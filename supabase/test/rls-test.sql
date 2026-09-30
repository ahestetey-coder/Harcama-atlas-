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

-- Yabancı hiçbir şey göremez, gruba yazamaz, geçersiz kodla katılamaz
select pg_temp.as_user(:'yabanci');
select (select count(*) from public.ha_transactions) + (select count(*) from public.ha_groups) + (select count(*) from public.ha_group_members) = 0 as stranger_blind \gset
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
\echo 'TUM SQL TESTLERI GECTI'
