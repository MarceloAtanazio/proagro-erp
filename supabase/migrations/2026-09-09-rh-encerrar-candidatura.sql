-- ============================================================================
-- RH — encerramento de candidatura no Quadro de admissão
--
-- ADITIVA e idempotente.
--
-- A tabela já tinha `situacao='cancelada'` e `cancelamento_motivo` (texto
-- livre). Faltava o que a pergunta do negócio precisa: encerrou por parte de
-- QUEM. "Perdemos 4 candidatos" e "reprovamos 4 candidatos" são diagnósticos
-- opostos — o primeiro é problema de proposta, o segundo é problema de funil —
-- e texto livre não responde nenhum dos dois num agregado.
--
-- Por isso `cancelamento_tipo` é código de catálogo. A PARTE (candidato ou
-- empresa) NÃO é coluna: sai do catálogo em código, para que reclassificar um
-- motivo no futuro leve junto as linhas antigas em vez de deixar duas verdades.
--
-- `encerrada_em` é DATE e separada de `updated_at`: a data em que o candidato
-- recusou é uma coisa, o dia em que alguém registrou isso no ERP é outra, e é
-- a primeira que entra na métrica.
-- ============================================================================

ALTER TABLE erp_rh_admissoes ADD COLUMN IF NOT EXISTS cancelamento_tipo text;
ALTER TABLE erp_rh_admissoes ADD COLUMN IF NOT EXISTS encerrada_em      date;
ALTER TABLE erp_rh_admissoes ADD COLUMN IF NOT EXISTS encerrada_por     integer REFERENCES erp_users(id) ON DELETE SET NULL;

-- Índice parcial: a consulta dos encerrados é sempre por situação + data, e as
-- canceladas são a minoria das linhas.
CREATE INDEX IF NOT EXISTS erp_rh_admissoes_encerradas_idx
  ON erp_rh_admissoes (encerrada_em DESC) WHERE situacao = 'cancelada';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_rh_admissoes'
     AND column_name IN ('cancelamento_tipo', 'encerrada_em', 'encerrada_por');
  IF n <> 3 THEN RAISE EXCEPTION 'Migracao incompleta: % de 3 colunas', n; END IF;
END $$;
