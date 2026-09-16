-- ============================================================================
-- RH — registrar o término do contrato de trabalho
--
-- ADITIVA e idempotente.
--
-- O desligamento já era gravável (desligamento, desligamento_tipo,
-- desligamento_motivo), mas só por dois caminhos ruins: o formulário genérico
-- de editar vínculo, onde a data de saída fica perdida entre trinta campos de
-- contrato, e o botão Arquivar, que pedia data e tipo de passagem. Nos dois, o
-- registro sai pobre: não se sabe QUEM registrou, QUANDO registrou, nem como
-- ficou o aviso prévio — e o aviso é o que define a data em que o contrato de
-- fato termina.
--
-- O que entra aqui é o ATO do desligamento, não o dinheiro dele. Os valores da
-- rescisão vêm da contabilidade externa e entram em Contas a Pagar associados
-- ao colaborador; de lá a aba Financeiro já os puxa. Guardar aqui um cálculo
-- próprio criaria uma segunda verdade sobre o mesmo pagamento, e a errada seria
-- sempre a nossa.
--
-- Uma coisa que o registro precisa e o resto do sistema não tem: DATA DO AVISO
-- separada da data de saída. No aviso trabalhado as duas são diferentes por até
-- 90 dias, e é a data de saída que conta para headcount, turnover e para o
-- último mês de folha.
-- ============================================================================

ALTER TABLE erp_rh_vinculos
  -- trabalhado | indenizado | dispensado | nao_aplicavel
  ADD COLUMN IF NOT EXISTS desligamento_aviso        text,
  ADD COLUMN IF NOT EXISTS desligamento_aviso_em     date,
  ADD COLUMN IF NOT EXISTS desligamento_obs          text,
  ADD COLUMN IF NOT EXISTS desligamento_registrado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS desligamento_registrado_por integer
    REFERENCES erp_users(id) ON DELETE SET NULL;

-- Os códigos de motivo do registro e os do quadro comparativo de rescisão
-- nasceram em telas diferentes e divergiram: a tela de arquivar gravava
-- 'fim_contrato' e o cálculo conhece 'experiencia_fim'. O efeito é que a saída
-- REGISTRADA não casava com a coluna que a pessoa comparou antes de decidir.
-- Um vocabulário só, e o histórico volta a falar a mesma língua do cálculo.
UPDATE erp_rh_vinculos
   SET desligamento_tipo = 'experiencia_fim'
 WHERE desligamento_tipo = 'fim_contrato';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_rh_vinculos'
     AND column_name IN ('desligamento_aviso', 'desligamento_aviso_em', 'desligamento_obs',
                         'desligamento_registrado_em', 'desligamento_registrado_por');
  IF n <> 5 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_vinculos sem as colunas de desligamento (achei %)', n; END IF;
  SELECT count(*) INTO n FROM erp_rh_vinculos WHERE desligamento_tipo = 'fim_contrato';
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % vinculo(s) com o codigo antigo fim_contrato', n; END IF;
END $$;
