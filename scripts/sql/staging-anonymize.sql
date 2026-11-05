BEGIN;

-- Анонимизация staging-БД (ТЗ §6): дамп с прода используется только как схема и наполнение,
-- персональные данные заменяются до того, как staging начнёт отвечать на запросы.
-- Запускается только на staging-БД (scripts/staging-db-refresh.sh).

DO $guard$
BEGIN
  IF current_database() IN ('tamir_rs', 'tamir_prod', 'tamir_development') THEN
    RAISE EXCEPTION 'staging-anonymize запрещено запускать на базе %', current_database();
  END IF;
  IF current_database() NOT LIKE '%staging%' AND current_database() NOT LIKE '%dev%' THEN
    RAISE EXCEPTION 'staging-anonymize: неожиданное имя базы %', current_database();
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS tamir_staging;
CREATE TABLE IF NOT EXISTS tamir_staging.anonymized_column (
  relation    text NOT NULL,
  column_name text NOT NULL,
  rows_masked integer NOT NULL,
  masked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (relation, column_name)
);

-- Покрытие PII строим по information_schema, а не по жёсткому списку таблиц:
-- Medusa может переложить модуль, и новую колонку мы не пропустили бы.
DO $anon$
DECLARE
  r record;
  rel text;
  col text;
  expr text;
  affected integer;
  pii_columns text[] := ARRAY[
    'email','first_name','last_name','phone','company',
    'address_1','address_2','address_3','address1','address2',
    'city','province','postal_code','zip_code',
    'receiver','recipient','contact','tracking_number',
    'ip','ip_address','fingerprint','user_agent'
  ];
  -- Эти таблицы не трогаем: без них staging не работает (country/region) или ломается вход в админку.
  keep_tables text[] := ARRAY[
    'auth_user','api_key','sales_channel','store','region','country','shipping_option',
    'tax_region','price_list','product','product_variant','collection','category'
  ];
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = ANY (pii_columns)
      AND c.data_type IN ('character varying','text','character')
      AND c.table_name <> ALL (keep_tables)
    ORDER BY c.table_name, c.column_name
  LOOP
    rel := format('%I', r.table_name);
    col := format('%I', r.column_name);
    CASE r.column_name
      -- Хеш от исходного значения: адреса остаются разными, уникальные индексы не конфликтают.
      WHEN 'email' THEN expr := $expr$'staging-' || md5(email::text) || '@anon.invalid'$expr$;
      WHEN 'first_name' THEN expr := '''Anonim''';
      WHEN 'last_name' THEN expr := '''Anonimovic''';
      WHEN 'company' THEN expr := '''ANON d.o.o.''';
      WHEN 'phone' THEN expr := '''000000000''';
      WHEN 'ip', 'ip_address' THEN expr := '''203.0.113.10''';
      WHEN 'fingerprint' THEN expr := '''staging-fingerprint''';
      WHEN 'user_agent' THEN expr := '''staging-anonymized''';
      WHEN 'tracking_number' THEN expr := '''STAGING-TRACK''';
      WHEN 'receiver', 'recipient', 'contact' THEN expr := '''Anonim Anonimovic''';
      ELSE expr := '''ANON''';
    END CASE;
    BEGIN
      EXECUTE format('UPDATE %s SET %s = %s WHERE %s IS NOT NULL', rel, col, expr, col);
      GET DIAGNOSTICS affected = ROW_COUNT;
      EXECUTE $ins$INSERT INTO tamir_staging.anonymized_column (relation, column_name, rows_masked)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (relation, column_name) DO UPDATE
                     SET rows_masked = EXCLUDED.rows_masked, masked_at = now()$ins$
        USING r.table_name, r.column_name, affected;
      RAISE NOTICE 'anonymized %.% rows=%', r.table_name, r.column_name, affected;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END
$anon$;

-- Сервисные строки staging-смысла не имеют и могут содержать реальные адреса/коды.
DO $clean$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND (table_name ILIKE '%registration_code%' OR table_name ILIKE '%password_reset%'
           OR table_name ILIKE '%login_rate%' OR table_name ILIKE '%review_rate%'
           OR table_name ILIKE '%one_time_password%')
    ORDER BY table_name
  LOOP
    BEGIN
      EXECUTE format('TRUNCATE TABLE %I', t);
      RAISE NOTICE 'truncated %', t;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip truncate %: %', t, SQLERRM;
    END;
  END LOOP;
END
$clean$;

-- Контроль результата: ни одной строки с оригинальным email быть не должно.
DO $verify$
DECLARE
  r record;
  leftover integer;
  total_leftover integer := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'email'
      AND c.data_type IN ('character varying','text')
      AND c.table_name <> 'auth_user'
    ORDER BY c.table_name
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE email IS NOT NULL AND email NOT LIKE %L',
        r.table_name, '%@anon.invalid'
      ) INTO leftover;
      total_leftover := total_leftover + leftover;
      IF leftover > 0 THEN
        RAISE WARNING 'осталось оригинальных email в %: %', r.table_name, leftover;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip verify %: %', r.table_name, SQLERRM;
    END;
  END LOOP;
  IF total_leftover > 0 THEN
    RAISE EXCEPTION 'анонимизация не завершена: строк с оригинальным email: %', total_leftover;
  END IF;
  RAISE NOTICE 'анонимизация завершена: оригинальных email не осталось';
END
$verify$;

ANALYZE;
COMMIT;
