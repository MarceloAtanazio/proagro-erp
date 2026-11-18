-- Viáticos: evidência da cotação (print/PDF) anexada à solicitação de viagem pelo Direcionador de mobilidade.
-- Propósito: aceitar o tipo de anexo 'viatico_cotacao' (entity_id = id de erp_viaticos_solicitacoes) em erp_attachments, para o solicitante anexar a evidência da diária do carro locado
--   (cotação) ou da indisponibilidade de carro para locação. Aditiva e idempotente: só amplia a lista de tipos aceitos; não altera nem apaga dados.
-- Entradas: nenhuma. Saídas: erp_attachments_entity_type_check passa a aceitar 'viatico_cotacao' além dos tipos que já aceitava.
-- Como executar: Supabase (SQL editor ou MCP apply_migration) no projeto wsieuqzrztlgxwotrjpy, somente com autorização do Marcelo.
ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY['payable','receivable','viatico','colab_cnh','colab_veiculo','colab_seguro',
    'viatico_km','contrato','rh_doc','rh_admissao_doc','envio_termo','rc_orcamento','termo_lote','viatico_cotacao']));
