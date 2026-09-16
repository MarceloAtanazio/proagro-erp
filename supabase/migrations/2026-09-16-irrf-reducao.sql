-- ============================================================================
-- IRRF — o redutor da Lei 15.270/2025
--
-- ADITIVA e idempotente.
--
-- Até 2025 o IRRF na fonte terminava na tabela progressiva: alíquota da faixa
-- sobre a base, menos a parcela a deduzir. A partir de 1º/01/2026 o imposto
-- apurado assim ainda passa por uma SEGUNDA ETAPA, o redutor:
--
--   rendimento tributável mensal <= 5.000,00  ->  redução de até R$ 312,89,
--                                                 que na prática zera o imposto
--   de 5.000,01 a 7.350,00  ->  978,62 - (0,133145 x rendimento), decrescendo
--                               em linha reta até sumir no teto
--   acima de 7.350,00       ->  sem redução
--
-- A redução é limitada ao imposto apurado (§ 1º) — nunca vira crédito — e vale
-- também no 13º. O rendimento que entra na fórmula é o TRIBUTÁVEL BRUTO, antes
-- do INSS; não é a base de cálculo.
--
-- Por que isso merece coluna própria em vez de virar mais uma faixa: o redutor
-- NÃO está na tabela progressiva. Quem atualiza as faixas de 2026 acerta a
-- tabela inteira e continua descontando a mais de todo mundo que está na rampa
-- dos 5.000 aos 7.350 — foi exatamente o que aconteceu aqui. Guardar o redutor
-- junto da tabela, e editável na mesma tela, é o que faz a próxima mudança de
-- lei ser um campo a trocar e não um cálculo a reescrever.
--
-- A competência da linha 1 também é acertada: as faixas gravadas já são as de
-- 2026 (teto do INSS 8.475,55; parcela a deduzir de 908,73 na última faixa do
-- IRRF; dependente 189,59; simplificado 607,20), só o rótulo ficou em "2025".
-- ============================================================================

ALTER TABLE erp_rh_encargos
  ADD COLUMN IF NOT EXISTS irrf_reducao jsonb NOT NULL
    DEFAULT '{"piso": 5000.00, "teto": 7350.00, "maxima": 312.89,
              "constante": 978.62, "fator": 0.133145}'::jsonb;

-- Linha já existente nasceu antes da coluna: recebe o mesmo conteúdo do default.
UPDATE erp_rh_encargos
   SET irrf_reducao = '{"piso": 5000.00, "teto": 7350.00, "maxima": 312.89,
                        "constante": 978.62, "fator": 0.133145}'::jsonb
 WHERE id = 1 AND (irrf_reducao IS NULL OR irrf_reducao = '{}'::jsonb);

-- Rótulo da competência, só quando as faixas gravadas forem mesmo as de 2026.
-- Sem esse teste a migração renomearia uma tabela velha para "2026" e apagaria
-- justamente o aviso que existe para denunciá-la.
UPDATE erp_rh_encargos
   SET competencia = '2026'
 WHERE id = 1
   AND competencia = '2025'
   AND (inss_faixas -> -1 ->> 'ate')::numeric = 8475.55
   AND (irrf_faixas -> -1 ->> 'deducao')::numeric = 908.73;

DO $$
DECLARE j jsonb;
BEGIN
  SELECT irrf_reducao INTO j FROM erp_rh_encargos WHERE id = 1;
  IF j IS NULL OR (j ->> 'teto') IS NULL OR (j ->> 'fator') IS NULL THEN
    RAISE EXCEPTION 'Migracao incompleta: erp_rh_encargos.irrf_reducao sem teto/fator';
  END IF;
END $$;
