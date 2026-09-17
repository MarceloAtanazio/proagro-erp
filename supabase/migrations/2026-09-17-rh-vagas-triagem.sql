-- ============================================================================
-- RH — vagas, e o recrutamento antes da carta oferta
--
-- ADITIVA e idempotente.
--
-- O Quadro de admissão começava na Carta Oferta: a pessoa só existia no sistema
-- quando a oferta já tinha sido feita. Quem foi entrevistado e não foi escolhido
-- não deixava rastro, e o "encerrar candidatura", que já existia, quase não
-- tinha onde ser usado.
--
-- DUAS COISAS DIFERENTES, e é por isso que são duas estruturas:
--
--   VAGA é uma posição. Tem um cargo, um departamento, um número de posições, e
--   vários candidatos. Vive aqui, em erp_rh_vagas.
--
--   CANDIDATO é uma pessoa. Tem nome, contato, entrevista, oferta. Vive onde já
--   vivia, em erp_rh_admissoes, com um card no quadro.
--
-- Uma vaga virando card de kanban não funcionaria: ao avançar de "recebendo
-- currículos" para "entrevista" ela teria de se dividir em N cards, e coluna de
-- kanban não faz isso. Então a vaga aponta para os candidatos, e o quadro
-- continua sendo um quadro de pessoas.
--
-- As duas etapas novas (triagem e entrevista) NÃO exigem CPF nem documento:
-- quem está em entrevista pode não ser contratado, e guardar documento de quem
-- não entrou é o que o próprio sistema já evita na exclusão de candidato. Os
-- documentos continuam sendo cobrados só na Documentação.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_vagas (
  id                serial PRIMARY KEY,
  cargo             text NOT NULL,
  nivel             text,
  departamento      text,
  -- Quantas pessoas se quer contratar para esta vaga. Uma vaga de 3 posições
  -- não some ao contratar a primeira.
  posicoes          smallint NOT NULL DEFAULT 1 CHECK (posicoes > 0),
  regime            text,
  modelo_trabalho   text,
  salario_previsto  numeric(12,2),
  -- aberta | pausada | fechada
  situacao          text NOT NULL DEFAULT 'aberta',
  fechamento_motivo text,
  observacao        text,
  aberta_em         date NOT NULL DEFAULT CURRENT_DATE,
  fechada_em        date,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        integer REFERENCES erp_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS erp_rh_vagas_situacao_ix ON erp_rh_vagas (situacao);

ALTER TABLE erp_rh_admissoes
  -- ON DELETE SET NULL, não CASCADE: apagar uma vaga não pode apagar o processo
  -- de admissão de ninguém. O candidato continua existindo sem a vaga.
  ADD COLUMN IF NOT EXISTS vaga_id         integer REFERENCES erp_rh_vagas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrevista_em   date,
  ADD COLUMN IF NOT EXISTS entrevista_notas text;

CREATE INDEX IF NOT EXISTS erp_rh_admissoes_vaga_ix ON erp_rh_admissoes (vaga_id);

-- O card passa a nascer na triagem. O default do banco acompanha o código, que
-- grava a etapa explicitamente a partir de RH_ETAPAS[0] — os dois apontando
-- para o mesmo lugar, para nenhum caminho criar card fora da primeira etapa.
ALTER TABLE erp_rh_admissoes ALTER COLUMN etapa SET DEFAULT 'triagem';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_rh_admissoes'
     AND column_name IN ('vaga_id', 'entrevista_em', 'entrevista_notas');
  IF n <> 3 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_admissoes sem as colunas novas (achei %)', n; END IF;
  SELECT count(*) INTO n FROM information_schema.tables WHERE table_name = 'erp_rh_vagas';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_vagas nao existe'; END IF;
END $$;
