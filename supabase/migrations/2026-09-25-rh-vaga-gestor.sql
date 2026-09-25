-- "A quem reporta" na vaga: quando a vaga é aberta pra suceder ou reforçar
-- alguém, o organograma consegue mostrar ONDE ela vai se encaixar antes de
-- existir um colaborador de verdade pra preencher a caixa. ON DELETE SET
-- NULL, mesmo padrão de erp_rh_admissoes.gestor_id -- apagar o gestor não
-- pode apagar a vaga junto. ADITIVA e idempotente.
ALTER TABLE erp_rh_vagas
  ADD COLUMN IF NOT EXISTS gestor_id integer REFERENCES erp_colaboradores(id) ON DELETE SET NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_rh_vagas' AND column_name = 'gestor_id';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: erp_rh_vagas sem gestor_id'; END IF;
END $$;
