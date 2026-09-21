-- ============================================================================
-- RH — controle de férias
--
-- ADITIVA e idempotente.
--
-- Duas tabelas, porque são duas coisas diferentes:
--
--   PERÍODO AQUISITIVO é o direito que nasce sozinho, 12 meses depois do
--   anterior (ou da admissão, no primeiro) — ninguém "cria" um período, ele
--   existe pelo simples fato de a pessoa ter completado o ano. Por isso o
--   servidor os GERA sob demanda (função `rhSincronizarFerias`), em vez de
--   alguém precisar lembrar de abrir um a cada aniversário de casa.
--
--   GOZO é o que alguém de fato REGISTRA: uma parcela tirada, ou convertida em
--   abono pecuniário. Um período pode ter até 3 parcelas (art. 134 §1º CLT).
--
-- Esta primeira versão RASTREIA e REGISTRA — não calcula o valor da folha de
-- férias. O valor a pagar continua vindo da contabilidade externa e entrando
-- em Contas a Pagar, do mesmo jeito que já é com a rescisão.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_ferias_periodos (
  id             serial PRIMARY KEY,
  vinculo_id     integer NOT NULL REFERENCES erp_rh_vinculos(id) ON DELETE CASCADE,
  -- Denormalizado de propósito: toda consulta desta tela filtra por PESSOA, e
  -- vinculo_id sozinho obrigaria um JOIN a mais em cada uma delas.
  colaborador_id integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  -- O ano que se está formando: começa na admissão (ou no dia seguinte ao fim
  -- do período anterior) e completa 12 meses depois.
  periodo_inicio date NOT NULL,
  periodo_fim    date NOT NULL,
  -- Prazo para GOZAR o que foi adquirido (art. 134 CLT): 12 meses depois do
  -- período fechar. Passar disso com saldo é férias vencidas — a lei manda
  -- pagar em dobro, mas essa conta não está nesta versão.
  limite_gozo    date NOT NULL,
  -- 30 por padrão; editável quando falta abusiva reduz o direito (art. 130
  -- CLT) — sempre com uma observação de por quê, cobrada na aplicação.
  dias_direito   smallint NOT NULL DEFAULT 30 CHECK (dias_direito BETWEEN 0 AND 30),
  observacao     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Um vínculo não tem dois períodos começando no mesmo dia — é o que faz a
  -- geração idempotente: rodar de novo não duplica nada.
  UNIQUE (vinculo_id, periodo_inicio)
);
CREATE INDEX IF NOT EXISTS erp_rh_ferias_periodos_colab_ix ON erp_rh_ferias_periodos (colaborador_id);
CREATE INDEX IF NOT EXISTS erp_rh_ferias_periodos_limite_ix ON erp_rh_ferias_periodos (limite_gozo);

CREATE TABLE IF NOT EXISTS erp_rh_ferias_gozos (
  id               serial PRIMARY KEY,
  periodo_id       integer NOT NULL REFERENCES erp_rh_ferias_periodos(id) ON DELETE CASCADE,
  inicio           date NOT NULL,
  fim              date NOT NULL CHECK (fim >= inicio),
  dias             smallint NOT NULL CHECK (dias > 0),
  -- Conversão em dinheiro de até 1/3 do período (art. 143 CLT), em vez de
  -- descanso de fato. Ocupa saldo do mesmo jeito — só não é dia de folga.
  abono_pecuniario boolean NOT NULL DEFAULT false,
  observacao       text,
  registrado_em    timestamptz NOT NULL DEFAULT now(),
  registrado_por   integer REFERENCES erp_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS erp_rh_ferias_gozos_periodo_ix ON erp_rh_ferias_gozos (periodo_id);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name IN ('erp_rh_ferias_periodos', 'erp_rh_ferias_gozos');
  IF n <> 2 THEN RAISE EXCEPTION 'Migracao incompleta: faltou tabela de ferias (achei %)', n; END IF;
END $$;
