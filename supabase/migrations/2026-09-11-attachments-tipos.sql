-- ============================================================================
-- erp_attachments — o CHECK de entity_type estava desatualizado
--
-- ADITIVA e idempotente (recria a restrição com a lista completa).
--
-- A restrição nasceu com sete tipos e não acompanhou o código:
--
--   permitidos no banco : payable, receivable, viatico, colab_cnh,
--                         colab_veiculo, colab_seguro, contrato
--   usados pelo código  : ...os sete acima + rh_doc + viatico_km
--
-- Consequência silenciosa: todo anexo de dossiê de RH (`rh_doc`, desde
-- 2026-09-08) e toda foto de odômetro (`viatico_km`, desde 2026-09-11) eram
-- recusados pelo banco. O INSERT lançava exceção, o wrapper `h()` devolvia
-- "Erro interno. Tente novamente." e nada ficava gravado — sem nenhuma pista
-- de qual era o problema.
--
-- Pior: o painel de RH lia "0 documentos no dossiê" e reportava "dossiê
-- incompleto: 11", o que se parece com "ninguém anexou ainda" e na verdade era
-- "ninguém CONSEGUE anexar".
--
-- A lista aqui tem de espelhar ATTACH_TYPES em api/index.js. O
-- scratchpad tem uma verificação que compara as duas e falha se divergirem.
-- ============================================================================

ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;

ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'payable'::text, 'receivable'::text, 'viatico'::text,
    'colab_cnh'::text, 'colab_veiculo'::text, 'colab_seguro'::text,
    'viatico_km'::text,   -- fotos do odômetro (Viáticos)
    'contrato'::text,
    'rh_doc'::text        -- dossiê do colaborador (RH)
  ]));

DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO def
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'erp_attachments' AND con.conname = 'erp_attachments_entity_type_check';
  IF def IS NULL THEN RAISE EXCEPTION 'Restricao nao recriada'; END IF;
  IF def NOT LIKE '%rh_doc%' THEN RAISE EXCEPTION 'rh_doc ausente da restricao'; END IF;
  IF def NOT LIKE '%viatico_km%' THEN RAISE EXCEPTION 'viatico_km ausente da restricao'; END IF;
END $$;
