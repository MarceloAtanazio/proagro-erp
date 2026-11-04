-- Saldo da OT sem as reprovadas + estorno real do Flash + diferença "a conferir".
-- Reprovada no Flash saiu da conta e será descontada na próxima OT: não volta ao saldo (valor_devolvido = liberado − comprovado − reprovadas).
-- estorno_flash: soma das linhas "Estorno de saldo" do extrato (NULL = extrato sem estorno importado, nada a conferir).
-- conferir_valor: o que sobrou como devolvido mas não voltou como estorno. Fica visível até um administrador decidir
-- (justificar com nota, ou cobrar = vira pendência). Nunca é apagado em silêncio.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS estorno_flash numeric(12,2);
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS conferir_valor numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS conferir_decisao text;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS conferir_nota text;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS conferir_decidida_em timestamptz;
ALTER TABLE erp_viaticos_solicitacoes DROP CONSTRAINT IF EXISTS erp_viaticos_solicitacoes_conferir_decisao_check;
ALTER TABLE erp_viaticos_solicitacoes ADD CONSTRAINT erp_viaticos_solicitacoes_conferir_decisao_check
  CHECK (conferir_decisao IS NULL OR conferir_decisao IN ('justificado','cobrado'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_viaticos_solicitacoes' AND column_name='conferir_valor') THEN
    RAISE EXCEPTION 'coluna conferir_valor não foi criada';
  END IF;
END $$;
