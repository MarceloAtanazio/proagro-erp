// Propósito: verifica a OT complementar no backend (POST /api/viaticos/solicitacoes/autosservico com solicitacao_pai_id), com o banco simulado.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-04_verifica_complementar_api.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Fulano', email: 'f@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false },
            2: { id: 2, name: 'Outro', email: 'o@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false } };
const COLAB = { 1: { id: 7, usuario_id: 1, tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande' },
                2: { id: 8, usuario_id: 2, tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande' } };
const TUD = [];
for (const [cat, h, a] of [['interior', 200, 100], ['capital', 300, 150], ['sp_df_rj_intl', 400, 200]]) {
  TUD.push({ tier: 'A', categoria_local: cat, tipo_despesa: 'hospedagem', valor_diaria: h }, { tier: 'A', categoria_local: cat, tipo_despesa: 'alimentacao', valor_diaria: a });
}
const SOL = {
  41: { id: 41, colaborador_id: 7, ordem_trabalho: '41', status: 'em_viagem', destinos: [{ uf: 'MT', municipio: 'Sorriso' }, { uf: 'MT', municipio: 'Sinop' }], data_fim: new Date('2026-11-10T00:00:00Z') },
  42: { id: 42, colaborador_id: 7, ordem_trabalho: '42', status: 'comprovado', destinos: [{ uf: 'MT', municipio: 'Sinop' }], data_fim: '2026-10-10' },
  43: { id: 43, colaborador_id: 8, ordem_trabalho: '43', status: 'em_viagem', destinos: [{ uf: 'MT', municipio: 'Sinop' }], data_fim: '2026-11-10' },
  44: { id: 44, colaborador_id: 7, ordem_trabalho: '41 - Complementar', status: 'em_viagem', destinos: [{ uf: 'GO', municipio: 'Rio Verde' }], data_fim: '2026-11-14' } };
let INS = [], JA = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE usuario_id=$1')) return [COLAB[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT tier, categoria_local, tipo_despesa, valor_diaria FROM erp_viaticos_tud')) return TUD;
  if (s.startsWith('SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOL[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2')) { JA.push(p); return INS.filter(i => i.colab === p[0] && i.ot.startsWith(p[1].replace(/\\([\\%_])/g, '$1').replace(/%$/, ''))).map(i => ({ id: i.id })); }
  if (s.startsWith('INSERT INTO erp_viaticos_solicitacoes')) {
    const r = { id: 500 + INS.length, colab: p[0], ot: p[3], destinos: JSON.parse(p[4]), ini: p[7], fim: p[8], total: p[9], cat: JSON.parse(p[10]), pai: p[14], tipo: p[15], pu: p[16], pm: p[17] };
    INS.push(r); return [{ id: r.id }];
  }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const post = async (quem, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/viaticos/solicitacoes/autosservico`, { method: 'POST', headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const base = { motivo: 'Sinistro', objetivo: 'Estender a vistoria', data_inicio: '2000-01-01', ordem_trabalho: 'LIXO' };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r, ult = () => INS[INS.length - 1];

  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'extensao', data_fim: '2026-11-13', destinos: [{ uf: 'SP', municipio: 'São Paulo' }], transporte_detalhes: {} });
  ok('extensão sem transporte é aceita (a pessoa já está no local)', r.status === 200 && r.body.ok, r);
  ok('...número vira "41 - Complementar" (o que veio do navegador é ignorado)', ult().ot === '41 - Complementar', ult());
  ok('...saída = data final da OT de origem (10/11), não a enviada', ult().ini === '2026-11-10', ult());
  ok('...destinos = os da OT de origem (impostos pelo servidor)', JSON.stringify(ult().destinos) === JSON.stringify(SOL[41].destinos), ult().destinos);
  ok('...grava a OT de origem, o tipo e o ponto de partida (último destino: Sinop/MT)', ult().pai === 41 && ult().tipo === 'extensao' && ult().pu === 'MT' && ult().pm === 'Sinop', ult());
  // 10→13 = 3 dias/noites, interior (Sinop/Sorriso): hospedagem 3×200=600, alimentação 3×100=300 → 900
  ok('...previsão: 3 noites de hospedagem e 3 dias de alimentação (sem repetir o dia de saída) = R$ 900', ult().cat.hospedagem === 600 && ult().cat.alimentacao === 300 && ult().total === 900, ult());

  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'extensao', data_fim: '2026-11-11', destinos: [], transporte_detalhes: {} });
  ok('segunda complementar da mesma OT: "41 - Complementar 2"', r.status === 200 && ult().ot === '41 - Complementar 2', ult());
  ok('...1 dia depois da saída: 1 noite + 1 dia de alimentação = R$ 300', ult().total === 300, ult());

  r = await post(1, { ...base, solicitacao_pai_id: 44, complementar_tipo: 'extensao', data_fim: '2026-11-16', destinos: [], transporte_detalhes: {} });
  ok('complementar de complementar: parte do último destino da anterior (Rio Verde/GO) e mantém a raiz do número', r.status === 200 && ult().pm === 'Rio Verde' && /^41 - Complementar( \d+)?$/.test(ult().ot) && ult().ini === '2026-11-14', ult());

  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'novo_destino', data_fim: '2026-11-13', destinos: [{ uf: 'MT', municipio: 'Lucas do Rio Verde' }], transporte_detalhes: {} });
  ok('novo destino SEM meio de transporte é recusado', r.status === 400 && /transporte/i.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'novo_destino', data_fim: '2026-11-13', destinos: [{ uf: 'MT', municipio: 'Lucas do Rio Verde' }], transporte_detalhes: { taxi_uber: true, taxi_uber_corridas: [{ valor: 80 }] } });
  ok('novo destino com táxi/Uber: aceito, parte de Sinop e usa os destinos escolhidos', r.status === 200 && ult().tipo === 'novo_destino' && ult().pm === 'Sinop' && ult().destinos[0].municipio === 'Lucas do Rio Verde', [r, ult()]);
  ok('...previsão: 3 noites + 3 dias + táxi R$ 80 = R$ 980', ult().total === 980 && ult().cat.taxi_uber === 80, ult());

  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'extensao', data_fim: '2026-11-10', destinos: [], transporte_detalhes: {} });
  ok('complementar que termina no mesmo dia da saída é recusada', r.status === 400 && /depois da data final/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'extensao', data_fim: '2026-11-09', destinos: [], transporte_detalhes: {} });
  ok('...e a que termina antes também', r.status === 400, r);
  r = await post(1, { ...base, solicitacao_pai_id: 42, complementar_tipo: 'extensao', data_fim: '2026-11-13', destinos: [], transporte_detalhes: {} });
  ok('OT de origem já fechada: recusada', r.status === 400 && /em curso/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 43, complementar_tipo: 'extensao', data_fim: '2026-11-13', destinos: [], transporte_detalhes: {} });
  ok('OT de OUTRO colaborador: 404', r.status === 404, r);
  r = await post(1, { ...base, solicitacao_pai_id: 999, complementar_tipo: 'extensao', data_fim: '2026-11-13', destinos: [], transporte_detalhes: {} });
  ok('OT de origem inexistente: 404', r.status === 404, r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'qualquer', data_fim: '2026-11-13', destinos: [], transporte_detalhes: {} });
  ok('tipo inválido: 400', r.status === 400, r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, complementar_tipo: 'extensao', data_fim: '2026-11-13', objetivo: '', destinos: [], transporte_detalhes: {} });
  ok('objetivo continua obrigatório', r.status === 400 && /objetivo/i.test(r.body.error), r);

  // OT comum (sem origem): nada mudou — conta o dia de saída e exige transporte
  const antes = INS.length;
  r = await post(1, { ordem_trabalho: '60', motivo: 'Sinistro', objetivo: 'x', data_inicio: '2026-11-10', data_fim: '2026-11-12', destinos: [{ uf: 'MT', municipio: 'Sinop' }], transporte_detalhes: { taxi_uber: true, taxi_uber_corridas: [{ valor: 50 }] } });
  ok('OT comum: 3 dias de alimentação + 2 noites + táxi = 300 + 400 + 50 = R$ 750 (regra antiga intacta)', r.status === 200 && INS.length === antes + 1 && ult().total === 750 && ult().pai === null, [r, ult()]);
  r = await post(1, { ordem_trabalho: '61', motivo: 'Sinistro', objetivo: 'x', data_inicio: '2026-11-10', data_fim: '2026-11-12', destinos: [{ uf: 'MT', municipio: 'Sinop' }], transporte_detalhes: {} });
  ok('OT comum sem transporte continua recusada', r.status === 400, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
