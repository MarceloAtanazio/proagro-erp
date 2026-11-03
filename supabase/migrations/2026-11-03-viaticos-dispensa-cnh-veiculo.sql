-- Dispensa do cadastro de CNH, CRLV e seguro do veículo em Viáticos. Nem todo colaborador dirige a serviço: marcar a dispensa tira a
-- pessoa das pendências de documentação (não vira "não habilitado", nem "só aluguel", nem "vencendo"). Os dados já informados ficam
-- guardados. Enquanto a dispensa estiver ligada, o carro (próprio e alugado) fica indisponível nas solicitações; avião, ônibus e
-- táxi/Uber seguem normais. Quando a pessoa passar a viajar de carro, basta desmarcar e preencher o cadastro. Idempotente.
ALTER TABLE erp_colaboradores ADD COLUMN IF NOT EXISTS dispensa_cnh_veiculo boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_colaboradores' AND column_name='dispensa_cnh_veiculo') THEN
    RAISE EXCEPTION 'coluna dispensa_cnh_veiculo não foi criada';
  END IF;
END $$;
