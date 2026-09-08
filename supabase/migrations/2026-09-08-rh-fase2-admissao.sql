-- ============================================================================
-- Recursos Humanos — fase 2: processo de admissão (Kanban) e minutas
--
-- ADITIVA e idempotente. Nada é removido, renomeado ou alterado de tipo.
--
-- O Kanban tem seis etapas, na ordem que a empresa segue:
--   carta_oferta → documentacao → exame_admissional → contrato
--                → contas_acessos → onboarding  (→ concluida)
--
-- Por que as datas de cada etapa são COLUNAS e não um JSON: "quando a carta foi
-- aceita" e "quando o contrato foi assinado" são perguntas que se faz num
-- relatório e num filtro. Em JSON viram string sem tipo, sem índice e sem
-- checagem — e o dia em que alguém quiser o tempo médio de admissão, não dá.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_admissoes (
  id                serial PRIMARY KEY,
  colaborador_id    integer NOT NULL REFERENCES erp_colaboradores(id) ON DELETE CASCADE,
  etapa             text NOT NULL DEFAULT 'carta_oferta',
  situacao          text NOT NULL DEFAULT 'andamento',   -- andamento | concluida | cancelada
  -- O que se sabe antes de existir vínculo. Quando o contrato é assinado, isto
  -- vira o vínculo de verdade em erp_rh_vinculos.
  cargo_pretendido  text,
  nivel_pretendido  text,
  departamento      text,
  centro_custo      text,
  regime            text DEFAULT 'regular',
  modelo_trabalho   text DEFAULT 'presencial',
  salario_previsto  numeric(12,2),
  admissao_prevista date,
  gestor_id         integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL,
  responsavel_id    integer REFERENCES erp_users(id) ON DELETE SET NULL,
  vinculo_id        integer REFERENCES erp_rh_vinculos(id) ON DELETE SET NULL,

  -- Marcos, um por etapa
  oferta_enviada_em      date,
  oferta_aceita_em       date,
  exame_agendado_para    date,
  exame_realizado_em     date,
  exame_resultado        text,                            -- apto | apto_com_restricao | inapto
  contrato_emitido_em    date,
  contrato_assinado_em   date,
  acessos_solicitados_em date,
  acessos_concluidos_em  date,
  onboarding_iniciado_em date,
  onboarding_concluido_em date,

  observacao        text,
  cancelamento_motivo text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        integer REFERENCES erp_users(id) ON DELETE SET NULL,
  updated_at        timestamptz
);

-- Um processo de admissão ABERTO por colaborador. Recontratação é um processo
-- novo, e o anterior fica no histórico — por isso o índice é parcial.
CREATE UNIQUE INDEX IF NOT EXISTS erp_rh_admissoes_um_aberto
  ON erp_rh_admissoes (colaborador_id) WHERE situacao = 'andamento';
CREATE INDEX IF NOT EXISTS erp_rh_admissoes_etapa_idx ON erp_rh_admissoes (situacao, etapa);

-- ---------------------------------------------------------------------------
-- Histórico de movimentação entre etapas. É o que responde "quem moveu, quando
-- e por quê" — o card sozinho só sabe onde está agora.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_admissao_hist (
  id           serial PRIMARY KEY,
  admissao_id  integer NOT NULL REFERENCES erp_rh_admissoes(id) ON DELETE CASCADE,
  de_etapa     text,
  para_etapa   text NOT NULL,
  observacao   text,
  movido_por   integer REFERENCES erp_users(id) ON DELETE SET NULL,
  movido_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_rh_admissao_hist_idx ON erp_rh_admissao_hist (admissao_id, movido_em DESC);

-- ---------------------------------------------------------------------------
-- Minutas: os modelos .docx da empresa, guardados NO ERP.
--
-- Ficam em tabela própria e não em erp_attachments porque um modelo não é anexo
-- de coisa nenhuma — não tem entity_id — e precisa carregar o mapa de slots
-- (`slots`), que é o que liga cada trecho realçado a um campo da ficha.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_rh_minutas (
  id              serial PRIMARY KEY,
  nome            text NOT NULL,
  regime          text,                 -- regular | confianca
  modelo_trabalho text,                 -- presencial | hibrido | home_office | externo
  file_name       text NOT NULL,
  byte_size       integer NOT NULL,
  data            bytea NOT NULL,
  -- Um registro por trecho realçado, na ORDEM em que aparece no documento:
  -- [{n, texto, campo}]. A ordem é o identificador, porque dois slots têm o
  -- mesmo texto na minuta (os dois DD/MM/AAAA e os dois XXXXXXXXX).
  slots           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativa           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES erp_users(id) ON DELETE SET NULL
);
-- Uma minuta ativa por combinação regime × modelo de trabalho: é assim que a
-- emissão escolhe sozinha qual usar.
CREATE UNIQUE INDEX IF NOT EXISTS erp_rh_minutas_combinacao
  ON erp_rh_minutas (regime, modelo_trabalho) WHERE ativa = true;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name IN ('erp_rh_admissoes','erp_rh_admissao_hist','erp_rh_minutas');
  IF n <> 3 THEN RAISE EXCEPTION 'Migracao incompleta: % de 3 tabelas', n; END IF;
END $$;
