-- Viáticos: "OT de custo extra" — uma complementar que pede só UM custo avulso (remarcação de passagem, bagagem, taxa/multa, pedágio…) sem
-- diária de hospedagem nem de alimentação. Ganha o tipo 'custo_extra' em complementar_tipo e a coluna custo_extra_tipo (qual custo). Idempotente.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS custo_extra_tipo text;
ALTER TABLE erp_viaticos_solicitacoes DROP CONSTRAINT IF EXISTS erp_viaticos_solic_compl_tipo_chk;
ALTER TABLE erp_viaticos_solicitacoes ADD CONSTRAINT erp_viaticos_solic_compl_tipo_chk
  CHECK (complementar_tipo IS NULL OR complementar_tipo IN ('extensao','novo_destino','custo_extra'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_viaticos_solicitacoes' AND column_name='custo_extra_tipo') THEN
    RAISE EXCEPTION 'coluna custo_extra_tipo não foi criada';
  END IF;
END $$;
