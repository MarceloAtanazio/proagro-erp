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
  const TUD = [];
  for (const [cat, h, a] of [['interior', 200, 100], ['capital', 300, 150], ['sp_df_rj_intl', 400, 200]]) TUD.push({ tier: 'A', categoria_local: cat, tipo_despesa: 'hospedagem', valor_diaria: h }, { tier: 'A', categoria_local: cat, tipo_despesa: 'alimentacao', valor_diaria: a });
  window.__POSTS = []; window.__CHAMADAS = [];
  window.fetch = async (url, opts = {}) => {
    const u = String(url), m = (opts.method || 'GET').toUpperCase();
    if (!u.includes('/api/')) return json({});
    window.__CHAMADAS.push(m + ' ' + u);
    if (u.includes('/api/auth/me')) return json({ user: { id: 1, name: 'Fulano de Tal', email: 'f@x.com', role: 'admin', is_super: true, permissions: { viaticos: (location.search.includes('admin') ? 'edit' : 'view') }, must_change_password: false } });
    if (u.includes('/api/viaticos/dashboard')) return json({ aguardandoComprovacao: { n: 0, v: 0 }, divergentes: { n: 0, v: 0 }, vencidas: { n: 0, v: 0 }, kmPendentes: { n: 0, valor: 0 }, saldoCarteira: 0, transferido: 0, transferidoMes: 0 });
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
    if (u.includes('/despesas') && m === 'GET') return json(u.includes('/solicitacoes/109/') ? [
      { id: 1, solicitacao_id: 109, categoria: 'hospedagem', data: '2026-11-03', valor: 700, descricao: 'Hotel' },
      { id: 2, solicitacao_id: 109, categoria: 'alimentacao', data: '2026-11-04', valor: 300, descricao: 'Almoço' },
      { id: 3, solicitacao_id: 109, categoria: 'passagem_aviao', data: '2026-11-05', valor: 200, descricao: 'Remarcação' }] : []);
    if (u.includes('/reprovadas')) return json([]);
    if (u.includes('/conferir')) return json({ estorno_flash: null, conferir_valor: 0, conferir_decisao: null, conferir_nota: null });
    if (u.includes('/api/viaticos/km')) return json({ registros: [], taxa_vigente: 0.7 });
    if (u.includes('/fechar') && m === 'POST') { window.__POSTS.push({ fechar: u }); return json({ error: 'Há complementar(es) ainda em aprovação (OT 42 - Custo extra). Aprove ou cancele antes de fechar a comprovação: ela é única para a OT e as complementares.' }, 400); }
    if (u.includes('/pendencia')) return json({ total: 256.5, solicitacoes: [{ id: 38, ordem_trabalho: '38', status: 'divergente', valor_pendencia: 256.5, origem: 'flash' }] });
    if (u.includes('/cancelar') && m === 'POST') { window.__POSTS.push({ url: u, ...JSON.parse(opts.body) }); return json({ ok: true }); }
    return json([]);
  };
})();

