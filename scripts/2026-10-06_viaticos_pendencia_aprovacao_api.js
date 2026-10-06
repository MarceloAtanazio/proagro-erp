// Propósito: a decisão sobre a pendência de estouro (descontar/dispensar) também pode ser tomada por quem aprova:
//   (1) ao EDITAR uma solicitação em Em Approvals e (2) ao AGENDAR a transferência (que grava o valor liberado) —
//   as solicitações abertas pelo próprio colaborador (autosserviço) nunca passavam pelo aviso da criação.
//   Só administrador decide; só enquanto a solicitação está em Em Approvals / ao agendar a transferência.
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-06_viaticos_pendencia_aprovacao_api.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

// ---- auditoria: texto da decisão reaproveitado pelos três pontos ----
troca(`  'POST /api/viaticos/solicitacoes': (req, body) => {
    let msg = \`Criou solicitação de viático (ID \${body && body.id}) para o colaborador ID \${req.body.colaborador_id}\`;
    const pi = req.body.pendencia_info;
    if (pi && pi.valor > 0) {
      msg += pi.decisao === 'descontar'
        ? \` — descontou pendência de \${fmtBRL(pi.valor)} de viagem(ns) anterior(es) (ID \${(pi.ids || []).join(', ')}) do valor liberado\`
        : \` — optou por NÃO descontar a pendência de \${fmtBRL(pi.valor)} (encerrada sem desconto, não aparece mais; viagem(ns) ID \${(pi.ids || []).join(', ')})\`;
    }
    return msg;
  },`,
`  'POST /api/viaticos/solicitacoes': (req, body) =>
    \`Criou solicitação de viático (ID \${body && body.id}) para o colaborador ID \${req.body.colaborador_id}\` + auditPendencia(req.body.pendencia_info),`);
troca(`  'PUT /api/viaticos/solicitacoes/:id': req => \`Editou a solicitação de viático ID \${req.params.id}\`,`,
      `  'PUT /api/viaticos/solicitacoes/:id': req => \`Editou a solicitação de viático ID \${req.params.id}\` + auditPendencia(req.body.pendencia_info),`);
troca("    (req.body.valor_liberado ? ` e registrou o valor liberado de R$ ${Number(req.body.valor_liberado).toFixed(2)}` : ''),",
      "    (req.body.valor_liberado ? ` e registrou o valor liberado de R$ ${Number(req.body.valor_liberado).toFixed(2)}` : '') + auditPendencia(req.body.pendencia_info),");
troca('// Intercepta res.json em toda requisição autenticada de escrita',
`// Texto da decisão sobre pendência de estouro (descontar/dispensar) para o log de auditoria.
function auditPendencia(pi) {
  if (!pi || !(pi.valor > 0)) return '';
  return pi.decisao === 'descontar'
    ? \` — descontou pendência de \${fmtBRL(pi.valor)} de viagem(ns) anterior(es) (ID \${(pi.ids || []).join(', ')}) do valor liberado\`
    : \` — optou por NÃO descontar a pendência de \${fmtBRL(pi.valor)} (encerrada sem desconto, não aparece mais; viagem(ns) ID \${(pi.ids || []).join(', ')})\`;
}

// Intercepta res.json em toda requisição autenticada de escrita`);

// ---- encerrar pendências: função única usada pela criação, edição e agendamento ----
troca(`  // A pendência de viagem anterior é decidida UMA vez, aqui, na viagem seguinte: descontar do valor
  // liberado ou dispensar. Nas duas decisões ela é encerrada (e registrada) — não pode voltar a
  // aparecer depois, porque descontar muito tempo depois não faz sentido.
  const idsPend = (Array.isArray(b.pendencia_ids) ? b.pendencia_ids : (Array.isArray(b.descontar_pendencia_ids) ? b.descontar_pendencia_ids : []))
    .map(Number).filter(Number.isInteger);
  if (idsPend.length) {
    const decisao = b.pendencia_decisao === 'dispensar' ? 'dispensada' : 'descontada';
    await query(\`UPDATE erp_viaticos_solicitacoes
        SET pendencia_resolvida=true, pendencia_decisao=$3, pendencia_decidida_em=now(), pendencia_decidida_na=$4
      WHERE id = ANY($1::int[]) AND colaborador_id=$2 AND status='divergente' AND pendencia_resolvida=false\`,
      [idsPend, b.colaborador_id, decisao, ins[0].id]);
  }`,
`  await encerrarPendencias(b, b.colaborador_id, ins[0].id);`);

