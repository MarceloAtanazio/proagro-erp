-- ============================================================
-- ProAgro ERP — Dados de exemplo (seed)
-- Execute DEPOIS do schema.sql, apenas uma vez, em banco vazio.
-- Senha do admin já vem com hash bcrypt pronto (ProAgro@2026).
-- ============================================================

-- ---------- Usuário administrador ----------
-- E-mail: marcelo@proagroseguros.com  |  Senha: ProAgro@2026
insert into erp_users (name, email, password_hash, role)
values (
  'Marcelo Atanázio Argolo',
  'marcelo@proagroseguros.com',
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Y0.z8g4Y1e2v8ROLc3XZoRB5H0K1e', -- será substituído no runtime, ver nota abaixo
  'admin'
);

-- ---------- Fornecedores ----------
insert into erp_suppliers (name, cnpj, category, contact_name, email, phone, payment_terms, status) values
('Climaterra Consultoria Agroclimática', '12.345.678/0001-10', 'Serviços Técnicos', 'Atendimento', 'contato@climaterra.com.br', '(11) 3000-1001', '30 dias', 'ativo'),
('Budget Locadora de Veículos', '23.456.789/0001-20', 'Frota', 'Comercial Corporativo', 'corporativo@budget.com.br', '(11) 3000-2002', '30 dias', 'ativo'),
('Regus Escritórios', '34.567.890/0001-30', 'Instalações', 'Gerência de Contas', 'contas@regus.com.br', '(11) 3000-3003', 'Antecipado', 'ativo'),
('SantosBevilaqua Advogados', '45.678.901/0001-40', 'Jurídico', 'João Marcelo Santos', 'contato@santosbevilaqua.com.br', '(11) 3000-4004', '15 dias', 'ativo'),
('Produttivo Sistemas', '56.789.012/0001-50', 'Tecnologia', 'Suporte', 'suporte@produttivo.com.br', '(11) 3000-5005', 'Mensal', 'ativo'),
('Flash Tecnologia (Benefícios)', '67.890.123/0001-60', 'RH / Benefícios', 'Atendimento Empresas', 'empresas@flashapp.com.br', '(11) 3000-6006', 'Mensal', 'ativo'),
('Agrossistemas Análises', '78.901.234/0001-70', 'Serviços Técnicos', 'Laboratório', 'lab@agrossistemas.com.br', '(11) 3000-7007', '30 dias', 'ativo');

-- ---------- Contas a Pagar (mai–ago/2026) ----------
insert into erp_payables (supplier_id, description, category, cost_center, document, amount, due_date, payment_date, status, created_by) values
(3, 'Aluguel escritório — Maio/2026', 'Instalações', 'Administrativo', 'NF 8841', 12500.00, '2026-05-05', '2026-05-05', 'pago', 1),
(3, 'Aluguel escritório — Junho/2026', 'Instalações', 'Administrativo', 'NF 8912', 12500.00, '2026-06-05', '2026-06-04', 'pago', 1),
(3, 'Aluguel escritório — Julho/2026', 'Instalações', 'Administrativo', 'NF 8987', 12500.00, '2026-07-05', '2026-07-03', 'pago', 1),
(3, 'Aluguel escritório — Agosto/2026', 'Instalações', 'Administrativo', 'NF 9054', 12500.00, '2026-08-05', null, 'pendente', 1),
(2, 'Locação frota técnicos — Junho/2026', 'Frota', 'Operação a Campo', 'NF 5521', 18900.00, '2026-06-10', '2026-06-10', 'pago', 1),
(2, 'Locação frota técnicos — Julho/2026', 'Frota', 'Operação a Campo', 'NF 5610', 18900.00, '2026-07-10', null, 'pendente', 1),
(6, 'Benefícios colaboradores — Junho/2026', 'RH / Benefícios', 'Administrativo', 'FAT 3301', 24350.00, '2026-06-28', '2026-06-28', 'pago', 1),
(6, 'Benefícios colaboradores — Julho/2026', 'RH / Benefícios', 'Administrativo', 'FAT 3388', 24350.00, '2026-07-28', null, 'pendente', 1),
(4, 'Honorários jurídicos — Parecer SCE-IED', 'Jurídico', 'Administrativo', 'NF 1204', 8500.00, '2026-06-20', '2026-06-19', 'pago', 1),
(4, 'Honorários jurídicos — Mensalidade Julho', 'Jurídico', 'Administrativo', 'NF 1255', 6200.00, '2026-07-20', null, 'pendente', 1),
(5, 'Licenças Produttivo — Julho/2026', 'Tecnologia', 'Operação a Campo', 'FAT 990', 3400.00, '2026-07-15', null, 'pendente', 1),
(1, 'Consultoria agroclimática — Safra 26/27', 'Serviços Técnicos', 'Operação a Campo', 'NF 2210', 15800.00, '2026-08-15', null, 'pendente', 1),
(7, 'Análises de solo — Lote 07/2026', 'Serviços Técnicos', 'Operação a Campo', 'NF 4470', 5620.00, '2026-07-25', null, 'pendente', 1),
(null, 'Folha de pagamento — Junho/2026', 'Folha de Pagamento', 'Administrativo', 'FOLHA 06/26', 96400.00, '2026-06-30', '2026-06-30', 'pago', 1),
(null, 'Folha de pagamento — Julho/2026', 'Folha de Pagamento', 'Administrativo', 'FOLHA 07/26', 96400.00, '2026-07-31', null, 'pendente', 1),
(null, 'Impostos e taxas — DAS/ISS Julho', 'Impostos e Taxas', 'Administrativo', 'GUIA 07/26', 14280.00, '2026-07-20', null, 'pendente', 1),
(null, 'Viáticos equipe de campo — Junho/2026', 'Viáticos', 'Operação a Campo', 'REL 06/26', 11230.00, '2026-07-08', '2026-07-08', 'pago', 1);

