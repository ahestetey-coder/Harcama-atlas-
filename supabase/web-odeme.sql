-- Web aboneliği kurulumu (tek seferlik). Supabase > SQL Editor'da bir kez çalıştırın; tekrar çalıştırmak zararsızdır.
-- İçerik supabase/schema.sql'deki "Web aboneliği (Paddle)" bölümüyle ve güncellenen üç fonksiyonla aynıdır.

-- ---------------------------------------------------------------------------------------------
-- Web aboneliği (Paddle)
--
-- Site üzerinden Paddle ile alınan abonelikler. Paddle satıcı kaydıdır (Merchant of Record): ödeme,
-- vergi ve fatura onda. Paddle'ın bildirimleri (webhook) ha-paddle-webhook fonksiyonuna gelir; her olay
-- ha_webhook_events'e bir kez yazılır, abonelik ha_subscriptions'ta tutulur ve paket ha_user_plans'a
-- işlenir. Uygulama değişmeden ha_my_plan() ile paketi görür. Uygulamada web ödemesine bağlantı yoktur.
--
-- Fiyatlar ve kampanya kodları yönetici panelinden değişir; ha-billing fonksiyonu bunları Paddle'a aktarır.
-- Gizli anahtarlar (Paddle API anahtarı) veritabanında değil, Edge Function Secrets'ta durur.

-- Paketin kaynağı: yönetici/deneme seçimi ya da Paddle aboneliği. Paddle yalnızca kendi satırını bitirir.
alter table public.ha_user_plans add column if not exists source text not null default 'admin';
alter table public.ha_user_plans drop constraint if exists ha_user_plans_source_check;
alter table public.ha_user_plans add constraint ha_user_plans_source_check check (source in ('admin', 'paddle'));

