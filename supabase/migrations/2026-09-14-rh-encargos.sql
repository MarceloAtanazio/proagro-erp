-- ============================================================================
-- RH — tabelas de encargos e impostos, para o custo real do colaborador
--
-- ADITIVA e idempotente.
--
-- O custo tem DUAS naturezas, e elas não podem ser tratadas do mesmo jeito:
--
--   CUSTO DA EMPRESA (provisões + FGTS + INSS patronal + RAT) é ARITMÉTICA:
--     percentuais fixos sobre a remuneração. Dá para calcular com certeza.
--
--   SALÁRIO LÍQUIDO depende das tabelas de INSS e IRRF, que MUDAM TODO ANO.
--     Chutar faixa é pior que não mostrar: o número sai com cara de oficial e
--     vira base de decisão salarial.
--
-- Por isso as faixas são DADO editável, com `competencia` e `confirmada`. O
-- sistema nasce com a tabela de 2025 e `confirmada = false` — a tela mostra o
-- líquido com aviso até alguém conferir as faixas do ano corrente.
--
-- Uma linha só (id=1), como erp_viaticos_config.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_encargos (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  competencia        text NOT NULL,
  -- Falso enquanto ninguém confirmou que as faixas são as do ano vigente.
  confirmada         boolean NOT NULL DEFAULT false,

  -- [{ "ate": 1518.00, "aliquota": 7.5 }, ...] — progressivo, a última faixa
  -- é o teto: acima dela a contribuição não sobe.
  inss_faixas        jsonb NOT NULL,
  -- [{ "ate": 2259.20, "aliquota": 0, "deducao": 0 }, ...] — `ate: null` na
  -- última, que não tem teto.
  irrf_faixas        jsonb NOT NULL,
  irrf_dependente    numeric(10,2) NOT NULL DEFAULT 189.59,
  -- Desconto simplificado: substitui as deduções legais quando é mais vantajoso.
  irrf_simplificado  numeric(10,2) NOT NULL DEFAULT 607.20,

  -- Encargos patronais, em %. Incidem sobre remuneração + provisões.
  fgts_pct           numeric(6,3) NOT NULL DEFAULT 8,
  inss_patronal_pct  numeric(6,3) NOT NULL DEFAULT 20,
  -- RAT vai de 1 a 3 conforme o grau de risco da atividade; entra como dado.
  rat_pct            numeric(6,3) NOT NULL DEFAULT 1,
  -- Terceiros (Sistema S) começa em 0 porque a tabela de referência da empresa
  -- não o inclui — quem souber a alíquota do CNAE preenche.
  terceiros_pct      numeric(6,3) NOT NULL DEFAULT 0,

  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por     integer REFERENCES erp_users(id) ON DELETE SET NULL
);

-- Tabela de 2025, marcada como NÃO confirmada de propósito.
INSERT INTO erp_rh_encargos (id, competencia, confirmada, inss_faixas, irrf_faixas)
VALUES (1, '2025', false,
  '[{"ate": 1518.00, "aliquota": 7.5},
    {"ate": 2793.88, "aliquota": 9},
    {"ate": 4190.83, "aliquota": 12},
    {"ate": 8157.41, "aliquota": 14}]'::jsonb,
  '[{"ate": 2259.20, "aliquota": 0,    "deducao": 0},
    {"ate": 2826.65, "aliquota": 7.5,  "deducao": 169.44},
    {"ate": 3751.05, "aliquota": 15,   "deducao": 381.44},
    {"ate": 4664.68, "aliquota": 22.5, "deducao": 662.77},
    {"ate": null,    "aliquota": 27.5, "deducao": 896.00}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM erp_rh_encargos WHERE id = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_encargos sem a linha 1'; END IF;
  SELECT jsonb_array_length(inss_faixas) INTO n FROM erp_rh_encargos WHERE id = 1;
  IF n < 3 THEN RAISE EXCEPTION 'Faixas de INSS ausentes'; END IF;
END $$;
