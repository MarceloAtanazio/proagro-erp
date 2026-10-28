-- Propósito: lançar no sistema o dissídio 2025/2026 (vigência desde 01/08/2026, acertado na folha de outubro) e as promoções
--   de 01/11/2026 (Diego: Gerente de Subscrição; Marcelo: Gerente Administrativo), conforme a planilha do Marcelo.
--   Entram como movimentações "agendadas"; o sistema aplica sozinho as que já valem (dissídio, agora) e as de 01/11 na data.
-- Entrada: banco de produção, depois da migração 2026-10-28-rh-movimentacoes.sql e do deploy do código. Saída: linhas em erp_rh_movimentacoes.
-- Uso: executar uma vez no SQL Editor do Supabase (idempotente: não duplica movimentação do mesmo tipo/vigência).
-- Fora do dissídio (sem reajuste na planilha): André Gabriel, Luiz Suzuki, Idalino, Pablo, Rodolpho, Leonardo, Arthur (admitidos desde 01/08).
WITH dis(colaborador_id, salario_novo, percentual) AS (VALUES
  (15, 14906.30, 2.08),  -- Alcenir de Amorim Fernandes Júnior
  (16, 15154.19, 2.08),  -- Diego Bispo dos Santos Farias
  (1,  45543.39, 0.7815),-- Fabricio Camargo de Lima (valor fixo R$ 353,15)
  (7,  10574.00, 2.08),  -- Leticia Cristina Deniz Fonseca
  (6,  13746.19, 2.08),  -- Marcelo Atanázio Argolo
  (4,   8407.85, 2.08),  -- Gustavo do Amaral
  (3,   8407.85, 2.08),  -- Gustavo Fonseca
  (2,   8407.85, 2.08),  -- Mayara Arielly Silva Vieira
  (19,  6679.26, 1.67),  -- Brenda Porcinelli Baptistone
  (18, 10886.29, 1.67))  -- Adele Mariana Nunes Polastre
INSERT INTO erp_rh_movimentacoes (vinculo_id, colaborador_id, tipo, vigencia_inicio, salario_novo, percentual, motivo, registrado_por)
SELECT v.id, d.colaborador_id, 'dissidio', DATE '2026-08-01', d.salario_novo, d.percentual,
       'Dissídio EAA 2025/2026 — retroativo a agosto, acertado na folha de outubro', 1
  FROM dis d
  JOIN LATERAL (SELECT id FROM erp_rh_vinculos WHERE colaborador_id = d.colaborador_id AND desligamento IS NULL ORDER BY admissao DESC LIMIT 1) v ON true
 WHERE NOT EXISTS (SELECT 1 FROM erp_rh_movimentacoes m WHERE m.vinculo_id = v.id AND m.tipo = 'dissidio' AND m.vigencia_inicio = DATE '2026-08-01' AND m.status <> 'cancelada');

INSERT INTO erp_rh_movimentacoes (vinculo_id, colaborador_id, tipo, vigencia_inicio, cargo_novo, salario_novo, motivo, registrado_por)
SELECT v.id, p.colaborador_id, 'promocao', DATE '2026-11-01', p.cargo, 19045.00, 'Promoção a ' || p.cargo, 1
  FROM (VALUES (16, 'Gerente de Subscrição'), (6, 'Gerente Administrativo')) AS p(colaborador_id, cargo)
  JOIN LATERAL (SELECT id FROM erp_rh_vinculos WHERE colaborador_id = p.colaborador_id AND desligamento IS NULL ORDER BY admissao DESC LIMIT 1) v ON true
 WHERE NOT EXISTS (SELECT 1 FROM erp_rh_movimentacoes m WHERE m.vinculo_id = v.id AND m.tipo = 'promocao' AND m.vigencia_inicio = DATE '2026-11-01' AND m.status <> 'cancelada');

SELECT tipo, status, count(*) FROM erp_rh_movimentacoes GROUP BY 1, 2 ORDER BY 1, 2;
