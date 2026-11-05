// Propósito: simulador de servidor para testar a COMPROVAÇÃO ÚNICA no app real, no navegador (sem banco). Família da OT 42: a OT de origem (em viagem, R$ 5.400,39
//   liberados, R$ 1.200 já comprovados), o custo extra (Em Approvals, R$ 1.500) e uma extensão (transferência agendada, R$ 900 liberados), mais a OT 50 sem complementares.
//   Roteiro verificado: a lista mostra UMA linha para a OT 42 com a etiqueta "↪ 2 complementares", valores somados (solicitado 7.800,39 · liberado 6.300,39) e aviso de
//   "1 compl. em Approvals"; a etiqueta abre as duas sub-linhas; Comprovar na sub-linha abre a comprovação da OT 42, com a memória por OT e os totais somados; Fechar
//   recebe a recusa do servidor (complementar em aprovação).
// Como executar: como em 2026-11-04_complementar_mock_navegador.js (salvar como mock.js, servir public/ e abrir /#viaticos).
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
    if (u.includes('/api/auth/me')) return json({ user: { id: 1, name: 'Fulano de Tal', email: 'f@x.com', role: 'usuario', permissions: { viaticos: (location.search.includes('admin') ? 'edit' : 'view') }, must_change_password: false } });
    if (u.includes('/api/viaticos/dashboard')) return json({ aguardandoComprovacao: { n: 0, v: 0 }, divergentes: { n: 0, v: 0 }, vencidas: { n: 0, v: 0 }, kmPendentes: { n: 0, valor: 0 }, saldoCarteira: 0, transferido: 0, transferidoMes: 0 });
    if (u.endsWith('/api/viaticos/solicitacoes') && m === 'GET') return json(SOLS);
    if (u.includes('/api/viaticos/autosservico/meu-colaborador')) return json(COLAB);
    if (u.endsWith('/api/colaboradores')) return json([COLAB]);
    if (u.endsWith('/api/viaticos/tud')) return json(TUD);
    if (u.endsWith('/api/viaticos/config')) return json({ preco_combustivel_litro: 6 });
    if (u.endsWith('/api/viaticos/solicitacoes/autosservico') && m === 'POST') { window.__POSTS.push(JSON.parse(opts.body)); return json({ ok: true, id: 900 }); }
    if (m === 'DELETE') { window.__POSTS.push({ del: u }); return json({ ok: true }); }
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
