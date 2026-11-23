-- Lote de pagamento Santander (Contas a Pagar): tipo da chave PIX no fornecedor e no título, e marca de "enviado à tesouraria" no título.
-- Aditiva e reversível: só acrescenta colunas anuláveis; nada existente muda de significado.
ALTER TABLE erp_suppliers ADD COLUMN IF NOT EXISTS pix_key_tipo text;
ALTER TABLE erp_payables  ADD COLUMN IF NOT EXISTS pix_key_tipo text;
ALTER TABLE erp_payables  ADD COLUMN IF NOT EXISTS enviado_tesouraria_em  timestamptz;
ALTER TABLE erp_payables  ADD COLUMN IF NOT EXISTS enviado_tesouraria_por integer;
ALTER TABLE erp_suppliers DROP CONSTRAINT IF EXISTS erp_suppliers_pix_key_tipo_chk;
ALTER TABLE erp_suppliers ADD CONSTRAINT erp_suppliers_pix_key_tipo_chk CHECK (pix_key_tipo IS NULL OR pix_key_tipo IN ('cpf','cnpj','telefone','email','aleatoria'));
ALTER TABLE erp_payables DROP CONSTRAINT IF EXISTS erp_payables_pix_key_tipo_chk;
ALTER TABLE erp_payables ADD CONSTRAINT erp_payables_pix_key_tipo_chk CHECK (pix_key_tipo IS NULL OR pix_key_tipo IN ('cpf','cnpj','telefone','email','aleatoria'));
