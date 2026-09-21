-- ============================================================================
-- RH — logo do benefício, direto no catálogo
--
-- ADITIVA e idempotente.
--
-- Mesmo padrão de erp_attachments (arquivo binário no próprio Postgres — sem
-- S3, sem storage externo), mas como coluna do catálogo em vez de uma tabela
-- de anexos à parte: cada benefício tem NO MÁXIMO um logo, e a listagem em
-- cards precisa saber "tem logo ou não" sem uma query extra por card — daria
-- pra usar erp_attachments com um entity_type novo, mas isso exigiria join (ou
-- N+1) só pra pintar a grade. Coluna direta resolve com um único SELECT.
-- ============================================================================

ALTER TABLE erp_rh_beneficios ADD COLUMN IF NOT EXISTS logo_mime text;
ALTER TABLE erp_rh_beneficios ADD COLUMN IF NOT EXISTS logo_data bytea;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'erp_rh_beneficios' AND column_name = 'logo_data'
  ) THEN
    RAISE EXCEPTION 'Migracao incompleta: erp_rh_beneficios.logo_data nao foi criada';
  END IF;
END $$;
