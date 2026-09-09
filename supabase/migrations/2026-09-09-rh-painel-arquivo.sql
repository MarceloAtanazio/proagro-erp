-- ============================================================================
-- RH — arquivamento de colaborador, treinamentos e pesquisa de clima
--
-- ADITIVA e idempotente.
--
-- Por que `arquivado_em` e não reusar `ativo=false`: desde a fase do Kanban,
-- ativo=false significa "candidato em admissão". Se arquivar também usasse esse
-- flag, um ex-funcionário arquivado apareceria como candidato no Quadro. São
-- dois estados diferentes e precisam de duas colunas.
--
--   ativo=true                          -> colaborador
--   ativo=false + admissão em andamento -> candidato
--   arquivado_em IS NOT NULL            -> arquivado (fora de tudo)
-- ============================================================================

ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS arquivado_em    timestamptz;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS arquivado_por   integer REFERENCES erp_users(id) ON DELETE SET NULL;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS arquivado_motivo text;
CREATE INDEX IF NOT EXISTS erp_colaboradores_arquivado_idx
  ON erp_colaboradores (arquivado_em) WHERE arquivado_em IS NOT NULL;

-- ---------------------------------------------------------------------------
-- DESENVOLVIMENTO — treinamentos, certificações e capacitações.
--
-- `validade` é o que torna a tabela útil para compliance e não só para
-- histórico: NR, brigada e primeiros socorros vencem, e vencido é pendência.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_treinamentos (
  id             serial PRIMARY KEY,
  colaborador_id integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  titulo         text NOT NULL,
  tipo           text,                    -- obrigatorio | tecnico | comportamental | idioma | pos | outro
  instituicao    text,
  carga_horaria  numeric(6,1),            -- horas
  concluido_em   date,
  validade       date,                    -- NULL = não vence
  custo          numeric(12,2),
  obrigatorio    boolean NOT NULL DEFAULT false,
  observacao     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     integer REFERENCES erp_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS erp_rh_treinamentos_colab_idx ON erp_rh_treinamentos (colaborador_id, concluido_em DESC);
CREATE INDEX IF NOT EXISTS erp_rh_treinamentos_validade_idx ON erp_rh_treinamentos (validade) WHERE validade IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CLIMA E ENGAJAMENTO — respostas por ciclo.
--
-- `colaborador_id` é OPCIONAL de propósito: pesquisa de clima que identifica
-- quem respondeu não mede clima, mede o que a pessoa acha seguro dizer. Quando
-- nulo, a resposta é anônima e só conta para o agregado.
--
-- eNPS de 0 a 10 (promotor 9-10, neutro 7-8, detrator 0-6) e satisfação de 1 a
-- 5 — as duas escalas mais usadas, para o número poder ser comparado com o
-- mercado em vez de só consigo mesmo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_clima (
  id             serial PRIMARY KEY,
  ciclo          text NOT NULL,                     -- ex.: '2026-S1'
  colaborador_id integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL,
  departamento   text,                              -- guardado à parte: permite recortar sem identificar
  enps           smallint CHECK (enps BETWEEN 0 AND 10),
  satisfacao     smallint CHECK (satisfacao BETWEEN 1 AND 5),
  comentario     text,
  respondido_em  timestamptz NOT NULL DEFAULT now(),
  created_by     integer REFERENCES erp_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS erp_rh_clima_ciclo_idx ON erp_rh_clima (ciclo);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name IN ('erp_rh_treinamentos','erp_rh_clima');
  IF n <> 2 THEN RAISE EXCEPTION 'Migracao incompleta: % de 2 tabelas', n; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='erp_colaboradores' AND column_name IN ('arquivado_em','arquivado_por','arquivado_motivo');
  IF n <> 3 THEN RAISE EXCEPTION 'Migracao incompleta: % de 3 colunas de arquivo', n; END IF;
END $$;
