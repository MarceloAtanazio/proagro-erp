-- ============================================================================
-- RH — vaga ganha descrição e onde foi divulgada
--
-- ADITIVA e idempotente.
--
-- `observacao` já existia, mas é nota interna (do RH, sobre o processo) — não
-- o texto que descreve a vaga em si (o que o cargo faz, requisitos), nem onde
-- ela foi anunciada. `divulgada_em` é texto livre, não catálogo: uma vaga
-- costuma sair em mais de uma plataforma ao mesmo tempo (ex.: "LinkedIn,
-- Gupy, indicação"), e uma lista fechada obrigaria escolher só uma.
-- ============================================================================

ALTER TABLE erp_rh_vagas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE erp_rh_vagas ADD COLUMN IF NOT EXISTS divulgada_em text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'erp_rh_vagas' AND column_name = 'descricao'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'erp_rh_vagas' AND column_name = 'divulgada_em'
  ) THEN
    RAISE EXCEPTION 'Migracao incompleta: erp_rh_vagas.descricao ou .divulgada_em nao foi criada';
  END IF;
END $$;
