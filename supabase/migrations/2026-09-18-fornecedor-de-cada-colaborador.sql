-- ============================================================================
-- O fornecedor de cada colaborador ativo
--
-- ADITIVA e idempotente.
--
-- A folha é lançada em Contas a Pagar, um título por pessoa por mês, e a pessoa
-- aparece lá como FORNECEDOR. A aba Financeiro da ficha lê por
-- erp_suppliers.colaborador_id.
--
-- A coluna existe desde 2026-09-15, mas até hoje NENHUM endpoint a escrevia: a
-- única ligação que existiu foi a semeadura por nome daquela migração, feita
-- uma vez. Quem foi cadastrado depois ficava permanentemente sem fornecedor —
-- sem onde lançar o salário, e com a aba Financeiro mostrando R$ 0,00 desde a
-- admissão como se estivesse certo.
--
-- Quatro pessoas já estavam nesse estado: Leonardo Machado, Pablo de Sousa
-- Catarina, Arthur Albani Dala Costa e Rodolpho Teixeira Mensato — todas
-- cadastradas nos últimos dias. Sem esta migração seriam também todas as
-- próximas.
--
-- Daqui para a frente o fornecedor nasce junto com o colaborador (nas duas
-- portas por onde alguém vira funcionário), e o Painel de RH passa a acusar
-- quem estiver sem — para o estado nunca mais ser invisível.
-- ============================================================================

-- 1) ADOTA antes de criar: fornecedor de mesmo nome e sem dono é o que alguém
--    cadastrou à mão. Criar outro partiria o histórico da pessoa em dois.
--    Só liga quando o nome bate INTEIRO e não há ambiguidade de nenhum lado.
UPDATE erp_suppliers s
   SET colaborador_id = c.id
  FROM erp_colaboradores c
 WHERE s.colaborador_id IS NULL
   AND c.ativo = true AND c.arquivado_em IS NULL
   AND NOT EXISTS (SELECT 1 FROM erp_suppliers s2 WHERE s2.colaborador_id = c.id)
   AND lower(btrim(c.name)) = lower(btrim(s.name))
   AND (SELECT count(*) FROM erp_colaboradores c2
         WHERE c2.ativo = true AND lower(btrim(c2.name)) = lower(btrim(s.name))) = 1
   AND (SELECT count(*) FROM erp_suppliers s3
         WHERE s3.colaborador_id IS NULL AND lower(btrim(s3.name)) = lower(btrim(s.name))) = 1;

-- 2) Cria para quem sobrou. Mesma convenção dos 16 que já existiam: nome da
--    pessoa, CPF no campo de documento, categoria "Folha de Pagamento".
INSERT INTO erp_suppliers (name, cnpj, category, status, pix_key, colaborador_id, notes)
SELECT c.name, c.cpf, 'Folha de Pagamento', 'ativo', COALESCE(c.pix_chave, c.cpf), c.id,
       'Criado pela migração de 18/09 — o colaborador estava sem fornecedor e a folha dele não tinha onde ser lançada.'
  FROM erp_colaboradores c
 WHERE c.ativo = true AND c.arquivado_em IS NULL
   AND NOT EXISTS (SELECT 1 FROM erp_suppliers s WHERE s.colaborador_id = c.id);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM erp_colaboradores c
   WHERE c.ativo = true AND c.arquivado_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM erp_suppliers s WHERE s.colaborador_id = c.id);
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % colaborador(es) ativo(s) sem fornecedor', n; END IF;

  -- Dois fornecedores para a mesma pessoa partiriam o histórico dela em dois.
  SELECT count(*) INTO n FROM (
    SELECT colaborador_id FROM erp_suppliers
     WHERE colaborador_id IS NOT NULL GROUP BY colaborador_id HAVING count(*) > 1) t;
  IF n <> 0 THEN RAISE EXCEPTION '% colaborador(es) com mais de um fornecedor', n; END IF;
END $$;
