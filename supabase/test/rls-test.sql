-- Şema ve güvenlik testleri. Çalıştırma: npm run test:sql (yerel PostgreSQL gerekir)
\set ON_ERROR_STOP on
\set osman '11111111-1111-1111-1111-111111111111'
\set ayse '22222222-2222-2222-2222-222222222222'
\set yabanci '33333333-3333-3333-3333-333333333333'

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

-- Osman grup oluşturur ve davet kodu üretir
select pg_temp.as_user(:'osman');
create temp table t_ctx as select (public.ha_create_group('Ortak', '#059669', 'Osman')).id as gid;
grant select on t_ctx to authenticated;
create temp table t_code as select public.ha_create_invite((select gid from t_ctx)) as code;
reset role;
grant all on t_ctx, t_code to authenticated;

-- Ayşe davetle katılır
select pg_temp.as_user(:'ayse');
select (public.ha_join_group((select code from t_code), 'Ayşe')).name = 'Ortak' as join_ok \gset
\if :join_ok \else \echo 'HATA: katılım' \q \endif

-- Ayşe kendi işlemini ekler
select public.ha_upsert_transactions(jsonb_build_array(jsonb_build_object(
  'id', 'tx-ayse-1', 'group_id', (select gid from t_ctx), 'date', '2026-09-10', 'amount_kurus', 12550, 'type', 'expense',
  'description', 'MİGROS', 'category_name', 'Market', 'category_icon', 'shopping-cart', 'category_color', '#059669'))) = 1 as ins_ok \gset
\if :ins_ok \else \echo 'HATA: ekleme' \q \endif
reset role;

-- Osman Ayşe'nin işlemini görür, değiştiremez
select pg_temp.as_user(:'osman');
select count(*) = 1 as osman_sees from public.ha_transactions \gset
\if :osman_sees \else \echo 'HATA: osman göremiyor' \q \endif
select count(*) = 2 as members_ok from public.ha_group_members \gset
\if :members_ok \else \echo 'HATA: üyeler' \q \endif
do $$ begin
  perform public.ha_upsert_transactions(jsonb_build_array(jsonb_build_object('id', 'tx-ayse-1', 'group_id', (select gid from t_ctx), 'date', '2026-09-10', 'amount_kurus', 1, 'type', 'expense', 'description', 'X')));
  raise exception 'HATA: başkasının işlemi değişti';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
select public.ha_delete_transactions(array['tx-ayse-1']) = 0 as del_other_blocked \gset
\if :del_other_blocked \else \echo 'HATA: başkasının işlemi silindi' \q \endif
-- Doğrudan tablo yazma yasak
do $$ begin
  insert into public.ha_transactions (id, group_id, user_id, date, amount_kurus, type, description) values ('x', (select gid from t_ctx), auth.uid(), '2026-01-01', 1, 'expense', 'x');
  raise exception 'HATA: doğrudan yazma açık';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Ay döngüsünü yalnızca yönetici değiştirir; üye değiştiremez ama okur
select pg_temp.as_user(:'ayse');
do $$ begin
  perform public.ha_set_group_cycle((select gid from t_ctx), 15);
  raise exception 'HATA: üye ay döngüsünü değiştirdi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
select pg_temp.as_user(:'osman');
select public.ha_set_group_cycle((select gid from t_ctx), 15);
reset role;
select pg_temp.as_user(:'ayse');
select cycle_start_day = 15 as cycle_ok from public.ha_groups \gset
\if :cycle_ok \else \echo 'HATA: ay döngüsü' \q \endif
reset role;

-- Gider paylaşımını yalnızca yönetici yapar ve geri alır; üye okur
select pg_temp.as_user(:'ayse');
do $$ begin
  perform public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 100, '{}'::jsonb);
  raise exception 'HATA: üye paylaştırdı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
select pg_temp.as_user(:'osman');
do $$ begin
  perform public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 100, '{"33333333-3333-3333-3333-333333333333": 50}'::jsonb);
  raise exception 'HATA: üye olmayana pay verildi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
select public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 100,
  jsonb_build_object(:'osman', 50, :'ayse', 50));
select public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 200,
  jsonb_build_object(:'osman', 100, :'ayse', 100));
