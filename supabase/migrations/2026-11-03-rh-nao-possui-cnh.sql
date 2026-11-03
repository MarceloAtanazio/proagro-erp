-- "Não possui CNH": nem todo cidadão tem habilitação, então a CNH deixa de ser falta no dossiê. Enquanto não houver arquivo nem declaração, o item
-- aparece como pendente (amarelo); a pessoa de RH pode declarar que o colaborador NÃO POSSUI e o item fica resolvido. Idempotente.
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS nao_possui_cnh boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_colaboradores' AND column_name='nao_possui_cnh') THEN
    RAISE EXCEPTION 'coluna nao_possui_cnh não foi criada';
  END IF;
END $$;
