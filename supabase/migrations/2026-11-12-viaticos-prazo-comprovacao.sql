-- Propósito: prazo de comprovação de Viáticos (3 dias úteis após o fim da viagem), bloqueio por atraso e liberação pelo administrador.
--   comprovacao_fechada_em: quando a comprovação foi fechada (base do indicador "tempo / atraso para comprovar"). Preenchida pelo botão Fechar/conferir;
--     para as já fechadas, é recuperada do log de auditoria ("Fechou/conferiu a solicitação de viático ID n"). As sem registro no log ficam vazias.
--   comprovacao_liberada_em / _por / _motivo: liberação de uma comprovação em atraso (só administrador, com justificativa).
-- Entradas: nenhuma. Saídas: 4 colunas novas em erp_viaticos_solicitacoes + preenchimento do histórico. Idempotente.
-- Como executar: no SQL do Supabase (projeto do ERP) ou via migração. Não apaga nem altera dados existentes além de preencher colunas novas.
ALTER TABLE erp_viaticos_solicitacoes
  ADD COLUMN IF NOT EXISTS comprovacao_fechada_em timestamptz,
  ADD COLUMN IF NOT EXISTS comprovacao_liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS comprovacao_liberada_por text,
  ADD COLUMN IF NOT EXISTS comprovacao_liberada_motivo text;

UPDATE erp_viaticos_solicitacoes s
   SET comprovacao_fechada_em = a.em
  FROM (SELECT (regexp_match(action, 'solicitação de viático ID (\d+)'))[1]::int AS sid, MAX(created_at) AS em
          FROM erp_audit_log
         WHERE action LIKE 'Fechou/conferiu a solicitação de viático ID %'
         GROUP BY 1) a
 WHERE s.id = a.sid AND s.comprovacao_fechada_em IS NULL
   AND s.status IN ('comprovado','devolvido','divergente','arquivado');

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='erp_viaticos_solicitacoes'
        AND column_name IN ('comprovacao_fechada_em','comprovacao_liberada_em','comprovacao_liberada_por','comprovacao_liberada_motivo')) <> 4 THEN
    RAISE EXCEPTION 'colunas do prazo de comprovação não foram criadas';
  END IF;
END $$;
