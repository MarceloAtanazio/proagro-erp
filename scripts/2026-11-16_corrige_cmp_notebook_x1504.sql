-- Propósito: corrigir o custo médio do item 14 (Notebook Asus X1504VANJ1723W) em Suprimentos. O CMP estava em 1477.99 porque 6 unidades entraram sem custo e diluíram a
--   média; depois a saída de correção não recalculou. A única compra com custo é 6 un a 2951.74, então o CMP correto é 2951.74.
-- Entrada: nenhuma (item id 14). Saída: erp_estoque_itens.custo_medio do item 14 = 2951.74 (valor anterior: 1477.99).
-- Como executar: SQL editor do Supabase ou MCP execute_sql no projeto wsieuqzrztlgxwotrjpy. Aplicado em 2026-11-16.
UPDATE erp_estoque_itens SET custo_medio = 2951.74 WHERE id = 14 AND custo_medio = 1477.99;