reset role;
select pg_temp.as_user(:'ayse');
select count(*) = 1 and min(total_kurus) = 200 and min((shares->>'22222222-2222-2222-2222-222222222222')::bigint) = 100 as settle_ok from public.ha_settlements \gset
\if :settle_ok \else \echo 'HATA: paylaşım' \q \endif
do $$ begin
  perform public.ha_unsettle_period((select gid from t_ctx), '2026-09-15');
  raise exception 'HATA: üye paylaşımı geri aldı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
select pg_temp.as_user(:'osman');
select public.ha_unsettle_period((select gid from t_ctx), '2026-09-15');
select count(*) = 0 as unsettle_ok from public.ha_settlements \gset
\if :unsettle_ok \else \echo 'HATA: paylaşım geri alınmadı' \q \endif
select public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 100, jsonb_build_object(:'osman', 50, :'ayse', 50));
-- Grup bütçesi: yalnızca yönetici
select public.ha_set_group_budget((select gid from t_ctx), 500000);
select budget_kurus = 500000 as budget_ok from public.ha_groups \gset
\if :budget_ok \else \echo 'HATA: grup bütçesi' \q \endif
reset role;
select pg_temp.as_user(:'ayse');
do $$ begin
  perform public.ha_set_group_budget((select gid from t_ctx), 1);
  raise exception 'HATA: üye grup bütçesini değiştirdi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
-- Ödeme durumu: taraf işaretler, herkes görür; paylaştırılmamış dönem ve yabancı kişi reddedilir
select public.ha_mark_payment((select gid from t_ctx), '2026-09-15', :'ayse', :'osman', 25, true);
select count(*) = 1 as paid_ok from public.ha_settlement_payments \gset
\if :paid_ok \else \echo 'HATA: ödeme işareti' \q \endif
do $$ begin
  perform public.ha_mark_payment((select gid from t_ctx), '2026-08-15', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 25, true);
  raise exception 'HATA: paylaştırılmamış dönem işaretlendi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  perform public.ha_mark_payment((select gid from t_ctx), '2026-09-15', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 25, true);
  raise exception 'HATA: üye olmayana ödeme işaretlendi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  insert into public.ha_settlement_payments (group_id, period_start, from_user, to_user, amount_kurus, marked_by) values ((select gid from t_ctx), '2026-09-15', auth.uid(), auth.uid(), 1, auth.uid());
  raise exception 'HATA: ödeme tablosuna doğrudan yazıldı';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Yönetici geri alır ve yeniden paylaştırır: ödeme kaydı paylaşımla birlikte silinir
select pg_temp.as_user(:'osman');
select count(*) = 1 as owner_sees_paid from public.ha_settlement_payments \gset
\if :owner_sees_paid \else \echo 'HATA: yönetici ödemeyi görmüyor' \q \endif
select public.ha_unsettle_period((select gid from t_ctx), '2026-09-15');
select public.ha_settle_period((select gid from t_ctx), '2026-09-15', '2026-10-14', 100, jsonb_build_object(:'osman', 50, :'ayse', 50));
select count(*) = 0 as paid_cleared from public.ha_settlement_payments \gset
\if :paid_cleared \else \echo 'HATA: ödeme kaydı paylaşımla silinmedi' \q \endif
select public.ha_mark_payment((select gid from t_ctx), '2026-09-15', :'ayse', :'osman', 25, true);
reset role;

-- Yabancı hiçbir şey göremez, gruba yazamaz, geçersiz kodla katılamaz
select pg_temp.as_user(:'yabanci');
select (select count(*) from public.ha_transactions) + (select count(*) from public.ha_groups) + (select count(*) from public.ha_group_members) + (select count(*) from public.ha_settlements) + (select count(*) from public.ha_settlement_payments) = 0 as stranger_blind \gset
\if :stranger_blind \else \echo 'HATA: yabancı veri görüyor' \q \endif
do $$ begin
  perform public.ha_upsert_transactions(jsonb_build_array(jsonb_build_object('id', 'tx-y', 'group_id', (select gid from t_ctx), 'date', '2026-09-10', 'amount_kurus', 1, 'type', 'expense', 'description', 'X')));
  raise exception 'HATA: yabancı yazdı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  perform public.ha_join_group('yanlis-kod', 'Y');
  raise exception 'HATA: yanlış kodla katıldı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;

