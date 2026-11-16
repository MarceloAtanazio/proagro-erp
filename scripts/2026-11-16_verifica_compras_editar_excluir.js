// Propósito: verifica no backend (banco simulado) a correção de COMPRAS em Suprimentos: edição troca fornecedor, documento (NF), quantidade e custo com justificativa; fornecedor inexistente é recusado
//   antes de gravar qualquer coisa; compra com título existente é barrada; depois de editar/excluir o "preço da última compra" do item é refeito e o CMP é recalculado.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_compras_editar_excluir.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
let MOVS, LOG;
const reset = () => { MOVS = [
  { id: 10, item_id: 1, tipo: 'entrada', origem: 'compra', quantidade: 10, custo_unitario: 50, data: '2026-11-10', notes: null, documento: '111', supplier_id: null, payable_id: null, unidade_id: null, tamanho: null },
  { id: 11, item_id: 1, tipo: 'entrada', origem: 'compra', quantidade: 10, custo_unitario: 70, data: '2026-11-12', notes: null, documento: '222', supplier_id: 3, payable_id: 88, unidade_id: null, tamanho: null }
]; LOG = { upd: null, docForn: null, preco: 0, cmp: null }; };
reset();
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_movimentos WHERE id=$1')) return MOVS.filter(m => m.id === Number(p[0]));
  if (s.startsWith('SELECT 1 FROM erp_payables WHERE id=$1')) return Number(p[0]) === 88 ? [{}] : [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [{ id: 1, nome: 'Bota', unidade: 'un', custo_medio: 60, grade_tamanhos: null }];
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: MOVS.reduce((a, m) => a + m.quantidade, 0) }];
  if (s.startsWith('SELECT id FROM erp_suppliers WHERE id=$1')) return Number(p[0]) === 5 ? [{ id: 5 }] : [];
  if (s.startsWith('UPDATE erp_estoque_movimentos SET quantidade=$1')) { LOG.upd = p; return []; }
  if (s.startsWith('UPDATE erp_estoque_movimentos SET documento=$1, supplier_id=$2 WHERE id=$3')) { LOG.docForn = p; return []; }
  if (s.startsWith('UPDATE erp_estoque_itens SET preco_ultima_compra')) { LOG.preco++; return []; }
  if (s.startsWith('SELECT tipo, quantidade, custo_unitario FROM erp_estoque_movimentos WHERE item_id=$1 ORDER BY data, id')) return MOVS;
  if (s.startsWith('UPDATE erp_estoque_itens SET custo_medio=$1')) { LOG.cmp = p[0]; return []; }
  if (s.startsWith('DELETE FROM erp_estoque_movimentos WHERE id=$1')) { MOVS = MOVS.filter(m => m.id !== Number(p[0])); return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 170));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: 2, role: 'usuario' }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo || {}) }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const base = { quantidade: 10, custo_unitario: 55, data: '2026-11-10', notes: '', motivo: 'custo digitado errado' };
  let r = await chama('PUT', '/api/suprimentos/movimentos/11', { ...base, custo_unitario: 70 });
  ok('compra que gerou título existente (#88) é barrada na edição (409)', r.status === 409 && /#88/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/movimentos/11/excluir', { motivo: 'compra duplicada' });
  ok('e também na exclusão (409)', r.status === 409 && /#88/.test(r.body.error), r);
  r = await chama('PUT', '/api/suprimentos/movimentos/10', { ...base, supplier_id: 99, documento: '999' });
  ok('fornecedor inexistente é recusado (400) sem gravar nada', r.status === 400 && /Fornecedor/.test(r.body.error) && LOG.upd === null && LOG.docForn === null, [r, LOG]);
  r = await chama('PUT', '/api/suprimentos/movimentos/10', { ...base, supplier_id: 5, documento: ' 040854 ' });
  ok('edita compra: fornecedor 5 e NF gravados', r.status === 200 && LOG.docForn && LOG.docForn[0] === '040854' && LOG.docForn[1] === 5 && LOG.docForn[2] === 10, [r, LOG]);
  ok('custo da compra alterado para 55 e preço da última compra refeito', LOG.upd && LOG.upd[1] === 55 && LOG.preco === 1, LOG);
  reset(); r = await chama('PUT', '/api/suprimentos/movimentos/10', { ...base });
  ok('sem informar fornecedor/NF mantém os atuais (NF 111, fornecedor nulo)', r.status === 200 && LOG.docForn[0] === '111' && LOG.docForn[1] === null, [r, LOG]);
  reset(); MOVS = MOVS.filter(m => m.id === 10);
  r = await chama('POST', '/api/suprimentos/movimentos/10/excluir', { motivo: 'compra lançada em duplicidade' });
  ok('excluir compra refaz o preço da última compra e recalcula o CMP', r.status === 200 && LOG.preco === 1, [r, LOG]);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
