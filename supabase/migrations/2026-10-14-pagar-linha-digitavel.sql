-- Contas a Pagar: linha digitável do boleto (só dígitos; a tela formata na exibição).
-- ADITIVA e idempotente.
ALTER TABLE erp_payables ADD COLUMN IF NOT EXISTS boleto_line text;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_payables' AND column_name = 'boleto_line';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_payables sem boleto_line'; END IF;
END $$;
