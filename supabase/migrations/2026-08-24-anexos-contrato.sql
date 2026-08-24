-- ============================================================
-- Anexo do contrato assinado
-- 2026-08-24
-- ============================================================
-- Contratos passam a aceitar anexo (o documento assinado), reutilizando toda a
-- máquina de anexos: limite de 3 MB, whitelist de MIME, conferência da
-- assinatura do arquivo, download, exclusão e log de auditoria.
--
-- Operação ADITIVA: apenas amplia o conjunto aceito pelo CHECK. Nenhuma linha é
-- alterada e nenhum registro existente pode violar o novo CHECK, porque todos
-- os valores anteriores continuam na lista.
--
-- ROLLBACK:
--   DELETE FROM erp_attachments WHERE entity_type = 'contrato';
--   ALTER TABLE erp_attachments DROP CONSTRAINT erp_attachments_entity_type_check;
--   ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
--     CHECK (entity_type = ANY (ARRAY['payable'::text, 'receivable'::text, 'viatico'::text,
--       'colab_cnh'::text, 'colab_veiculo'::text, 'colab_seguro'::text]));

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;

ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'payable'::text, 'receivable'::text, 'viatico'::text,
    'colab_cnh'::text, 'colab_veiculo'::text, 'colab_seguro'::text,
    'contrato'::text
  ]));