-- ---------- Contas a Receber ----------
insert into erp_receivables (client_name, description, category, document, amount, due_date, receipt_date, status, created_by) values
('Seguradora Essor', 'Comissão corretagem — apólices Maio/2026', 'Comissões', 'FAT 2026-051', 88400.00, '2026-06-15', '2026-06-15', 'recebido', 1),
('Seguradora Essor', 'Comissão corretagem — apólices Junho/2026', 'Comissões', 'FAT 2026-061', 92750.00, '2026-07-15', null, 'pendente', 1),
('Swiss Re Corporate Solutions', 'Comissão resseguro facultativo — Q2/2026', 'Comissões', 'FAT 2026-062', 45300.00, '2026-07-30', null, 'pendente', 1),
('Matriz México (ProAgro Insur)', 'Reembolso serviços compartilhados — Jun/2026', 'Serviços Intercompany', 'INV 2026-014', 32000.00, '2026-07-10', '2026-07-09', 'recebido', 1),
('Matriz México (ProAgro Insur)', 'Reembolso serviços compartilhados — Jul/2026', 'Serviços Intercompany', 'INV 2026-015', 32000.00, '2026-08-10', null, 'pendente', 1),
('Cooperativa Agrária', 'Serviços técnicos de monitoramento — Safra', 'Serviços Técnicos', 'NF 2026-118', 27500.00, '2026-08-20', null, 'pendente', 1),
('Seguradora Essor', 'Comissão corretagem — apólices Abril/2026', 'Comissões', 'FAT 2026-041', 79600.00, '2026-05-15', '2026-05-15', 'recebido', 1);

-- ---------- Extrato bancário (para conciliação) ----------
insert into erp_bank_transactions (txn_date, description, amount, reconciled, matched_type, matched_id, imported_batch) values
('2026-06-15', 'TED RECEBIDA SEGURADORA ESSOR', 88400.00, true, 'receivable', 1, 'extrato-jun-2026'),
('2026-06-04', 'PAG BOLETO REGUS ESCRITORIOS', -12500.00, true, 'payable', 2, 'extrato-jun-2026'),
('2026-06-10', 'PAG BOLETO BUDGET LOCADORA', -18900.00, true, 'payable', 5, 'extrato-jun-2026'),
('2026-06-19', 'TED ENVIADA SANTOSBEVILAQUA', -8500.00, true, 'payable', 9, 'extrato-jun-2026'),
('2026-06-28', 'DEB AUTOM FLASH TECNOLOGIA', -24350.00, true, 'payable', 7, 'extrato-jun-2026'),
('2026-06-30', 'PAGAMENTO FOLHA 06/2026', -96400.00, true, 'payable', 14, 'extrato-jun-2026'),
('2026-07-03', 'PAG BOLETO REGUS ESCRITORIOS', -12500.00, false, null, null, 'extrato-jul-2026'),
('2026-07-08', 'TED ENVIADA VIATICOS CAMPO', -11230.00, false, null, null, 'extrato-jul-2026'),
('2026-07-09', 'SWIFT RECEBIDO PROAGRO INSUR MX', 32000.00, false, null, null, 'extrato-jul-2026'),
('2026-07-01', 'TARIFA PACOTE SERVICOS PJ', -189.90, false, null, null, 'extrato-jul-2026'),
('2026-07-06', 'RENDIMENTO APLIC AUTOMATICA', 1240.55, false, null, null, 'extrato-jul-2026');

-- ---------- Orçamento 2026 ----------
do $$
declare
  m int;
  cat text;
  val numeric;
  despesas jsonb := '{"Folha de Pagamento":97000,"Instalações":13000,"Frota":19500,"RH / Benefícios":25000,"Jurídico":7500,"Tecnologia":4000,"Serviços Técnicos":12000,"Viáticos":10000,"Impostos e Taxas":15000}';
  receitas jsonb := '{"Comissões":120000,"Serviços Intercompany":32000,"Serviços Técnicos":15000}';
begin
  for m in 1..12 loop
    for cat, val in select key, value::numeric from jsonb_each_text(despesas) loop
      insert into erp_budgets (year, month, type, category, amount) values (2026, m, 'despesa', cat, val);
    end loop;
    for cat, val in select key, value::numeric from jsonb_each_text(receitas) loop
      insert into erp_budgets (year, month, type, category, amount) values (2026, m, 'receita', cat, val);
    end loop;
  end loop;
end $$;

-- ============================================================
-- IMPORTANTE sobre a senha do admin acima:
-- O hash de exemplo neste arquivo NÃO corresponde a "ProAgro@2026"
-- (gerar um hash bcrypt fixo dentro de puro SQL não é seguro/trivial).
-- Depois de rodar este seed, gere o hash real e atualize com:
--
--   node -e "console.log(require('bcryptjs').hashSync('ProAgro@2026', 10))"
--
-- E então, no SQL Editor do Supabase:
--   update erp_users set password_hash = 'HASH_GERADO_AQUI'
--   where email = 'marcelo@proagroseguros.com';
--
-- Alternativa mais simples: não rode este INSERT do usuário admin e,
-- em vez disso, use a própria tela de "Criar conta" do sistema —
-- o primeiro usuário cadastrado vira admin automaticamente.
-- ============================================================
