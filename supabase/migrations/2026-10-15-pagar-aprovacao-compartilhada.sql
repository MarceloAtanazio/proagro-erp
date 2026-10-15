-- Contas a Pagar: uma Aprovação (anexo do tipo "aprovacao") pode valer para VÁRIOS títulos (ex.: auxílio
-- home-office, FGTS e tributos federais). O arquivo continua guardado uma vez só, no título onde foi anexado;
-- esta tabela liga os demais títulos a esse mesmo anexo. Apagar o título ou o anexo remove os vínculos.
-- ADITIVA e idempotente.
CREATE TABLE IF NOT EXISTS erp_payable_aprovacoes (
  payable_id    integer NOT NULL REFERENCES erp_payables(id)    ON DELETE CASCADE,
  attachment_id integer NOT NULL REFERENCES erp_attachments(id) ON DELETE CASCADE,
  created_by    integer REFERENCES erp_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payable_id, attachment_id)
);
CREATE INDEX IF NOT EXISTS erp_payable_aprovacoes_att_idx ON erp_payable_aprovacoes (attachment_id);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_payable_aprovacoes' AND column_name IN ('payable_id','attachment_id','created_by','created_at');
  IF n <> 4 THEN RAISE EXCEPTION 'Migracao incompleta: erp_payable_aprovacoes (%/4)', n; END IF;
END $$;
