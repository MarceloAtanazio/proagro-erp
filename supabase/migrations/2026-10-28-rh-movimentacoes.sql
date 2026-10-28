-- Movimentações de carreira (promoção, mérito, dissídio, ajuste) com data de vigência, inclusive futura.
-- Cada linha é aplicada ao vínculo quando a vigência chega (cargo/departamento/salário) e grava a vigência de
-- salário na data certa (erp_rh_salario_hist), que é o que o histórico financeiro lê. Idempotente.
CREATE TABLE IF NOT EXISTS erp_rh_movimentacoes (
  id                    serial PRIMARY KEY,
  vinculo_id            integer NOT NULL REFERENCES erp_rh_vinculos(id) ON DELETE CASCADE,
  colaborador_id        integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  tipo                  text    NOT NULL CHECK (tipo IN ('promocao','merito','dissidio','ajuste')),
  vigencia_inicio       date    NOT NULL,
  cargo_novo            text,
  departamento_novo     text,
  salario_novo          numeric(12,2),
  percentual            numeric(8,4),
  cargo_anterior        text,
  departamento_anterior text,
  salario_anterior      numeric(12,2),
  motivo                text,
  obs                   text,
  status                text    NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','aplicada','cancelada')),
  aplicada_em           timestamptz,
  registrado_por        integer REFERENCES erp_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_rh_mov_colab_idx  ON erp_rh_movimentacoes (colaborador_id, vigencia_inicio DESC);
CREATE INDEX IF NOT EXISTS erp_rh_mov_fila_idx   ON erp_rh_movimentacoes (status, vigencia_inicio);

-- O backend só acessa por service role; mesma postura das demais tabelas erp_*.
ALTER TABLE erp_rh_movimentacoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regclass('public.erp_rh_movimentacoes') IS NULL THEN
    RAISE EXCEPTION 'tabela erp_rh_movimentacoes não foi criada';
  END IF;
END $$;
