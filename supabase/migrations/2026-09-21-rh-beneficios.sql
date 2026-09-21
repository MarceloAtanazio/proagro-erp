-- ============================================================================
-- RH — catálogo de benefícios e adesão
--
-- ADITIVA e idempotente.
--
-- Hoje só existem três benefícios possíveis, e cada um é uma coluna booleana
-- fixa do vínculo (totalpass, clube_saude, seguro_vida): adicionar um quarto
-- benefício exigiria migração E código novo toda vez. Isto vira catálogo — o
-- mesmo desenho que já usamos para Cargos: uma tabela que a própria tela
-- alimenta, sem precisar de deploy para cada linha nova.
--
-- Duas tabelas: o CATÁLOGO (o que a empresa oferece, com o custo de cada um) e
-- a ADESÃO (quem está inscrito em quê, desde quando). As colunas antigas
-- (totalpass, clube_saude, seguro_vida, vt_opcao) continuam existindo — não são
-- desta migração mexer nelas; o catálogo é para os benefícios que vêm daqui
-- para a frente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_beneficios (
  id                serial PRIMARY KEY,
  nome              text NOT NULL,
  -- saude | odonto | alimentacao | transporte | bem_estar | outro
  categoria         text,
  fornecedor        text,
  -- O que a empresa paga e o que desconta do colaborador — nem todo benefício
  -- é de graça (plano de saúde costuma ter coparticipação).
  custo_empresa     numeric(12,2) NOT NULL DEFAULT 0,
  custo_colaborador numeric(12,2) NOT NULL DEFAULT 0,
  -- mensal | anual — só para a tela rotular certo; a soma do custo de pessoal
  -- trata tudo como mensal (anual dividido por 12 ficaria para uma v2).
  periodicidade     text NOT NULL DEFAULT 'mensal',
  -- Benefício que a empresa parou de oferecer some da lista de "+ Inscrever",
  -- mas continua existindo — quem já estava inscrito é histórico.
  ativo             boolean NOT NULL DEFAULT true,
  observacao        text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        integer REFERENCES erp_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS erp_rh_beneficios_ativo_ix ON erp_rh_beneficios (ativo);

CREATE TABLE IF NOT EXISTS erp_rh_beneficio_colab (
  id                serial PRIMARY KEY,
  beneficio_id      integer NOT NULL REFERENCES erp_rh_beneficios(id) ON DELETE CASCADE,
  colaborador_id    integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  desde             date NOT NULL DEFAULT CURRENT_DATE,
  -- NULL = inscrição em vigor. Preenchido quando a pessoa sai do benefício
  -- (não do benefício ter sido apagado — apagar SEMPRE preserva quem já teve).
  ate               date,
  -- Sobrescreve o custo do catálogo para ESTA pessoa (ex.: plano com
  -- dependente, que custa mais que o valor-base). NULL usa o do catálogo.
  valor_colaborador numeric(12,2),
  observacao        text,
  registrado_em     timestamptz NOT NULL DEFAULT now(),
  registrado_por    integer REFERENCES erp_users(id) ON DELETE SET NULL,
  CHECK (ate IS NULL OR ate >= desde)
);
CREATE INDEX IF NOT EXISTS erp_rh_beneficio_colab_colab_ix ON erp_rh_beneficio_colab (colaborador_id);
-- Só uma inscrição EM VIGOR por pessoa por benefício — inscrever de novo depois
-- de ter saído (ate preenchido) é permitido e vira uma linha nova.
CREATE UNIQUE INDEX IF NOT EXISTS erp_rh_beneficio_colab_ativa_ux
  ON erp_rh_beneficio_colab (beneficio_id, colaborador_id) WHERE ate IS NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name IN ('erp_rh_beneficios', 'erp_rh_beneficio_colab');
  IF n <> 2 THEN RAISE EXCEPTION 'Migracao incompleta: faltou tabela de beneficios (achei %)', n; END IF;
END $$;
