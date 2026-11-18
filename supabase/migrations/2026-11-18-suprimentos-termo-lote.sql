-- Suprimentos: TERMO ÚNICO por lote de equipamentos + ESTADO de saída obrigatório.
-- Propósito: reunir vários equipamentos de um mesmo colaborador em UM termo de responsabilidade (um PDF, um anexo assinado) e guardar o estado do equipamento na saída
--   (Novo, Seminovo, Usado, Recondicionado), que o termo imprime. O termo é uma linha em erp_estoque_termos; cada envio aponta para ele em erp_estoque_movimentos.termo_id.
--   O termo assinado é anexado ao termo (entity_type 'termo_lote'), e "Marcar entregue" passa a aceitar o anexo do termo do lote. Aditiva e idempotente.
-- Entradas: nenhuma. Saídas: tabela erp_estoque_termos; colunas erp_estoque_movimentos.termo_id e .estado_saida; tipo de anexo 'termo_lote' aceito em erp_attachments.
-- Como executar: Supabase (SQL editor ou MCP apply_migration) no projeto wsieuqzrztlgxwotrjpy. Aplicada em 2026-11-18 com autorização do Marcelo.
CREATE TABLE IF NOT EXISTS erp_estoque_termos (
  id               serial PRIMARY KEY,
  colaborador_id   integer NOT NULL REFERENCES erp_colaboradores(id),
  justificativa    text,
  observacoes      text,
  emitido_por      integer REFERENCES erp_users(id) ON DELETE SET NULL,
  emitido_por_nome text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS termo_id integer REFERENCES erp_estoque_termos(id) ON DELETE SET NULL;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS estado_saida text;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_termo ON erp_estoque_movimentos (termo_id) WHERE termo_id IS NOT NULL;

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY['payable','receivable','viatico','colab_cnh','colab_veiculo','colab_seguro',
    'viatico_km','contrato','rh_doc','rh_admissao_doc','envio_termo','rc_orcamento','termo_lote']));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_estoque_movimentos' AND column_name IN ('termo_id','estado_saida');
  IF n <> 2 THEN RAISE EXCEPTION 'Migracao incompleta: colunas do termo de lote (%/2)', n; END IF;
END $$;
