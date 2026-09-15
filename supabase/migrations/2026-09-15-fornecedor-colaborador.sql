-- Quem é a pessoa por trás do fornecedor.
--
-- A folha de pagamento é lançada em Contas a Pagar, um título por pessoa por
-- mês, e a pessoa aparece como FORNECEDOR. Sem uma ligação explícita, o único
-- jeito de saber que o fornecedor "Diego Bispo dos Santos Farias" é o
-- colaborador Diego seria comparar nomes -- que quebra no primeiro acento
-- digitado diferente, no primeiro "Jr." e no primeiro homônimo.
--
-- A coluna resolve isso de uma vez: o vínculo é dado, não adivinhação.

ALTER TABLE erp_suppliers
  ADD COLUMN IF NOT EXISTS colaborador_id integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS erp_suppliers_colaborador_idx
  ON erp_suppliers (colaborador_id) WHERE colaborador_id IS NOT NULL;

-- Semeadura por nome exato: é adivinhação, mas é a única disponível para o que
-- já está lançado, e só liga quando o nome bate INTEIRO e sem ambiguidade dos
-- dois lados. Daqui para a frente a ligação é escolhida, não inferida.
UPDATE erp_suppliers s
   SET colaborador_id = c.id
  FROM erp_colaboradores c
 WHERE s.colaborador_id IS NULL
   AND lower(btrim(c.name)) = lower(btrim(s.name))
   AND (SELECT count(*) FROM erp_colaboradores c2
         WHERE lower(btrim(c2.name)) = lower(btrim(s.name))) = 1
   AND (SELECT count(*) FROM erp_suppliers s2
         WHERE lower(btrim(s2.name)) = lower(btrim(s.name))) = 1;
