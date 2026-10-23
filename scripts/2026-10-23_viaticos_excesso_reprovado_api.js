// Propósito: excesso da TUD REPROVADO vira pendência do colaborador, a descontar na próxima OT (mesmo quando a viagem
//   foi fechada como "devolvido"/"comprovado", sem estouro). Só vale para reprovações feitas daqui para frente:
//   o valor do excesso é guardado em erp_viaticos_solicitacoes.excessos_valores no momento da reprovação.
//   - POST .../excesso-status: ao reprovar, recebe e guarda `valor`; ao aprovar, apaga; se a viagem já está fechada
//     sem estouro, recalcula valor_pendencia/pendencia_resolvida.
//   - POST .../fechar: viagem sem estouro com excesso reprovado já nasce com pendência.
//   - GET .../colaboradores/:id/pendencia e encerrarPendencias passam a enxergar essas pendências (origem: 'excesso').
//   Nada retroativo: reprovações antigas (sem valor guardado) não geram cobrança.
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-23_viaticos_excesso_reprovado_api.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

// ---- consulta de pendência do colaborador ----
troca(`  const rows = await query(\`SELECT id, destino, data_fim, valor_pendencia FROM erp_viaticos_solicitacoes
    WHERE colaborador_id=$1 AND status='divergente' AND pendencia_resolvida=false ORDER BY data_fim\`, [req.params.id]);
  const total = rows.reduce((s, r) => s + n(r.valor_pendencia), 0);
  res.json({ total, solicitacoes: rows.map(r => ({ ...r, valor_pendencia: n(r.valor_pendencia) })) });`,
`  // Duas origens: viagem que estourou o valor liberado (status "divergente") e viagem fechada SEM estouro em que um
  // excesso da TUD foi reprovado (valor_pendencia guarda a soma dos excessos reprovados).
  const rows = await query(\`SELECT id, destino, ordem_trabalho, status, data_fim, valor_pendencia FROM erp_viaticos_solicitacoes
    WHERE colaborador_id=$1 AND pendencia_resolvida=false AND (status='divergente' OR valor_pendencia > 0) ORDER BY data_fim\`, [req.params.id]);
  const total = rows.reduce((s, r) => s + n(r.valor_pendencia), 0);
  res.json({ total, solicitacoes: rows.map(r => ({ ...r, valor_pendencia: n(r.valor_pendencia), origem: r.status === 'divergente' ? 'estouro' : 'excesso' })) });`);

// ---- encerrar pendências (descontar/dispensar) também para a de excesso ----
troca("WHERE id = ANY($1::int[]) AND colaborador_id=$2 AND status='divergente' AND pendencia_resolvida=false",
      "WHERE id = ANY($1::int[]) AND colaborador_id=$2 AND (status='divergente' OR valor_pendencia > 0) AND pendencia_resolvida=false");

// ---- ajudante + fechar ----
troca("// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente",
`// Soma dos excessos da TUD que foram REPROVADOS e tiveram o valor guardado na reprovação. Reprovações antigas, de
// antes de o excesso virar pendência, não têm valor guardado e portanto não contam (sem cobrança retroativa).
function somaExcessosReprovados(statusPorChave, valoresPorChave) {
  const st = (statusPorChave && typeof statusPorChave === 'object') ? statusPorChave : {};
  const vl = (valoresPorChave && typeof valoresPorChave === 'object') ? valoresPorChave : {};
  return Math.round(Object.keys(vl).reduce((t, k) => t + (st[k] === 'reprovado' ? Number(vl[k]) || 0 : 0), 0) * 100) / 100;
}

// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente`);
troca(`  else { status = 'divergente'; valor_pendencia = Math.abs(dif); pendencia_resolvida = false; }`,
`  else { status = 'divergente'; valor_pendencia = Math.abs(dif); pendencia_resolvida = false; }
  // Sem estouro, mas com excesso reprovado: o valor reprovado fica como pendência a descontar na próxima OT. No
  // estouro o valor já está contido em valor_pendencia (comprovado − liberado), então não se soma de novo.
  if (status !== 'divergente' && !s.pendencia_decisao) {
    const ex = somaExcessosReprovados(s.excessos_status, s.excessos_valores);
    if (ex > 0) { valor_pendencia = ex; pendencia_resolvida = false; }
  }`);

// ---- excesso-status ----
const ini = s.indexOf("  const s = (await query('SELECT excessos_status, status AS sol_status FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];");
const fimMarca = "  res.json({ ok: true });\n}));";
const fim = ini < 0 ? -1 : s.indexOf(fimMarca, ini);
if (ini < 0 || fim < 0) throw new Error('rota excesso-status não achada');
s = s.slice(0, ini) + `  const s = (await query('SELECT excessos_status, excessos_valores, status AS sol_status, pendencia_decisao FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const atual = (s.excessos_status && typeof s.excessos_status === 'object') ? s.excessos_status : {};
  const valores = (s.excessos_valores && typeof s.excessos_valores === 'object') ? { ...s.excessos_valores } : {};
  atual[chave] = status;
  // Reprovar guarda o valor do excesso (é ele que vira pendência); aprovar apaga. Quem manda o valor é um
  // administrador (a rota exige admin), mas ele precisa ser um número razoável.
  if (status === 'reprovado') {
    const v = Number(req.body.valor);
    if (isFinite(v) && v > 0 && v < 1000000) valores[chave] = Math.round(v * 100) / 100;
  } else {
    delete valores[chave];
  }
  await query('UPDATE erp_viaticos_solicitacoes SET excessos_status=$1, excessos_valores=$2 WHERE id=$3', [JSON.stringify(atual), JSON.stringify(valores), req.params.id]);
  if (status === 'aprovado' && s.sol_status === 'divergente') {
    await query(\`UPDATE erp_viaticos_solicitacoes SET pendencia_resolvida=true WHERE id=$1\`, [req.params.id]);
  }
  // Viagem já fechada SEM estouro: o excesso reprovado vira (ou deixa de ser) pendência na hora. Se ela ainda está
  // em andamento, quem aplica é o fechamento. Pendência já decidida (descontada/dispensada) não é reaberta.
  if (['comprovado', 'devolvido'].includes(s.sol_status) && !s.pendencia_decisao) {
    const total = somaExcessosReprovados(atual, valores);
    await query('UPDATE erp_viaticos_solicitacoes SET valor_pendencia=$1, pendencia_resolvida=$2 WHERE id=$3', [total, total === 0, req.params.id]);
  }
` + s.slice(fim);

// ---- auditoria ----
troca("na solicitação de viático ID ${req.params.id}`,\n", "na solicitação de viático ID ${req.params.id}`,\n");
troca("'POST /api/viaticos/solicitacoes/:id/excesso-status': req => `${req.body.status === 'aprovado' ? 'Aprovou' : 'Reprovou'} o excesso da TUD (\"${req.body.chave}\") na solicitação de viático ID ${req.params.id}`,",
      "'POST /api/viaticos/solicitacoes/:id/excesso-status': req => `${req.body.status === 'aprovado' ? 'Aprovou' : 'Reprovou'} o excesso da TUD (\"${req.body.chave}\") na solicitação de viático ID ${req.params.id}` +\n    (req.body.status === 'reprovado' && Number(req.body.valor) > 0 ? ` — ${fmtBRL(req.body.valor)} viram pendência a descontar na próxima OT do colaborador` : ''),");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
