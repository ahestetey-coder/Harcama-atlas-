-- Harcama Atlası: ortak gruplar için bulut eşitleme şeması (Supabase / PostgreSQL)
--
-- Kurulum: Supabase panelinde SQL Editor > New query, bu dosyanın tamamını yapıştırıp "Run".
-- Tekrar çalıştırılabilir (var olan tabloları silmez).
--
-- Güvenlik modeli:
--  * Yalnızca "ortak" olarak paylaşılan gruplardaki işlemler buluta gelir; kişisel kayıtlar cihazda kalır.
--  * Tablolar satır düzeyinde güvenlikle (RLS) korunur: bir kullanıcı yalnızca üyesi olduğu grupları,
--    üyelerini ve işlemlerini okuyabilir.
--  * Doğrudan tablo yazma izni yoktur; bütün yazmalar aşağıdaki fonksiyonlardan geçer ve her fonksiyon
--    çağıranın kimliğini (auth.uid()) ve grup üyeliğini denetler. Herkes yalnızca kendi işlemini yazar/siler.

create table if not exists public.ha_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#059669' check (char_length(color) <= 20),
  owner_id uuid not null,
  created_at timestamptz not null default now()
);

-- Ay döngüsü: grubun dönemi her ayın bu gününde başlar (boşsa takvim ayı). Yalnızca yönetici değiştirir.
alter table public.ha_groups add column if not exists cycle_start_day smallint check (cycle_start_day between 1 and 28);

