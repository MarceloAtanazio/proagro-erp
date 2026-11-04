// Propósito: aplicar em api/index.js o novo fechamento de viáticos: saldo sem reprovadas, estorno do Flash e "a conferir".
// Entrada: caminho do api/index.js (argumento 1). Saída: arquivo alterado no lugar; aborta se algum trecho não for encontrado.
// Executar: node scripts/2026-11-05_viaticos_saldo_api_aplicar.js <caminho/api/index.js>
const fs = require('fs'); const f = process.argv[2];
let t = fs.readFileSync(f, 'utf8'); const crlf = t.includes('\r\n'); if (crlf) t = t.replace(/\r\n/g, '\n');
function sub(a, b) { if (!t.includes(a)) { console.error('NÃO ACHOU:\n' + a.slice(0, 140)); process.exit(1); } t = t.replace(a, () => b); }

// 1) recalcular ao mudar reprovadas: agora também refaz o devolvido e a conferência
sub(`async function recalcularPendenciaReprovadas(solId) {
  const s = (await query('SELECT status, pendencia_decisao, excessos_status, excessos_valores FROM erp_viaticos_solicitacoes WHERE id=$1', [solId]))[0];
  if (!s || s.pendencia_decisao || !['comprovado', 'devolvido'].includes(s.status)) return;
  const total = Math.round((somaExcessosReprovados(s.excessos_status, s.excessos_valores) + await somaReprovadasFlash(solId)) * 100) / 100;
  await query('UPDATE erp_viaticos_solicitacoes SET valor_pendencia=$1, pendencia_resolvida=$2 WHERE id=$3', [total, total === 0, solId]);
}`, `async function recalcularPendenciaReprovadas(solId) {
  const s = (await query('SELECT status, pendencia_decisao, excessos_status, excessos_valores, valor_liberado FROM erp_viaticos_solicitacoes WHERE id=$1', [solId]))[0];
  if (!s || !['comprovado', 'devolvido'].includes(s.status)) return;
  const repr = await somaReprovadasFlash(solId);
  if (!s.pendencia_decisao) {
    const total = Math.round((somaExcessosReprovados(s.excessos_status, s.excessos_valores) + repr) * 100) / 100;
    await query('UPDATE erp_viaticos_solicitacoes SET valor_pendencia=$1, pendencia_resolvida=$2 WHERE id=$3', [total, total === 0, solId]);
  }
  // A reprovada não volta ao saldo: o devolvido acompanha o que ela consome.
  const comp = n((await query('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_despesas WHERE solicitacao_id=$1', [solId]))[0].v);
  const dv = saldoDevolvivel(n(s.valor_liberado), comp, repr);
  await query('UPDATE erp_viaticos_solicitacoes SET valor_devolvido=$1, status=$2 WHERE id=$3', [dv, dv > 0.005 ? 'devolvido' : 'comprovado', solId]);
  await recalcularSaldoConferir(solId);
}

// Saldo devolvível = liberado − comprovado − reprovadas do Flash. A reprovada saiu da conta do Flash e será abatida na próxima OT,
// então NÃO volta ao saldo (ela vive só na pendência). Só vale sem estouro: no estouro (comprovado > liberado) a regra é a do estouro.
function saldoDevolvivel(liberado, comprovado, reprovadas) {
  return Math.max(0, Math.round((liberado - comprovado - reprovadas) * 100) / 100);
}

// "A conferir" = parte do devolvido que NÃO voltou como estorno no extrato do Flash. Sem estorno importado (NULL) não há o que
// conferir. Enquanto um administrador não decidir, fica visível; decidido (justificado/cobrado) não é recalculado.
async function recalcularSaldoConferir(solId) {
  const s = (await query('SELECT status, valor_devolvido, estorno_flash, conferir_decisao FROM erp_viaticos_solicitacoes WHERE id=$1', [solId]))[0];
  if (!s || s.conferir_decisao || !['comprovado', 'devolvido'].includes(s.status)) return;
  const conf = (s.estorno_flash === null || s.estorno_flash === undefined) ? 0 : Math.max(0, Math.round((n(s.valor_devolvido) - n(s.estorno_flash)) * 100) / 100);
  await query('UPDATE erp_viaticos_solicitacoes SET conferir_valor=$1 WHERE id=$2', [conf, solId]);
}`);

// 2) fechar
sub(`  const dif = liberado - comprovado; // >0 sobrou, <0 estourou
  let status, valor_devolvido = 0, valor_pendencia = 0, pendencia_resolvida = true;
  if (Math.abs(dif) < 0.005) { status = 'comprovado'; }
  else if (dif > 0) { status = 'devolvido'; valor_devolvido = dif; }
  else {`, `  const dif = liberado - comprovado; // >0 sobrou, <0 estourou
  const reprFlash = await somaReprovadasFlash(s.id);
  let status, valor_devolvido = 0, valor_pendencia = 0, pendencia_resolvida = true;
  if (Math.abs(dif) < 0.005) { status = 'comprovado'; }
  else if (dif > 0) { valor_devolvido = saldoDevolvivel(liberado, comprovado, reprFlash); status = valor_devolvido > 0.005 ? 'devolvido' : 'comprovado'; }
  else {`);
