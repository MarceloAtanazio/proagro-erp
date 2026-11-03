// Propósito: verifica o cancelamento de solicitação de Viáticos (POST /api/viaticos/solicitacoes/:id/cancelar) com o banco simulado.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-05_verifica_cancelar_api.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Dono', email: 'd@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Outro', email: 'o@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false },
            3: { id: 3, name: 'Editor', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'edit' }, must_change_password: false } };
const dia = d => new Date(Date.now() + d * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const SOL = {
  1: { id: 1, colaborador_id: 7, usuario_id: 1, status: 'em_approvals', data_inicio: dia(-2), valor_liberado: 0 },
  2: { id: 2, colaborador_id: 7, usuario_id: 1, status: 'transferencia_agendada', data_inicio: dia(5), valor_liberado: 1500 },
  3: { id: 3, colaborador_id: 7, usuario_id: 1, status: 'liberado', data_inicio: dia(0), valor_liberado: 800 },
  4: { id: 4, colaborador_id: 7, usuario_id: 1, status: 'em_viagem', data_inicio: dia(-1), valor_liberado: 800 },
  5: { id: 5, colaborador_id: 7, usuario_id: 1, status: 'cancelada', data_inicio: dia(5), valor_liberado: 0 },
  6: { id: 6, colaborador_id: 7, usuario_id: 1, status: 'liberado', data_inicio: dia(3), valor_liberado: 0 },
  7: { id: 7, colaborador_id: 8, usuario_id: 2, status: 'em_approvals', data_inicio: dia(3), valor_liberado: 0 } };
let UPD = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT s.id, s.colaborador_id, s.status, s.data_inicio, s.valor_liberado, c.usuario_id FROM erp_viaticos_solicitacoes s JOIN erp_colaboradores c')) return [SOL[p[0]]].filter(Boolean);
  if (s.startsWith("UPDATE erp_viaticos_solicitacoes SET status='cancelada'")) { UPD.push(p); SOL[p[0]].status = 'cancelada'; return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const post = async (quem, id, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/viaticos/solicitacoes/${id}/cancelar`, { method: 'POST', headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, body: await r.json().catch(() => null) }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r;
  r = await post(1, 1, { motivo: '  ' }); ok('sem motivo: 400', r.status === 400 && /motivo/i.test(r.body.error), r);
  r = await post(1, 1, { motivo: 'Solicitação feita por engano' });
  ok('dono cancela OT em Approvals (mesmo com a data de saída já passada)', r.status === 200 && UPD.at(-1)[0] === 1 && UPD.at(-1)[2] === 'Solicitação feita por engano', [r, UPD]);
  ok('...sem valor transferido: nenhuma pendência (já resolvida)', r.body.pendencia === 0 && UPD.at(-1)[3] === 0 && UPD.at(-1)[4] === true, UPD.at(-1));
  r = await post(1, 2, { motivo: 'Viagem desnecessária' });
  ok('dono cancela OT com transferência agendada antes da saída', r.status === 200, r);
  ok('...R$ 1.500 já transferidos viram pendência de devolução ABERTA', r.body.pendencia === 1500 && UPD.at(-1)[3] === 1500 && UPD.at(-1)[4] === false, UPD.at(-1));
  r = await post(1, 3, { motivo: 'x' }); ok('OT liberada com saída HOJE: a viagem começa hoje, não cancela (400)', r.status === 400 && /já começou/.test(r.body.error), r);
  r = await post(1, 4, { motivo: 'x' }); ok('OT em viagem: 400, procurar o administrador', r.status === 400 && /antes da viagem/.test(r.body.error), r);
  r = await post(1, 5, { motivo: 'x' }); ok('OT já cancelada: 400', r.status === 400 && /já está cancelada/.test(r.body.error), r);
  r = await post(1, 6, { motivo: 'x' }); ok('liberada sem valor, saída futura: cancela', r.status === 200 && r.body.pendencia === 0, r);
  r = await post(1, 7, { motivo: 'x' }); ok('OT de OUTRO colaborador (só visualiza): 403', r.status === 403, r);
  SOL[7].status = 'em_approvals';
  r = await post(3, 7, { motivo: 'Pedido duplicado' }); ok('quem edita Viáticos cancela a de outra pessoa', r.status === 200, r);
  r = await post(1, 999, { motivo: 'x' }); ok('inexistente: 404', r.status === 404, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
