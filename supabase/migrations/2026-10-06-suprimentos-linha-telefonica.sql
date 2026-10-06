-- Envio de celular: registra a linha telefônica (e a operadora) que vai junto com o aparelho.
-- ADITIVA e idempotente.
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS linha_telefonica text;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS operadora text;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_estoque_movimentos' AND column_name IN ('linha_telefonica','operadora');
  IF n <> 2 THEN RAISE EXCEPTION 'Migracao incompleta: linha_telefonica/operadora (%/2)', n; END IF;
END $$;