-- Anonim kullanıcı fonksiyon çağıramaz
set role anon;
do $$ begin
  perform public.ha_create_group('x', '#000', 'x');
  raise exception 'HATA: anonim grup açtı';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Süresi dolan davetle katılınamaz
update public.ha_invites set expires_at = now() - interval '1 minute';
select pg_temp.as_user(:'yabanci');
do $$ begin
  perform public.ha_join_group((select code from t_code), 'Y');
  raise exception 'HATA: süresi dolan davetle katıldı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;

-- Ayşe kendi işlemini siler (silindi işareti), updated_at ilerler; gruptan ayrılır
select pg_temp.as_user(:'ayse');
select public.ha_delete_transactions(array['tx-ayse-1']) = 1 as del_ok \gset
\if :del_ok \else \echo 'HATA: silme' \q \endif
select deleted from public.ha_transactions where id = 'tx-ayse-1' \gset
\if :deleted \else \echo 'HATA: silindi işareti' \q \endif
select public.ha_remove_member((select gid from t_ctx), :'ayse');
select count(*) = 0 as left_ok from public.ha_group_members \gset
\if :left_ok \else \echo 'HATA: ayrılma' \q \endif
reset role;
-- Yönetici paneli: yalnızca yönetici kullanıcıları görür ve hesap işlemleri yapar
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (:'osman', 'osman@ornek.test', '{"provider":"google"}', '{"full_name":"Osman"}'),
  (:'ayse', 'ayse@ornek.test', '{"provider":"email"}', '{}'),
  (:'yabanci', 'y@ornek.test', null, null);
insert into auth.sessions (user_id) values (:'yabanci');
insert into public.ha_admins (user_id) values (:'osman');
select pg_temp.as_user(:'ayse');
select public.ha_is_admin() = false as not_admin \gset
\if :not_admin \else \echo 'HATA: üye yönetici sayıldı' \q \endif
do $$ begin
  perform * from public.ha_admin_list_users();
  raise exception 'HATA: üye kullanıcı listesini gördü';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  perform public.ha_admin_delete_user('33333333-3333-3333-3333-333333333333');
  raise exception 'HATA: üye hesap sildi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  perform * from public.ha_admins;
  raise exception 'HATA: yönetici tablosu okunabildi';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.as_user(:'osman');
select public.ha_is_admin() as is_admin \gset
\if :is_admin \else \echo 'HATA: yönetici tanınmadı' \q \endif
select count(*) = 3 and bool_or(is_admin and provider = 'google' and full_name = 'Osman') as list_ok from public.ha_admin_list_users() \gset
\if :list_ok \else \echo 'HATA: kullanıcı listesi' \q \endif
select public.ha_admin_set_banned(:'yabanci', true);
select public.ha_admin_confirm_email(:'ayse');
do $$ begin
  perform public.ha_admin_set_banned('11111111-1111-1111-1111-111111111111', true);
  raise exception 'HATA: yönetici kendini dondurdu';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
select banned_until > now() + interval '50 years' as banned_ok from auth.users where id = :'yabanci' \gset
\if :banned_ok \else \echo 'HATA: dondurma' \q \endif
select count(*) = 0 as sessions_closed from auth.sessions where user_id = :'yabanci' \gset
\if :sessions_closed \else \echo 'HATA: oturumlar kapanmadı' \q \endif
select email_confirmed_at is not null as confirm_ok from auth.users where id = :'ayse' \gset
\if :confirm_ok \else \echo 'HATA: e-posta onayı' \q \endif
select pg_temp.as_user(:'osman');
select public.ha_admin_set_banned(:'yabanci', false);
select public.ha_admin_delete_user(:'yabanci');
reset role;
select count(*) = 0 as deleted_ok from auth.users where id = :'yabanci' \gset
\if :deleted_ok \else \echo 'HATA: hesap silinmedi' \q \endif
-- Hesabımı sil: kişi yalnızca kendi hesabını siler
select pg_temp.as_user(:'ayse');
select public.ha_delete_my_account();
reset role;
select count(*) = 0 as self_deleted from auth.users where id = :'ayse' \gset
\if :self_deleted \else \echo 'HATA: kendi hesabı silinmedi' \q \endif
select count(*) = 1 as osman_kept from auth.users where id = :'osman' \gset
\if :osman_kept \else \echo 'HATA: başka hesap silindi' \q \endif
set role anon;
do $$ begin
  perform public.ha_delete_my_account();
  raise exception 'HATA: girişsiz hesap silme';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Koç: haber kaynaklarını yalnızca yönetici yönetir; günlük özeti giriş yapan herkes okur
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'z@ornek.test');
select pg_temp.as_user(:'osman');
select public.ha_admin_add_news_source('x', 'https://x.com/Ornek_Hesap/status/1', 'Örnek') is not null as added_x \gset
\if :added_x \else \echo 'HATA: X kaynağı eklenmedi' \q \endif
select public.ha_admin_add_news_source('rss', 'https://ornek.test/rss', null) is not null as added_rss \gset
do $$ begin
  perform public.ha_admin_add_news_source('rss', 'http://guvensiz.test/rss', null);
  raise exception 'HATA: https olmayan RSS kabul edildi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
