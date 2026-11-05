// Despesas reprovadas no Flash: não entram no comprovado, contam no devolvido e viram pendência a descontar na próxima OT.
const path = require('path');
const ROOT = process.argv[2];
process.env.JWT_SECRET = 'teste-somente-local-nao-usado-em-producao';
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false }
};
const mk = (id, status, extra = {}) => ({ id, colaborador_id: 7, ordem_trabalho: String(id), status, valor_liberado: 6470, valor_pendencia: 0, pendencia_resolvida: true, pendencia_decisao: null, excessos_status: {}, excessos_valores: {}, comprovado: 5248.77, ...extra });
let SOL = [], REPR = [], SEQ = 0;
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  n: v => (v == null ? 0 : Number(v)), pool: {},
  query: async (sql, p = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    const find = id => SOL.find(x => x.id == id);
    // comprovação única da família: aqui cada OT é uma família de um (a raiz é ela mesma)
    if (s.startsWith('WITH RECURSIVE fam AS')) return s.includes('SELECT raiz_id FROM fam WHERE id=$1') ? [{ raiz_id: Number(p[0]) }] : [{ id: Number(p[0]) }];
    if (s.startsWith('SELECT COALESCE(SUM(valor_liberado),0) AS v FROM erp_viaticos_solicitacoes WHERE id = ANY($1::int[])')) return [{ v: SOL.filter(x => p[0].includes(x.id)).reduce((t, x) => t + x.valor_liberado, 0) }];
    if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
    if (s.includes('INSERT INTO erp_audit_log')) return [];
    if (s.startsWith('SELECT id FROM erp_colaboradores WHERE usuario_id = $1')) return [{ id: 7 }];
    if (s.startsWith('SELECT 1 FROM erp_viaticos_solicitacoes WHERE id=$1 AND colaborador_id = ANY')) return (p[1] || []).includes(7) ? [{ x: 1 }] : [];
    if (s.startsWith('SELECT id FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]).map(x => ({ id: x.id }));
    if (s.startsWith('SELECT id, data, descricao, categoria, valor FROM erp_viaticos_reprovadas')) return REPR.filter(r => p[0].includes(r.solicitacao_id));
    if (s.startsWith('INSERT INTO erp_viaticos_reprovadas')) {
      const [sid, data, desc, cat, valor, lote, linha] = p;
      if (lote !== null && REPR.some(r => r.solicitacao_id == sid && r.import_batch === lote && r.import_linha === linha)) return [];
      REPR.push({ id: ++SEQ, solicitacao_id: Number(sid), data, descricao: desc, categoria: cat, valor, import_batch: lote, import_linha: linha }); return [{ id: SEQ }];
    }
    if (s.startsWith('DELETE FROM erp_viaticos_reprovadas WHERE id=$1 RETURNING solicitacao_id')) { const i = REPR.findIndex(r => r.id == p[0]); if (i < 0) return []; const [r] = REPR.splice(i, 1); return [{ solicitacao_id: r.solicitacao_id }]; }
    if (s.startsWith('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_reprovadas WHERE solicitacao_id = ANY($1::int[])')) return [{ v: REPR.filter(r => p[0].includes(r.solicitacao_id)).reduce((t, r) => t + r.valor, 0) }];
    // consultas do saldo/estorno (sessões de 05/11): sem estorno importado e sem decisão de conferência
    if (s.startsWith('SELECT status, pendencia_decisao, excessos_status, excessos_valores, valor_liberado FROM erp_viaticos_solicitacoes WHERE id=$1')) { const x = find(p[0]); return x ? [x] : []; }
    if (s.startsWith('SELECT status, valor_devolvido, estorno_flash, conferir_decisao FROM erp_viaticos_solicitacoes WHERE id=$1')) { const x = find(p[0]); return x ? [{ ...x, estorno_flash: null, conferir_decisao: null }] : []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET valor_devolvido=$1, status=$2 WHERE id=$3')) { const x = find(p[2]); Object.assign(x, { valor_devolvido: p[0], status: p[1] }); return []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET conferir_valor=$1 WHERE id=$2')) return [];
    if (s.startsWith('SELECT conferir_valor FROM erp_viaticos_solicitacoes WHERE id=$1')) return [{ conferir_valor: 0 }];
    if (s.startsWith('SELECT status, pendencia_decisao, excessos_status, excessos_valores FROM erp_viaticos_solicitacoes WHERE id=$1')) { const x = find(p[0]); return x ? [x] : []; }
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET valor_pendencia=$1, pendencia_resolvida=$2 WHERE id=$3')) { const x = find(p[2]); x.valor_pendencia = p[0]; x.pendencia_resolvida = p[1]; return []; }
    if (s.startsWith('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL.filter(x => x.id == p[0]);
    if (s.startsWith('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[])')) return [{ v: p[0].reduce((t, id) => t + find(id).comprovado, 0) }];
    if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=$2, valor_pendencia=$3, pendencia_resolvida=$4 WHERE id=$5')) {
      const x = find(p[4]); Object.assign(x, { status: p[0], valor_devolvido: p[1], valor_pendencia: p[2], pendencia_resolvida: p[3] }); return [];
    }
    if (s.startsWith('SELECT id, destino, ordem_trabalho, status, data_fim, valor_pendencia')) {
      return SOL.filter(x => x.colaborador_id == p[0] && x.pendencia_resolvida === false && (x.status === 'divergente' || x.valor_pendencia > 0))
        .map(x => ({ ...x, reprovadas_flash: REPR.filter(r => r.solicitacao_id === x.id).reduce((t, r) => t + r.valor, 0) }));
    }
    throw new Error('SQL não previsto no stub: ' + s.slice(0, 170));
  } } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const app = require(path.join(ROOT, 'api/index.js'));
const server = app.listen(0);
const ck = id => `proagro_token=${jwt.sign({ sub: id, role: U[id].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
const req = async (quem, m, rota, corpo) => {
  const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: ck(quem), 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const LOTE = 'a'.repeat(64);
(async () => {
  const falhas = [];
  const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) falhas.push(n); };

  // Caso da OT 41 do Alcenir: liberado 6.470,00; comprovado 5.248,77; reprovada do iFood R$ 7,95 (ainda em comprovação)
  SOL = [mk(93, 'aguardando_comprovacao')];
  let r = await req(1, 'POST', '/api/viaticos/solicitacoes/93/reprovadas', { data: '2026-10-28', valor: 7.95, descricao: 'IFD*iFood Osasco BRA Outro', categoria: 'outro', import_batch: LOTE, import_linha: 7 });
  ok('registrar a despesa reprovada (iFood R$ 7,95) responde 200', r.status === 200 && r.body.duplicada === false, r);
  ok('...viagem ainda em comprovação: a pendência só nasce no fechamento', SOL[0].valor_pendencia === 0, SOL[0]);
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/93/reprovadas', { data: '2026-10-28', valor: 7.95, descricao: 'IFD*iFood Osasco BRA Outro', import_batch: LOTE, import_linha: 7 });
  ok('reimportar o MESMO arquivo não duplica (já existente)', r.status === 200 && r.body.duplicada === true && REPR.length === 1, r);
  r = await req(1, 'GET', '/api/viaticos/solicitacoes/93/reprovadas');
  ok('a lista traz a reprovada', r.status === 200 && r.body.length === 1 && r.body[0].valor === 7.95, r);

  r = await req(1, 'POST', '/api/viaticos/solicitacoes/93/fechar');
  // regra de 05/11: a reprovada saiu da conta do Flash e NÃO volta ao saldo (1.221,23 − 7,95 = 1.213,28; a reprovada vive só na pendência)
  ok('fechar a viagem: devolvido = liberado − comprovado − reprovada (a reprovada não volta ao saldo)', r.status === 200 && r.body.status === 'devolvido' && Math.abs(r.body.valor_devolvido - 1213.28) < 0.005, r);
  ok('...e a reprovada vira pendência de R$ 7,95 em aberto', r.body.valor_pendencia === 7.95 && SOL[0].pendencia_resolvida === false, [r.body, SOL[0]]);
  let pe = (await req(1, 'GET', '/api/viaticos/colaboradores/7/pendencia')).body;
  ok('o aviso da próxima OT lista a pendência com origem "flash"', pe.total === 7.95 && pe.solicitacoes[0].origem === 'flash' && pe.solicitacoes[0].ordem_trabalho === '93' && pe.solicitacoes[0].valor_reprovado_flash === 7.95, pe);
  ok('...sem vazar os campos internos do excesso', !('excessos_status' in pe.solicitacoes[0]) && !('excessos_valores' in pe.solicitacoes[0]), pe.solicitacoes[0]);

  // com excesso reprovado da TUD também: soma e origem combinada
  SOL = [mk(94, 'aguardando_comprovacao', { excessos_status: { 'alimentacao_2026-10-27': 'reprovado' }, excessos_valores: { 'alimentacao_2026-10-27': 20 } })];
  REPR = [];
  await req(1, 'POST', '/api/viaticos/solicitacoes/94/reprovadas', { data: '2026-10-28', valor: 7.95, descricao: 'x' });
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/94/fechar');
  ok('excesso da TUD reprovado (20,00) + reprovada do Flash (7,95) = pendência de R$ 27,95', r.body.valor_pendencia === 27.95, r.body);
  pe = (await req(1, 'GET', '/api/viaticos/colaboradores/7/pendencia')).body;
  ok('...origem "excesso+flash"', pe.solicitacoes[0].origem === 'excesso+flash', pe);

  // viagem já fechada: registrar/excluir reprovada recalcula na hora
  SOL = [mk(95, 'devolvido')]; REPR = [];
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/95/reprovadas', { data: '2026-10-28', valor: 50, descricao: 'y' });
  ok('registrar reprovada numa viagem já fechada cria a pendência na hora', SOL[0].valor_pendencia === 50 && SOL[0].pendencia_resolvida === false, SOL[0]);
  r = await req(1, 'DELETE', '/api/viaticos/reprovadas/' + REPR[0].id);
  ok('excluir a reprovada desfaz a pendência', r.status === 200 && SOL[0].valor_pendencia === 0 && SOL[0].pendencia_resolvida === true, SOL[0]);

  // pendência já decidida não é reaberta
  SOL = [mk(96, 'devolvido', { pendencia_decisao: 'dispensada', pendencia_resolvida: true })]; REPR = [];
  await req(1, 'POST', '/api/viaticos/solicitacoes/96/reprovadas', { data: '2026-10-28', valor: 10, descricao: 'z' });
  ok('pendência já decidida (dispensada) NÃO é reaberta', SOL[0].valor_pendencia === 0 && SOL[0].pendencia_resolvida === true, SOL[0]);

  // viagem com estouro: a reprovada soma ao estouro
  SOL = [mk(97, 'aguardando_comprovacao', { valor_liberado: 1000, comprovado: 1100 })]; REPR = [];
  await req(1, 'POST', '/api/viaticos/solicitacoes/97/reprovadas', { data: '2026-10-28', valor: 30, descricao: 'w' });
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/97/fechar');
  ok('viagem com estouro de 100: pendência = 100 (estouro) + 30 (reprovada Flash) = 130', r.body.status === 'divergente' && r.body.valor_pendencia === 130, r.body);

  // validações e permissões
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/93/reprovadas', { data: '28/10/2026', valor: 5 }); ok('data inválida é recusada', r.status === 400, r);
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/93/reprovadas', { data: '2026-10-28', valor: -5 }); ok('valor inválido é recusado', r.status === 400, r);
  SOL = [mk(93, 'aguardando_comprovacao')];
  r = await req(2, 'POST', '/api/viaticos/solicitacoes/93/reprovadas', { data: '2026-10-28', valor: 5, descricao: 'a' }); ok('quem só visualiza não registra (403)', r.status === 403, r);
  r = await req(2, 'DELETE', '/api/viaticos/reprovadas/1'); ok('...nem exclui (403)', r.status === 403, r);
  r = await req(2, 'GET', '/api/viaticos/solicitacoes/93/reprovadas'); ok('...mas pode consultar', r.status === 200, r);
  r = await req(1, 'POST', '/api/viaticos/solicitacoes/999/reprovadas', { data: '2026-10-28', valor: 5, descricao: 'a' }); ok('solicitação inexistente: 404', r.status === 404, r);
  console.log(`\n${falhas.length ? 'FALHAS: ' + falhas.join(' | ') : 'Todas as verificações passaram.'}`);
  server.close(); process.exit(falhas.length ? 1 : 0);
})();