-- Tek satırlık bağlantı ayarı. Herkes okuyabilir: istemci anahtarı (client token) zaten herkese açıktır.
create table if not exists public.ha_billing_settings (
  id int primary key default 1 check (id = 1),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  client_token text check (client_token is null or client_token ~ '^(test|live)_[A-Za-z0-9]{10,}$'),
  product_ids jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  sync_error text,
  updated_at timestamptz not null default now()
);
insert into public.ha_billing_settings (id) values (1) on conflict (id) do nothing;
alter table public.ha_billing_settings enable row level security;
revoke all on public.ha_billing_settings from anon, authenticated;
grant select on public.ha_billing_settings to anon, authenticated;
grant update (environment, client_token) on public.ha_billing_settings to authenticated;
drop policy if exists ha_billing_settings_read on public.ha_billing_settings;
create policy ha_billing_settings_read on public.ha_billing_settings for select to anon, authenticated using (true);
drop policy if exists ha_billing_settings_admin on public.ha_billing_settings;
create policy ha_billing_settings_admin on public.ha_billing_settings for update to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Yalnızca sunucu fonksiyonlarının okuduğu sırlar (Paddle'ın bildirim imza anahtarı). Hiçbir rol okuyamaz.
create table if not exists public.ha_billing_secrets (
  id int primary key default 1 check (id = 1),
  webhook_secret text,
  notification_id text,
  updated_at timestamptz not null default now()
);
alter table public.ha_billing_secrets enable row level security;
revoke all on public.ha_billing_secrets from anon, authenticated;

-- Web fiyatları (kuruş, KDV dahil). Herkes okur: site fiyatları buradan gösterir.
create table if not exists public.ha_web_prices (
  plan text not null check (plan in ('plus', 'plusplus')),
  period text not null check (period in ('monthly', 'yearly')),
  amount_kurus int not null check (amount_kurus between 2700 and 10000000),
  trial_days int not null default 0 check (trial_days between 0 and 30),
  active boolean not null default true,
  paddle_price_id text,
  updated_at timestamptz not null default now(),
  primary key (plan, period)
);
insert into public.ha_web_prices (plan, period, amount_kurus, trial_days) values
  ('plus', 'monthly', 9999, 7),
  ('plus', 'yearly', 95990, 7),
  ('plusplus', 'monthly', 19999, 7),
  ('plusplus', 'yearly', 191990, 7)
on conflict (plan, period) do nothing;
alter table public.ha_web_prices enable row level security;
revoke all on public.ha_web_prices from anon, authenticated;
grant select on public.ha_web_prices to anon, authenticated;
grant update (amount_kurus, trial_days, active) on public.ha_web_prices to authenticated;
drop policy if exists ha_web_prices_read on public.ha_web_prices;
create policy ha_web_prices_read on public.ha_web_prices for select to anon, authenticated using (true);
drop policy if exists ha_web_prices_admin on public.ha_web_prices;
create policy ha_web_prices_admin on public.ha_web_prices for update to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Kampanya kodları. Liste yalnızca yöneticiye açık; ziyaretçi bir kodu ha_check_coupon ile dener.
create table if not exists public.ha_coupons (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  percent_off int not null check (percent_off between 1 and 100),
  plans text[] not null default array['plus', 'plusplus'] check (plans <@ array['plus', 'plusplus'] and cardinality(plans) > 0),
  periods text[] not null default array['monthly', 'yearly'] check (periods <@ array['monthly', 'yearly'] and cardinality(periods) > 0),
  -- Kaç ödeme döneminde geçerli; null: abonelik boyunca
  recur_intervals int check (recur_intervals is null or recur_intervals between 1 and 36),
  usage_limit int check (usage_limit is null or usage_limit > 0),
  expires_at timestamptz,
  active boolean not null default true,
  note text check (note is null or char_length(note) <= 200),
  paddle_discount_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ha_coupons enable row level security;
revoke all on public.ha_coupons from anon, authenticated;
grant select, insert, delete on public.ha_coupons to authenticated;
grant update (percent_off, plans, periods, recur_intervals, usage_limit, expires_at, active, note) on public.ha_coupons to authenticated;
drop policy if exists ha_coupons_admin on public.ha_coupons;
create policy ha_coupons_admin on public.ha_coupons for all to authenticated using (public.ha_is_admin()) with check (public.ha_is_admin());

-- Kod denemeleri: kod tahminini zorlaştırmak için kişi başına saatte en çok 20 deneme.
create table if not exists public.ha_coupon_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists ha_coupon_attempts_user on public.ha_coupon_attempts (user_id, at desc);
alter table public.ha_coupon_attempts enable row level security;
revoke all on public.ha_coupon_attempts from anon, authenticated;

-- Kod geçerliyse indirim yüzdesini döndürür, değilse null. Yalnızca giriş yapmış kişi dener; kod listesi açığa çıkmaz.
drop function if exists public.ha_check_coupon(text, text, text);
create or replace function public.ha_check_coupon(p_code text, p_plan text, p_period text) returns int
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Giriş yapılmamış'; end if;
  if (select count(*) from public.ha_coupon_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    raise exception 'Çok fazla kod denendi. Bir saat sonra tekrar dene.';
  end if;
  insert into public.ha_coupon_attempts (user_id) values (me);
  delete from public.ha_coupon_attempts where at < now() - interval '1 day';
  return (select percent_off from public.ha_coupons
    where code = upper(trim(p_code)) and active and paddle_discount_id is not null
      and p_plan = any (plans) and p_period = any (periods)
      and (expires_at is null or expires_at > now()));
end $$;
revoke all on function public.ha_check_coupon(text, text, text) from public, anon;
grant execute on function public.ha_check_coupon(text, text, text) to authenticated;

-- Paddle abonelikleri. Kişi kendi aboneliğini, yönetici hepsini okur; yalnızca sunucu yazar.
-- Hesap silinse de muhasebe için kayıt kalır (user_id boşalır).
create table if not exists public.ha_subscriptions (
  id text primary key check (id ~ '^sub_[a-z0-9]+$'),
  user_id uuid references auth.users (id) on delete set null,
  customer_id text not null,
  plan text not null check (plan in ('plus', 'plusplus')),
  period text not null check (period in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'paused', 'canceled')),
  price_id text,
  amount_kurus int,
  currency text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at timestamptz,
  discount_code text,
  event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ha_subscriptions_user on public.ha_subscriptions (user_id, updated_at desc);
alter table public.ha_subscriptions enable row level security;
revoke all on public.ha_subscriptions from anon, authenticated;
grant select on public.ha_subscriptions to authenticated;
drop policy if exists ha_subscriptions_read on public.ha_subscriptions;
create policy ha_subscriptions_read on public.ha_subscriptions for select to authenticated using (user_id = auth.uid() or public.ha_is_admin());

-- Paddle bildirimleri: her olay kimliğiyle bir kez işlenir (tekrar gelen bildirim yok sayılır).
create table if not exists public.ha_webhook_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb not null check (pg_column_size(payload) < 200000)
);
create index if not exists ha_webhook_events_received on public.ha_webhook_events (received_at desc);
alter table public.ha_webhook_events enable row level security;
revoke all on public.ha_webhook_events from anon, authenticated;
grant select on public.ha_webhook_events to authenticated;
drop policy if exists ha_webhook_events_admin on public.ha_webhook_events;
create policy ha_webhook_events_admin on public.ha_webhook_events for select to authenticated using (public.ha_is_admin());

-- Aboneliği yazar ve paketi işler. Yalnızca sunucu (service_role) çağırır. Eski tarihli olay, daha yeni
-- bir olayla yazılmış aboneliği ezmez (Paddle bildirimleri sırasız gelebilir).
-- Paket, dönem sonuna 3 gün tolerans eklenerek verilir; ödeme yenilenince Paddle yeni olay gönderir.
create or replace function public.ha_apply_subscription(p jsonb) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_id text := p ->> 'id';
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
  v_status text := p ->> 'status';
  v_plan text := p ->> 'plan';
  v_at timestamptz := (p ->> 'event_at')::timestamptz;
  v_end timestamptz := (p ->> 'current_period_end')::timestamptz;
  v_trial timestamptz := (p ->> 'trial_end')::timestamptz;
  v_until timestamptz;
  v_prev timestamptz;
  v_cur record;
begin
  -- Aynı aboneliğin eşzamanlı bildirimleri sırayla işlenir
  perform pg_advisory_xact_lock(hashtext('ha_sub:' || v_id));
  select event_at into v_prev from public.ha_subscriptions where id = v_id;
  if v_prev is not null and v_prev > v_at then return 'eski'; end if;
  if v_user is not null and not exists (select 1 from auth.users where id = v_user) then v_user := null; end if;

  insert into public.ha_subscriptions (id, user_id, customer_id, plan, period, status, price_id, amount_kurus, currency, current_period_end, trial_end, cancel_at, discount_code, event_at)
  values (v_id, v_user, p ->> 'customer_id', v_plan, p ->> 'period', v_status, p ->> 'price_id', (p ->> 'amount_kurus')::int, p ->> 'currency',
          v_end, v_trial, (p ->> 'cancel_at')::timestamptz, p ->> 'discount_code', v_at)
  on conflict (id) do update set
    user_id = coalesce(excluded.user_id, ha_subscriptions.user_id), customer_id = excluded.customer_id, plan = excluded.plan,
    period = excluded.period, status = excluded.status, price_id = excluded.price_id, amount_kurus = excluded.amount_kurus,
    currency = excluded.currency, current_period_end = excluded.current_period_end, trial_end = excluded.trial_end,
    cancel_at = excluded.cancel_at, discount_code = coalesce(excluded.discount_code, ha_subscriptions.discount_code),
    event_at = excluded.event_at, updated_at = now();

  select user_id into v_user from public.ha_subscriptions where id = v_id;
  if v_user is null then return 'kullanici-yok'; end if;

  if v_status in ('active', 'trialing', 'past_due') then
    v_until := coalesce(greatest(v_end, v_trial), now() + interval '1 day') + interval '3 days';
    -- Yöneticinin verdiği eşit ya da daha güçlü paket (aynı/üst paket, daha geç ya da süresiz) korunur
    select * into v_cur from public.ha_user_plans where user_id = v_user;
    if v_cur.source = 'admin' and (v_cur.plan = 'plusplus' or v_cur.plan = v_plan)
       and (v_cur.expires_at is null or v_cur.expires_at >= v_until) then
      return 'yonetici';
    end if;
    insert into public.ha_user_plans (user_id, plan, expires_at, granted_by, source)
      values (v_user, v_plan, v_until, null, 'paddle')
      on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, granted_by = null, granted_at = now(), source = 'paddle';
    return 'verildi';
  end if;

  -- İptal ya da duraklatma: paket yalnızca Paddle'dan geldiyse ve başka etkin abonelik yoksa biter
  select * into v_cur from public.ha_user_plans where user_id = v_user;
  if v_cur.source = 'paddle' and not exists (
    select 1 from public.ha_subscriptions where user_id = v_user and id <> v_id and status in ('active', 'trialing', 'past_due')
  ) then
    update public.ha_user_plans set expires_at = least(coalesce(expires_at, now()), now()) where user_id = v_user;
    return 'bitti';
  end if;
  return 'degismedi';
end $$;
revoke all on function public.ha_apply_subscription(jsonb) from public, anon, authenticated;
grant execute on function public.ha_apply_subscription(jsonb) to service_role;


-- Güncellenen fonksiyonlar: paket kaynağı, canlıda ödemesiz seçimin kapanması, abonelik sürerken hesap silme engeli
create or replace function public.ha_admin_set_plan(p_user uuid, p_plan text, p_expires timestamptz) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.ha_admin_require();
  if p_plan = 'free' then
    delete from public.ha_user_plans where user_id = p_user;
  elsif p_plan in ('plus', 'plusplus') then
    if p_expires is not null and p_expires <= now() then raise exception 'Bitiş tarihi gelecekte olmalı'; end if;
    insert into public.ha_user_plans (user_id, plan, expires_at, granted_by, source) values (p_user, p_plan, p_expires, auth.uid(), 'admin')
      on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, granted_by = excluded.granted_by, granted_at = now(), source = 'admin';
  else
    raise exception 'Geçersiz paket';
  end if;
end $$;

create or replace function public.ha_test_choose_plan(p_plan text) returns text
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Giriş yapılmamış'; end if;
  -- Gerçek ödeme başlayınca (Paddle canlı ortam) ödemesiz seçim kapanır
  if to_regclass('public.ha_billing_settings') is not null and exists (select 1 from public.ha_billing_settings where environment = 'production') then
    raise exception 'Ödemesiz paket seçimi kapandı';
  end if;
  -- Web aboneliğiyle gelen paket ödemesiz seçimle değiştirilemez (iptal edilince doğru bitsin)
  if exists (select 1 from public.ha_user_plans where user_id = me and source = 'paddle' and (expires_at is null or expires_at > now())) then
    raise exception 'Web aboneliğin sürüyor; paketini abonelik sayfandan değiştir';
  end if;
  if p_plan = 'free' then
    delete from public.ha_user_plans where user_id = me;
  elsif p_plan in ('plus', 'plusplus') then
    insert into public.ha_user_plans (user_id, plan, expires_at, granted_by, source) values (me, p_plan, null, me, 'admin')
      on conflict (user_id) do update set plan = excluded.plan, expires_at = null, granted_by = me, granted_at = now(), source = 'admin';
  else
    raise exception 'Geçersiz paket';
  end if;
  return p_plan;
end $$;

create or replace function public.ha_delete_my_account() returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Giriş yapılmamış'; end if;
  -- Web aboneliği sürerken hesap silinirse Paddle ödeme almaya devam eder; önce iptal edilmeli
  if to_regclass('public.ha_subscriptions') is not null and exists (
    select 1 from public.ha_subscriptions where user_id = me and status in ('active', 'trialing', 'past_due', 'paused') and cancel_at is null
  ) then
    raise exception 'Web aboneliğin sürüyor. Hesabını silmeden önce aboneliğini iptal et.';
  end if;
  delete from public.ha_groups where owner_id = me;
  delete from public.ha_transactions where user_id = me;
  delete from public.ha_settlement_payments where from_user = me or to_user = me or marked_by = me;
  delete from public.ha_group_members where user_id = me;
  delete from public.ha_invites where created_by = me;
  delete from public.ha_admins where user_id = me;
  delete from auth.users where id = me;
end $$;
