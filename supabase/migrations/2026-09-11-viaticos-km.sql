-- ============================================================================
-- Viáticos — comprovação de quilometragem rodada
--
-- ADITIVA e idempotente.
--
-- O ressarcimento por km NÃO cobre combustível: a empresa custeia o combustível
-- de qualquer forma (ele já entra na previsão da viagem e é pago pelo cartão).
-- Os R$ 0,70/km ressarcem o USO do carro próprio — seguro, manutenção,
-- depreciação, pneus. Por isso a taxa vale só para `modelo='proprio'`.
--
-- No carro ALUGADO o registro existe igual, mas sem valor: o desgaste é da
-- locadora. Serve de base de dados e de comparativo com o km previsto na
-- solicitação — e é o que permite conferir franquia e km excedente na fatura.
--
-- Por que `taxa_km` e `km_previsto` ficam GRAVADOS na linha, e não são lidos da
-- config na hora de exibir: mudar a taxa amanhã não pode reescrever o valor de
-- um reembolso já aprovado. O que foi aprovado tem de continuar contando a
-- mesma história daqui a um ano.
-- ============================================================================

ALTER TABLE erp_viaticos_config
  ADD COLUMN IF NOT EXISTS km_taxa_reembolso numeric(6,2) NOT NULL DEFAULT 0.70;

CREATE TABLE IF NOT EXISTS erp_viaticos_km (
  id              serial PRIMARY KEY,
  solicitacao_id  integer NOT NULL REFERENCES erp_viaticos_solicitacoes(id) ON DELETE CASCADE,
  -- Uma viagem pode ter carro próprio E alugado (a solicitação permite os dois,
  -- e o aluguel é uma lista). Por isso a linha é por VEÍCULO, não por viagem.
  modelo          text NOT NULL CHECK (modelo IN ('proprio', 'alugado')),
  veiculo_placa   text,
  veiculo_modelo  text,

  km_inicial      numeric(10,1) NOT NULL CHECK (km_inicial >= 0),
  km_final        numeric(10,1) NOT NULL CHECK (km_final  >= 0),
  km_rodado       numeric(10,1) NOT NULL CHECK (km_rodado > 0),
  km_previsto     numeric(10,1),
  taxa_km         numeric(6,2),
  valor_reembolso numeric(12,2) NOT NULL DEFAULT 0,

  justificativa   text,
  status          text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'rejeitado')),
  decisao_motivo  text,
  payable_id      integer REFERENCES erp_payables(id) ON DELETE SET NULL,

  enviado_por     integer REFERENCES erp_users(id) ON DELETE SET NULL,
  enviado_em      timestamptz,
  decidido_por    integer REFERENCES erp_users(id) ON DELETE SET NULL,
  decidido_em     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES erp_users(id) ON DELETE SET NULL,
  updated_at      timestamptz
);

CREATE INDEX IF NOT EXISTS erp_viaticos_km_solicitacao_idx ON erp_viaticos_km (solicitacao_id);
-- A fila de aprovação é a consulta mais frequente do administrador.
CREATE INDEX IF NOT EXISTS erp_viaticos_km_fila_idx ON erp_viaticos_km (status, enviado_em)
  WHERE status = 'enviado';
-- A trava do odômetro que não retrocede consulta por placa, do mais recente
-- para o mais antigo.
CREATE INDEX IF NOT EXISTS erp_viaticos_km_placa_idx ON erp_viaticos_km (veiculo_placa, km_final DESC)
  WHERE veiculo_placa IS NOT NULL;

-- As fotos do odômetro vivem em erp_attachments com entity_type='viatico_km',
-- e `doc_tipo` diz qual é qual ('odometro_inicial' / 'odometro_final'). A
-- coluna já existe desde a fase 1 do RH.
CREATE INDEX IF NOT EXISTS erp_attachments_viatico_km_idx
  ON erp_attachments (entity_id, doc_tipo) WHERE entity_type = 'viatico_km';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables WHERE table_name = 'erp_viaticos_km';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: tabela erp_viaticos_km ausente'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'erp_viaticos_config' AND column_name = 'km_taxa_reembolso';
  IF n <> 1 THEN RAISE EXCEPTION 'Migracao incompleta: km_taxa_reembolso ausente'; END IF;
END $$;
