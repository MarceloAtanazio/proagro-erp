-- OT complementar em Viáticos: a OT que estende o tempo no local ou parte da localização atual para um novo destino. Guarda a OT de
-- origem (mãe), o tipo e o ponto de partida (último destino da mãe), para a previsão e a rota não voltarem a usar a cidade-base. Idempotente.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS solicitacao_pai_id integer REFERENCES erp_viaticos_solicitacoes(id) ON DELETE SET NULL;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS complementar_tipo text;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS partida_uf text;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS partida_municipio text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_viaticos_solic_compl_tipo_chk') THEN
    ALTER TABLE erp_viaticos_solicitacoes ADD CONSTRAINT erp_viaticos_solic_compl_tipo_chk CHECK (complementar_tipo IS NULL OR complementar_tipo IN ('extensao','novo_destino'));
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name='erp_viaticos_solicitacoes' AND column_name IN ('solicitacao_pai_id','complementar_tipo','partida_uf','partida_municipio')) <> 4 THEN
    RAISE EXCEPTION 'colunas da OT complementar não foram criadas';
  END IF;
END $$;
