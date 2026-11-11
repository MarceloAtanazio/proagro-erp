// Propósito: simulador de servidor para avaliar o TEMA (claro/escuro e visual novo) no app real, no navegador, sem banco. Usuário administrador; Dashboard com todos os
//   indicadores e gráficos (dados de exemplo) e Viáticos (OT 42 com complementares). Roteiro: abrir /#dashboard e /#viaticos, alternar Clássico/Novo e claro/escuro.
// Como executar: copiar public/ para uma pasta, salvar este arquivo como mock.js ao lado do index.html (com <script src="/mock.js"> antes do app.js), servir e abrir /#dashboard.
(() => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const COLAB = { id: 7, name: 'Fulano de Tal', cargo: 'Inspetor', tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande', usuario_id: 1,
    cnh_numero: '123', cnh_validade: '2030-01-01', motorista_apto: true, veiculo_apto: true, veiculo_placa: 'ABC1D23', veiculo_modelo: 'Fox', veiculo_consumo_kml: 10,
    veiculo_crlv_validade: '2030-01-01', veiculo_possui_seguro: true, veiculo_seguradora: 'X', veiculo_apolice: '1', veiculo_seguro_validade: '2030-01-01' };
  const base = (o) => ({ colaborador_id: 7, colaborador_name: 'Fulano de Tal', colaborador_cargo: 'Inspetor', colaborador_cidade_base_uf: 'MS', colaborador_cidade_base_municipio: 'Campo Grande',
    tier: 'A', categoria_local: 'interior', valor_solicitado: 1000, valor_liberado: 1000, valor_devolvido: 0, valor_pendencia: 0, valor_comprovado: 0, origem: 'colaborador',
    previsao_por_categoria: { hospedagem: 500, alimentacao: 500 }, transporte_detalhes: {}, motivo: 'Sinistro', objetivo: 'Vistoria', ...o });
  const SOLS = [
    base({ id: 109, familia_raiz_id: 109, ordem_trabalho: '42', status: 'em_viagem', data_inicio: '2026-11-03', data_fim: '2026-11-06', valor_solicitado: 5400.39, valor_liberado: 5400.39, valor_comprovado: 1200,
      previsao_por_categoria: { hospedagem: 3000, alimentacao: 1400.39, passagem_aviao: 1000 }, destinos: [{ uf: 'PR', municipio: 'Maringá' }] }),
    base({ id: 120, familia_raiz_id: 109, solicitacao_pai_id: 109, complementar_tipo: 'custo_extra', custo_extra_tipo: 'remarcacao_aviao', ordem_trabalho: '42 - Custo extra', status: 'em_approvals',
      valor_solicitado: 1500, valor_liberado: 0, previsao_por_categoria: { passagem_aviao: 1500 }, data_inicio: '2026-11-03', data_fim: '2026-11-06', destinos: [{ uf: 'PR', municipio: 'Maringá' }] }),
    base({ id: 121, familia_raiz_id: 109, solicitacao_pai_id: 109, complementar_tipo: 'extensao', ordem_trabalho: '42 - Complementar', status: 'transferencia_agendada',
      valor_solicitado: 900, valor_liberado: 900, previsao_por_categoria: { hospedagem: 600, alimentacao: 300 }, data_inicio: '2026-11-06', data_fim: '2026-11-09', destinos: [{ uf: 'PR', municipio: 'Maringá' }] }),
    base({ id: 50, familia_raiz_id: 50, ordem_trabalho: '50', status: 'comprovado', data_inicio: '2026-10-01', data_fim: '2026-10-05', valor_comprovado: 1000, destinos: [{ uf: 'MT', municipio: 'Sinop' }] })
  ];
  // OTs extras (painel de Viáticos): vários colaboradores, situações e datas
  const NOMES = ['Dijovano Dal Castel', 'Leticia Cristina Deniz Fonseca', 'Rodolpho Teixeira Mensato', 'Arthur Albani Dala Costa', 'Marina Souza Prado', 'Carlos Eduardo Lima'];
  const STS = ['comprovado', 'em_viagem', 'aguardando_comprovacao', 'devolvido', 'divergente', 'liberado', 'comprovado', 'em_approvals'];
  for (let k = 0; k < 22; k++) { const di = new Date(2026, 9, 2 + k * 1.4), df = new Date(di.getTime() + (2 + k % 3) * 86400000), lib = 900 + (k * 377) % 3100;
    SOLS.push(base({ id: 200 + k, familia_raiz_id: 200 + k, ordem_trabalho: String(150 + k), colaborador_name: NOMES[k % NOMES.length], status: STS[k % STS.length], data_inicio: di.toISOString().slice(0, 10), data_fim: df.toISOString().slice(0, 10),
      valor_solicitado: lib, valor_liberado: lib, valor_comprovado: Math.round(lib * (0.55 + (k % 5) * 0.1)), valor_devolvido: k % 4 === 3 ? 120 : 0, valor_pendencia: k % 7 === 6 ? 210.5 : 0, destinos: k % 5 === 0 ? ['Jaguapitã', 'Iguaraçu', 'Ângulo', 'Astorga', 'Munhoz de Melo', 'Godoy Moreira', 'Fênix', 'São João do Ivaí'].map(m => ({ uf: 'PR', municipio: m })) : [{ uf: 'PR', municipio: ['Maringá', 'Cascavel', 'Londrina'][k % 3] }] })); }
  const CATS = ['hospedagem', 'alimentacao', 'combustivel', 'pedagio', 'aluguel_carro', 'estacionamento', 'taxi_uber'];
  const despesasMock = id => { const s = SOLS.find(x => x.id === id); if (!s || id < 200) return null; const out = []; const n = 3 + id % 4; for (let j = 0; j < n; j++) { const d = new Date(new Date(s.data_inicio + 'T12:00:00').getTime() + (j % 3) * 86400000);
      out.push({ id: id * 10 + j, solicitacao_id: id, categoria: CATS[(id + j) % CATS.length], data: d.toISOString().slice(0, 10), valor: Math.round((s.valor_comprovado / n) * (0.7 + (j % 3) * 0.3) * 100) / 100, descricao: ['Hotel', 'Almoço', 'Abastecimento', 'Pedágio BR-376', 'Locadora', 'Estacionamento', 'Corrida'][(id + j) % 7] }); } return out; };
  const TUD = [];
  for (const [cat, h, a] of [['interior', 200, 100], ['capital', 300, 150], ['sp_df_rj_intl', 400, 200]]) TUD.push({ tier: 'A', categoria_local: cat, tipo_despesa: 'hospedagem', valor_diaria: h }, { tier: 'A', categoria_local: cat, tipo_despesa: 'alimentacao', valor_diaria: a });
  window.__POSTS = []; window.__CHAMADAS = [];
  window.fetch = async (url, opts = {}) => {
    const u = String(url), m = (opts.method || 'GET').toUpperCase();
    if (!u.includes('/api/')) return json({});
    window.__CHAMADAS.push(m + ' ' + u);
    if (u.includes('/api/auth/me')) return json({ user: { id: 1, name: 'Fulano de Tal', email: 'f@x.com', role: 'admin', is_super: true, permissions: { viaticos: (location.search.includes('admin') ? 'edit' : 'view') }, must_change_password: false } });
    if (u.includes('/api/viaticos/dashboard')) return json({ aguardandoComprovacao: { n: 13, v: 41569.18 }, divergentes: { n: 2, v: 1830.4 }, vencidas: { n: 0, v: 0 }, kmPendentes: { n: 2, valor: 314.5 }, saldoCarteira: 60155.59, transferido: 219793.18, transferidoMes: 18400 });
    if (u.endsWith('/api/viaticos/solicitacoes') && m === 'GET') return json(SOLS);
    if (u.includes('/api/viaticos/autosservico/meu-colaborador')) return json(COLAB);
    if (u.endsWith('/api/colaboradores')) return json([COLAB]);
    if (u.endsWith('/api/viaticos/tud')) return json(TUD);
    if (u.endsWith('/api/viaticos/config')) return json({ preco_combustivel_litro: 6 });
    if (u.endsWith('/api/viaticos/solicitacoes/autosservico') && m === 'POST') { window.__POSTS.push(JSON.parse(opts.body)); return json({ ok: true, id: 900 }); }
    if (m === 'DELETE') { window.__POSTS.push({ del: u }); return json({ ok: true }); }
    if (u.endsWith('/api/suppliers')) return json([
      { id: 1, name: 'Tech Cloud S/A', cnpj: '12345678000190', category: 'Tecnologia', email: 'contato@techcloud.com', contact_name: 'Marina Souza', phone: '4430543219', payment_terms: '30 dias', status: 'ativo' },
      { id: 2, name: 'Imobiliária Central', cnpj: '98765432000110', category: 'Aluguel', email: 'fin@imobcentral.com', contact_name: '', phone: '', payment_terms: '15 dias', status: 'ativo' },
      { id: 3, name: 'Gráfica Rápida LTDA', cnpj: '11222333000144', category: 'Marketing', email: '', contact_name: 'Paulo', phone: '4430548800', payment_terms: '', status: 'inativo' },
      { id: 4, name: 'Seguradora Alfa', cnpj: '55666777000188', category: 'Seguros', email: 'cobranca@alfa.com.br', contact_name: 'Julia Reis', phone: '1130001000', payment_terms: '30 dias', status: 'ativo' }]);
    if (u.includes('/api/settings/manage')) return json({
      categories: ['Administrativo', 'Água', 'Aluguel', 'Energia', 'Tecnologia'].map((n, k) => ({ id: 10 + k, type: 'despesa', name: n, active: k !== 3 }))
        .concat(['Prêmios', 'Serviços'].map((n, k) => ({ id: 30 + k, type: 'receita', name: n, active: true })))
        .concat([{ id: 40, type: 'fornecedor', name: 'Tecnologia', active: true }]),
      costCenters: [{ id: 50, name: 'Operações', active: true }, { id: 51, name: 'Comercial', active: false }] });
    if (u.endsWith('/api/payables') && m === 'GET') {
      const off = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
      const forn = ['Tech Cloud S/A', 'Imobiliária Central', 'Seguradora Alfa', 'Gráfica Rápida', 'Contabilidade Silva', 'Energia Sul', 'Papelaria Norte', 'Consultoria Beta'];
      const cats = ['Tecnologia', 'Aluguel e Condomínio', 'Seguros', 'Marketing', 'Consultoria', 'Energia', 'Material de Escritório', 'Impostos'];
      const dias = [-12, -9, -5, -2, 0, 1, 2, 4, 6, 9, 12, 15, 19, 25, -30, -22, -18, -14];
      return json(dias.map((dd, k) => { const pago = k >= 14; return { id: 410 + k, due_date: off(dd), description: ['Mensalidade da plataforma', 'Aluguel do escritório', 'Apólice coletiva', 'Campanha de divulgação', 'Honorários contábeis', 'Conta de energia'][k % 6] + ' ' + (k + 1), supplier_name: forn[k % 8],
        payment_method: ['boleto', 'pix', 'transferencia'][k % 3], amount: 1800 + k * 2350.4, status: pago ? 'pago' : 'pendente', payment_date: pago ? off(dd + 2) : null, aprovacao_count: k % 3 === 0 ? 1 : 0, attachment_count: k % 4, reconciled: pago && k % 2 === 0, category: cats[k % 8], cost_center: 'Operações', document: 'NF ' + (1000 + k) }; })); }
    if (u.endsWith('/api/receivables') && m === 'GET') {
      const off = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
      const cli = ['Agro Vale Ltda', 'Cooperativa Sul', 'Fazenda Boa Safra', 'Grupo Semear', 'Agropecuária Norte'];
      const dias = [-20, -8, -3, 0, 2, 5, 8, 14, 21, -40, -35, -28, -15];
      return json(dias.map((dd, k) => { const rec = k >= 9; return { id: 90 + k, due_date: off(dd), description: 'Prêmio de seguro — apólice ' + (7000 + k), client_name: cli[k % 5], document: 'AP ' + (7000 + k), amount: 6400 + k * 3120.7, status: rec ? 'recebido' : 'pendente', receipt_date: rec ? off(dd + 1) : null, reconciled: rec && k % 2 === 1, attachment_count: k % 3, category: 'Prêmios' }; })); }
    if (u.includes('/api/reports/fluxo-caixa')) {
      const q = new URL(u, location.origin).searchParams, de = q.get('de'), ate = q.get('ate'), gran = q.get('granularidade') || 'dia';
      const n = { dia: 30, semana: 9, mes: 12, ano: 3 }[gran] || 30; let saldo = 482350.4 - 38000; const bk = [];
      for (let k = 0; k < n; k++) { let ent =Math.round(24000 + Math.sin(k / 2.2) * 9000 + (k % 4) * 3100), sai = Math.round(21000 + Math.cos(k / 1.7) * 8000 + (k % 3) * 4200); saldo += ent - sai;
        if (location.search.includes('out') && k === n - 1) { sai = 1250000; saldo = 482350 - 600000; }   // ?out: último período com saída enorme (caso do print do Marcelo)
        bk.push({ label: gran === 'ano' ? String(2024 + k) : gran === 'mes' ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][k] + '/26' : gran === 'semana' ? 'Sem ' + (k + 1) : String(1 + k).padStart(2, '0') + '/11', entradas: ent, saidas: sai, saldo: Math.round(saldo) }); }
      const te = bk.reduce((t, x) => t + x.entradas, 0), ts = bk.reduce((t, x) => t + x.saidas, 0), ok = location.search.includes('ok');
      return json({ de, ate, resumo: { saldoInicial: 444350.4, totalEntradas: te, totalSaidas: ts, saldoAtual: 482350.4, saldoPrevisto: ok ? 512000 : 301200.6 },
        alerta: ok ? { diaCritico: null, horizonte: '2027-02-09' } : { diaCritico: '2026-12-18', diaPior: '2027-01-14', necessidade: 86400.5, horizonte: '2027-02-09' }, buckets: bk,
        categorias: { despesas: [{ category: 'Folha de Pagamento', total: 470000 }, { category: 'Repasse de Viáticos', total: 288000 }, { category: 'Compras / Fornecedores', total: 52000 }, { category: 'Frota', total: 29800 }, { category: 'RH / Benefícios', total: 22400 }, { category: 'Jurídico', total: 8900 }, { category: 'Aluguel', total: 7600 }, { category: 'Serviços de Terceiros', total: 6900 }, { category: 'Contabilidade', total: 5600 }, { category: 'Condomínio', total: 3100 }, { category: 'Viáticos', total: 1200 }, { category: 'Telefone', total: 540 }, { category: 'Internet', total: 90 }], receitas: [{ category: 'Prêmios', total: 402000 }, { category: 'Serviços', total: 83000 }] },
        futuras: { receber: [{ due_date: '2026-11-20', client_name: 'Agro Vale Ltda', description: 'Prêmio 7001', amount: 9520.7 }], pagar: [{ due_date: '2026-11-18', party: 'Tech Cloud S/A', description: 'Mensalidade', amount: 4200 }] } }); }
    if (/\/api\/budgets\/\d+/.test(u)) { const orc = { 'Folha de Pagamento': 215000, 'Compras / Fornecedores': 9000, 'Serviços de Terceiros': 6500, 'Tarifas Bancárias': 1500, 'Contabilidade': 2600, 'RH / Benefícios': 8200, 'Energia': 1900, 'Viáticos': 14000, 'Frota': 7000, 'Aluguel': 4200, 'Jurídico': 3000, 'Investimentos': 6000, 'Administrativo': 2500, 'Telefone': 600 }; const out = [];
      Object.entries(orc).forEach(([c, v]) => { for (let mth = 1; mth <= 12; mth++) out.push({ type: 'despesa', category: c, month: mth, amount: v }); });
      for (let mth = 1; mth <= 12; mth++) { out.push({ type: 'receita', category: 'Prêmios', month: mth, amount: 410000 }, { type: 'receita', category: 'Serviços', month: mth, amount: 60000 }); } return json(out); }
    if (/\/api\/reports\/actuals\/\d+/.test(u)) { const real = { 'Folha de Pagamento': 96000, 'Compras / Fornecedores': 41000, 'Serviços de Terceiros': 7400, 'Tarifas Bancárias': 1400, 'Contabilidade': 2550, 'RH / Benefícios': 8100, 'Energia': 1500, 'Viáticos': 4700, 'Frota': 6900, 'Aluguel': 3900, 'Jurídico': 3300, 'Telefone': 690 }; const ds = [], rs = [];
      Object.entries(real).forEach(([c, v]) => { for (let mth = 1; mth <= 11; mth++) ds.push({ category: c, month: mth, total: Math.round(v * (0.82 + ((mth * 7 + c.length) % 9) / 25)) }); });
      for (let mth = 1; mth <= 11; mth++) { rs.push({ category: 'Prêmios', month: mth, total: 330000 + mth * 9000 }, { category: 'Serviços', month: mth, total: 52000 }); }
      return json({ despesas: ds, receitas: rs, viaticos: null }); }
    if (u.includes('/api/reports/cashflow/')) { const mes = n => ({ month: n, total: 0 }); const ent = [], sai = []; for (let k = 1; k <= 12; k++) { ent.push({ month: k, total: 300000 + k * 9000 + (k % 3) * 18000 }); sai.push({ month: k, total: 240000 + k * 7000 + (k % 4) * 15000 }); }
      return json({ entradas: { realizado: ent.slice(0, 10), projetado: ent.slice(10) }, saidas: { realizado: sai.slice(0, 10), projetado: sai.slice(10) } }); }
    if (u.includes('/api/reports/dashboard')) {
      const lab = ['nov/25', 'dez/25', 'jan/26', 'fev/26', 'mar/26', 'abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26'];
      const rec = [284, 301, 276, 312, 335, 328, 351, 369, 358, 384, 402, 396], des = [231, 248, 259, 244, 262, 281, 274, 290, 301, 296, 318, 326];
      const proj = []; let saldo = 482350; for (let k = 0; k < 30; k++) { saldo += (k % 5 === 0 ? -24000 : 9000) + Math.sin(k / 3) * 7000; const d = new Date(2026, 10, 11 + k); proj.push({ date: d.toISOString().slice(0, 10), saldo: Math.round(saldo) }); }
      const cats = ['Folha de Pagamento', 'Aluguel e Condomínio', 'Tecnologia', 'Viáticos', 'Marketing', 'Seguros', 'Impostos', 'Consultoria', 'Material de Escritório', 'Manutenção'];
      return json({
        last12: lab.map((l, k) => ({ label: l, receitas: rec[k] * 1000, despesas: des[k] * 1000 })), projecaoDiaria: proj, saldoAtual: 482350.4, saldoNegativoEm: null,
        pagarVencido: { n: 3, v: 18420.5 }, pagarAVencer: { n: 27, v: 212300 }, pagarPend: { n: 30, v: 230720.5 }, pagarHoje: { n: 2, v: 5400 }, pagar7: { n: 9, v: 61200 }, pagar15: { n: 15, v: 118400 }, pagar30: { n: 27, v: 212300 },
        receber7: { n: 4, v: 88000 }, receber15: { n: 6, v: 140000 }, receber30: { n: 11, v: 305000 }, receberMesAtual: { n: 14, v: 412000 }, receberMesRecebido: { v: 268000 }, receberVencido: { n: 2, v: 31000 },
        pagoMes: 186400, orcadoDespesaMes: 175000, naoConciliados: 12, naoConciliadosValor: 45210.9,
        maiorClienteInadimplente: { cliente: 'Agro Vale Ltda', total: 21000, desde: '2026-09-12' }, maiorFornecedorAberto: { fornecedor: 'Tech Cloud S/A', total: 48200 },
        agingPagar: { '1-30': 9200, '31-60': 6100, '61-90': 2300, '90+': 820.5 },
        categoriaMes: cats.slice(0, 6).map((c, k) => ({ category: c, orcado: 90000 - k * 12000, realizado: 88400 - k * 11000 + (k % 2) * 6000, variacao: -1600 + (k % 2) * 7600, variacaoPct: -1.8 + (k % 2) * 8.4 })),
        despesasPorCategoria: cats.map((c, k) => ({ category: c, total: 980000 - k * 85000 })),
        centrosCusto: ['Comercial', 'Operações', 'TI', 'Sinistros', 'RH', 'Financeiro'].map((c, k) => ({ centro: c, total: 640000 - k * 90000 })), centrosCustoTotal: 2430000,
        vencendoPagar: cats.slice(0, 6).map((c, k) => ({ due_date: '2026-11-' + String(12 + k * 3).padStart(2, '0'), party: ['Tech Cloud S/A', 'Imobiliária Central', 'Seguradora Alfa', 'Gráfica Rápida', 'Contabilidade Silva', 'Energia Sul'][k], description: 'Pagamento ' + c, category: c, amount: 4200 + k * 3100 })),
        maioresPagarAbertos: cats.slice(0, 5).map((c, k) => ({ fornecedor: ['Tech Cloud S/A', 'Imobiliária Central', 'Seguradora Alfa', 'Folha de Pagamento', 'Energia Sul'][k], description: 'Título ' + (410 + k), category: c, due_date: '2026-11-' + String(15 + k * 2).padStart(2, '0'), amount: 48200 - k * 7300 }))
      }); }
    if (u.includes('/despesas') && m === 'GET') { const mm = /solicitacoes\/(\d+)\/despesas/.exec(u); const g = mm && despesasMock(Number(mm[1])); if (g) return json(g); }
    if (u.includes('/despesas') && m === 'GET') return json(u.includes('/solicitacoes/109/') ? [
      { id: 1, solicitacao_id: 109, categoria: 'hospedagem', data: '2026-11-03', valor: 700, descricao: 'Hotel' },
      { id: 2, solicitacao_id: 109, categoria: 'alimentacao', data: '2026-11-04', valor: 300, descricao: 'Almoço' },
      { id: 3, solicitacao_id: 109, categoria: 'passagem_aviao', data: '2026-11-05', valor: 200, descricao: 'Remarcação' }] : []);
    if (u.includes('/api/rh/painel')) { const meses = ['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];
      return json({ cobertura: { ativos: 26, com_vinculo: 26, sem_vinculo: 0, sem_vinculo_nomes: [], sem_fornecedor: 0, sem_fornecedor_nomes: [], com_nascimento: 24, com_sexo: 25, com_salario: 23 },
        headcount: { ativos: 26, candidatos: 2, tempo_casa_dias: 520, idade_media: 34, arquivados: 9, por_departamento: [{ chave: 'Campo', n: 13 }, { chave: 'Subscrição', n: 4 }, { chave: 'Comercial', n: 2 }, { chave: 'Administrativo', n: 2 }], por_modelo: [{ chave: 'externo', n: 14 }, { chave: 'hibrido', n: 8 }], por_sexo: [{ chave: 'M', n: 15 }, { chave: 'F', n: 10 }],
          movimentacao: meses.map((m, i) => ({ mes: m, admissoes: i % 3 === 0 ? 2 : 1, desligamentos: i % 4 === 0 ? 1 : 0 })) },
        recrutamento: { vagas: { abertas: 3, pausadas: 1, posicoes_abertas: 4, tempo_medio_preenchimento_dias: 32, paradas: 1, paradas_nomes: ['Analista de Sinistros'] }, em_andamento: 5, previstas_30d: 2, tempo_medio_dias: 21, taxa_conclusao: 57, concluidas_12m: 4, canceladas: 8,
          por_etapa: [{ chave: 'triagem', n: 2 }, { chave: 'entrevista', n: 2 }, { chave: 'documentacao', n: 1 }], encerradas_por_parte: { candidato: 2, empresa: 6 },
          encerradas_por_motivo: [{ chave: 'Escolhemos outro candidato', n: 5 }, { chave: 'Recusou a proposta', n: 1 }, { chave: 'Outro motivo', n: 1 }, { chave: 'Desistiu do processo', n: 1 }, { chave: 'Reprovado na seleção', n: 1 }] },
        turnover: { taxa_12m: 23.1, desligamentos_12m: 6, headcount_medio: 26, voluntario: 2, involuntario: 4, permanencia_media_dias: 60, por_departamento: [{ chave: 'Campo', n: 3 }, { chave: 'Comercial', n: 2 }, { chave: 'Sinistros', n: 1 }] },
        custo: { folha_mensal: 268843.27, periculosidade_mensal: 24140.08, beneficios_mensais: 19526, base_dias_uteis: 22, custo_medio: 12537.79,
          por_departamento: [{ chave: 'Campo', n: 13, salario: 131187.08 }, { chave: 'Diretoria', n: 1, salario: 45543.39 }, { chave: 'Subscrição', n: 4, salario: 43180.1 }, { chave: 'Administrativo', n: 2, salario: 22327.5 }, { chave: 'Comercial', n: 2, salario: 20035.65 }, { chave: 'Sinistros', n: 1, salario: 6569.55 }] },
        desenvolvimento: { horas_12m: 0, horas_per_capita: 0, cobertura_pct: 0, pessoas_treinadas_12m: 0, certificacoes_vencidas: 0, certificacoes_a_vencer: 0, investimento_12m: 0, registros: 0 },
        clima: location.search.includes('clima') ? { enps: 32, ciclo_atual: '2026-S2', satisfacao: 4.1, participacao_pct: 62, respostas: 16, ciclos: [{ ciclo: '2026-S2', respostas: 16, promotores: 9, neutros: 4, detratores: 3, satisfacao: 4.1 }] } : { enps: null, ciclo_atual: null, satisfacao: null, participacao_pct: null, respostas: 0, ciclos: [] },
        compliance: { dossie_incompleto: 3, sem_aso: 2, sem_contrato_assinado: 1, experiencia_vencida: [], sem_vinculo: 0, experiencia_vencendo_30d: [{ nome: 'Fulano de Tal', ate: '2026-12-02' }] } }); }
    if (u.includes('/reprovadas')) return json([]);
    if (u.includes('/conferir')) return json({ estorno_flash: null, conferir_valor: 0, conferir_decisao: null, conferir_nota: null });
    if (u.includes('/api/viaticos/km')) return json({ registros: [], taxa_vigente: 0.7 });
    if (u.includes('/fechar') && m === 'POST') { window.__POSTS.push({ fechar: u }); return json({ error: 'Há complementar(es) ainda em aprovação (OT 42 - Custo extra). Aprove ou cancele antes de fechar a comprovação: ela é única para a OT e as complementares.' }, 400); }
    if (u.includes('/pendencia')) return json({ total: 256.5, solicitacoes: [{ id: 38, ordem_trabalho: '38', status: 'divergente', valor_pendencia: 256.5, origem: 'flash' }] });
    if (u.includes('/cancelar') && m === 'POST') { window.__POSTS.push({ url: u, ...JSON.parse(opts.body) }); return json({ ok: true }); }
    return json([]);
  };
})();