select count(*) = 2 and bool_or(value = 'ornek_hesap') as sources_ok from public.ha_news_sources where value in ('ornek_hesap', 'https://ornek.test/rss') \gset
\if :sources_ok \else \echo 'HATA: kaynak listesi' \q \endif
reset role;
insert into public.ha_coach_broadcasts (day, title, summary, items) values ('2026-10-06', 'Günün özeti', 'Özet', '[]');
insert into public.ha_coach_usage (user_id, day, count) values ('44444444-4444-4444-4444-444444444444', '2026-10-06', 1);
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select count(*) = 0 as hidden_sources from public.ha_news_sources \gset
\if :hidden_sources \else \echo 'HATA: üye kaynakları gördü' \q \endif
select count(*) = 1 as broadcast_read from public.ha_coach_broadcasts \gset
\if :broadcast_read \else \echo 'HATA: günlük özet okunamadı' \q \endif
do $$ begin
  perform public.ha_admin_add_news_source('x', 'baskasi', null);
  raise exception 'HATA: üye kaynak ekledi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  insert into public.ha_coach_broadcasts (day, title, summary) values ('2026-10-07', 'Sahte', 'Sahte');
  raise exception 'HATA: üye özet yazdı';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform * from public.ha_coach_usage;
  raise exception 'HATA: kullanım sayacı okunabildi';
exception when insufficient_privilege then null;
end $$;
select public.ha_delete_my_account();
reset role;
select count(*) = 0 as usage_gone from public.ha_coach_usage \gset
\if :usage_gone \else \echo 'HATA: hesap silinince sayaç kaldı' \q \endif
-- Araştırma ajanı
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'u@ornek.test');
select count(*) = 8 and bool_and(not active and terms_status = 'inceleniyor') as seeds_ok from public.ha_news_sources where kind <> 'x' and value <> 'https://ornek.test/rss' \gset
\if :seeds_ok \else \echo 'HATA: önerilen kaynaklar kapalı ve incelemede değil' \q \endif
select pg_temp.as_user(:'osman');
insert into public.ha_experts (name, area, speaks_for) values ('Örnek Uzman', 'tr_makro', 'kisisel');
insert into public.ha_release_calendar (institution, title, release_at) values ('TÜİK', 'TÜFE Eylül', now() + interval '1 day');
update public.ha_news_sources set terms_status = 'izinli', active = true where value = 'https://ornek.test/rss';
do $$ begin
  insert into public.ha_news_sources (kind, value, grp) values ('rss', 'https://haber.test/rss', 'piyasa');
  raise exception 'HATA: haber kaynağı fiyat grubuna eklendi';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.ha_news_sources (kind, value) values ('rss', 'http://guvensiz.test/rss');
  raise exception 'HATA: https olmayan kaynak eklendi';
exception when check_violation then null;
end $$;
update public.ha_agent_settings set coach_daily_limit = 25;
reset role;
insert into public.ha_research_items (dedupe_key, url, title, institution, published_at, content_type) values ('k1', 'https://ornek.test/1', 'Madde', 'Kurum', now(), 'resmi_veri');
do $$ begin
  insert into public.ha_research_items (dedupe_key, url, title, institution, published_at, content_type) values ('k1', 'https://ornek.test/1', 'Madde', 'Kurum', now(), 'resmi_veri');
  raise exception 'HATA: aynı madde iki kez kaydedildi';
