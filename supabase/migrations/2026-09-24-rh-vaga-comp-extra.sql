-- A vaga hoje só carrega salário previsto -- vale-refeição/dia, dias
-- presenciais/home office e a ajuda de custo do home office ficavam de fora
-- do cadastro da vaga e, por isso, nunca chegavam ao candidato: quem abria
-- "+ Candidato" a partir de uma vaga via esses 4 campos em branco no card,
-- mesmo já sabendo qual pacote a vaga oferecia. ADITIVA e idempotente.
ALTER TABLE erp_rh_vagas
  ADD COLUMN IF NOT EXISTS vr_dia numeric(10,2),
  ADD COLUMN IF NOT EXISTS dias_presenciais integer,
  ADD COLUMN IF NOT EXISTS dias_home_office integer,
  ADD COLUMN IF NOT EXISTS home_office_dia numeric(10,2);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_rh_vagas'
     AND column_name IN ('vr_dia', 'dias_presenciais', 'dias_home_office', 'home_office_dia');
  IF n <> 4 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_vagas sem as colunas novas (achei %)', n; END IF;
END $$;
