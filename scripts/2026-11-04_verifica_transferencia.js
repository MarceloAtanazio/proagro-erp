// GET /api/viaticos/solicitacoes/:id/transferencia: o que foi descontado NESTA transferência e as outras OTs do colaborador ainda não fechadas.
const path = require('path');
const ROOT = process.argv[2];
process.env.JWT_SECRET = 'teste-local';
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'Só vê', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false } };
const SOL = [
  { id: 100, colaborador_id: 7, ordem_trabalho: '50', status: 'em_approvals', valor_liberado: 0, data_inicio: '2026-11-10', data_fim: '2026-11-12' },          // a OT do painel (nova)
  { id: 93, colaborador_id: 7, ordem_trabalho: '41', status: 'devolvido', valor_liberado: 6470, valor_pendencia: 7.95, pendencia_decisao: 'descontada', pendencia_decidida_na: 101, excessos_status: {}, excessos_valores: {}, flash: 7.95, data_inicio: '2026-10-22', data_fim: '2026-10-29' },
  { id: 94, colaborador_id: 7, ordem_trabalho: '42', status: 'divergente', valor_liberado: 1000, valor_pendencia: 300, pendencia_decisao: 'dispensada', pendencia_decidida_na: 101, excessos_status: {}, excessos_valores: {}, flash: 0, data_inicio: '2026-10-01', data_fim: '2026-10-05' },
  { id: 101, colaborador_id: 7, ordem_trabalho: '48', status: 'liberado', valor_liberado: 2000, data_inicio: '2026-11-01', data_fim: '2026-11-03' },               // a OT que já recebeu os descontos
  { id: 102, colaborador_id: 7, ordem_trabalho: '47', status: 'aguardando_comprovacao', valor_liberado: 900, data_inicio: '2026-10-20', data_fim: '2026-10-25' },
  { id: 103, colaborador_id: 7, ordem_trabalho: '46', status: 'comprovado', valor_liberado: 500, data_inicio: '2026-10-10', data_fim: '2026-10-12' },
  { id: 104, colaborador_id: 8, ordem_trabalho: '49', status: 'em_viagem', valor_liberado: 700, data_inicio: '2026-11-02', data_fim: '2026-11-04' }];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT id, colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]).map(x => ({ id: x.id, colaborador_id: x.colaborador_id }));
  // (atualizado em 05/11: o painel agora lê os abatimentos e, para as antigas, a marca pendencia_decidida_na)
  if (s.includes('FROM erp_viaticos_pendencia_abatimentos a JOIN')) return [];
  if (s.includes('FROM erp_viaticos_solicitacoes o WHERE o.pendencia_decidida_na=$1 AND NOT EXISTS')) return SOL.filter(x => x.pendencia_decidida_na == p[0]).map(x => ({ ...x, reprovadas_flash: x.flash, decisao_ant: x.pendencia_decisao }));
  if (s.startsWith('SELECT id, ordem_trabalho, status, valor_liberado, data_inicio, data_fim FROM erp_viaticos_solicitacoes')) {
    return SOL.filter(x => x.colaborador_id == p[0] && x.id != p[1] && ['transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'].includes(x.status));
  }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const get = async (quem, rota) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` } }); return { status: r.status, body: await r.json().catch(() => null) }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r = await get(1, '/api/viaticos/solicitacoes/100/transferencia');
  ok('OT nova (ainda sem transferência): nada descontado nela', r.status === 200 && r.body.descontadas.length === 0, r);
  ok('...lista as OUTRAS OTs do colaborador ainda não fechadas (agendada/liberada/em viagem/aguardando comprovação)', JSON.stringify(r.body.outras_abertas.map(o => o.ordem_trabalho).sort()) === JSON.stringify(['47', '48']), r.body.outras_abertas);
  ok('...não inclui OT fechada (46), de outro colaborador (49) nem a própria OT (50)', !r.body.outras_abertas.some(o => ['46', '49', '50'].includes(o.ordem_trabalho)), r.body.outras_abertas);
  r = await get(1, '/api/viaticos/solicitacoes/101/transferencia');
  ok('OT que já recebeu os descontos: mostra as duas ocorrências tratadas nela', r.status === 200 && r.body.descontadas.length === 2, r.body);
  const d41 = r.body.descontadas.find(d => d.ordem_trabalho === '41'), d42 = r.body.descontadas.find(d => d.ordem_trabalho === '42');
  ok('...OT 41: R$ 7,95, origem "flash", descontada', d41 && d41.valor === 7.95 && d41.origem === 'flash' && d41.decisao === 'descontada', d41);
  ok('...OT 42: R$ 300,00, origem "estouro", dispensada', d42 && d42.valor === 300 && d42.origem === 'estouro' && d42.decisao === 'dispensada', d42);
  ok('...sem vazar campos internos do excesso', !('excessos_status' in d41) && !('reprovadas_flash' in d41), d41);
  r = await get(1, '/api/viaticos/solicitacoes/999/transferencia'); ok('OT inexistente: 404', r.status === 404, r);
  r = await get(2, '/api/viaticos/solicitacoes/100/transferencia'); ok('quem só visualiza Viáticos não acessa o painel (403)', r.status === 403, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
