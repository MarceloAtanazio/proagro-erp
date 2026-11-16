// Propósito: verifica no backend (banco simulado) a exclusão de item de Suprimentos com justificativa: só quem edita Suprimentos, justificativa obrigatória, barra equipamento em custódia,
//   item sem histórico é apagado, item com histórico é inativado (saldo baixado por ajuste, unidades em estoque baixadas, justificativa nas observações) e não exclui duas vezes.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_excluir_item_estoque.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
const ITENS = { 1: { id: 1, nome: 'Item vazio', ativo: true, notes: null }, 2: { id: 2, nome: 'Notebook', ativo: true, notes: 'obs antiga' }, 3: { id: 3, nome: 'Celular', ativo: true, notes: null },
                4: { id: 4, nome: 'Já excluído', ativo: false, notes: '[Excluído em 01/11/2026 por X] teste' } };
const MOV = { 1: 0, 2: 3, 3: 2, 4: 1 }, UNID = { 1: 0, 2: 6, 3: 1, 4: 0 }, CUST = { 3: 1 }, SALDO = { 2: 6 };
const LOG = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [ITENS[Number(p[0])]].filter(Boolean);
  if (s.includes("FROM erp_estoque_movimentos WHERE item_id=$1 AND origem='envio'")) return [{ n: CUST[Number(p[0])] || 0 }];
  if (s.includes("FROM erp_estoque_unidades WHERE item_id=$1 AND estado='em_custodia'")) return [{ n: CUST[Number(p[0])] || 0 }];
  if (s.startsWith('SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE item_id=$1')) return [{ n: MOV[Number(p[0])] }];
  if (s.startsWith('SELECT COUNT(*)::int AS n FROM erp_estoque_unidades WHERE item_id=$1')) return [{ n: UNID[Number(p[0])] }];
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: SALDO[Number(p[0])] || 0 }];
  if (s.startsWith('DELETE FROM erp_estoque_itens')) { LOG.push(['delete', p[0]]); return []; }
  if (s.startsWith('INSERT INTO erp_estoque_movimentos')) { LOG.push(['saida', p]); return []; }
  if (s.startsWith("UPDATE erp_estoque_unidades SET estado='baixado'")) { LOG.push(['baixa-unid', p[0]]); return []; }
  if (s.startsWith('UPDATE erp_estoque_itens SET ativo=false')) { LOG.push(['inativa', p]); return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: 'POST', headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo || {}) }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const rota = id => `/api/suprimentos/itens/${id}/excluir`;
  let r = await chama(1, rota(1), { motivo: 'duplicado no cadastro' });
  ok('quem só lê é barrado (403)', r.status === 403, r);
  r = await chama(2, rota(1), { motivo: 'ab' });
  ok('justificativa curta é recusada (400)', r.status === 400, r);
  r = await chama(2, rota(99), { motivo: 'duplicado no cadastro' });
  ok('item inexistente (404)', r.status === 404, r);
  r = await chama(2, rota(4), { motivo: 'duplicado no cadastro' });
  ok('item já excluído (409)', r.status === 409, r);
  r = await chama(2, rota(3), { motivo: 'duplicado no cadastro' });
  ok('equipamento em custódia barra (409) e não grava nada', r.status === 409 && /custódia/.test(r.body.error) && LOG.length === 0, [r, LOG]);
  r = await chama(2, rota(1), { motivo: 'duplicado no cadastro' });
  ok('item sem histórico é apagado', r.status === 200 && r.body.modo === 'removido' && LOG.length === 1 && LOG[0][0] === 'delete', [r, LOG]);
  LOG.length = 0;
  r = await chama(2, rota(2), { motivo: 'Cadastrado em duplicidade' });
  ok('item com histórico é inativado', r.status === 200 && r.body.modo === 'inativado' && r.body.saldo_baixado === 6, r);
  const saida = LOG.find(l => l[0] === 'saida'), inativa = LOG.find(l => l[0] === 'inativa');
  ok('saldo baixado por ajuste de saída com o motivo', saida && saida[1][1] === 6 && /Exclusão do item: Cadastrado em duplicidade/.test(saida[1][3]), LOG);
  ok('unidades em estoque baixadas', LOG.some(l => l[0] === 'baixa-unid'), LOG);
  ok('justificativa gravada nas observações com quem e quando', inativa && /^\[Excluído em \d\d\/\d\d\/\d{4} por Larissa\] Cadastrado em duplicidade$/.test(inativa[1][1]), inativa);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
