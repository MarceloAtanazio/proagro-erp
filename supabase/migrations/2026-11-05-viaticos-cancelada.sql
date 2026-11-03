-- Cancelamento de solicitação de Viáticos antes da viagem: novo status 'cancelada' e o registro de quem cancelou, quando e por quê. Idempotente.
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS cancelada_por integer;
ALTER TABLE erp_viaticos_solicitacoes ADD COLUMN IF NOT EXISTS cancelamento_motivo text;
ALTER TABLE erp_viaticos_solicitacoes DROP CONSTRAINT IF EXISTS erp_viaticos_solicitacoes_status_check;
ALTER TABLE erp_viaticos_solicitacoes ADD CONSTRAINT erp_viaticos_solicitacoes_status_check CHECK (status = ANY (ARRAY['em_approvals','transferencia_agendada','liberado','em_viagem','aguardando_comprovacao','comprovado','devolvido','divergente','arquivado','cancelada']));
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name='erp_viaticos_solicitacoes' AND column_name IN ('cancelada_em','cancelada_por','cancelamento_motivo')) <> 3 THEN
    RAISE EXCEPTION 'colunas do cancelamento não foram criadas';
  END IF;
END $$;
