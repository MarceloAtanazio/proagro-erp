-- Vigências de remuneração: o que valia, e desde quando.
--
-- Por que existe: o salário morava só como atributo do vínculo. Um aumento
-- sobrescrevia o campo e, com ele, TODO o passado -- qualquer histórico
-- financeiro passaria a afirmar que a pessoa sempre ganhou o valor de hoje.
-- O erro seria silencioso e cresceria a cada reajuste.
--
-- A tabela é alimentada sozinha: o vínculo nasce com uma linha na data da
-- admissão, e cada edição que mexa na remuneração acrescenta outra. Não há
-- tela para editá-la à mão de propósito -- histórico que se edita não é
-- histórico.

CREATE TABLE IF NOT EXISTS erp_rh_salario_hist (
  id                 serial PRIMARY KEY,
  vinculo_id         integer NOT NULL REFERENCES erp_rh_vinculos(id) ON DELETE CASCADE,
  vigencia_inicio    date NOT NULL,
  salario            numeric(12,2),
  periculosidade_pct numeric(5,2),
  vr_dia             numeric(10,2),
  home_office_dia    numeric(10,2),
  motivo             text,
  registrado_em      timestamptz NOT NULL DEFAULT now(),
  registrado_por     integer REFERENCES erp_users(id)
);

CREATE INDEX IF NOT EXISTS erp_rh_salario_hist_vinculo_idx
  ON erp_rh_salario_hist (vinculo_id, vigencia_inicio);

-- Semente: cada vínculo que já existe ganha a vigência inicial na data da
-- admissão, com o que está no contrato hoje. É a melhor verdade disponível --
-- o que houve antes disso não foi registrado em lugar nenhum.
INSERT INTO erp_rh_salario_hist
  (vinculo_id, vigencia_inicio, salario, periculosidade_pct, vr_dia, home_office_dia, motivo)
SELECT v.id, v.admissao, v.salario, v.periculosidade_pct, v.vr_dia, v.home_office_dia,
       'Vigência inicial (semente da migração)'
  FROM erp_rh_vinculos v
 WHERE NOT EXISTS (SELECT 1 FROM erp_rh_salario_hist h WHERE h.vinculo_id = v.id);
