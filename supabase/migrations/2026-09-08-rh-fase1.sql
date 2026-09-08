-- ============================================================================
-- Recursos Humanos — fase 1: ficha, vínculo, dependentes e dossiê
-- Desenho: docs/rh-desenho.md
--
-- INTEIRAMENTE ADITIVA. Só ADD COLUMN IF NOT EXISTS e CREATE TABLE IF NOT
-- EXISTS: nenhuma coluna é removida, renomeada ou tem o tipo alterado, e
-- nenhuma linha existente é tocada. Pode rodar mais de uma vez sem efeito.
--
-- Por que os campos de RH entram em erp_colaboradores e não numa tabela nova:
-- essa tabela já é a PESSOA no sistema — referenciada por Viáticos, pelos
-- anexos de CNH/veículo/seguro e por 9 usuários do ERP. Um segundo cadastro da
-- mesma pessoa divergiria, e no dia em que divergisse ninguém saberia qual
-- está certo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A PESSOA — campos de RH em erp_colaboradores
--    Transcritos da "Ficha de Cadastro de Funcionários.xlsx" que a empresa já
--    usa, mais o que a qualificação das partes nos contratos exige.
-- ---------------------------------------------------------------------------

-- Identificação
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS nome_social       text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS data_nascimento   date;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS sexo              text;   -- 'M' | 'F' | 'O'
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS estado_civil      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS nacionalidade     text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS naturalidade      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS naturalidade_uf   text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS grau_instrucao    text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS raca_cor          text;   -- LGPD: sensível
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS nome_mae          text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS nome_pai          text;

-- Documentos
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS cpf               text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS rg                text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS rg_orgao          text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS rg_uf             text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS rg_emissao        date;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS ctps_numero       text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS ctps_serie        text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS ctps_uf           text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS ctps_emissao      date;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS pis               text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS titulo_eleitor    text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS titulo_zona       text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS titulo_secao      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS titulo_uf         text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS reservista        text;

-- Contato e endereço residencial
-- (distinto de cidade_base_*, que é de Viáticos e significa outra coisa)
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS endereco             text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS endereco_numero      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS endereco_complemento text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS bairro               text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS municipio            text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS uf                   text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS cep                  text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS celular              text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS email_pessoal        text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS email_corporativo    text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS emergencia_nome      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS emergencia_telefone  text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS emergencia_parentesco text;

-- Bancário
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS banco_numero      text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS banco_nome        text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS agencia           text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS conta             text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS conta_tipo        text;
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS pix_chave         text;

-- O CPF identifica a pessoa. Índice único PARCIAL: não impede as 11 linhas de
-- hoje, que estão todas com cpf NULL, e impede o mesmo CPF entrar duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS erp_colaboradores_cpf_uniq
  ON erp_colaboradores (cpf) WHERE cpf IS NOT NULL AND cpf <> '';

-- ---------------------------------------------------------------------------
-- 2. O VÍNCULO — o contrato de trabalho, separado da pessoa
--    Uma pessoa tem N vínculos: no acervo, TODO funcionário tem um distrato de
--    PJ antes da admissão CLT.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_vinculos (
  id                 serial PRIMARY KEY,
  colaborador_id     integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  tipo               text NOT NULL DEFAULT 'clt',        -- clt | pj | estagio | aprendiz | temporario
  matricula          text,
  admissao           date NOT NULL,
  -- Vínculo aberto = desligamento IS NULL. Não há coluna "ativo": ela poderia
  -- discordar da data, e aí não se sabe qual das duas é verdade.
  desligamento       date,
  desligamento_motivo text,
  desligamento_tipo  text,                                -- sem justa causa | pedido | justa causa | fim de contrato | acordo
  cargo              text,
  nivel              text,                                -- junior | pleno | senior | NULL
  departamento       text,
  centro_custo       text,
  gestor_id          integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL,
  unidade            text,
  -- O par regime + modelo_trabalho é o que seleciona a minuta na emissão:
  -- são exatamente as 5 combinações que existem em "Minutas Pro Agro".
  regime             text DEFAULT 'regular',              -- regular | confianca
  modelo_trabalho    text DEFAULT 'presencial',           -- presencial | hibrido | home_office | externo
  controle_ponto     boolean DEFAULT true,
  experiencia_fim    date,
  prorrogacao_fim    date,
  salario            numeric(12,2),
  periculosidade_pct numeric(5,2),
  vr_dia             numeric(10,2),
  home_office_dia    numeric(10,2),
  vt_opcao           text,                                -- nao | sim | alterar
  totalpass          boolean DEFAULT false,
  clube_saude        boolean DEFAULT false,
  seguro_vida        boolean DEFAULT false,
  cct                text,
  sindicato          text,
  observacao         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         integer REFERENCES erp_users(id) ON DELETE SET NULL,
  updated_at         timestamptz
);
CREATE INDEX IF NOT EXISTS erp_rh_vinculos_colab_idx ON erp_rh_vinculos (colaborador_id, admissao DESC);
-- Um colaborador só pode ter UM vínculo aberto por vez.
CREATE UNIQUE INDEX IF NOT EXISTS erp_rh_vinculos_um_aberto
  ON erp_rh_vinculos (colaborador_id) WHERE desligamento IS NULL;

-- ---------------------------------------------------------------------------
-- 3. DEPENDENTES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_dependentes (
  id              serial PRIMARY KEY,
  colaborador_id  integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  cpf             text,
  parentesco      text,
  data_nascimento date,
  sexo            text,
  irrf            boolean DEFAULT false,
  salario_familia boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_rh_dependentes_colab_idx ON erp_rh_dependentes (colaborador_id);

-- ---------------------------------------------------------------------------
-- 4. O DOSSIÊ — reusa erp_attachments, que já é genérica
--    Os documentos de RH entram com entity_type='rh_doc' e entity_id=colaborador.
--    `kind` já existe e é uma lista fechada compartilhada com boletos e notas
--    fiscais; o TIPO do documento de RH (rg, cpf, ctps…) precisa de coluna
--    própria para não poluir aquele vocabulário.
-- ---------------------------------------------------------------------------
ALTER TABLE erp_attachments ADD COLUMN IF NOT EXISTS doc_tipo text;
CREATE INDEX IF NOT EXISTS erp_attachments_rh_idx
  ON erp_attachments (entity_id, doc_tipo) WHERE entity_type = 'rh_doc';

-- ---------------------------------------------------------------------------
-- 5. Conferência — o que esta migração deixou pronto
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_colunas integer;
  n_tabelas integer;
BEGIN
  SELECT count(*) INTO n_colunas FROM information_schema.columns
   WHERE table_name = 'erp_colaboradores'
     AND column_name IN ('cpf','rg','ctps_numero','pis','endereco','banco_numero','sexo','nome_mae');
  SELECT count(*) INTO n_tabelas FROM information_schema.tables
   WHERE table_name IN ('erp_rh_vinculos','erp_rh_dependentes');
  IF n_colunas <> 8 OR n_tabelas <> 2 THEN
    RAISE EXCEPTION 'Migração incompleta: % de 8 colunas-amostra, % de 2 tabelas', n_colunas, n_tabelas;
  END IF;
  RAISE NOTICE 'RH fase 1: colunas e tabelas no lugar.';
END $$;
