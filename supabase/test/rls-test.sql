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
\echo 'TUM SQL TESTLERI GECTI'
