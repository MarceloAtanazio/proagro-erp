-- ============================================================================
-- RH — os cargos viram catálogo editável
--
-- ADITIVA e idempotente.
--
-- A lista de cargos era uma constante dentro de public/app.js. Consequência
-- prática: contratar alguém num cargo novo exigia um deploy. Não é decisão de
-- engenharia — é o organograma da empresa, que muda quando a empresa muda.
--
-- O cargo continua sendo gravado como TEXTO em erp_rh_vinculos.cargo,
-- erp_colaboradores.cargo e erp_rh_admissoes.cargo_pretendido. Esta tabela não
-- é chave estrangeira: é o catálogo que alimenta o select. Fazer dela uma FK
-- obrigaria a migrar três colunas de texto e quebraria todo registro histórico
-- cujo cargo não existe mais — e o histórico tem de continuar dizendo o cargo
-- que a pessoa de fato ocupava, mesmo que a empresa tenha extinguido a função.
--
-- `tem_nivel` substitui a segunda constante (RH_CARGOS_COM_NIVEL): é o que diz
-- se o cargo aceita Júnior/Pleno/Sênior. Ficavam duas listas paralelas, e
-- acrescentar um cargo analista exigia lembrar de mexer nas duas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rh_cargos (
  id         serial PRIMARY KEY,
  nome       text NOT NULL,
  -- Aceita Júnior/Pleno/Sênior.
  tem_nivel  boolean NOT NULL DEFAULT false,
  -- Cargo extinto sai do select sem sumir do histórico de quem o ocupou.
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por integer REFERENCES erp_users(id) ON DELETE SET NULL
);

-- Único por nome ignorando caixa: "Analista de Riscos" e "analista de riscos"
-- são o mesmo cargo, e dois deles no select é o começo de dois vocabulários.
CREATE UNIQUE INDEX IF NOT EXISTS erp_rh_cargos_nome_uk ON erp_rh_cargos (lower(nome));

INSERT INTO erp_rh_cargos (nome, tem_nivel) VALUES
  ('CEO', false),
  ('Gerente de Campo', false),
  ('Gerente Administrativo', false),
  ('Gerente de Subscrição', false),
  ('Gerente Comercial', false),
  ('Coordenador de Campo', false),
  ('Coordenador Administrativo', false),
  ('Coordenador de Subscrição', false),
  ('Coordenador Comercial', false),
  ('Analista Administrativo', true),
  ('Analista de Subscrição', true),
  ('Analista de Riscos', true),
  ('Analista de Sinistros', true),
  ('Técnico de Campo', true)
ON CONFLICT DO NOTHING;

-- Cargo que já está em uso e não está na lista entra também. Sem isto, a
-- primeira edição de um desses vínculos acharia o cargo "inválido" e o select
-- abriria em branco — perder o cargo de alguém por omissão do catálogo seria
-- a tabela nova apagando um dado que existia antes dela.
INSERT INTO erp_rh_cargos (nome)
SELECT DISTINCT btrim(c) FROM (
  SELECT cargo AS c FROM erp_rh_vinculos WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
  UNION SELECT cargo FROM erp_colaboradores WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
  UNION SELECT cargo_pretendido FROM erp_rh_admissoes WHERE cargo_pretendido IS NOT NULL AND btrim(cargo_pretendido) <> ''
) t
WHERE NOT EXISTS (SELECT 1 FROM erp_rh_cargos g WHERE lower(g.nome) = lower(btrim(t.c)));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM erp_rh_cargos;
  IF n < 14 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_cargos com apenas % linha(s)', n; END IF;
  -- Nenhum cargo em uso pode ter ficado de fora.
  SELECT count(*) INTO n FROM (
    SELECT cargo AS c FROM erp_rh_vinculos WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
    UNION SELECT cargo FROM erp_colaboradores WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
    UNION SELECT cargo_pretendido FROM erp_rh_admissoes WHERE cargo_pretendido IS NOT NULL AND btrim(cargo_pretendido) <> ''
  ) t WHERE NOT EXISTS (SELECT 1 FROM erp_rh_cargos g WHERE lower(g.nome) = lower(btrim(t.c)));
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % cargo(s) em uso fora do catalogo', n; END IF;
END $$;
