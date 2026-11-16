// Propósito: verifica no backend (banco simulado) o custo médio de Suprimentos: média ponderada normal com CMP > 0, e sem diluição quando o item tem saldo com CMP zero
//   (compra e ajuste de entrada com custo). Caso real: 6 un sem custo + compra de 6 un a R$ 2.951,74 deve dar CMP 2.951,74 (antes dava 1.477,99).
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_cmp_estoque.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
let ITEM, SALDO, CMP_GRAVADO;
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [ITEM];
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: SALDO }];   // saldo JÁ com a entrada em curso
  if (s.startsWith('INSERT INTO erp_estoque_movimentos')) return [{ id: 1 }];
  if (s.startsWith('UPDATE erp_estoque_itens SET custo_medio=$1')) { CMP_GRAVADO = p[0]; return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: 'POST', headers: { cookie: `proagro_token=${jwt.sign({ sub: 2, role: 'usuario' }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, body: await r.json().catch(() => null) }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  // 1) caso real: 6 un sem custo (CMP 0), compra de 6 un a 2951,74 -> saldo depois = 12
  ITEM = { id: 14, nome: 'Notebook', unidade: 'un', custo_medio: 0, preco_ultima_compra: null }; SALDO = 12; CMP_GRAVADO = null;
  let r = await chama('/api/suprimentos/ajustes', { item_id: 14, tipo: 'entrada', quantidade: 6, custo_unitario: 2951.74, notes: 'nova compra' });
  ok('ajuste de entrada com CMP zero: CMP = custo da entrada (2951,74)', r.status === 200 && CMP_GRAVADO === 2951.74, [r, CMP_GRAVADO]);
  // 2) a mesma coisa pela compra
  CMP_GRAVADO = null; r = await chama('/api/suprimentos/compras', { item_id: 14, quantidade: 6, custo_unitario: 2951.74 });
  ok('compra com CMP zero: CMP = custo da compra (2951,74)', r.status === 200 && CMP_GRAVADO === 2951.74, [r, CMP_GRAVADO]);
  // 3) CMP > 0 continua ponderado: 10 un a 100 + 10 un a 200 = 150
  ITEM = { id: 5, nome: 'Cabo', unidade: 'un', custo_medio: 100, preco_ultima_compra: 100 }; SALDO = 20; CMP_GRAVADO = null;
  r = await chama('/api/suprimentos/compras', { item_id: 5, quantidade: 10, custo_unitario: 200 });
  ok('com CMP > 0 a média ponderada segue igual (10 a 100 + 10 a 200 = 150)', r.status === 200 && CMP_GRAVADO === 150, [r, CMP_GRAVADO]);
  CMP_GRAVADO = null; r = await chama('/api/suprimentos/ajustes', { item_id: 5, tipo: 'entrada', quantidade: 10, custo_unitario: 200, notes: 'x' });
  ok('ajuste com CMP > 0 também pondera (150)', r.status === 200 && CMP_GRAVADO === 150, [r, CMP_GRAVADO]);
  // 4) primeira compra de item sem saldo
  ITEM = { id: 6, nome: 'Novo', unidade: 'un', custo_medio: 0, preco_ultima_compra: null }; SALDO = 3; CMP_GRAVADO = null;
  r = await chama('/api/suprimentos/compras', { item_id: 6, quantidade: 3, custo_unitario: 99.9 });
  ok('primeira compra: CMP = custo da compra (99,90)', r.status === 200 && CMP_GRAVADO === 99.9, [r, CMP_GRAVADO]);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
