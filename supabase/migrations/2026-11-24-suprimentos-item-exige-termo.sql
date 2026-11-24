-- Suprimentos: termo de responsabilidade também para EPI e uniformes (materiais de consumo).
-- Aditiva: coluna booleana no item; equipamentos continuam exigindo termo pelo próprio tipo.
ALTER TABLE erp_estoque_itens ADD COLUMN IF NOT EXISTS exige_termo boolean NOT NULL DEFAULT false;
UPDATE erp_estoque_itens SET exige_termo = true WHERE tipo = 'material' AND categoria IN ('EPI', 'Uniformes');