troca(`app.post('/api/viaticos/solicitacoes', requireAuth, requireEdit('viaticos'), h(async (req, res) => {`,
`// A pendência de viagem anterior é decidida UMA vez — descontar do valor liberado ou dispensar — e
// nas duas decisões ela é encerrada e registrada: não pode voltar a aparecer depois, porque descontar
// tanto tempo depois não faz sentido. Só encerra pendências ABERTAS do próprio colaborador.
async function encerrarPendencias(b, colaboradorId, naSolicitacaoId) {
  const ids = (Array.isArray(b.pendencia_ids) ? b.pendencia_ids : (Array.isArray(b.descontar_pendencia_ids) ? b.descontar_pendencia_ids : []))
    .map(Number).filter(Number.isInteger);
  if (!ids.length) return;
  const decisao = b.pendencia_decisao === 'dispensar' ? 'dispensada' : 'descontada';
  await query(\`UPDATE erp_viaticos_solicitacoes
      SET pendencia_resolvida=true, pendencia_decisao=$3, pendencia_decidida_em=now(), pendencia_decidida_na=$4
    WHERE id = ANY($1::int[]) AND colaborador_id=$2 AND status='divergente' AND pendencia_resolvida=false\`,
    [ids, colaboradorId, decisao, naSolicitacaoId]);
}

app.post('/api/viaticos/solicitacoes', requireAuth, requireEdit('viaticos'), h(async (req, res) => {`);

// ---- edição (Editar): só admin decide, só em Em Approvals ----
troca(`app.put('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body, err = validateSolicitacao(b);
  if (err) return res.status(400).json({ error: err });`,
`app.put('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body, err = validateSolicitacao(b);
  if (err) return res.status(400).json({ error: err });
  // Decidir sobre a pendência é liberar (ou abrir mão de) valor: só administrador, e só antes da transferência.
  const querDecidir = Array.isArray(b.pendencia_ids) && b.pendencia_ids.length;
  let donoPend = null;
  if (querDecidir) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Somente um administrador pode decidir sobre a pendência de viagem anterior.' });
    const atual = (await query('SELECT colaborador_id, status FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'em_approvals') return res.status(400).json({ error: 'A decisão sobre a pendência só pode ser tomada enquanto a solicitação está em Em Approvals.' });
    donoPend = atual.colaborador_id;
  }`);
troca(`     b.data_expiracao_flash || null, b.valor_solicitado ? Number(b.valor_solicitado) : null, Number(b.valor_liberado), sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));`,
`     b.data_expiracao_flash || null, b.valor_solicitado ? Number(b.valor_solicitado) : null, Number(b.valor_liberado), sanitize(b.notes), req.params.id]);
  if (querDecidir) await encerrarPendencias(b, donoPend, Number(req.params.id));
  res.json({ ok: true });
}));`);

// ---- agendar transferência (grava o valor liberado) ----
troca(`    const lib = Number(req.body.valor_liberado);
    if (!isFinite(lib) || lib < 0) return res.status(400).json({ error: 'Valor liberado inválido.' });
    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);
    return res.json({ ok: true });`,
`    const lib = Number(req.body.valor_liberado);
    if (!isFinite(lib) || lib < 0) return res.status(400).json({ error: 'Valor liberado inválido.' });
    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);
    if (Array.isArray(req.body.pendencia_ids) && req.body.pendencia_ids.length) {
      const dono = (await query('SELECT colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
      if (dono) await encerrarPendencias(req.body, dono.colaborador_id, Number(req.params.id));
    }
    return res.json({ ok: true });`);

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
