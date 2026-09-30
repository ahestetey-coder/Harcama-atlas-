#!/usr/bin/env bash
# supabase/schema.sql dosyasını boş bir yerel PostgreSQL veritabanında dener.
# PGHOST/PGPORT/PGUSER ortam değişkenleriyle bağlantı ayarlanır.
set -euo pipefail
DB="ha_sql_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/test/supabase-shim.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/schema.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/schema.sql # ikinci kez: tekrar çalıştırılabilir olmalı
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/test/rls-test.sql 2>&1 | tee /dev/stderr | grep -q "TUM SQL TESTLERI GECTI"
