// Propósito: verifica a COMPROVAÇÃO ÚNICA da família de OTs (OT de origem + complementares) no backend, com o banco simulado em memória: despesas e
//   reprovadas gravadas na raiz, leitura pela raiz ou por uma complementar, fechamento com liberado somado, recusa de fechar com complementar em
//   aprovação, status final propagado, reabrir/arquivar, excluir OT com complementares e o painel que conta a família uma vez.
//   (O SQL em si — CTE recursiva e status automático por família — é conferido à parte no Postgres real; ver BITACORA.md.)
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-06_verifica_comprovacao_unica.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-somente-local-nao-usado-em-producao';
const U = { 1: { id: 1, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false } };
const mk = (id, pai, status, lib, extra = {}) => ({ id, solicitacao_pai_id: pai, colaborador_id: 7, ordem_trabalho: String(id), status, valor_liberado: lib, valor_devolvido: 0, valor_pendencia: 0,
  pendencia_resolvida: true, pendencia_decisao: null, excessos_status: {}, excessos_valores: {}, estorno_flash: null, conferir_valor: 0, conferir_decisao: null, ...extra });
let SOL = [], DESP = [], REPR = [], SEQ = 100;
const raizDe = id => { let x = SOL.find(y => y.id == id); if (!x) return Number(id); while (x.solicitacao_pai_id) x = SOL.find(y => y.id == x.solicitacao_pai_id); return x.id; };
const familiaDe = id => SOL.filter(x => raizDe(x.id) === raizDe(id)).map(x => x.id).sort((a, b) => a - b);
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  n: v => (v == null ? 0 : Number(v)), pool: {},
  query: async (sql, p = []) => {
    const s = sql.replace(/\s+/g, ' ').trim(), find = id => SOL.find(x => x.id == id);
    if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
    if (s.includes('INSERT INTO erp_audit_log')) return [];
    if (s.startsWith('WITH RECURSIVE fam AS') && s.includes('SELECT raiz_id FROM fam WHERE id=$1')) return SOL.some(x => x.id == p[0]) ? [{ raiz_id: raizDe(p[0]) }] : [];
    if (s.startsWith('WITH RECURSIVE fam AS') && s.includes('SELECT id FROM fam WHERE raiz_id=$1')) return familiaDe(p[0]).map(id => ({ id }));
    if (s.startsWith('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]);
    if (s.startsWith('SELECT ordem_trabalho FROM erp_viaticos_solicitacoes WHERE id = ANY($1::int[]) AND id <> $2 AND status=\'em_approvals\'')) return SOL.filter(x => p[0].includes(x.id) && x.id !== p[1] && x.status === 'em_approvals').map(x => ({ ordem_trabalho: x.ordem_trabalho }));
    if (s.startsWith('SELECT COALESCE(SUM(valor_liberado),0) AS v FROM erp_viaticos_solicitacoes WHERE id = ANY($1::int[]) AND status <> \'cancelada\'')) return [{ v: SOL.filter(x => p[0].includes(x.id) && x.status !== 'cancelada').reduce((t, x) => t + x.valor_liberado, 0) }];
    if (s.startsWith('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[])')) return [{ v: DESP.filter(d => p[0].includes(d.solicitacao_id)).reduce((t, d) => t + d.valor, 0) }];
    if (s.startsWith('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_reprovadas WHERE solicitacao_id = ANY($1::int[])')) return [{ v: REPR.filter(r => p[0].includes(r.solicitacao_id)).reduce((t, r) => t + r.valor, 0) }];
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=$2, valor_pendencia=$3, pendencia_resolvida=$4 WHERE id=$5')) { Object.assign(find(p[4]), { status: p[0], valor_devolvido: p[1], valor_pendencia: p[2], pendencia_resolvida: p[3] }); return []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true WHERE id = ANY($2::int[]) AND id <> $3 AND status = ANY($4::text[])')) {
      SOL.filter(x => p[1].includes(x.id) && x.id !== p[2] && p[3].includes(x.status)).forEach(x => Object.assign(x, { status: p[0], valor_devolvido: 0, valor_pendencia: 0, pendencia_resolvida: true })); return [];
    }
    if (s.startsWith('SELECT status, valor_devolvido, estorno_flash, conferir_decisao FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]);
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET conferir_valor=$1 WHERE id=$2')) { find(p[1]).conferir_valor = p[0]; return []; }
    if (s.startsWith('SELECT conferir_valor FROM erp_viaticos_solicitacoes WHERE id=$1')) return [{ conferir_valor: find(p[0]).conferir_valor }];
    if (s.startsWith('SELECT status, pendencia_decisao, excessos_status, excessos_valores, valor_liberado FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]);
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET valor_pendencia=$1, pendencia_resolvida=$2 WHERE id=$3')) { const x = find(p[2]); x.valor_pendencia = p[0]; x.pendencia_resolvida = p[1]; return []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET valor_devolvido=$1, status=$2 WHERE id=$3')) { Object.assign(find(p[2]), { valor_devolvido: p[0], status: p[1] }); return []; }
    if (s.startsWith('SELECT * FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) ORDER BY data')) return DESP.filter(d => p[0].includes(d.solicitacao_id)).sort((a, b) => a.data.localeCompare(b.data));
    if (s.startsWith('INSERT INTO erp_viaticos_despesas')) { DESP.push({ id: ++SEQ, solicitacao_id: Number(p[0]), categoria: p[1], data: p[2], valor: p[3], descricao: p[4] }); return [{ id: SEQ }]; }
    if (s.startsWith('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) RETURNING valor')) { const fora = DESP.filter(d => p[0].includes(d.solicitacao_id)); DESP = DESP.filter(d => !p[0].includes(d.solicitacao_id)); return fora.map(d => ({ valor: d.valor })); }
    if (s.startsWith('SELECT id FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]).map(x => ({ id: x.id }));
    if (s.startsWith('SELECT id, data, descricao, categoria, valor FROM erp_viaticos_reprovadas WHERE solicitacao_id = ANY($1::int[])')) return REPR.filter(r => p[0].includes(r.solicitacao_id));
    if (s.startsWith('INSERT INTO erp_viaticos_reprovadas')) { REPR.push({ id: ++SEQ, solicitacao_id: Number(p[0]), data: p[1], valor: p[4] }); return [{ id: SEQ }]; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=\'aguardando_comprovacao\', valor_devolvido=0')) { const x = find(p[0]); if (x && ['comprovado', 'devolvido', 'divergente'].includes(x.status)) { x.status = 'aguardando_comprovacao'; return [{ id: x.id }]; } return []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=\'arquivado\' WHERE id=$1')) { const x = find(p[0]); if (x && ['comprovado', 'devolvido', 'divergente'].includes(x.status)) { x.status = 'arquivado'; return [{ id: x.id }]; } return []; }
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM erp_viaticos_solicitacoes WHERE solicitacao_pai_id=$1')) return [{ n: SOL.filter(x => x.solicitacao_pai_id == p[0]).length }];
    if (s.startsWith('DELETE FROM erp_viaticos_solicitacoes WHERE id=$1')) { SOL = SOL.filter(x => x.id != p[0]); return []; }
    // painel
    if (s.includes('FROM erp_payables')) return [{ v: 0 }];
    if (s.includes('SUM(valor_liberado - valor_devolvido)')) return [{ v: 0 }];
    if (s.startsWith('SELECT id, destino, data_expiracao_flash, valor_liberado, solicitacao_pai_id FROM erp_viaticos_solicitacoes')) return SOL.filter(x => ['liberado', 'em_viagem', 'aguardando_comprovacao'].includes(x.status)).map(x => ({ id: x.id, data_expiracao_flash: null, valor_liberado: x.valor_liberado, solicitacao_pai_id: x.solicitacao_pai_id }));
    if (s.includes("WHERE status='divergente' AND solicitacao_pai_id IS NULL")) { const d = SOL.filter(x => x.status === 'divergente' && !x.solicitacao_pai_id); return [{ n: d.length, v: d.reduce((t, x) => t + x.valor_pendencia, 0) }]; }
    if (s.includes('FROM erp_viaticos_km k WHERE k.status')) return [{ n: 0, v: 0, mais_antigo: null }];
    throw new Error('SQL não previsto no stub: ' + s.slice(0, 190));
  } } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const app = require(path.join(ROOT, 'api/index.js'));
const server = app.listen(0);
const ck = `proagro_token=${jwt.sign({ sub: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
const req = async (m, rota, corpo) => {
  const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: ck, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const desp = (id, valor, data = '2026-11-04', categoria = 'alimentacao') => req('POST', `/api/viaticos/solicitacoes/${id}/despesas`, { categoria, data, valor });
(async () => {
  const falhas = [];
  const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) falhas.push(n); };
  const reset = () => { SOL = [mk(10, null, 'aguardando_comprovacao', 5000), mk(11, 10, 'aguardando_comprovacao', 300, { complementar_tipo: 'custo_extra' }), mk(12, 10, 'em_approvals', 0), mk(20, null, 'aguardando_comprovacao', 1000)]; DESP = []; REPR = []; };
  let r;

  reset();
  r = await desp(11, 120, '2026-11-04', 'passagem_aviao');
  ok('despesa lançada pela complementar (11) é gravada na OT raiz (10)', r.status === 200 && DESP.length === 1 && DESP[0].solicitacao_id === 10, DESP);
  r = await desp(10, 4900);
  ok('despesa lançada pela raiz também fica na raiz', r.status === 200 && DESP.every(d => d.solicitacao_id === 10) && DESP.length === 2, DESP);
  await desp(20, 50);
  r = await req('GET', '/api/viaticos/solicitacoes/10/despesas');
  ok('a raiz lê as despesas da família toda (2 lançamentos) e só elas', r.status === 200 && r.body.length === 2 && r.body.every(d => d.solicitacao_id === 10), r.body);
  r = await req('GET', '/api/viaticos/solicitacoes/11/despesas');
  ok('a complementar só vê as próprias (nenhuma): os relatórios por OT não contam a mesma despesa duas vezes', r.status === 200 && r.body.length === 0, r.body);
  r = await req('GET', '/api/viaticos/solicitacoes/20/despesas');
  ok('uma OT sem complementares continua como antes (a própria despesa)', r.status === 200 && r.body.length === 1 && r.body[0].solicitacao_id === 20, r.body);

  r = await req('POST', '/api/viaticos/solicitacoes/11/fechar');
  ok('fechar com complementar ainda em aprovação é recusado, apontando a OT', r.status === 400 && /OT 12/.test(r.body.error) && /aprovação/.test(r.body.error), r);
  ok('...e nada foi alterado no estado da família', SOL.find(x => x.id === 10).status === 'aguardando_comprovacao' && SOL.find(x => x.id === 11).status === 'aguardando_comprovacao', SOL);

  SOL.find(x => x.id === 12).status = 'cancelada';
  r = await req('POST', '/api/viaticos/solicitacoes/11/fechar');
  // liberado = 5000 + 300 (a cancelada não conta) = 5300; comprovado = 120 + 4900 = 5020; sobra 280
  ok('fechar pela complementar fecha a família: liberado 5.300 (sem a cancelada), comprovado 5.020, devolvido 280', r.status === 200 && r.body.status === 'devolvido' && r.body.liberado === 5300 && r.body.comprovado === 5020 && r.body.valor_devolvido === 280 && r.body.familia === 3, r);
  ok('...a devolução fica só na raiz; a complementar acompanha o status e não carrega valor', SOL.find(x => x.id === 10).valor_devolvido === 280 && SOL.find(x => x.id === 11).status === 'devolvido' && SOL.find(x => x.id === 11).valor_devolvido === 0, SOL);
  ok('...a OT cancelada continua cancelada', SOL.find(x => x.id === 12).status === 'cancelada', SOL);
  ok('...e a OT de outra família não foi tocada', SOL.find(x => x.id === 20).status === 'aguardando_comprovacao', SOL);

  r = await req('POST', '/api/viaticos/solicitacoes/11/reabrir');
  ok('reabrir pela complementar reabre a família inteira', r.status === 200 && SOL.find(x => x.id === 10).status === 'aguardando_comprovacao' && SOL.find(x => x.id === 11).status === 'aguardando_comprovacao' && SOL.find(x => x.id === 12).status === 'cancelada', SOL);

  // estouro: comprovado 5.500 contra liberado 5.300 → divergente de 200, pendência só na raiz
  await desp(10, 480);
  r = await req('POST', '/api/viaticos/solicitacoes/10/fechar');
  ok('estouro: comprovado 5.500 contra 5.300 liberados = divergente, pendência de R$ 200 na raiz', r.status === 200 && r.body.status === 'divergente' && r.body.valor_pendencia === 200 && SOL.find(x => x.id === 10).pendencia_resolvida === false, r);
  ok('...a complementar acompanha como divergente, sem pendência própria (não duplica a cobrança)', SOL.find(x => x.id === 11).status === 'divergente' && SOL.find(x => x.id === 11).valor_pendencia === 0 && SOL.find(x => x.id === 11).pendencia_resolvida === true, SOL);

  r = await req('GET', '/api/viaticos/dashboard');
  ok('painel: "Divergentes" conta a família uma vez (1), não duas', r.status === 200 && r.body.divergentes.n === 1 && r.body.divergentes.v === 200, r.body);

  r = await req('POST', '/api/viaticos/solicitacoes/11/arquivar');
  ok('arquivar pela complementar arquiva a família', r.status === 200 && SOL.find(x => x.id === 10).status === 'arquivado' && SOL.find(x => x.id === 11).status === 'arquivado', SOL);

  // reprovada do Flash lançada pela complementar fica na raiz
  reset(); SOL.find(x => x.id === 12).status = 'cancelada';
  await desp(10, 5000);
  await req('POST', '/api/viaticos/solicitacoes/10/fechar');
  r = await req('POST', '/api/viaticos/solicitacoes/11/reprovadas', { data: '2026-11-04', valor: 30, descricao: 'iFood' });
  ok('reprovada do Flash registrada pela complementar fica na raiz', r.status === 200 && REPR.length === 1 && REPR[0].solicitacao_id === 10, REPR);
  ok('...e a raiz (já fechada, sem estouro) vira pendência de R$ 30 e devolvido = 5.300 − 5.000 − 30 = 270', SOL.find(x => x.id === 10).valor_pendencia === 30 && SOL.find(x => x.id === 10).valor_devolvido === 270, SOL.find(x => x.id === 10));
  r = await req('GET', '/api/viaticos/solicitacoes/10/reprovadas');
  ok('a raiz lista as reprovadas da família', r.status === 200 && r.body.length === 1, r.body);

  // limpar os lançamentos pela complementar apaga os da família
  reset(); await desp(10, 100); await desp(11, 50);
  r = await req('DELETE', '/api/viaticos/solicitacoes/11/despesas');
  ok('limpar pela complementar apaga os lançamentos da família (2 lançamentos, R$ 150)', r.status === 200 && r.body.removidas === 2 && r.body.total === 150 && DESP.length === 0, r);

  // excluir
  reset();
  r = await req('DELETE', '/api/viaticos/solicitacoes/10');
  ok('excluir a OT raiz que tem complementares é recusado (a comprovação mora nela)', r.status === 400 && /complementar/.test(r.body.error) && SOL.some(x => x.id === 10), r);
  r = await req('DELETE', '/api/viaticos/solicitacoes/12');
  ok('excluir uma complementar é permitido', r.status === 200 && !SOL.some(x => x.id === 12), r);
  r = await req('DELETE', '/api/viaticos/solicitacoes/20');
  ok('excluir uma OT sem complementares continua permitido', r.status === 200 && !SOL.some(x => x.id === 20), r);

  // painel "Aguardando comprovação"
  reset();
  r = await req('GET', '/api/viaticos/dashboard');
  ok('painel: "Aguardando comprovação" conta a família uma vez (OT 10 + OT 20 = 2; a complementar 11 não conta), com o valor liberado de todas (6.300)', r.status === 200 && r.body.aguardandoComprovacao.n === 2 && r.body.aguardandoComprovacao.v === 6300, r.body);
  console.log(falhas.length ? 'FALHAS: ' + falhas.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(falhas.length ? 1 : 0);
})();