exception when unique_violation then null;
end $$;
insert into public.ha_reports (id, kind, title, window_start, window_end, checks) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'gunluk', 'Sorunlu taslak', now() - interval '1 day', now(), '{"ok": false}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gunluk', 'Temiz taslak', now() - interval '1 day', now(), '{"ok": true, "counts": {"kaynaksiz": 0}}');
-- Üye: taslakları, maddeleri, uzmanları, limitleri göremez; yayın yapamaz
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select count(*) = 0 as member_no_drafts from public.ha_reports \gset
\if :member_no_drafts \else \echo 'HATA: üye taslak gördü' \q \endif
select (select count(*) from public.ha_research_items) + (select count(*) from public.ha_experts) + (select count(*) from public.ha_release_calendar) + (select count(*) from public.ha_agent_settings) = 0 as member_hidden \gset
\if :member_hidden \else \echo 'HATA: üye araştırma tablolarını gördü' \q \endif
do $$ begin
  perform public.ha_admin_report_publish('aaaaaaaa-0000-0000-0000-000000000002');
  raise exception 'HATA: üye rapor yayınladı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  insert into public.ha_experts (name) values ('Sahte');
  raise exception 'HATA: üye uzman ekledi';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.ha_coach_usage_bump(auth.uid(), current_date, 1000, 0);
  raise exception 'HATA: üye sayaç fonksiyonunu çağırdı';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.ha_admin_research_metrics();
  raise exception 'HATA: üye ölçümleri gördü';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
