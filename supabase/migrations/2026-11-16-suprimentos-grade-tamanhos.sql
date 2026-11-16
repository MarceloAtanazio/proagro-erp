-- Suprimentos: grade de tamanhos (uniformes, calçados etc.).
-- Propósito: permitir que um item controle o estoque POR TAMANHO. O item guarda a grade (lista de tamanhos) e o estoque mínimo de cada tamanho; cada movimentação
--   (compra, ajuste, envio, devolução) guarda o tamanho a que se refere. O saldo por tamanho é a soma dos movimentos por (item, tamanho). O CMP continua único por item.
-- Entradas: nenhuma. Saídas: erp_estoque_itens.grade_tamanhos (jsonb, ex.: ["P","M","G"]; nulo = item sem grade) e .minimos_tamanho (jsonb, ex.: {"P":5,"M":10});
--   erp_estoque_movimentos.tamanho (text; nulo = sem tamanho). Migração só aditiva: não altera nem apaga dados existentes.
-- Como executar: Supabase (SQL editor ou MCP apply_migration) no projeto wsieuqzrztlgxwotrjpy. Aplicada em 2026-11-16 com autorização do Marcelo.
ALTER TABLE erp_estoque_itens ADD COLUMN IF NOT EXISTS grade_tamanhos jsonb;
ALTER TABLE erp_estoque_itens ADD COLUMN IF NOT EXISTS minimos_tamanho jsonb;
ALTER TABLE erp_estoque_movimentos ADD COLUMN IF NOT EXISTS tamanho text;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_item_tamanho ON erp_estoque_movimentos (item_id, tamanho);