create table if not exists public.ha_group_members (
  group_id uuid not null references public.ha_groups(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null default '#0f766e' check (char_length(color) <= 20),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.ha_invites (
  code text primary key,
  group_id uuid not null references public.ha_groups(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table if not exists public.ha_transactions (
  id text primary key check (char_length(id) between 1 and 80),
  group_id uuid not null references public.ha_groups(id) on delete cascade,
  user_id uuid not null,
  date date not null,
  amount_kurus bigint not null check (amount_kurus > 0 and amount_kurus <= 10000000000),
  type text not null check (type in ('expense', 'refund', 'transfer')),
  description text not null check (char_length(description) between 1 and 200),
  category_name text check (char_length(category_name) <= 60),
  category_icon text check (char_length(category_icon) <= 40),
  category_color text check (char_length(category_color) <= 20),
  note text check (char_length(note) <= 500),
  installment jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ha_transactions_group_updated on public.ha_transactions (group_id, updated_at);

-- updated_at her zaman sunucu saatinden gelir (eşitleme imleci buna güvenir)
create or replace function public.ha_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists ha_transactions_touch on public.ha_transactions;
create trigger ha_transactions_touch before insert or update on public.ha_transactions
  for each row execute function public.ha_touch();

-- Üyelik denetimi (RLS politikalarında kullanılır)
create or replace function public.ha_is_member(p_group uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ha_group_members m where m.group_id = p_group and m.user_id = auth.uid())
$$;

alter table public.ha_groups enable row level security;
alter table public.ha_group_members enable row level security;
alter table public.ha_invites enable row level security;
alter table public.ha_transactions enable row level security;

drop policy if exists ha_groups_read on public.ha_groups;
create policy ha_groups_read on public.ha_groups for select to authenticated using (public.ha_is_member(id));
drop policy if exists ha_members_read on public.ha_group_members;
create policy ha_members_read on public.ha_group_members for select to authenticated using (public.ha_is_member(group_id));
drop policy if exists ha_transactions_read on public.ha_transactions;
create policy ha_transactions_read on public.ha_transactions for select to authenticated using (public.ha_is_member(group_id));
-- ha_invites için okuma politikası yok: davet kodları yalnızca fonksiyonlarla kullanılır.

revoke all on public.ha_groups, public.ha_group_members, public.ha_invites, public.ha_transactions from anon, authenticated;
grant select on public.ha_groups, public.ha_group_members, public.ha_transactions to authenticated;

-- Yeni ortak grup: çağıran sahibi ve ilk üyesi olur.
create or replace function public.ha_create_group(p_name text, p_color text, p_display_name text)
  returns public.ha_groups language plpgsql security definer set search_path = public as $$
declare
  g public.ha_groups;
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  insert into public.ha_groups (name, color, owner_id) values (trim(p_name), coalesce(p_color, '#059669'), auth.uid()) returning * into g;
  insert into public.ha_group_members (group_id, user_id, display_name) values (g.id, auth.uid(), trim(p_display_name));
  return g;
end $$;

-- Davet kodu üretir (7 gün geçerli). Yalnızca grup üyeleri davet edebilir.
create or replace function public.ha_create_invite(p_group uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if not public.ha_is_member(p_group) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
  c := replace(gen_random_uuid()::text, '-', '');
  insert into public.ha_invites (code, group_id, created_by) values (c, p_group, auth.uid());
  return c;
end $$;

-- Davet koduyla gruba katılır. Kod süresi dolmamış olmalıdır.
create or replace function public.ha_join_group(p_code text, p_display_name text)
  returns public.ha_groups language plpgsql security definer set search_path = public as $$
declare
  i public.ha_invites;
  g public.ha_groups;
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  select * into i from public.ha_invites where code = p_code;
  if not found or i.expires_at < now() then raise exception 'Davet geçersiz veya süresi dolmuş'; end if;
  insert into public.ha_group_members (group_id, user_id, display_name) values (i.group_id, auth.uid(), trim(p_display_name))
    on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  select * into g from public.ha_groups where id = i.group_id;
  return g;
end $$;

create or replace function public.ha_set_display_name(p_group uuid, p_display_name text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.ha_group_members set display_name = trim(p_display_name) where group_id = p_group and user_id = auth.uid();
end $$;

-- Grubun ay döngüsü başlangıç gününü değiştirir. Yalnızca grup yöneticisi (sahibi).
create or replace function public.ha_set_group_cycle(p_group uuid, p_day integer) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if p_day is not null and (p_day < 1 or p_day > 28) then raise exception 'Ay döngüsü günü 1 ile 28 arasında olmalı'; end if;
  update public.ha_groups set cycle_start_day = nullif(p_day, 1) where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Ay döngüsünü yalnızca grup yöneticisi değiştirebilir'; end if;
end $$;

-- Gruptan ayrılır; sahibi başka bir üyeyi çıkarabilir. Çıkan üyenin işlemleri silinir.
create or replace function public.ha_remove_member(p_group uuid, p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.ha_groups where id = p_group;
  if auth.uid() is null or (auth.uid() <> p_user and auth.uid() is distinct from owner) then raise exception 'Yetkiniz yok'; end if;
  if p_user = owner then raise exception 'Grup sahibi gruptan çıkarılamaz'; end if;
  delete from public.ha_transactions where group_id = p_group and user_id = p_user;
  delete from public.ha_group_members where group_id = p_group and user_id = p_user;
end $$;

-- Kendi işlemlerini ekler/günceller. Başkasının işlemi değiştirilemez.
create or replace function public.ha_upsert_transactions(p_rows jsonb) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  n integer := 0;
  existing_user uuid;
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Tek seferde en fazla 500 işlem gönderilebilir'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not public.ha_is_member((r->>'group_id')::uuid) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
    select user_id into existing_user from public.ha_transactions where id = r->>'id';
    if found and existing_user <> auth.uid() then raise exception 'Başka bir üyenin işlemi değiştirilemez'; end if;
    insert into public.ha_transactions (id, group_id, user_id, date, amount_kurus, type, description, category_name, category_icon, category_color, note, installment, deleted)
    values (r->>'id', (r->>'group_id')::uuid, auth.uid(), (r->>'date')::date, (r->>'amount_kurus')::bigint, r->>'type', r->>'description',
            r->>'category_name', r->>'category_icon', r->>'category_color', r->>'note', r->'installment', false)
    on conflict (id) do update set
      group_id = excluded.group_id, date = excluded.date, amount_kurus = excluded.amount_kurus, type = excluded.type,
      description = excluded.description, category_name = excluded.category_name, category_icon = excluded.category_icon,
      category_color = excluded.category_color, note = excluded.note, installment = excluded.installment, deleted = false;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Kendi işlemlerini siler (silindi olarak işaretler; diğer cihazlar eşitlemede kaldırır).
create or replace function public.ha_delete_transactions(p_ids text[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  update public.ha_transactions set deleted = true where id = any(p_ids) and user_id = auth.uid() and not deleted;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.ha_create_group(text, text, text), public.ha_create_invite(uuid), public.ha_join_group(text, text),
  public.ha_set_display_name(uuid, text), public.ha_remove_member(uuid, uuid), public.ha_upsert_transactions(jsonb),
  public.ha_delete_transactions(text[]), public.ha_is_member(uuid), public.ha_set_group_cycle(uuid, integer) from public, anon;
grant execute on function public.ha_create_group(text, text, text), public.ha_create_invite(uuid), public.ha_join_group(text, text),
  public.ha_set_display_name(uuid, text), public.ha_remove_member(uuid, uuid), public.ha_upsert_transactions(jsonb),
  public.ha_delete_transactions(text[]), public.ha_is_member(uuid), public.ha_set_group_cycle(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Gider paylaşımı (hesaplaşma)
--
-- Yönetici bir dönemin ortak giderini üyelere paylaştırır; her üyenin payı burada saklanır.
-- Üyelerin "Tümü" görünümünde bu dönem için yalnızca kendi payları sayılır. Yönetici geri alabilir.

create table if not exists public.ha_settlements (
  group_id uuid not null references public.ha_groups(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  total_kurus bigint not null check (total_kurus >= 0),
  -- { "<user_id>": <pay_kuruş>, ... }
  shares jsonb not null check (jsonb_typeof(shares) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, period_start)
);

alter table public.ha_settlements enable row level security;
drop policy if exists ha_settlements_read on public.ha_settlements;
create policy ha_settlements_read on public.ha_settlements for select to authenticated using (public.ha_is_member(group_id));
revoke all on public.ha_settlements from anon, authenticated;
grant select on public.ha_settlements to authenticated;

-- Dönemi paylaştırır (varsa günceller). Yalnızca grup yöneticisi.
create or replace function public.ha_settle_period(p_group uuid, p_start date, p_end date, p_total bigint, p_shares jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if not exists (select 1 from public.ha_groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Gideri yalnızca grup yöneticisi paylaştırabilir';
  end if;
  if jsonb_typeof(p_shares) <> 'object' then raise exception 'Paylar geçersiz'; end if;
  for k in select jsonb_object_keys(p_shares) loop
    if not exists (select 1 from public.ha_group_members where group_id = p_group and user_id::text = k) then
      raise exception 'Paylar yalnızca grup üyelerine verilebilir';
    end if;
    if jsonb_typeof(p_shares->k) <> 'number' or (p_shares->>k)::bigint < 0 then raise exception 'Paylar geçersiz'; end if;
  end loop;
  insert into public.ha_settlements (group_id, period_start, period_end, total_kurus, shares, created_by)
  values (p_group, p_start, p_end, p_total, p_shares, auth.uid())
  on conflict (group_id, period_start) do update set
    period_end = excluded.period_end, total_kurus = excluded.total_kurus, shares = excluded.shares,
    created_by = excluded.created_by, created_at = now();
end $$;

-- Paylaşımı geri alır. Yalnızca grup yöneticisi.
create or replace function public.ha_unsettle_period(p_group uuid, p_start date) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if not exists (select 1 from public.ha_groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Paylaşımı yalnızca grup yöneticisi geri alabilir';
  end if;
  delete from public.ha_settlements where group_id = p_group and period_start = p_start;
end $$;

revoke all on function public.ha_settle_period(uuid, date, date, bigint, jsonb), public.ha_unsettle_period(uuid, date) from public, anon;
grant execute on function public.ha_settle_period(uuid, date, date, bigint, jsonb), public.ha_unsettle_period(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Yönetici paneli
--
-- Yalnızca ha_admins tablosundaki hesaplar kullanıcı listesini görür ve hesap işlemleri yapar.
-- Yönetici eklemek için (bir kez, SQL Editor'de, kendi e-postanızla):
--   insert into public.ha_admins (user_id) select id from auth.users where email = 'SIZIN@EPOSTANIZ' on conflict do nothing;
-- Şifreler Supabase'de geri döndürülemez biçimde (hash) saklanır; kimse göremez. Yönetici yalnızca
-- şifre yenileme e-postası gönderebilir (uygulama bunu Supabase'in herkese açık uç noktasıyla yapar).

create table if not exists public.ha_admins (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
alter table public.ha_admins enable row level security;
revoke all on public.ha_admins from anon, authenticated;

create or replace function public.ha_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.ha_admins where user_id = auth.uid())
$$;

create or replace function public.ha_admin_require() returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ha_is_admin() then raise exception 'Bu işlem için yönetici yetkisi gerekir'; end if;
end $$;

create or replace function public.ha_admin_list_users()
  returns table (id uuid, email text, full_name text, provider text, created_at timestamptz, last_sign_in_at timestamptz,
                 email_confirmed_at timestamptz, banned_until timestamptz, is_admin boolean, group_count integer, shared_tx_count integer)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.ha_admin_require();
  return query
    select u.id, u.email::text,
           coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
           coalesce(u.raw_app_meta_data->>'provider', 'email'),
           u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
           exists (select 1 from public.ha_admins a where a.user_id = u.id),
           (select count(*)::integer from public.ha_group_members m where m.user_id = u.id),
           (select count(*)::integer from public.ha_transactions t where t.user_id = u.id and not t.deleted)
      from auth.users u
     order by u.created_at desc;
end $$;

-- Hesabı dondurur (giriş yapamaz, oturumları kapanır) veya açar.
create or replace function public.ha_admin_set_banned(p_user uuid, p_banned boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  if p_user = auth.uid() then raise exception 'Kendi hesabınızı donduramazsınız'; end if;
  update auth.users set banned_until = case when p_banned then now() + interval '100 years' else null end where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  if p_banned then
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;

-- E-posta doğrulamasını elle tamamlar (doğrulama e-postası ulaşmadıysa).
create or replace function public.ha_admin_confirm_email(p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
end $$;

-- Hesabı ve buluttaki bütün verisini siler: sahibi olduğu gruplar (üyeleri ve işlemleriyle),
-- diğer gruplardaki üyeliği ve işlemleri. Cihazlardaki yerel kayıtlar silinmez.
create or replace function public.ha_admin_delete_user(p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  if p_user = auth.uid() then raise exception 'Kendi hesabınızı buradan silemezsiniz'; end if;
  if exists (select 1 from public.ha_admins where user_id = p_user) then raise exception 'Yönetici hesabı silinemez'; end if;
  delete from public.ha_groups where owner_id = p_user;
  delete from public.ha_transactions where user_id = p_user;
  delete from public.ha_group_members where user_id = p_user;
  delete from public.ha_invites where created_by = p_user;
  delete from auth.users where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
end $$;

revoke all on function public.ha_is_admin(), public.ha_admin_require(), public.ha_admin_list_users(), public.ha_admin_set_banned(uuid, boolean),
  public.ha_admin_confirm_email(uuid), public.ha_admin_delete_user(uuid) from public, anon;
grant execute on function public.ha_is_admin(), public.ha_admin_list_users(), public.ha_admin_set_banned(uuid, boolean),
  public.ha_admin_confirm_email(uuid), public.ha_admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Hesabımı sil (App Store şartı: kullanıcı hesabını uygulama içinden silebilmeli)
--
-- Giriş yapmış kişi yalnızca kendi hesabını siler: yöneticisi olduğu ortak gruplar (içindeki
-- herkesin harcamaları ve paylaşımlarıyla), diğer gruplara eklediği harcamalar, üyelikleri,
-- davetleri ve hesabın kendisi buluttan kalıcı olarak silinir.

create or replace function public.ha_delete_my_account() returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Giriş yapılmamış'; end if;
  delete from public.ha_groups where owner_id = me;
  delete from public.ha_transactions where user_id = me;
  delete from public.ha_group_members where user_id = me;
  delete from public.ha_invites where created_by = me;
  delete from public.ha_admins where user_id = me;
  delete from auth.users where id = me;
end $$;

revoke all on function public.ha_delete_my_account() from public, anon;
grant execute on function public.ha_delete_my_account() to authenticated;
