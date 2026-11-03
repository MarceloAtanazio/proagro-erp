// Propósito: simulador de servidor para testar a lista de Viáticos (ações em ícones, cancelar, complementar, exclusão em duas perguntas) no app real.
// Como executar: como em 2026-11-04_complementar_mock_navegador.js (salvar como mock.js). Abrir /#viaticos (colaborador, só visualiza) ou /?admin#viaticos (edita).
// Roteiro verificado: ícones com dica e aria-label; Comprovar verde e Excluir vermelho; perfil só-leitura sem Excluir; Excluir pede duas confirmações (window.__POSTS guarda o DELETE só no "Sim, excluir definitivamente").
// Simula o servidor para abrir o app real: colaborador (só visualiza Viáticos) com uma OT em viagem.
(() => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const COLAB = { id: 7, name: 'Fulano de Tal', cargo: 'Inspetor', tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande', usuario_id: 1,
    cnh_numero: '123', cnh_validade: '2030-01-01', motorista_apto: true, veiculo_apto: true, veiculo_placa: 'ABC1D23', veiculo_modelo: 'Fox', veiculo_consumo_kml: 10,
    veiculo_crlv_validade: '2030-01-01', veiculo_possui_seguro: true, veiculo_seguradora: 'X', veiculo_apolice: '1', veiculo_seguro_validade: '2030-01-01' };
  const base = (o) => ({ colaborador_id: 7, colaborador_name: 'Fulano de Tal', colaborador_cargo: 'Inspetor', colaborador_cidade_base_uf: 'MS', colaborador_cidade_base_municipio: 'Campo Grande',
    tier: 'A', categoria_local: 'interior', valor_solicitado: 1000, valor_liberado: 1000, valor_devolvido: 0, valor_pendencia: 0, valor_comprovado: 0, origem: 'colaborador',
    previsao_por_categoria: { hospedagem: 500, alimentacao: 500 }, transporte_detalhes: {}, motivo: 'Sinistro', objetivo: 'Vistoria', ...o });
  const SOLS = [
    base({ id: 41, ordem_trabalho: '41', status: 'em_viagem', data_inicio: '2026-11-01', data_fim: '2026-11-10', destinos: [{ uf: 'MT', municipio: 'Sorriso' }, { uf: 'MT', municipio: 'Sinop' }] }),
    base({ id: 44, ordem_trabalho: '44', status: 'em_approvals', valor_liberado: 0, data_inicio: '2026-12-01', data_fim: '2026-12-03', destinos: [{ uf: 'MT', municipio: 'Sinop' }] }),
    base({ id: 45, ordem_trabalho: '45', status: 'liberado', valor_liberado: 1500, data_inicio: '2026-12-10', data_fim: '2026-12-12', destinos: [{ uf: 'MT', municipio: 'Sinop' }] }),
    base({ id: 42, ordem_trabalho: '42', status: 'comprovado', data_inicio: '2026-10-01', data_fim: '2026-10-05', destinos: [{ uf: 'MT', municipio: 'Sinop' }] }),
    base({ id: 43, colaborador_id: 8, colaborador_name: 'Outra Pessoa', ordem_trabalho: '43', status: 'em_viagem', data_inicio: '2026-11-01', data_fim: '2026-11-10', destinos: [{ uf: 'MT', municipio: 'Sinop' }] })
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
    if (u.includes('/cancelar') && m === 'POST') { window.__POSTS.push({ url: u, ...JSON.parse(opts.body) }); return json({ ok: true }); }
    return json([]);
  };
})();