-- Editör: denetimden geçmeyen taslak yayınlanamaz; temiz taslak yayınlanır ve herkes görür
select pg_temp.as_user(:'osman');
do $$ begin
  perform public.ha_admin_report_publish('aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'HATA: sorunlu taslak yayınlandı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
select public.ha_admin_report_publish('aaaaaaaa-0000-0000-0000-000000000002');
select public.ha_admin_report_set_status('aaaaaaaa-0000-0000-0000-000000000001', 'reddedildi', 'Kaynak eksik');
select (public.ha_admin_research_metrics()->>'yayinlanan')::int = 1 as metrics_ok \gset
\if :metrics_ok \else \echo 'HATA: ölçümler' \q \endif
select count(*) = 1 as admin_items from public.ha_research_items \gset
\if :admin_items \else \echo 'HATA: yönetici maddeleri göremedi' \q \endif
reset role;
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select count(*) = 1 and bool_and(title = 'Temiz taslak') as member_published from public.ha_reports \gset
\if :member_published \else \echo 'HATA: yayınlanan rapor görünmedi' \q \endif
reset role;
-- Koç sayacı: sınıra kadar artar, sınırda -1 döner ve artmaz
select public.ha_coach_usage_bump('55555555-5555-5555-5555-555555555555', '2026-10-07', 2, 100) = 1 as b1 \gset
select public.ha_coach_usage_bump('55555555-5555-5555-5555-555555555555', '2026-10-07', 2, 100) = 2 as b2 \gset
select public.ha_coach_usage_bump('55555555-5555-5555-5555-555555555555', '2026-10-07', 2, 100) = -1 as b3 \gset
\if :b1 \else \echo 'HATA: sayaç 1' \q \endif
\if :b2 \else \echo 'HATA: sayaç 2' \q \endif
\if :b3 \else \echo 'HATA: sayaç sınırı aştı' \q \endif
select count = 2 and tokens = 200 as bump_ok from public.ha_coach_usage where user_id = '55555555-5555-5555-5555-555555555555' \gset
\if :bump_ok \else \echo 'HATA: sayaç değeri' \q \endif
select public.ha_agent_usage_add('ai_coach', 50, '2026-10-07') + public.ha_agent_usage_add('ai_coach', 50, '2026-10-07') = 150 as usage_ok \gset
\if :usage_ok \else \echo 'HATA: kullanım toplamı' \q \endif
-- Paketler: yalnızca yönetici tanımlar, kişi kendi paketini okur
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select public.ha_my_plan() = 'free' as plan_free \gset
\if :plan_free \else \echo 'HATA: varsayılan paket' \q \endif
do $$ begin
  perform public.ha_admin_set_plan(auth.uid(), 'plusplus', null);
  raise exception 'HATA: üye kendine paket tanımladı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
select pg_temp.as_user(:'osman');
select public.ha_admin_set_plan('55555555-5555-5555-5555-555555555555', 'plusplus', null);
reset role;
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select public.ha_my_plan() = 'plusplus' and (select count(*) from public.ha_user_plans) = 1 as plan_set \gset
\if :plan_set \else \echo 'HATA: paket tanımlanmadı' \q \endif
reset role;
update public.ha_user_plans set expires_at = now() - interval '1 day';
select public.ha_plan_of('55555555-5555-5555-5555-555555555555') = 'free' as plan_expired \gset
\if :plan_expired \else \echo 'HATA: süresi biten paket' \q \endif
-- Web Finansal Harita testi: girişsiz kayıt, doğrudan okuma yok, e-posta ya da kodla sahiplenme
insert into auth.users (id, email, email_confirmed_at) values
  ('66666666-6666-6666-6666-666666666666', 'Elif@Ornek.com', now()),
  ('77777777-7777-7777-7777-777777777777', 'can@ornek.com', null),
  ('88888888-8888-8888-8888-888888888888', 'baska@ornek.com', now());
set role anon;
select public.ha_submit_freedom_lead('ATL-ABC234', 'Elif', 'elif@ornek.com', '{"v":1,"gelir":"g3"}'::jsonb, '{"level":2}'::jsonb, true) = 'ATL-ABC234' as lead_ok \gset
\if :lead_ok \else \echo 'HATA: web testi kaydı' \q \endif
select public.ha_submit_freedom_lead('ATL-CAN234', 'Can', 'can@ornek.com', '{"v":1}'::jsonb, null, false) = 'ATL-CAN234' as lead2_ok \gset
\if :lead2_ok \else \echo 'HATA: ikinci kayıt' \q \endif
do $$ begin
  perform public.ha_submit_freedom_lead('kotu-kod', 'X', 'x@y.co', '{"v":1}'::jsonb, null, false);
  raise exception 'HATA: geçersiz kod kabul edildi';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
do $$ begin
  perform count(*) from public.ha_freedom_leads;
  raise exception 'HATA: anon kayıtları okudu';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform * from public.ha_claim_freedom_lead(null);
  raise exception 'HATA: anon sahiplendi';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Sıradan üye tabloyu okuyamaz
select pg_temp.as_user('88888888-8888-8888-8888-888888888888');
select count(*) = 0 as leads_hidden from public.ha_freedom_leads \gset
\if :leads_hidden \else \echo 'HATA: üye web kayıtlarını gördü' \q \endif
-- Başka e-postalı kişi e-postayla alamaz
select count(*) = 0 as other_email from public.ha_claim_freedom_lead(null) \gset
\if :other_email \else \echo 'HATA: başkasının kaydı e-postayla alındı' \q \endif
reset role;
-- Doğrulanmış e-posta (büyük/küçük harf farkıyla) kendi kaydını alır
select pg_temp.as_user('66666666-6666-6666-6666-666666666666');
select count(*) = 1 and min(code) = 'ATL-ABC234' and min(name) = 'Elif' as claim_email from public.ha_claim_freedom_lead(null) \gset
\if :claim_email \else \echo 'HATA: e-postayla sahiplenme' \q \endif
reset role;
-- E-postası doğrulanmamış kişi e-postayla alamaz, kodla alır
select pg_temp.as_user('77777777-7777-7777-7777-777777777777');
select count(*) = 0 as unconfirmed_blocked from public.ha_claim_freedom_lead('') \gset
\if :unconfirmed_blocked \else \echo 'HATA: doğrulanmamış e-posta' \q \endif
select count(*) = 1 as claim_code from public.ha_claim_freedom_lead('atl-can234') \gset
\if :claim_code \else \echo 'HATA: kodla sahiplenme' \q \endif
-- Başkasının sahiplendiği kod alınamaz
select count(*) = 0 as taken_blocked from public.ha_claim_freedom_lead('ATL-ABC234') \gset
\if :taken_blocked \else \echo 'HATA: sahiplenilmiş kod alındı' \q \endif
reset role;
-- Yönetici bütün kayıtları okur
select pg_temp.as_user(:'osman');
select count(*) = 2 as admin_reads from public.ha_freedom_leads \gset
\if :admin_reads \else \echo 'HATA: yönetici kayıtları okuyamadı' \q \endif
reset role;
-- Kişisel kayıtlar: herkes yalnızca kendi satırlarını görür ve yazar
select pg_temp.as_user(:'osman');
insert into public.ha_user_records (tbl, id, data) values ('transactions', 'tx-1', '{"id":"tx-1","amountKurus":100}');
update public.ha_user_records set data = '{"id":"tx-1","amountKurus":200}' where id = 'tx-1';
reset role;
select pg_temp.as_user(:'ayse');
select count(*) = 0 as rec_hidden from public.ha_user_records \gset
\if :rec_hidden \else \echo 'HATA: başkasının kişisel kaydı göründü' \q \endif
update public.ha_user_records set deleted = true where id = 'tx-1';
select pg_temp.as_user(:'ayse');
\set ON_ERROR_STOP off
insert into public.ha_user_records (user_id, tbl, id, data) values (:'osman', 'transactions', 'tx-2', '{}');
\set ON_ERROR_STOP on
reset role;
select count(*) = 1 and bool_and(not deleted) and min((data->>'amountKurus')::int) = 200 as rec_safe from public.ha_user_records \gset
\if :rec_safe \else \echo 'HATA: kişisel kayıt korunmadı' \q \endif
-- Web aboneliği: fiyatlar herkese açık, kodlar ve olaylar gizli, paket yalnızca sunucuyla verilir
\set abone 'a0000000-0000-0000-0000-000000000001'
reset role;
insert into auth.users (id, email) values (:'abone', 'abone@ornek.test');
set role anon;
select count(*) = 4 as prices_public from public.ha_web_prices \gset
\if :prices_public \else \echo 'HATA: web fiyatları herkese açık değil' \q \endif
\set ON_ERROR_STOP off
select count(*) from public.ha_coupons;
\set ON_ERROR_STOP on
reset role;
select pg_temp.as_user(:'abone');
update public.ha_web_prices set amount_kurus = 100 where plan = 'plus';
reset role;
select count(*) = 0 as price_safe from public.ha_web_prices where amount_kurus = 100 \gset
\if :price_safe \else \echo 'HATA: yönetici olmayan fiyat değiştirdi' \q \endif
select pg_temp.as_user(:'osman');
update public.ha_web_prices set amount_kurus = 10999 where plan = 'plus' and period = 'monthly';
insert into public.ha_coupons (code, percent_off, plans) values ('YAZ20', 20, array['plusplus']);
reset role;
select amount_kurus = 10999 as price_admin from public.ha_web_prices where plan = 'plus' and period = 'monthly' \gset
\if :price_admin \else \echo 'HATA: yönetici fiyatı değiştiremedi' \q \endif
-- Paddle'a aktarılmamış kod geçersizdir
select pg_temp.as_user(:'abone');
select public.ha_check_coupon('yaz20', 'plusplus', 'monthly') is null as coupon_unsynced \gset
\if :coupon_unsynced \else \echo 'HATA: aktarılmamış kod geçti' \q \endif
reset role;
update public.ha_coupons set paddle_discount_id = 'dsc_test' where code = 'YAZ20';
select pg_temp.as_user(:'abone');
select public.ha_check_coupon(' yaz20 ', 'plusplus', 'monthly') = 20 and public.ha_check_coupon('YAZ20', 'plus', 'monthly') is null as coupon_ok \gset
\if :coupon_ok \else \echo 'HATA: kampanya kodu denetimi' \q \endif
reset role;
-- Kod deneme sınırı: saatte 20 deneme
insert into public.ha_coupon_attempts (user_id) select :'abone' from generate_series(1, 20);
select pg_temp.as_user(:'abone');
do $$ begin
  perform public.ha_check_coupon('YAZ20', 'plusplus', 'monthly');
  raise exception 'HATA: kod deneme sınırı çalışmadı';
exception when others then
  if sqlerrm like 'HATA%' then raise; end if;
end $$;
reset role;
-- Abonelik başlar: Ayşe Plus+ olur; eski tarihli olay yeni durumu ezmez
select public.ha_apply_subscription(jsonb_build_object('id', 'sub_ayse1', 'user_id', :'abone', 'customer_id', 'ctm_1', 'plan', 'plusplus', 'period', 'monthly',
  'status', 'trialing', 'event_at', '2026-10-01T10:00:00Z', 'current_period_end', (now() + interval '7 days')::text, 'trial_end', (now() + interval '7 days')::text)) = 'verildi' as sub_given \gset
\if :sub_given \else \echo 'HATA: abonelik paketi verilmedi' \q \endif
select public.ha_apply_subscription(jsonb_build_object('id', 'sub_ayse1', 'user_id', :'abone', 'customer_id', 'ctm_1', 'plan', 'plusplus', 'period', 'monthly',
  'status', 'canceled', 'event_at', '2026-09-30T10:00:00Z')) = 'eski' as sub_old \gset
\if :sub_old \else \echo 'HATA: eski olay işlendi' \q \endif
select public.ha_plan_of(:'abone') = 'plusplus' as plan_paid \gset
\if :plan_paid \else \echo 'HATA: ödenen paket görünmüyor' \q \endif
-- Abonelik sürerken hesap silinemez
select pg_temp.as_user(:'abone');
\set ON_ERROR_STOP off
select public.ha_delete_my_account();
\set ON_ERROR_STOP on
select count(*) = 1 as sub_own from public.ha_subscriptions \gset
\if :sub_own \else \echo 'HATA: kişi kendi aboneliğini göremedi' \q \endif
select count(*) = 0 as events_hidden from public.ha_webhook_events \gset
\if :events_hidden \else \echo 'HATA: olaylar göründü' \q \endif
reset role;
select count(*) = 1 as account_kept from auth.users where id = :'abone' \gset
\if :account_kept \else \echo 'HATA: abonelik sürerken hesap silindi' \q \endif
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select count(*) = 0 as sub_hidden from public.ha_subscriptions \gset
\if :sub_hidden \else \echo 'HATA: başkasının aboneliği göründü' \q \endif
reset role;
-- İptal: Paddle'dan gelen paket biter
select public.ha_apply_subscription(jsonb_build_object('id', 'sub_ayse1', 'user_id', :'abone', 'customer_id', 'ctm_1', 'plan', 'plusplus', 'period', 'monthly',
  'status', 'canceled', 'event_at', '2026-10-09T10:00:00Z')) = 'bitti' as sub_end \gset
\if :sub_end \else \echo 'HATA: iptal işlenmedi' \q \endif
select public.ha_plan_of(:'abone') = 'free' as plan_ended \gset
\if :plan_ended \else \echo 'HATA: iptal sonrası paket sürüyor' \q \endif
-- Yöneticinin verdiği paket Paddle iptaliyle bitmez
select pg_temp.as_user(:'osman');
select public.ha_admin_set_plan('55555555-5555-5555-5555-555555555555', 'plus', null);
reset role;
select public.ha_apply_subscription(jsonb_build_object('id', 'sub_u1', 'user_id', '55555555-5555-5555-5555-555555555555', 'customer_id', 'ctm_2', 'plan', 'plus',
  'period', 'yearly', 'status', 'canceled', 'event_at', '2026-10-09T10:00:00Z')) = 'degismedi' as admin_kept \gset
\if :admin_kept \else \echo 'HATA: yönetici paketi iptalle bitti' \q \endif
-- Süresiz yönetici paketi, aynı paketin aboneliğiyle kısalmaz
select public.ha_apply_subscription(jsonb_build_object('id', 'sub_u2', 'user_id', '55555555-5555-5555-5555-555555555555', 'customer_id', 'ctm_2', 'plan', 'plus',
  'period', 'monthly', 'status', 'active', 'event_at', '2026-10-10T10:00:00Z', 'current_period_end', (now() + interval '30 days')::text)) = 'yonetici' as admin_strong \gset
\if :admin_strong \else \echo 'HATA: yönetici paketi abonelikle değişti' \q \endif
select expires_at is null and source = 'admin' as admin_same from public.ha_user_plans where user_id = '55555555-5555-5555-5555-555555555555' \gset
\if :admin_same \else \echo 'HATA: yönetici paketi bozuldu' \q \endif
-- Hesap silinince sahiplenilen kayıt da silinir
delete from auth.users where id = '66666666-6666-6666-6666-666666666666';
select count(*) = 0 as lead_deleted from public.ha_freedom_leads where code = 'ATL-ABC234' \gset
\if :lead_deleted \else \echo 'HATA: hesapla birlikte silinmedi' \q \endif
delete from auth.users where id = :'osman';
select count(*) = 0 as rec_deleted from public.ha_user_records \gset
\if :rec_deleted \else \echo 'HATA: kişisel kayıtlar hesapla silinmedi' \q \endif
\echo 'TUM SQL TESTLERI GECTI'