sub(`    const fl = await somaReprovadasFlash(s.id);
    if (fl > 0) {`, `    const fl = reprFlash;
    if (fl > 0) {`);
sub(`    [status, valor_devolvido, valor_pendencia, pendencia_resolvida, req.params.id]);
  res.json({ ok: true, status, comprovado, valor_devolvido, valor_pendencia });`, `    [status, valor_devolvido, valor_pendencia, pendencia_resolvida, req.params.id]);
  await recalcularSaldoConferir(Number(req.params.id));
  const conferir = n((await query('SELECT conferir_valor FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0].conferir_valor);
  res.json({ ok: true, status, comprovado, valor_devolvido, valor_pendencia, conferir_valor: conferir });`);

// 3) reabrir limpa a conferência
sub(`SET status='aguardando_comprovacao', valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true
    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`, `SET status='aguardando_comprovacao', valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true,
      conferir_valor=0, conferir_decisao=NULL, conferir_nota=NULL, conferir_decidida_em=NULL
    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`);

// 4) rotas de estorno e decisão
sub(`// ---- Painel "Transferência" da OT ----`, `// ---- Estorno do Flash e diferença "a conferir" ----
// O extrato traz "Estorno de saldo de pessoa": o que voltou de fato à carteira. SUBSTITUI (não soma) o valor guardado, então
// reimportar o mesmo arquivo dá o mesmo resultado.
app.get('/api/viaticos/solicitacoes/:id/conferir', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const escopo = await viaticosEscopo(req.user);
  if (escopo) {
    const dona = await query('SELECT 1 FROM erp_viaticos_solicitacoes WHERE id=$1 AND colaborador_id = ANY($2)', [req.params.id, escopo]);
    if (!dona.length) return res.status(403).json({ error: 'Acesso restrito às suas próprias solicitações.' });
  }
  const r = (await query('SELECT estorno_flash, conferir_valor, conferir_decisao, conferir_nota, conferir_decidida_em FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
  if (!r) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  res.json({ estorno_flash: r.estorno_flash === null ? null : n(r.estorno_flash), conferir_valor: n(r.conferir_valor),
    conferir_decisao: r.conferir_decisao, conferir_nota: r.conferir_nota, conferir_decidida_em: r.conferir_decidida_em });
}));

app.post('/api/viaticos/solicitacoes/:id/estorno', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const valor = Math.round(Number(req.body && req.body.valor) * 100) / 100;
  if (!isFinite(valor) || valor < 0 || valor >= 1000000) return res.status(400).json({ error: 'Valor de estorno inválido.' });
  const up = await query('UPDATE erp_viaticos_solicitacoes SET estorno_flash=$1 WHERE id=$2 RETURNING id', [valor, req.params.id]);
  if (!up.length) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  await recalcularSaldoConferir(Number(req.params.id));
  res.json({ ok: true });
}));

// Decisão sobre a diferença: "justificar" (conferido no Flash; a nota é obrigatória e fica registrada) ou "cobrar" (o valor vira
// pendência a descontar na próxima OT). Só administrador: justificar é abrir mão de um valor.
app.post('/api/viaticos/solicitacoes/:id/conferir-decisao', requireAuth, requireAdmin, h(async (req, res) => {
  const b = req.body || {};
  const decisao = b.decisao === 'cobrar' ? 'cobrado' : (b.decisao === 'justificar' ? 'justificado' : null);
  const nota = sanitize(b.nota);
  if (!decisao) return res.status(400).json({ error: 'Decisão inválida.' });
  if (!nota || String(nota).trim().length < 5) return res.status(400).json({ error: 'Informe a justificativa (mínimo de 5 caracteres).' });
  const s = (await query('SELECT status, conferir_valor, conferir_decisao FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (s.conferir_decisao) return res.status(400).json({ error: 'Esta diferença já foi decidida.' });
  if (n(s.conferir_valor) <= 0) return res.status(400).json({ error: 'Não há diferença a conferir nesta OT.' });
  if (decisao === 'cobrado') {
    await query(\`UPDATE erp_viaticos_solicitacoes SET conferir_decisao=$1, conferir_nota=$2, conferir_decidida_em=now(),
      valor_pendencia = valor_pendencia + conferir_valor, pendencia_resolvida=false WHERE id=$3\`, [decisao, nota, req.params.id]);
  } else {
    await query('UPDATE erp_viaticos_solicitacoes SET conferir_decisao=$1, conferir_nota=$2, conferir_decidida_em=now() WHERE id=$3', [decisao, nota, req.params.id]);
  }
  res.json({ ok: true });
}));

// ---- Painel "Transferência" da OT ----`);
if (crlf) t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(f, t); console.log('ok');
