-- Anexos: novo tipo "aprovacao" (documento do Approvals com a aprovação da diretoria para o pagamento,
-- usado em Contas a Pagar). ADITIVA e idempotente; os demais tipos continuam valendo.
ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_kind_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_kind_check
  CHECK (kind IN ('boleto', 'nota_fiscal', 'comprovante', 'contrato', 'aprovacao', 'outro'));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'erp_attachments'::regclass AND conname = 'erp_attachments_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%aprovacao%';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: constraint de kind sem aprovacao'; END IF;
END $$;
