-- Desconto parcial de pendência em Viáticos: quando a transferência não cobre toda a pendência, desconta-se o que cabe e o resto segue em aberto.
-- Cada desconto (ou dispensa) fica registrado aqui: de qual OT veio a pendência, em qual OT/transferência foi abatida e quanto. Restante = valor_pendencia − soma dos descontos. Idempotente.
CREATE TABLE IF NOT EXISTS erp_viaticos_pendencia_abatimentos (
  id serial PRIMARY KEY,
  solicitacao_origem_id integer NOT NULL REFERENCES erp_viaticos_solicitacoes(id) ON DELETE CASCADE,
  solicitacao_destino_id integer NOT NULL REFERENCES erp_viaticos_solicitacoes(id) ON DELETE CASCADE,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  decisao text NOT NULL CHECK (decisao IN ('descontada','dispensada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_viaticos_pend_abat_origem_idx ON erp_viaticos_pendencia_abatimentos (solicitacao_origem_id);
CREATE INDEX IF NOT EXISTS erp_viaticos_pend_abat_destino_idx ON erp_viaticos_pendencia_abatimentos (solicitacao_destino_id);
DO $$ BEGIN
  IF to_regclass('erp_viaticos_pendencia_abatimentos') IS NULL THEN RAISE EXCEPTION 'tabela de abatimentos não foi criada'; END IF;
END $$;
