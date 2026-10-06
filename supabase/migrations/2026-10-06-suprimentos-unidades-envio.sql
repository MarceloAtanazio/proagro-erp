-- Suprimentos: controle por unidade física + rastreio do envio + termo assinado.
-- ADITIVA e idempotente.

CREATE TABLE IF NOT EXISTS erp_estoque_unidades (
  id            serial PRIMARY KEY,
  item_id       integer NOT NULL REFERENCES erp_estoque_itens(id),
  numero_serie  text NOT NULL DEFAULT '',
  patrimonio    text NOT NULL DEFAULT '',
  estado        text NOT NULL DEFAULT 'em_estoque',
  notes         text,
  created_by    integer REFERENCES erp_users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_estoque_unidades DROP CONSTRAINT IF EXISTS erp_estoque_unidades_estado_check;
ALTER TABLE erp_estoque_unidades ADD CONSTRAINT erp_estoque_unidades_estado_check
  CHECK (estado IN ('em_estoque', 'em_custodia', 'baixado'));
CREATE UNIQUE INDEX IF NOT EXISTS erp_estoque_unidades_serie_ux
  ON erp_estoque_unidades (item_id, numero_serie) WHERE numero_serie <> '';
CREATE UNIQUE INDEX IF NOT EXISTS erp_estoque_unidades_patrimonio_ux
  ON erp_estoque_unidades (patrimonio) WHERE patrimonio <> '';

ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS unidade_id integer REFERENCES erp_estoque_unidades(id);
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS forma_envio text;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS codigo_rastreio text;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS condicao_saida text;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS condicao_devolucao text;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS data_entrega date;

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY['payable','receivable','viatico','colab_cnh','colab_veiculo','colab_seguro',
    'viatico_km','contrato','rh_doc','rh_admissao_doc','envio_termo']));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_estoque_movimentos' AND column_name IN
     ('unidade_id','forma_envio','codigo_rastreio','condicao_saida','condicao_devolucao','data_entrega');
  IF n <> 6 THEN RAISE EXCEPTION 'Migracao incompleta: colunas de envio (%/6)', n; END IF;
  SELECT count(*) INTO n FROM information_schema.tables WHERE table_name = 'erp_estoque_unidades';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_estoque_unidades'; END IF;
END $$;
