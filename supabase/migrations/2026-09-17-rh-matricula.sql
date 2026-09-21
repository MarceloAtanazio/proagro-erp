-- ============================================================================
-- RH — a matrícula passa a ser o ID do colaborador
--
-- ADITIVA e idempotente.
--
-- `matricula` era um campo de texto livre no formulário do vínculo, e estava
-- NULO nos 17 vínculos existentes — ninguém preenchia, porque não havia de onde
-- tirar o número. Agora ela é o ID que a lista de Colaboradores já mostra.
--
-- Identifica a PESSOA, não o contrato: quem sai e volta reabre vínculo com a
-- mesma matrícula. É o que se espera de um número de matrícula, e é o motivo de
-- ela sair de `colaborador_id` e não do id do vínculo.
--
-- Sem zeros à esquerda, para ser idêntica à coluna ID da lista. Número que
-- aparece de dois jeitos diferentes deixa de servir para conferir.
--
-- O `WHERE matricula IS NULL` não é só idempotência: se algum dia alguém tiver
-- gravado uma matrícula vinda da folha, ela não é sobrescrita por esta
-- migração. Preencher o que está vazio é diferente de reescrever o que alguém
-- pôs ali.
-- ============================================================================

UPDATE erp_rh_vinculos
   SET matricula = colaborador_id::text
 WHERE matricula IS NULL OR btrim(matricula) = '';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM erp_rh_vinculos WHERE matricula IS NULL OR btrim(matricula) = '';
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % vinculo(s) sem matricula', n; END IF;
END $$;
