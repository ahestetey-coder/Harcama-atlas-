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
-- Gelişmiş paylaşım (Plus): grup bütçesi ve ödeme durumu
--
-- Grup bütçesini yalnızca yönetici belirler. Paylaştırılmış bir dönemdeki "A, B'ye öder" ödemeleri
-- yönetici veya ödemenin taraflarından biri "ödendi" olarak işaretler; grup üyeleri görür.

alter table public.ha_groups add column if not exists budget_kurus bigint;
do $$ begin
  alter table public.ha_groups add constraint ha_groups_budget_check check (budget_kurus is null or budget_kurus > 0);
exception when duplicate_object then null;
end $$;

create or replace function public.ha_set_group_budget(p_group uuid, p_budget bigint) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if p_budget is not null and p_budget <= 0 then raise exception 'Bütçe sıfırdan büyük olmalı'; end if;
  update public.ha_groups set budget_kurus = p_budget where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Grup bütçesini yalnızca grup yöneticisi değiştirebilir'; end if;
end $$;

create table if not exists public.ha_settlement_payments (
  group_id uuid not null,
  period_start date not null,
  from_user uuid not null,
  to_user uuid not null,
  amount_kurus bigint not null check (amount_kurus > 0),
  marked_by uuid not null,
  marked_at timestamptz not null default now(),
  primary key (group_id, period_start, from_user, to_user),
  -- Paylaşım geri alınınca veya grup silinince ödeme kayıtları da silinir
  foreign key (group_id, period_start) references public.ha_settlements(group_id, period_start) on delete cascade
);

alter table public.ha_settlement_payments enable row level security;
drop policy if exists ha_settlement_payments_read on public.ha_settlement_payments;
create policy ha_settlement_payments_read on public.ha_settlement_payments for select to authenticated using (public.ha_is_member(group_id));
revoke all on public.ha_settlement_payments from anon, authenticated;
grant select on public.ha_settlement_payments to authenticated;

