-- Orçamento Anual ganha centro de custo: até aqui era só categoria × mês, e
-- uma categoria como "Folha de Pagamento" hoje é lançada (no Contas a Pagar)
-- em 6 centros de custo diferentes — orçar sem essa dimensão mistura o gasto
-- de vários departamentos numa linha só. cost_center='' representa "Geral /
-- não departamental" (ex.: tarifa bancária, imposto que não é de um setor
-- só) — é o valor que todo o histórico de 2026 já recebe automaticamente
-- pelo DEFAULT, sem UPDATE nenhum: essa migração não altera 2026, só abre a
-- porta pra 2027 em diante nascer detalhado. String vazia em vez de NULL é
-- proposital: evita o Postgres tratar NULL como "distinto de tudo" no
-- UNIQUE/ON CONFLICT. ADITIVA e idempotente.
ALTER TABLE erp_budgets ADD COLUMN IF NOT EXISTS cost_center text NOT NULL DEFAULT '';

ALTER TABLE erp_budgets DROP CONSTRAINT IF EXISTS erp_budgets_year_month_type_category_key;
ALTER TABLE erp_budgets ADD CONSTRAINT erp_budgets_year_month_type_category_cost_center_key
  UNIQUE (year, month, type, category, cost_center);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_budgets' AND column_name = 'cost_center';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_budgets sem cost_center'; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conname = 'erp_budgets_year_month_type_category_cost_center_key';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: constraint nova nao existe'; END IF;
END $$;
