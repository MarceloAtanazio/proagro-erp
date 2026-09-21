-- ============================================================================
-- RH — adesão de benefício: "pendente" de cadastrar na plataforma do fornecedor
--
-- ADITIVA e idempotente.
--
-- O ERP registrar a adesão não significa que a pessoa já está de fato
-- funcionando no TotalPass, no plano de saúde, etc. — esse cadastro é feito à
-- parte, na plataforma de cada fornecedor, por fora do sistema. `pendente`
-- marca esse hiato: nasce true (fez a adesão aqui, falta cadastrar lá fora) e
-- vira false quando o RH confirma que terminou o cadastro externo.
-- ============================================================================

ALTER TABLE erp_rh_beneficio_colab ADD COLUMN IF NOT EXISTS pendente boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'erp_rh_beneficio_colab' AND column_name = 'pendente'
  ) THEN
    RAISE EXCEPTION 'Migracao incompleta: erp_rh_beneficio_colab.pendente nao foi criada';
  END IF;
END $$;