create or replace function public.ha_mark_payment(p_group uuid, p_start date, p_from uuid, p_to uuid, p_amount bigint, p_paid boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış'; end if;
  if not public.ha_is_member(p_group) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
  if auth.uid() <> p_from and auth.uid() <> p_to
     and not exists (select 1 from public.ha_groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Ödemeyi yalnızca yönetici veya ödemenin tarafları işaretleyebilir';
  end if;
  if not exists (select 1 from public.ha_settlements where group_id = p_group and period_start = p_start) then
    raise exception 'Bu dönem paylaştırılmamış';
  end if;
  if not p_paid then
    delete from public.ha_settlement_payments where group_id = p_group and period_start = p_start and from_user = p_from and to_user = p_to;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Tutar geçersiz'; end if;
  if (select count(*) from public.ha_group_members where group_id = p_group and user_id in (p_from, p_to)) <> 2 then
    raise exception 'Ödeme yalnızca grup üyeleri arasında olabilir';
  end if;
  insert into public.ha_settlement_payments (group_id, period_start, from_user, to_user, amount_kurus, marked_by)
  values (p_group, p_start, p_from, p_to, p_amount, auth.uid())
  on conflict (group_id, period_start, from_user, to_user) do update set
    amount_kurus = excluded.amount_kurus, marked_by = excluded.marked_by, marked_at = now();
end $$;

revoke all on function public.ha_set_group_budget(uuid, bigint), public.ha_mark_payment(uuid, date, uuid, uuid, bigint, boolean) from public, anon;
grant execute on function public.ha_set_group_budget(uuid, bigint), public.ha_mark_payment(uuid, date, uuid, uuid, bigint, boolean) to authenticated;

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
  delete from public.ha_settlement_payments where from_user = me or to_user = me or marked_by = me;
  delete from public.ha_group_members where user_id = me;
  delete from public.ha_invites where created_by = me;
  delete from public.ha_admins where user_id = me;
  delete from auth.users where id = me;
end $$;

revoke all on function public.ha_delete_my_account() from public, anon;
grant execute on function public.ha_delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Plus+ koç: günlük ekonomi özeti ve haber kaynakları
--
-- Kaynakları (X hesapları ve RSS adresleri) yalnızca yönetici ekler. Günlük özeti "coach-news"
-- sunucu fonksiyonu yazar (servis anahtarıyla); giriş yapmış herkes okur, uygulama Plus+ olana gösterir.
-- Her maddede kaynak, bağlantı ve yayın tarihi saklanır; özet yalnızca bu maddelerden yazılır.

create table if not exists public.ha_news_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('x', 'rss')),
  value text not null check (char_length(value) between 1 and 300),
  label text check (label is null or char_length(label) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
alter table public.ha_news_sources enable row level security;
revoke all on public.ha_news_sources from anon, authenticated;
grant select on public.ha_news_sources to authenticated;
drop policy if exists "ha_news_sources_admin_read" on public.ha_news_sources;
create policy "ha_news_sources_admin_read" on public.ha_news_sources for select to authenticated using (public.ha_is_admin());

create table if not exists public.ha_coach_broadcasts (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  title text not null,
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ha_coach_broadcasts enable row level security;
revoke all on public.ha_coach_broadcasts from anon, authenticated;
grant select on public.ha_coach_broadcasts to authenticated;
drop policy if exists "ha_coach_broadcasts_read" on public.ha_coach_broadcasts;
create policy "ha_coach_broadcasts_read" on public.ha_coach_broadcasts for select to authenticated using (true);

-- Sohbet kullanım sayacı (günlük sınır için). İstemci erişemez; yalnızca sunucu fonksiyonu yazar.
create table if not exists public.ha_coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.ha_coach_usage enable row level security;
revoke all on public.ha_coach_usage from anon, authenticated;

create or replace function public.ha_admin_add_news_source(p_kind text, p_value text, p_label text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v text := btrim(p_value);
  new_id uuid;
begin
  perform public.ha_admin_require();
  if p_kind = 'x' then
    v := lower(regexp_replace(v, '^(https?://)?(www\.)?(x|twitter)\.com/|^@', '', 'i'));
    v := split_part(v, '/', 1);
    if v !~ '^[a-z0-9_]{1,15}$' then raise exception 'Geçerli bir X kullanıcı adı girin'; end if;
  elsif p_kind = 'rss' then
    if v !~* '^https://[^ ]+$' then raise exception 'RSS adresi https:// ile başlamalı'; end if;
  else
    raise exception 'Bilinmeyen kaynak türü';
  end if;
  insert into public.ha_news_sources (kind, value, label) values (p_kind, v, nullif(btrim(coalesce(p_label, '')), ''))
    on conflict (kind, value) do update set active = true, label = coalesce(excluded.label, ha_news_sources.label)
    returning id into new_id;
  return new_id;
end $$;

create or replace function public.ha_admin_set_news_source(p_id uuid, p_active boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  update public.ha_news_sources set active = p_active where id = p_id;
end $$;

create or replace function public.ha_admin_delete_news_source(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  delete from public.ha_news_sources where id = p_id;
end $$;

revoke all on function public.ha_admin_add_news_source(text, text, text), public.ha_admin_set_news_source(uuid, boolean), public.ha_admin_delete_news_source(uuid) from public, anon;
grant execute on function public.ha_admin_add_news_source(text, text, text), public.ha_admin_set_news_source(uuid, boolean), public.ha_admin_delete_news_source(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ortak ekonomi araştırma ajanı
--
-- Yalnızca yöneticinin eklediği ve kullanım koşullarını "izinli" olarak işaretlediği kaynaklar okunur.
-- Toplanan her madde kaynak bağlantısı, yazar/kurum, yayın ve alınma zamanı, dönem ve içerik türüyle saklanır;
-- aynı madde iki kez kaydedilmez (dedupe_key), aynı olayın kopyaları olay anahtarıyla birleştirilir ve ilk
-- resmî açıklamaya bağlanır. Raporlar taslak olarak yazılır; yayın öncesi denetimden geçen taslağı yalnızca
-- yönetici (editör) yayınlar. Kullanıcı sohbetleri ve kişisel veriler bu tablolara hiç girmez.

create table if not exists public.ha_experts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  title text check (title is null or char_length(title) <= 120),
  institution text check (institution is null or char_length(institution) <= 120),
  area text not null default 'tr_makro' check (area in ('tr_makro', 'global', 'bist', 'emtia', 'kripto', 'diger')),
  -- Kişisel görüş mü, kurum adına mı konuşuyor. Kişisel görüş raporda kurum görüşü gibi sunulmaz.
  speaks_for text not null default 'kisisel' check (speaks_for in ('kisisel', 'kurumsal')),
  profile_url text check (profile_url is null or profile_url ~* '^https://\S+$'),
  note text check (note is null or char_length(note) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ha_experts enable row level security;
revoke all on public.ha_experts from anon, authenticated;
grant select, insert, update, delete on public.ha_experts to authenticated;
drop policy if exists "ha_experts_admin" on public.ha_experts;
create policy "ha_experts_admin" on public.ha_experts for all to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Kaynaklar: eski haber kaynakları tablosu genişletilir (grup, erişim türü, koşul durumu, sağlık bilgileri).
alter table public.ha_news_sources drop constraint if exists ha_news_sources_kind_check;
alter table public.ha_news_sources add constraint ha_news_sources_kind_check check (kind in ('x', 'rss', 'tcmb_kur', 'data', 'api', 'page'));
alter table public.ha_news_sources alter column value type text;
alter table public.ha_news_sources drop constraint if exists ha_news_sources_value_check;
alter table public.ha_news_sources add constraint ha_news_sources_value_check check (
  char_length(value) between 1 and 300
  and ((kind = 'x' and value ~ '^[a-z0-9_]{1,15}$') or (kind <> 'x' and value ~* '^https://\S+$')));
alter table public.ha_news_sources add column if not exists grp text not null default 'haber_uzman';
alter table public.ha_news_sources add column if not exists default_type text not null default 'haber';
alter table public.ha_news_sources add column if not exists terms_status text not null default 'inceleniyor';
alter table public.ha_news_sources add column if not exists terms_url text;
alter table public.ha_news_sources add column if not exists terms_note text;
alter table public.ha_news_sources add column if not exists terms_checked_at timestamptz;
alter table public.ha_news_sources add column if not exists poll_minutes integer not null default 60;
alter table public.ha_news_sources add column if not exists expert_id uuid references public.ha_experts (id) on delete set null;
alter table public.ha_news_sources add column if not exists last_checked_at timestamptz;
alter table public.ha_news_sources add column if not exists last_ok_at timestamptz;
alter table public.ha_news_sources add column if not exists last_error text;
alter table public.ha_news_sources add column if not exists last_error_at timestamptz;
alter table public.ha_news_sources add column if not exists last_item_at timestamptz;
alter table public.ha_news_sources add column if not exists items_total integer not null default 0;
alter table public.ha_news_sources drop constraint if exists ha_news_sources_meta_check;
alter table public.ha_news_sources add constraint ha_news_sources_meta_check check (
  grp in ('tr_resmi', 'global_resmi', 'haber_uzman', 'piyasa')
  and default_type in ('resmi_veri', 'sirket_aciklamasi', 'haber', 'uzman_yorumu', 'tahmin')
  and terms_status in ('inceleniyor', 'izinli', 'izinsiz')
  and (terms_url is null or terms_url ~* '^https://\S+$')
  and (terms_note is null or char_length(terms_note) <= 500)
  and poll_minutes between 10 and 10080
  -- Piyasa fiyatı yalnızca lisanslı/resmî fiyat kaynağından gelir; haber kaynağı fiyat grubuna konamaz.
  and (grp <> 'piyasa' or kind in ('tcmb_kur', 'api')));
grant insert, update, delete on public.ha_news_sources to authenticated;
drop policy if exists "ha_news_sources_admin_write" on public.ha_news_sources;
create policy "ha_news_sources_admin_write" on public.ha_news_sources for all to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Toplanan maddeler (yalnızca yönetici görür; kullanıcılar maddeleri yayınlanmış raporun kaynak listesinde görür).
create table if not exists public.ha_research_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.ha_news_sources (id) on delete set null,
  dedupe_key text not null unique,
  url text not null check (url ~* '^https?://\S+$'),
  title text not null,
  body text not null default '',
  author text,
  institution text not null,
  published_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  period text,
  content_type text not null check (content_type in ('resmi_veri', 'sirket_aciklamasi', 'haber', 'uzman_yorumu', 'tahmin')),
  expert_id uuid references public.ha_experts (id) on delete set null,
  event_key text,
  primary_item_id uuid references public.ha_research_items (id) on delete set null,
  -- Kurallarla hesaplanmış değerler (ör. kurun önceki güne göre değişimi). Raporda rakamlar buradan gelir.
  data jsonb
);
create index if not exists ha_research_items_published on public.ha_research_items (published_at desc);
create index if not exists ha_research_items_event on public.ha_research_items (event_key);
alter table public.ha_research_items enable row level security;
revoke all on public.ha_research_items from anon, authenticated;
grant select on public.ha_research_items to authenticated;
drop policy if exists "ha_research_items_admin_read" on public.ha_research_items;
create policy "ha_research_items_admin_read" on public.ha_research_items for select to authenticated using (public.ha_is_admin());

-- Yayın takvimi: planlı açıklamaların (TÜİK verisi, faiz kararı) çevresinde ilgili kaynak sık kontrol edilir.
create table if not exists public.ha_release_calendar (
  id uuid primary key default gen_random_uuid(),
  institution text not null check (char_length(institution) between 2 and 80),
  title text not null check (char_length(title) between 2 and 160),
  release_at timestamptz not null,
  period text check (period is null or char_length(period) <= 20),
  source_id uuid references public.ha_news_sources (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ha_release_calendar_at on public.ha_release_calendar (release_at);
alter table public.ha_release_calendar enable row level security;
revoke all on public.ha_release_calendar from anon, authenticated;
grant select, insert, update, delete on public.ha_release_calendar to authenticated;
drop policy if exists "ha_release_calendar_admin" on public.ha_release_calendar;
create policy "ha_release_calendar_admin" on public.ha_release_calendar for all to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Raporlar: sunucu fonksiyonu taslak yazar ve denetler (checks); yönetici yayınlar, reddeder veya geri çeker.
-- Herkes yalnızca yayınlanmış raporları okur. Metin değişiklikleri de sunucu fonksiyonundan geçer ki denetim atlanmasın.
create table if not exists public.ha_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gunluk', 'haftalik', 'aylik', 'acil')),
  title text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null default 'taslak' check (status in ('taslak', 'yayinda', 'reddedildi', 'geri_cekildi')),
  topics jsonb not null default '[]'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  first_checks jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by text not null default 'otomatik',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid,
  status_note text
);
create index if not exists ha_reports_published on public.ha_reports (status, published_at desc);
alter table public.ha_reports enable row level security;
revoke all on public.ha_reports from anon, authenticated;
grant select on public.ha_reports to authenticated;
drop policy if exists "ha_reports_read" on public.ha_reports;
create policy "ha_reports_read" on public.ha_reports for select to authenticated using (status = 'yayinda' or public.ha_is_admin());

create table if not exists public.ha_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ha_reports (id) on delete cascade,
  version integer not null,
  topics jsonb not null,
  checks jsonb not null,
  edited_by uuid,
  edited_at timestamptz not null default now(),
  note text,
  after_publish boolean not null default false
);
alter table public.ha_report_revisions enable row level security;
revoke all on public.ha_report_revisions from anon, authenticated;
grant select on public.ha_report_revisions to authenticated;
drop policy if exists "ha_report_revisions_admin_read" on public.ha_report_revisions;
create policy "ha_report_revisions_admin_read" on public.ha_report_revisions for select to authenticated using (public.ha_is_admin());

-- Ajan ayarları ve kullanım limitleri (tek satır). Toplama, piyasa verisi ve yapay zekâ ayrı sınırlanır.
create table if not exists public.ha_agent_settings (
  id integer primary key default 1 check (id = 1),
  collect_daily_max integer not null default 2000 check (collect_daily_max between 0 and 100000),
  market_daily_max integer not null default 50 check (market_daily_max between 0 and 10000),
  ai_research_monthly_tokens integer not null default 3000000 check (ai_research_monthly_tokens >= 0),
  ai_coach_monthly_tokens integer not null default 5000000 check (ai_coach_monthly_tokens >= 0),
  coach_daily_limit integer not null default 30 check (coach_daily_limit between 0 and 500),
  updated_at timestamptz not null default now()
);
insert into public.ha_agent_settings (id) values (1) on conflict do nothing;
alter table public.ha_agent_settings enable row level security;
revoke all on public.ha_agent_settings from anon, authenticated;
grant select, update on public.ha_agent_settings to authenticated;
drop policy if exists "ha_agent_settings_admin" on public.ha_agent_settings;
create policy "ha_agent_settings_admin" on public.ha_agent_settings for all to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Günlük kullanım: istek ve yapay zekâ token sayıları; koçun yönlendirme denetimine takılma sayıları.
-- Kişiye ait hiçbir bilgi tutulmaz.
create table if not exists public.ha_agent_usage (
  day date not null,
  kind text not null check (kind in ('collect', 'market', 'ai_research', 'ai_coach', 'koc_yeniden', 'koc_engel')),
  amount bigint not null default 0,
  primary key (day, kind)
);
alter table public.ha_agent_usage enable row level security;
revoke all on public.ha_agent_usage from anon, authenticated;
grant select on public.ha_agent_usage to authenticated;
drop policy if exists "ha_agent_usage_admin_read" on public.ha_agent_usage;
create policy "ha_agent_usage_admin_read" on public.ha_agent_usage for select to authenticated using (public.ha_is_admin());

create table if not exists public.ha_agent_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('toplama', 'rapor', 'koc_testi')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb not null default '{}'::jsonb,
  error text
);
create index if not exists ha_agent_runs_job on public.ha_agent_runs (job, started_at desc);
alter table public.ha_agent_runs enable row level security;
revoke all on public.ha_agent_runs from anon, authenticated;
grant select on public.ha_agent_runs to authenticated;
drop policy if exists "ha_agent_runs_admin_read" on public.ha_agent_runs;
create policy "ha_agent_runs_admin_read" on public.ha_agent_runs for select to authenticated using (public.ha_is_admin());

alter table public.ha_coach_usage add column if not exists tokens integer not null default 0;

-- Sunucu fonksiyonlarının kullandığı sayaçlar (yalnızca servis anahtarı).
create or replace function public.ha_agent_usage_add(p_kind text, p_amount bigint, p_day date default null) returns bigint
  language sql security definer set search_path = public as $$
  insert into public.ha_agent_usage (day, kind, amount)
    values (coalesce(p_day, (now() at time zone 'Europe/Istanbul')::date), p_kind, p_amount)
    on conflict (day, kind) do update set amount = ha_agent_usage.amount + excluded.amount
    returning amount
$$;

-- Koç sohbeti: başarılı yanıttan SONRA çağrılır; sınır dolmuşsa -1 döner, sayaç artmaz.
create or replace function public.ha_coach_usage_bump(p_user uuid, p_day date, p_limit integer, p_tokens integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.ha_coach_usage (user_id, day, count, tokens) values (p_user, p_day, 0, 0) on conflict do nothing;
  update public.ha_coach_usage set count = count + 1, tokens = tokens + greatest(p_tokens, 0)
   where user_id = p_user and day = p_day and count < p_limit
   returning count into n;
  return coalesce(n, -1);
end $$;

revoke all on function public.ha_agent_usage_add(text, bigint, date), public.ha_coach_usage_bump(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.ha_agent_usage_add(text, bigint, date), public.ha_coach_usage_bump(uuid, date, integer, integer) to service_role;

-- Editör işlemleri
create or replace function public.ha_admin_report_publish(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r public.ha_reports;
begin
  perform public.ha_admin_require();
  select * into r from public.ha_reports where id = p_id for update;
  if not found then raise exception 'Rapor bulunamadı'; end if;
  if r.status <> 'taslak' then raise exception 'Yalnızca taslak yayınlanabilir'; end if;
  if coalesce((r.checks->>'ok')::boolean, false) is not true then raise exception 'Yayın öncesi denetimde çözülmemiş sorun var'; end if;
  update public.ha_reports set status = 'yayinda', published_at = now(), published_by = auth.uid(), status_note = null, updated_at = now() where id = p_id;
end $$;

create or replace function public.ha_admin_report_set_status(p_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  cur text;
begin
  perform public.ha_admin_require();
  select status into cur from public.ha_reports where id = p_id for update;
  if not found then raise exception 'Rapor bulunamadı'; end if;
  if p_status = 'reddedildi' and cur <> 'taslak' then raise exception 'Yalnızca taslak reddedilebilir'; end if;
  if p_status = 'geri_cekildi' and cur <> 'yayinda' then raise exception 'Yalnızca yayındaki rapor geri çekilebilir'; end if;
  if p_status = 'taslak' and cur not in ('reddedildi', 'geri_cekildi') then raise exception 'Bu rapor taslağa alınamaz'; end if;
  if p_status not in ('reddedildi', 'geri_cekildi', 'taslak') then raise exception 'Geçersiz durum'; end if;
  update public.ha_reports set status = p_status, status_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), updated_at = now() where id = p_id;
end $$;

-- Yönetici ölçümleri (son 30 gün)
create or replace function public.ha_admin_research_metrics() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - interval '30 days';
  today date := (now() at time zone 'Europe/Istanbul')::date;
  month_start date := date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date;
  res jsonb;
begin
  perform public.ha_admin_require();
  select jsonb_build_object(
    'taslak', (select count(*) from public.ha_reports where created_at >= since),
    'yayinlanan', (select count(*) from public.ha_reports where published_at >= since),
    'kaynaksizIddia', (select coalesce(sum((first_checks->'counts'->>'kaynaksiz')::int), 0) from public.ha_reports where created_at >= since),
    'kaynaksizRakam', (select coalesce(sum((first_checks->'counts'->>'kaynaksizRakam')::int), 0) from public.ha_reports where created_at >= since),
    'eskiVeri', (select coalesce(sum((first_checks->'counts'->>'eskiVeri')::int), 0) from public.ha_reports where created_at >= since),
    'kaynakSayisi', (select coalesce(sum((first_checks->'counts'->>'kaynakSayisi')::int), 0) from public.ha_reports where created_at >= since),
    'raporYonlendirme', (select coalesce(sum((first_checks->'counts'->>'yonlendirme')::int), 0) from public.ha_reports where created_at >= since),
    'yakalamaDakikaMedyan', (select round((percentile_cont(0.5) within group (order by extract(epoch from (ingested_at - published_at)) / 60))::numeric, 1)
                               from public.ha_research_items where ingested_at >= since and content_type in ('resmi_veri', 'sirket_aciklamasi') and ingested_at >= published_at),
    'duzeltilenRapor', (select count(distinct report_id) from public.ha_report_revisions v join public.ha_reports r on r.id = v.report_id where v.after_publish and r.published_at >= since),
    'kocYenidenYazildi', (select coalesce(sum(amount), 0) from public.ha_agent_usage where kind = 'koc_yeniden' and day >= since::date),
    'kocEngellendi', (select coalesce(sum(amount), 0) from public.ha_agent_usage where kind = 'koc_engel' and day >= since::date),
    'sonKocTesti', (select to_jsonb(x) from (select started_at, ok, stats from public.ha_agent_runs where job = 'koc_testi' and finished_at is not null order by started_at desc limit 1) x),
    'sonToplama', (select to_jsonb(x) from (select started_at, ok, stats, error from public.ha_agent_runs where job = 'toplama' and finished_at is not null order by started_at desc limit 1) x),
    'bugun', (select coalesce(jsonb_object_agg(kind, amount), '{}'::jsonb) from public.ha_agent_usage where day = today),
    'buAy', (select coalesce(jsonb_object_agg(kind, s), '{}'::jsonb) from (select kind, sum(amount) s from public.ha_agent_usage where day >= month_start group by kind) m)
  ) into res;
  return res;
end $$;

revoke all on function public.ha_admin_report_publish(uuid), public.ha_admin_report_set_status(uuid, text, text), public.ha_admin_research_metrics() from public, anon;
grant execute on function public.ha_admin_report_publish(uuid), public.ha_admin_report_set_status(uuid, text, text), public.ha_admin_research_metrics() to authenticated;

-- Önerilen resmî kaynaklar: KAPALI ve "koşullar inceleniyor" olarak eklenir. Yönetici kullanım koşullarını
-- okuyup "izinli" yapmadan ve açmadan hiçbiri okunmaz.
insert into public.ha_news_sources (kind, value, label, active, grp, default_type, terms_status, poll_minutes) values
  ('tcmb_kur', 'https://www.tcmb.gov.tr/kurlar/today.xml', 'TCMB gösterge kurları', false, 'piyasa', 'resmi_veri', 'inceleniyor', 120),
  ('rss', 'https://tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Bottom+Menu/Diger/RSS/PPK+Kararlari', 'TCMB PPK kararları', false, 'tr_resmi', 'resmi_veri', 'inceleniyor', 120),
  ('rss', 'https://www.federalreserve.gov/feeds/press_all.xml', 'Fed basın duyuruları', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 120),
  ('rss', 'https://www.ecb.europa.eu/rss/press.html', 'ECB basın duyuruları', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 120),
  ('rss', 'https://www.bls.gov/feed/bls_latest.rss', 'ABD BLS temel göstergeler', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 120),
  ('rss', 'https://www.sec.gov/news/pressreleases.rss', 'SEC basın duyuruları', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 240),
  ('rss', 'https://www.imf.org/en/News/rss?language=eng', 'IMF haberleri', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 240),
  ('rss', 'https://www.bis.org/doclist/all_pressrels.rss', 'BIS basın duyuruları', false, 'global_resmi', 'resmi_veri', 'inceleniyor', 240)
on conflict (kind, value) do nothing;
