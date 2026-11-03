-- Despesas REPROVADAS no Flash (coluna "Prestação de contas" = Reprovado no Excel de comprovação).
-- Não entram no comprovado: o colaborador usou o valor, que conta como devolvido ao Flash (liberado − comprovado) e vira
-- pendência a descontar na próxima OT. Fica numa tabela própria para não misturar com as despesas comprovadas, cujas somas
-- alimentam o comprovado, o devolvido e os relatórios. Idempotente (reimportar o mesmo arquivo não duplica).
CREATE TABLE IF NOT EXISTS erp_viaticos_reprovadas (
  id             serial PRIMARY KEY,
  solicitacao_id integer NOT NULL REFERENCES erp_viaticos_solicitacoes(id) ON DELETE CASCADE,
  data           date    NOT NULL,
  descricao      text,
  categoria      text,
  valor          numeric(12,2) NOT NULL CHECK (valor > 0),
  import_batch   text,
  import_linha   integer,
  created_by     integer REFERENCES erp_users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_via_reprov_import_uq
  ON erp_viaticos_reprovadas (solicitacao_id, import_batch, import_linha) WHERE import_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_via_reprov_sol_idx ON erp_viaticos_reprovadas (solicitacao_id);
ALTER TABLE erp_viaticos_reprovadas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regclass('public.erp_viaticos_reprovadas') IS NULL THEN
    RAISE EXCEPTION 'tabela erp_viaticos_reprovadas não foi criada';
  END IF;
END $$;
