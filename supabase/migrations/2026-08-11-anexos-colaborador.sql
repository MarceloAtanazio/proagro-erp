-- ============================================================
-- Anexos de documentos do colaborador (CNH, veículo/CRLV, apólice)
-- 2026-08-11
-- ============================================================
-- O CHECK de erp_attachments.entity_type aceitava apenas os três tipos
-- originais. Documentos de colaborador reutilizam toda a máquina de anexos já
-- existente (limite de 3 MB, whitelist de MIME, conferência da assinatura do
-- arquivo, download, exclusão e log de auditoria), então basta ampliar o
-- conjunto permitido.
--
-- Operação puramente ADITIVA: amplia o conjunto aceito, não altera nem remove
-- nenhuma linha. Nenhum registro existente pode violar o novo CHECK, porque os
-- três valores antigos continuam na lista.
--
-- ROLLBACK (se algum dia for preciso desfazer):
--   DELETE FROM erp_attachments WHERE entity_type LIKE 'colab_%';
--   ALTER TABLE erp_attachments DROP CONSTRAINT erp_attachments_entity_type_check;
--   ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
--     CHECK (entity_type = ANY (ARRAY['payable'::text, 'receivable'::text, 'viatico'::text]));

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;

ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'payable'::text, 'receivable'::text, 'viatico'::text,
    'colab_cnh'::text, 'colab_veiculo'::text, 'colab_seguro'::text
  ]));

-- Busca dos anexos de um colaborador por seção (a tela abre os três blocos de
-- uma vez, então a consulta por entity_type + entity_id é o caminho quente).
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON erp_attachments (entity_type, entity_id);
