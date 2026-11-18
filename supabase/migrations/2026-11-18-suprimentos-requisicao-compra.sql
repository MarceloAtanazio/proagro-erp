-- Suprimentos: REQUISIÇÃO DE COMPRA (do pedido até a aprovação, antes de efetivar a compra).
-- Propósito: registrar quem solicita, por que solicita, o que (itens), os orçamentos recebidos (fornecedor, valor, prazo, condição, anexo), a escolha de um orçamento com a
--   justificativa, a aprovação ou reprovação (quem, quando, por quê) e a efetivação da compra, com a linha do tempo de tudo. Aditiva e idempotente.
-- Fluxo (status): em_cotacao -> em_aprovacao -> aprovada | reprovada; aprovada -> comprada; cancelada a qualquer momento antes de comprada.
-- Entradas: nenhuma. Saídas: tabelas erp_compra_requisicoes, erp_compra_req_itens, erp_compra_req_orcamentos, erp_compra_req_eventos; o tipo de anexo 'rc_orcamento' (PDF/foto do orçamento)
--   passa a ser aceito em erp_attachments. orcamento_escolhido_id é mantido pela aplicação (sem chave estrangeira para evitar dependência circular entre as tabelas).
-- Como executar: Supabase (SQL editor ou MCP apply_migration) no projeto wsieuqzrztlgxwotrjpy, somente com autorização do Marcelo.

CREATE TABLE IF NOT EXISTS erp_compra_requisicoes (
  id                      serial PRIMARY KEY,
  data_solicitacao        date NOT NULL DEFAULT CURRENT_DATE,
  solicitante_id          integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL,
  solicitante_nome        text NOT NULL,
  titulo                  text NOT NULL,
  justificativa           text NOT NULL,
  urgencia                text NOT NULL DEFAULT 'normal',
  status                  text NOT NULL DEFAULT 'em_cotacao',
  orcamento_escolhido_id  integer,
  justificativa_escolha   text,
  escolhido_por           text,
  escolhido_em            timestamptz,
  enviada_aprovacao_em    timestamptz,
  decidido_por            integer REFERENCES erp_users(id) ON DELETE SET NULL,
  decidido_por_nome       text,
  decidido_em             timestamptz,
  decisao_motivo          text,
  comprada_em             date,
  compra_documento        text,
  compra_obs              text,
  cancelada_motivo        text,
  created_by              integer REFERENCES erp_users(id) ON DELETE SET NULL,
  created_by_nome         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_compra_requisicoes DROP CONSTRAINT IF EXISTS erp_compra_requisicoes_status_check;
ALTER TABLE erp_compra_requisicoes ADD CONSTRAINT erp_compra_requisicoes_status_check
  CHECK (status IN ('em_cotacao', 'em_aprovacao', 'aprovada', 'reprovada', 'comprada', 'cancelada'));
ALTER TABLE erp_compra_requisicoes DROP CONSTRAINT IF EXISTS erp_compra_requisicoes_urgencia_check;
ALTER TABLE erp_compra_requisicoes ADD CONSTRAINT erp_compra_requisicoes_urgencia_check CHECK (urgencia IN ('baixa', 'normal', 'alta'));
CREATE INDEX IF NOT EXISTS idx_compra_req_status ON erp_compra_requisicoes (status, data_solicitacao DESC);

CREATE TABLE IF NOT EXISTS erp_compra_req_itens (
  id              serial PRIMARY KEY,
  requisicao_id   integer NOT NULL REFERENCES erp_compra_requisicoes(id) ON DELETE CASCADE,
  item_id         integer REFERENCES erp_estoque_itens(id) ON DELETE SET NULL,
  descricao       text NOT NULL,
  tamanho         text,
  quantidade      numeric(14,3) NOT NULL CHECK (quantidade > 0),
  unidade         text,
  observacao      text
);
CREATE INDEX IF NOT EXISTS idx_compra_req_itens_req ON erp_compra_req_itens (requisicao_id);

CREATE TABLE IF NOT EXISTS erp_compra_req_orcamentos (
  id                  serial PRIMARY KEY,
  requisicao_id       integer NOT NULL REFERENCES erp_compra_requisicoes(id) ON DELETE CASCADE,
  supplier_id         integer REFERENCES erp_suppliers(id) ON DELETE SET NULL,
  fornecedor_nome     text NOT NULL,
  valor_total         numeric(14,2) NOT NULL CHECK (valor_total >= 0),
  prazo_entrega_dias  integer CHECK (prazo_entrega_dias IS NULL OR prazo_entrega_dias >= 0),
  condicao_pagamento  text,
  validade            date,
  observacao          text,
  created_by          integer REFERENCES erp_users(id) ON DELETE SET NULL,
  created_by_nome     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compra_req_orc_req ON erp_compra_req_orcamentos (requisicao_id);

CREATE TABLE IF NOT EXISTS erp_compra_req_eventos (
  id              serial PRIMARY KEY,
  requisicao_id   integer NOT NULL REFERENCES erp_compra_requisicoes(id) ON DELETE CASCADE,
  evento          text NOT NULL,
  detalhe         text,
  usuario_id      integer REFERENCES erp_users(id) ON DELETE SET NULL,
  usuario_nome    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compra_req_ev_req ON erp_compra_req_eventos (requisicao_id, created_at);

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY['payable','receivable','viatico','colab_cnh','colab_veiculo','colab_seguro',
    'viatico_km','contrato','rh_doc','rh_admissao_doc','envio_termo','rc_orcamento']));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name IN ('erp_compra_requisicoes','erp_compra_req_itens','erp_compra_req_orcamentos','erp_compra_req_eventos');
  IF n <> 4 THEN RAISE EXCEPTION 'Migracao incompleta: tabelas de requisicao de compra (%/4)', n; END IF;
END $$;
