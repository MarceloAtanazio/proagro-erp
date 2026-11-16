// Propósito: verifica no backend (banco simulado) a grade de tamanhos de Suprimentos: validação do cadastro (grade só em material, sem repetição), compra/ajuste/envio que exigem tamanho da grade,
//   saldo por tamanho (saída e envio barram se o tamanho não tem saldo), tirar da grade um tamanho com saldo é barrado, mínimo por tamanho no resumo e correção de lançamentos por tamanho.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_grade_tamanhos.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
const GRADE = ['P', 'M', 'G'];
const ITEMS = {
  1: { id: 1, nome: 'Camisa polo', tipo: 'material', unidade: 'un', custo_medio: 50, grade_tamanhos: GRADE, minimos_tamanho: { P: 5, M: 5, G: 0 }, estoque_minimo: 10, ativo: true },
  2: { id: 2, nome: 'Caneta', tipo: 'material', unidade: 'un', custo_medio: 2, grade_tamanhos: null, ativo: true }
};
let MOVS = [], INS = [], LAST_ITEM_INSERT = null, UPD_ITEM = null, ENV_UPD = null, MOV_UPD = null;
const reset = () => { MOVS = [
  { id: 1, item_id: 1, tipo: 'entrada', origem: 'ajuste', quantidade: 10, tamanho: 'P', custo_unitario: 50, data: '2026-11-10', notes: 'x', payable_id: null, unidade_id: null },
  { id: 2, item_id: 1, tipo: 'entrada', origem: 'ajuste', quantidade: 3, tamanho: 'M', custo_unitario: 50, data: '2026-11-10', notes: 'x', payable_id: null, unidade_id: null },
  { id: 3, item_id: 1, tipo: 'saida', origem: 'envio', quantidade: 4, tamanho: 'P', custo_unitario: null, data: '2026-11-11', notes: null, payable_id: null, unidade_id: null, status: 'enviado', colaborador_id: 1 },
  { id: 4, item_id: 1, tipo: 'saida', origem: 'ajuste', quantidade: 1, tamanho: 'M', custo_unitario: null, data: '2026-11-12', notes: 'perda', payable_id: null, unidade_id: null }
]; INS = []; UPD_ITEM = null; ENV_UPD = null; MOV_UPD = null; };
reset();
const saldoDe = (itemId, tam) => MOVS.filter(m => m.item_id === itemId && (tam === undefined || (m.tamanho ?? null) === tam)).reduce((a, m) => a + (m.tipo === 'entrada' ? m.quantidade : -m.quantidade), 0);
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [ITEMS[Number(p[0])]].filter(Boolean);
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: s.includes('tamanho IS NOT DISTINCT FROM') ? saldoDe(Number(p[0]), p[1] ?? null) : saldoDe(Number(p[0])) }];
  if (s.startsWith('SELECT tipo, quantidade, custo_unitario FROM erp_estoque_movimentos WHERE item_id=$1 ORDER BY data, id')) return MOVS.filter(m => m.item_id === Number(p[0]));
  if (s.startsWith('INSERT INTO erp_estoque_movimentos')) { INS.push({ sql: s, p }); return [{ id: 99 }]; }
  if (s.startsWith('UPDATE erp_estoque_itens SET custo_medio=$1')) return [];
  if (s.startsWith('INSERT INTO erp_estoque_itens')) { LAST_ITEM_INSERT = { sql: s, p }; return [{ id: 50 }]; }
  if (s.startsWith('SELECT custo_medio FROM erp_estoque_itens WHERE id=$1')) return [{ custo_medio: 50 }];
  if (s.startsWith('SELECT tamanho, SUM(CASE WHEN tipo')) { const g = {}; MOVS.filter(m => m.item_id === Number(p[0]) && m.tamanho != null).forEach(m => { g[m.tamanho] = (g[m.tamanho] || 0) + (m.tipo === 'entrada' ? m.quantidade : -m.quantidade); }); return Object.entries(g).map(([tamanho, q]) => ({ tamanho, q })); }
  if (s.startsWith('UPDATE erp_estoque_itens SET nome=')) { UPD_ITEM = { s, p }; return []; }
  if (s.startsWith('SELECT id FROM erp_colaboradores WHERE id=$1')) return [{ id: 1 }];
  if (s.startsWith('SELECT COALESCE(SUM(quantidade),0) AS q FROM erp_estoque_movimentos WHERE origem=')) return [{ q: 0 }];
  if (s.startsWith('SELECT i.*, COALESCE(')) return [
    { ...ITEMS[1], estoque_atual: 11, estoque_por_tamanho: { P: 6, M: 2, G: 3 } },     // P 6 >= 5, M 2 < 5  -> abaixo do mínimo
    { ...ITEMS[2], estoque_atual: 0, estoque_minimo: 0, estoque_por_tamanho: {} }];     // sem grade, mínimo 0 -> ok
  if (s.startsWith('SELECT m.*, i.tipo AS item_tipo FROM erp_estoque_movimentos m JOIN erp_estoque_itens i')) return MOVS.filter(m => m.id === Number(p[0]) && m.origem === 'envio').map(m => ({ ...m, item_tipo: 'material' }));
  if (s.startsWith('UPDATE erp_estoque_movimentos SET colaborador_id=$1, data=$2')) { ENV_UPD = p; return []; }
  if (s.startsWith('UPDATE erp_estoque_movimentos SET tamanho=$1 WHERE devolucao_de=$2')) return [];
  if (s.startsWith('SELECT * FROM erp_estoque_movimentos WHERE id=$1')) return MOVS.filter(m => m.id === Number(p[0]));
  if (s.startsWith('SELECT 1 FROM erp_payables')) return [];
  if (s.startsWith('UPDATE erp_estoque_movimentos SET quantidade=$1')) { MOV_UPD = p; return []; }
  if (s.startsWith('DELETE FROM erp_estoque_movimentos WHERE id=$1')) { MOVS = MOVS.filter(m => m.id !== Number(p[0])); return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 170));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: 2, role: 'usuario' }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  // ---- cadastro ----
  let r = await chama('POST', '/api/suprimentos/itens', { nome: 'Bota', tipo: 'equipamento', grade_tamanhos: ['38', '39'] });
  ok('grade em equipamento é recusada (400)', r.status === 400 && /material/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/itens', { nome: 'Camisa', tipo: 'material', grade_tamanhos: ['P', 'p'] });
  ok('tamanho repetido na grade (400)', r.status === 400 && /repetido/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/itens', { nome: 'Camisa', tipo: 'material', grade_tamanhos: ['P', ''] });
  ok('tamanho vazio na grade (400)', r.status === 400, r);
  r = await chama('POST', '/api/suprimentos/itens', { nome: 'Camisa', tipo: 'material', grade_tamanhos: ['P', 'M', 'G'], minimos_tamanho: { P: 5, M: 3, G: 0 }, estoque_minimo: 99 });
  const cols = LAST_ITEM_INSERT && LAST_ITEM_INSERT.sql.match(/\(([^)]*)\) VALUES/)[1].split(',').map(x => x.trim()), val = c => LAST_ITEM_INSERT.p[cols.indexOf(c)];
  ok('cadastra com grade: grade e mínimos gravados, mínimo do item = soma dos mínimos (8)', r.status === 200 && val('grade_tamanhos') === '["P","M","G"]' && val('minimos_tamanho') === '{"P":5,"M":3,"G":0}' && val('estoque_minimo') === 8, [r, cols, LAST_ITEM_INSERT && LAST_ITEM_INSERT.p]);
  r = await chama('POST', '/api/suprimentos/itens', { nome: 'Caneta', tipo: 'material', estoque_minimo: 7 });
  ok('item sem grade segue como antes (mínimo 7, sem grade)', r.status === 200 && val('estoque_minimo') === 7 && val('grade_tamanhos') === null, [r]);
  // ---- edição do cadastro: tirar tamanho com saldo ----
  r = await chama('PUT', '/api/suprimentos/itens/1', { nome: 'Camisa polo', tipo: 'material', grade_tamanhos: ['M', 'G'] });
  ok('tirar da grade o tamanho P que tem saldo (6) é barrado (409)', r.status === 409 && /P ainda tem 6/.test(r.body.error), r);
  r = await chama('PUT', '/api/suprimentos/itens/1', { nome: 'Camisa polo', tipo: 'material', grade_tamanhos: ['P', 'M'], minimos_tamanho: { P: 5, M: 5 } });
  ok('tirar da grade o tamanho G sem saldo é permitido', r.status === 200, r);
  // ---- compra ----
  r = await chama('POST', '/api/suprimentos/compras', { item_id: 1, quantidade: 5, custo_unitario: 60 });
  ok('compra de item com grade sem tamanho (400)', r.status === 400 && /Informe o tamanho/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/compras', { item_id: 1, quantidade: 5, custo_unitario: 60, tamanho: 'XG' });
  ok('compra com tamanho fora da grade (400)', r.status === 400 && /não existe na grade/.test(r.body.error), r);
  INS.length = 0; r = await chama('POST', '/api/suprimentos/compras', { item_id: 1, quantidade: 5, custo_unitario: 60, tamanho: 'm' });
  ok('compra com tamanho válido (aceita "m" minúsculo) grava M', r.status === 200 && INS[0].p[INS[0].p.length - 1] === 'M', [r, INS]);
  INS.length = 0; r = await chama('POST', '/api/suprimentos/compras', { item_id: 2, quantidade: 5, custo_unitario: 3, tamanho: 'M' });
  ok('item sem grade ignora o tamanho (grava nulo)', r.status === 200 && INS[0].p[INS[0].p.length - 1] === null, [r, INS]);
  // ---- ajuste ----
  r = await chama('POST', '/api/suprimentos/ajustes', { item_id: 1, tipo: 'entrada', quantidade: 2, custo_unitario: 50, notes: 'contagem' });
  ok('ajuste sem tamanho em item com grade (400)', r.status === 400, r);
  r = await chama('POST', '/api/suprimentos/ajustes', { item_id: 1, tipo: 'saida', quantidade: 3, notes: 'perda', tamanho: 'G' });
  ok('saída de ajuste no tamanho G sem saldo (400, cita o tamanho)', r.status === 400 && /tamanho G/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/ajustes', { item_id: 1, tipo: 'saida', quantidade: 3, notes: 'perda', tamanho: 'P' });
  ok('saída de ajuste no tamanho P (saldo 6) é aceita', r.status === 200, r);
  // ---- envio ----
  r = await chama('POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 1, quantidade: 1 });
  ok('envio sem tamanho em item com grade (400)', r.status === 400 && /Informe o tamanho/.test(r.body.error), r);
  r = await chama('POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 1, quantidade: 1, tamanho: 'G' });
  ok('envio de tamanho sem saldo é barrado mesmo havendo estoque em outros tamanhos', r.status === 400 && /tamanho G/.test(r.body.error) && saldoDe(1) > 0, r);
  INS.length = 0; r = await chama('POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 1, quantidade: 2, tamanho: 'P' });
  ok('envio no tamanho P grava o tamanho no movimento', r.status === 200 && INS[0].p[INS[0].p.length - 1] === 'P', [r, INS]);
  // ---- editar envio: troca de tamanho ----
  reset();
  r = await chama('PUT', '/api/suprimentos/envios/3', { colaborador_id: 1, data: '2026-11-11', quantidade: 4, tamanho: 'G' });
  ok('trocar o envio para um tamanho sem saldo (400)', r.status === 400 && /tamanho G/.test(r.body.error), r);
  r = await chama('PUT', '/api/suprimentos/envios/3', { colaborador_id: 1, data: '2026-11-11', quantidade: 2, tamanho: 'M' });
  ok('trocar o envio de 2 un para o tamanho M (saldo 2) é aceito e grava M', r.status === 200 && ENV_UPD && ENV_UPD[ENV_UPD.length - 2] === 'M', [r, ENV_UPD]);
  // ---- resumo ----
  r = await chama('GET', '/api/suprimentos/resumo');
  ok('resumo: abaixo do mínimo conta o item com tamanho M abaixo (1) e ignora o sem grade', r.status === 200 && r.body.abaixoMinimo === 1, r);
  // ---- correção de lançamentos por tamanho ----
  reset();
  r = await chama('POST', '/api/suprimentos/movimentos/1/excluir', { motivo: 'lançamento feito por engano' });
  ok('excluir a entrada de 10 em P que tem saídas posteriores (saldo P 6 - 10 < 0) é barrado e cita o tamanho', r.status === 409 && /tamanho P/.test(r.body.error), r);
  r = await chama('PUT', '/api/suprimentos/movimentos/4', { quantidade: 1, data: '2026-11-12', notes: 'perda', motivo: 'tamanho errado', tamanho: 'G' });
  ok('mover a baixa de M para G (sem saldo em G) é barrado', r.status === 409 && /tamanho G/.test(r.body.error), r);
  r = await chama('PUT', '/api/suprimentos/movimentos/4', { quantidade: 1, data: '2026-11-12', notes: 'perda', motivo: 'tamanho errado', tamanho: 'P' });
  ok('mover a baixa de M para P (saldo 6) é aceito e grava P', r.status === 200 && MOV_UPD && MOV_UPD[5] === 'P', [r, MOV_UPD]);
  r = await chama('PUT', '/api/suprimentos/movimentos/4', { quantidade: 1, data: '2026-11-12', notes: 'perda', motivo: 'sem informar o tamanho', tamanho: '' });
  ok('corrigir lançamento de item com grade sem tamanho (400)', r.status === 400, r);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
