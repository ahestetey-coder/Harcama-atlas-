-- Varlıklarım: güncel fiyat önbelleği (hisse, ETF, fon, kripto, altın).
-- market-rates sunucu fonksiyonu fiyatları buraya yazar ve tekrar kullanır; böylece aynı sembol için
-- her kullanıcıda ayrı ayrı dış kaynağa gidilmez. Tablo kullanıcıya ait bilgi tutmaz: yalnızca sembol ve fiyat.
-- Uygulamalar ve kullanıcılar doğrudan okuyamaz ya da yazamaz; yalnızca sunucu fonksiyonu (service role) erişir.
-- Tekrar çalıştırmak güvenlidir.

create table if not exists public.ha_price_cache (
  key text primary key check (key ~ '^(bist|us|tefas|crypto|gold|commodity):[A-Z0-9][A-Z0-9.-]{0,14}$'),
  price numeric not null check (price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  name text,
  as_of date not null,
  provider text not null,
  fetched_at timestamptz not null default now()
);

alter table public.ha_price_cache enable row level security;
revoke all on table public.ha_price_cache from anon, authenticated;
grant select, insert, update, delete on table public.ha_price_cache to service_role;

-- 30 günden eski fiyatlar her gece silinir (pg_cron kuruluysa).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ha-price-cache-cleanup';
    perform cron.schedule('ha-price-cache-cleanup', '15 3 * * *', $c$delete from public.ha_price_cache where fetched_at < now() - interval '30 days'$c$);
  end if;
end $$;
