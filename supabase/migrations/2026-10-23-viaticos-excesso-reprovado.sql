-- Viáticos: excesso da TUD REPROVADO vira pendência a descontar na próxima OT do colaborador.
-- Guarda, por solicitação, o valor de cada excesso no momento em que foi reprovado ({chave: valor}).
-- Só reprovações feitas a partir de agora preenchem isto: as anteriores ficam como estavam (sem cobrança retroativa).
-- ADITIVA e idempotente.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS excessos_valores jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_viaticos_solicitacoes' AND column_name = 'excessos_valores';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: excessos_valores'; END IF;
END $$;
