// Widen only physical measurements. PostgreSQL float8 is returned as a JS
// number, matching Medusa's number properties. Prices keep their exact numeric
// storage; quantities, ranks and other integer columns are not changed.
export const decimalAttributesSchema = `
DO $$
DECLARE
  target_table text;
  target_column text;
  column_type text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['product_variant', 'inventory_item'] LOOP
    FOREACH target_column IN ARRAY ARRAY['weight', 'length', 'height', 'width'] LOOP
      SELECT data_type INTO column_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = target_table
          AND column_name = target_column;
      IF column_type IS NULL THEN
        RAISE EXCEPTION 'Missing measurement column %.%', target_table, target_column;
      ELSIF column_type IN ('smallint', 'integer', 'bigint') THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE double precision USING %I::double precision',
          target_table, target_column, target_column);
      ELSIF column_type <> 'double precision' THEN
        RAISE EXCEPTION 'Unexpected measurement type for %.%: %', target_table, target_column, column_type;
      END IF;
    END LOOP;
  END LOOP;
END $$;
`
