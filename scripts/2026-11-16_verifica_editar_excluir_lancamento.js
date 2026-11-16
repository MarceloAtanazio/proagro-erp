// Propósito: verifica no backend (banco simulado) a correção de lançamentos de estoque: excluir/editar compra e ajuste com justificativa, recálculo do CMP pelo histórico (caso real do
//   Notebook Asus X1504: apagar a entrada sem custo e a saída de correção deixa CMP 2.951,74), bloqueios (envio, compra com título, estoque negativo, baixa de unidade na edição) e permissão.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_editar_excluir_lancamento.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
// histórico do item 14 (caso real): entrada sem custo 6, entrada 6 a 2951,74, saída 6 (correção)
let MOVS, PAYABLES, UNID, LOG;
const reset = () => {
  MOVS = [
    { id: 18, item_id: 14, tipo: 'entrada', origem: 'ajuste', quantidade: 6, custo_unitario: null, data: '2026-11-16', notes: 'nova compra', payable_id: null, unidade_id: null },
    { id: 20, item_id: 14, tipo: 'entrada', origem: 'ajuste', quantidade: 6, custo_unitario: 2951.74, data: '2026-11-16', notes: 'nova compra', payable_id: null, unidade_id: null },
    { id: 21, item_id: 14, tipo: 'saida', origem: 'ajuste', quantidade: 6, custo_unitario: null, data: '2026-11-16', notes: 'correção', payable_id: null, unidade_id: null },
    { id: 30, item_id: 14, tipo: 'saida', origem: 'envio', quantidade: 1, custo_unitario: null, data: '2026-11-16', notes: null, payable_id: null, unidade_id: 5 },
    { id: 31, item_id: 14, tipo: 'entrada', origem: 'compra', quantidade: 2, custo_unitario: 100, data: '2026-11-16', notes: null, payable_id: 77, unidade_id: null },
    { id: 32, item_id: 14, tipo: 'saida', origem: 'ajuste', quantidade: 1, custo_unitario: null, data: '2026-11-16', notes: 'baixa', payable_id: null, unidade_id: 9 }
  ];
  PAYABLES = [77]; UNID = {}; LOG = { cmp: null, update: null };
};
reset();
const saldo = () => MOVS.reduce((a, m) => a + (m.tipo === 'entrada' ? m.quantidade : -m.quantidade), 0);
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_movimentos WHERE id=$1')) return MOVS.filter(m => m.id === Number(p[0]));
  if (s.startsWith('SELECT 1 FROM erp_payables WHERE id=$1')) return PAYABLES.includes(Number(p[0])) ? [{}] : [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [{ id: 14, nome: 'Notebook', unidade: 'un', custo_medio: 1477.99 }];
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: saldo() }];
  if (s.startsWith('SELECT tipo, quantidade, custo_unitario FROM erp_estoque_movimentos WHERE item_id=$1 ORDER BY data, id')) return MOVS.map(m => ({ tipo: m.tipo, quantidade: m.quantidade, custo_unitario: m.custo_unitario }));
  if (s.startsWith('UPDATE erp_estoque_itens SET custo_medio=$1')) { LOG.cmp = p[0]; return []; }
  if (s.startsWith('DELETE FROM erp_estoque_movimentos WHERE id=$1')) { MOVS = MOVS.filter(m => m.id !== Number(p[0])); return []; }
  if (s.startsWith("UPDATE erp_estoque_unidades SET estado='em_estoque'")) { UNID[p[0]] = 'em_estoque'; return []; }
  if (s.startsWith('UPDATE erp_estoque_movimentos SET quantidade=$1')) { LOG.update = p; const m = MOVS.find(x => x.id === p[6]); m.quantidade = p[0]; m.custo_unitario = p[1]; m.notes = p[4]; return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo || {}) }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const del = (id, corpo) => chama(2, 'POST', `/api/suprimentos/movimentos/${id}/excluir`, corpo), put = (id, corpo) => chama(2, 'PUT', `/api/suprimentos/movimentos/${id}`, corpo);
  let r = await chama(1, 'POST', '/api/suprimentos/movimentos/18/excluir', { motivo: 'lançado por engano' });
  ok('quem só lê é barrado (403)', r.status === 403, r);
  r = await del(18, { motivo: 'ab' }); ok('justificativa curta na exclusão (400)', r.status === 400, r);
  r = await del(99, { motivo: 'lançado por engano' }); ok('lançamento inexistente (404)', r.status === 404, r);
  r = await del(30, { motivo: 'lançado por engano' }); ok('envio não se corrige aqui (409)', r.status === 409 && /Envios/.test(r.body.error), r);
  r = await del(31, { motivo: 'lançado por engano' }); ok('compra com título existente é barrada (409)', r.status === 409 && /#77/.test(r.body.error), r);
  PAYABLES = []; MOVS = MOVS.filter(m => m.id !== 30 && m.id !== 31); // sem título, sem o envio e sem a compra de 2 un, para isolar os próximos casos
  // caso real: apagar a entrada sem custo (18) e a saída de correção (21) -> CMP 2951,74
  r = await del(21, { motivo: 'correção feita de forma errada' });
  ok('exclui a saída de correção (200) e devolve o resumo para a auditoria', r.status === 200 && /saida por ajuste, 6 un/.test(r.body.resumo), r);
  r = await del(18, { motivo: 'entrada lançada sem custo por engano' });
  ok('exclui a entrada sem custo e o CMP vira 2951,74 (única compra com custo)', r.status === 200 && r.body.custo_medio === 2951.74 && LOG.cmp === 2951.74, [r, LOG]);
  ok('lançamento sumiu do histórico', !MOVS.some(m => m.id === 18 || m.id === 21), MOVS.map(m => m.id));
  // estoque negativo: entrada 20 (6 un) ainda tem a saída 32 (1) e a compra 31 (2): saldo = 6 + 2 - 1 = 7 -> tirar 6 deixa 1: ok; criar saída grande antes
  MOVS.push({ id: 40, item_id: 14, tipo: 'saida', origem: 'ajuste', quantidade: 5, custo_unitario: null, data: '2026-11-16', notes: 'x', payable_id: null, unidade_id: null });
  r = await del(20, { motivo: 'entrada duplicada no sistema' }); ok('excluir entrada que deixaria o estoque negativo é barrado (409)', r.status === 409 && /negativo/.test(r.body.error), r);
  MOVS = MOVS.filter(m => m.id !== 40);
  r = await del(32, { motivo: 'baixa feita na unidade errada' });
  ok('exclusão de baixa de unidade devolve a unidade ao estoque', r.status === 200 && UNID[9] === 'em_estoque', [r, UNID]);
  // edição
  reset(); PAYABLES = []; MOVS = MOVS.filter(m => m.id !== 30 && m.id !== 31);
  r = await put(32, { quantidade: 2, data: '2026-11-16', notes: 'baixa', motivo: 'quantidade errada' }); ok('baixa de unidade não se edita (409)', r.status === 409, r);
  r = await put(20, { quantidade: 6, custo_unitario: 2951.74, data: '2026-11-16', notes: 'nova compra' }); ok('edição sem justificativa (400)', r.status === 400, r);
  r = await put(20, { quantidade: 0, custo_unitario: 1, data: '2026-11-16', notes: 'x', motivo: 'quantidade errada' }); ok('quantidade zero (400)', r.status === 400, r);
  r = await put(20, { quantidade: 6, custo_unitario: -1, data: '2026-11-16', notes: 'x', motivo: 'custo errado' }); ok('custo negativo (400)', r.status === 400, r);
  r = await put(20, { quantidade: 6, custo_unitario: 3000, data: '2026-11-16', notes: 'nova compra', motivo: 'custo digitado errado' });
  ok('edita o custo da entrada e o CMP é recalculado (histórico: 6 sem custo, 6 a 3000, saída 6 -> 3000)', r.status === 200 && r.body.custo_medio === 3000 && LOG.update[1] === 3000 && LOG.update[2] === 18000, [r, LOG]);
  ok('a justificativa fica nas observações com quem e quando', /\[Editado em \d\d\/\d\d\/\d{4} por Larissa: custo digitado errado\]$/.test(LOG.update[4]), LOG.update);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
