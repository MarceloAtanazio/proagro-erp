-- Viáticos: a pendência de estouro é decidida UMA vez, na viagem seguinte (descontar ou dispensar).
-- Depois da decisão ela é encerrada (pendencia_resolvida = true) e não reaparece; estas colunas
-- registram o que foi decidido, quando e em qual solicitação. ADITIVA e idempotente.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS pendencia_decisao text;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS pendencia_decidida_em timestamptz;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS pendencia_decidida_na integer;
ALTER TABLE erp_viaticos_solicitacoes DROP CONSTRAINT IF EXISTS erp_viaticos_solicitacoes_pendencia_decisao_check;
ALTER TABLE erp_viaticos_solicitacoes ADD CONSTRAINT erp_viaticos_solicitacoes_pendencia_decisao_check
  CHECK (pendencia_decisao IS NULL OR pendencia_decisao IN ('descontada', 'dispensada'));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_viaticos_solicitacoes'
     AND column_name IN ('pendencia_decisao', 'pendencia_decidida_em', 'pendencia_decidida_na');
  IF n <> 3 THEN RAISE EXCEPTION 'Migracao incompleta: colunas de decisao da pendencia (%/3)', n; END IF;
END $$;
