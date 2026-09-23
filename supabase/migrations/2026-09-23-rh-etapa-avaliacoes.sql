-- Nova etapa "Avaliações" no Quadro de admissão, entre Triagem e Entrevista:
-- registra o resultado da prova técnica e do psicotécnico, separados por tipo,
-- e cada um recebe seus próprios anexos (laudo/relatório). Os campos ficam na
-- própria erp_rh_admissoes, que nunca é apagada mesmo quando o processo é
-- encerrado — então o histórico sobrevive independente da pessoa ter entrado
-- ou não na empresa.
ALTER TABLE erp_rh_admissoes
  ADD COLUMN IF NOT EXISTS avaliacao_tecnica_em date,
  ADD COLUMN IF NOT EXISTS avaliacao_tecnica_resultado text,
  ADD COLUMN IF NOT EXISTS psicotecnico_em date,
  ADD COLUMN IF NOT EXISTS psicotecnico_resultado text;

-- ADITIVA e idempotente (recria a restrição com a lista completa): mesmo
-- padrão de toda vez que um novo entity_type de anexo é criado, pra não repetir
-- o incidente em que o tipo existia no código mas não na CHECK constraint do
-- banco (3 dias com "Erro interno" sem pista nenhuma).
ALTER TABLE erp_attachments DROP CONSTRAINT IF EXISTS erp_attachments_entity_type_check;
ALTER TABLE erp_attachments ADD CONSTRAINT erp_attachments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'payable'::text, 'receivable'::text, 'viatico'::text,
    'colab_cnh'::text, 'colab_veiculo'::text, 'colab_seguro'::text,
    'viatico_km'::text, 'contrato'::text, 'rh_doc'::text,
    'rh_admissao_doc'::text
  ]));

DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'erp_attachments_entity_type_check')
     NOT LIKE '%rh_admissao_doc%' THEN
    RAISE EXCEPTION 'erp_attachments_entity_type_check não ficou com rh_admissao_doc';
  END IF;
END $$;
