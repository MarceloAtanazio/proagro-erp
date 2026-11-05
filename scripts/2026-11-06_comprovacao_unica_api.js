// Propósito: COMPROVAÇÃO ÚNICA da família de OTs em Viáticos (backend). A OT de origem e as complementares seguem com aprovação, transferência e
//   cancelamento próprios, mas a comprovação é uma só e mora na OT raiz: despesas, reprovadas do Flash, estorno e excessos. Ajusta: leitura/gravação de
//   despesas e reprovadas, fechar/reabrir/arquivar (liberado = soma da família; complementares acompanham o status final; recusa fechar com complementar
//   em aprovação), status automático por data (a família só entra em "Aguardando comprovação" depois do fim da última OT), lista (devolve
//   familia_raiz_id), painéis (contam a família uma vez) e excluir (recusa apagar OT que tem complementares). Sem migração: a raiz é calculada por CTE.
// Entrada: api/index.js (ou a pasta indicada em argv[2]) e scripts/2026-11-06_comprovacao_unica_*_bloco.txt. Saída: o arquivo editado.
// Uso: node scripts/2026-11-06_comprovacao_unica_api.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const unico = (m, desde = 0) => { const i = s.indexOf(m, desde); if (i < 0) throw new Error('trecho não achado: ' + m.slice(0, 90)); if (s.indexOf(m, i + 1) >= 0) throw new Error('trecho repetido: ' + m.slice(0, 90)); return i; };
const troca = (de, para) => { unico(de); s = s.replace(de, () => para); };
// Do início de uma rota até o marcador seguinte: troca req.params.id pela raiz da família (calculada na 1ª linha da rota).
const rotaPelaRaiz = (ini, fim) => {
  const i = unico(ini), j = s.indexOf(fim, i + ini.length);
  if (j < 0) throw new Error('fim da rota não achado: ' + fim.slice(0, 60));
  const rota = s.slice(i, j), nl = rota.indexOf('\n') + 1;
  s = s.slice(0, i) + rota.slice(0, nl) + '  const rid = await raizFamilia(req.params.id);\n' + rota.slice(nl).split('req.params.id').join('rid') + s.slice(j);
};

// 1) ajudantes da família (antes das reprovadas do Flash)
troca("// ---- Despesas reprovadas no Flash ----\n", bloco('2026-11-06_comprovacao_unica_ajudantes_bloco.txt') + "// ---- Despesas reprovadas no Flash ----\n");

// 2) reprovadas e pendência: a soma é da família; o saldo devolvível usa o liberado e o comprovado da família
troca("  const r = await query('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_reprovadas WHERE solicitacao_id=$1', [solId]);\n  return Math.round(n(r[0].v) * 100) / 100;",
      "  const r = await query('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_reprovadas WHERE solicitacao_id = ANY($1::int[])', [await idsFamilia(solId)]);\n  return Math.round(n(r[0].v) * 100) / 100;");
troca("  const comp = n((await query('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_despesas WHERE solicitacao_id=$1', [solId]))[0].v);\n  const dv = saldoDevolvivel(n(s.valor_liberado), comp, repr);\n  await query('UPDATE erp_viaticos_solicitacoes SET valor_devolvido=$1, status=$2 WHERE id=$3', [dv, dv > 0.005 ? 'devolvido' : 'comprovado', solId]);",
      "  const idsFam = await idsFamilia(solId);\n  const comp = await comprovadoFamilia(idsFam);\n  const dv = saldoDevolvivel(await liberadoFamilia(idsFam), comp, repr);\n  const novoStatus = dv > 0.005 ? 'devolvido' : 'comprovado';\n  await query('UPDATE erp_viaticos_solicitacoes SET valor_devolvido=$1, status=$2 WHERE id=$3', [dv, novoStatus, solId]);\n  await propagarStatusFamilia(idsFam, solId, novoStatus, ['comprovado', 'devolvido']);");

// 3) reprovadas: lê a família na raiz; grava e recalcula na raiz
troca("  const rows = await query('SELECT id, data, descricao, categoria, valor FROM erp_viaticos_reprovadas WHERE solicitacao_id=$1 ORDER BY data, id', [req.params.id]);",
      "  const rows = await query('SELECT id, data, descricao, categoria, valor FROM erp_viaticos_reprovadas WHERE solicitacao_id = ANY($1::int[]) ORDER BY data, id', [await idsComprovacao(req.params.id)]);");
troca("  if (!sol.length) return res.status(404).json({ error: 'Solicitação não encontrada.' });\n  // Mesma idempotência da importação das despesas",
      "  if (!sol.length) return res.status(404).json({ error: 'Solicitação não encontrada.' });\n  const rid = await raizFamilia(req.params.id); // comprovação única: a reprovada fica na OT raiz da família\n  // Mesma idempotência da importação das despesas");
troca("    [req.params.id, b.data, sanitize(b.descricao) || null, sanitize(b.categoria) || null, valor, lote, linha, req.user.id]);\n  if (!ins.length) return res.json({ ok: true, duplicada: true });\n  await recalcularPendenciaReprovadas(Number(req.params.id));",
      "    [rid, b.data, sanitize(b.descricao) || null, sanitize(b.categoria) || null, valor, lote, linha, req.user.id]);\n  if (!ins.length) return res.json({ ok: true, duplicada: true });\n  await recalcularPendenciaReprovadas(Number(rid));");

// 4) estorno, conferência e excesso na raiz
rotaPelaRaiz("app.get('/api/viaticos/solicitacoes/:id/conferir'", "app.post('/api/viaticos/solicitacoes/:id/estorno'");
rotaPelaRaiz("app.post('/api/viaticos/solicitacoes/:id/estorno'", "// Decisão sobre a diferença");
rotaPelaRaiz("app.post('/api/viaticos/solicitacoes/:id/conferir-decisao'", "// ---- Painel \"Transferência\" da OT ----");
rotaPelaRaiz("app.post('/api/viaticos/solicitacoes/:id/excesso-status'", "app.delete('/api/viaticos/solicitacoes/:id', requireAuth");

// 5) fechar (substitui a rota inteira)
{
  const ini = "app.post('/api/viaticos/solicitacoes/:id/fechar'", fim = "app.post('/api/viaticos/solicitacoes/:id/arquivar'";
  const i = unico(ini), j = s.indexOf(fim, i);
  if (j < 0) throw new Error('fim de fechar não achado');
  s = s.slice(0, i) + bloco('2026-11-06_comprovacao_unica_fechar_bloco.txt') + '\n' + s.slice(j);
}

// 6) arquivar e reabrir: a raiz e as complementares juntas
troca("app.post('/api/viaticos/solicitacoes/:id/arquivar', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  await query(`UPDATE erp_viaticos_solicitacoes SET status='arquivado' WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`, [req.params.id]);\n  res.json({ ok: true });",
      "app.post('/api/viaticos/solicitacoes/:id/arquivar', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const rid = await raizFamilia(req.params.id);\n  const up = await query(`UPDATE erp_viaticos_solicitacoes SET status='arquivado' WHERE id=$1 AND status IN ('comprovado','devolvido','divergente') RETURNING id`, [rid]);\n  if (up.length) await propagarStatusFamilia(await idsFamilia(rid), rid, 'arquivado', ['comprovado', 'devolvido', 'divergente']);\n  res.json({ ok: true });");
troca("  await query(`UPDATE erp_viaticos_solicitacoes SET status='aguardando_comprovacao', valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true,\n      conferir_valor=0, conferir_decisao=NULL, conferir_nota=NULL, conferir_decidida_em=NULL\n    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`, [req.params.id]);\n  res.json({ ok: true });",
      "  const rid = await raizFamilia(req.params.id);\n  const up = await query(`UPDATE erp_viaticos_solicitacoes SET status='aguardando_comprovacao', valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true,\n      conferir_valor=0, conferir_decisao=NULL, conferir_nota=NULL, conferir_decidida_em=NULL\n    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente') RETURNING id`, [rid]);\n  if (up.length) await propagarStatusFamilia(await idsFamilia(rid), rid, 'aguardando_comprovacao', ['comprovado', 'devolvido', 'divergente']);\n  res.json({ ok: true });");

// 7) excluir: não apaga a OT raiz que ainda tem complementares (a comprovação da família mora nela)
troca("app.delete('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  await query('DELETE FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]);",
      "app.delete('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  // A comprovação da família (despesas, reprovadas, estorno) mora na OT raiz: apagá-la com complementares penduradas levaria tudo junto.\n  const filhas = await query('SELECT COUNT(*)::int AS n FROM erp_viaticos_solicitacoes WHERE solicitacao_pai_id=$1', [req.params.id]);\n  if (filhas[0] && filhas[0].n > 0) return res.status(400).json({ error: 'Esta OT tem complementar(es) ligada(s) a ela e a comprovação é única: exclua primeiro as complementares.' });\n  await query('DELETE FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]);");

// 8) despesas: lê a família na raiz; grava na raiz; limpar apaga a família
troca("  const rows = await query('SELECT * FROM erp_viaticos_despesas WHERE solicitacao_id=$1 ORDER BY data', [req.params.id]);",
      "  const rows = await query('SELECT * FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) ORDER BY data', [await idsComprovacao(req.params.id)]);");
troca("    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.params.id, b.categoria, b.data, valor, sanitize(b.descricao)]);",
      "    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [await raizFamilia(req.params.id), b.categoria, b.data, valor, sanitize(b.descricao)]);");
troca("  const apagadas = await query('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id=$1 RETURNING valor', [req.params.id]);",
      "  const apagadas = await query('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) RETURNING valor', [await idsFamilia(req.params.id)]);");

// 9) status automático por família
{
  const ini = "  const today = hojeISO();\n  const STATUS_POR_DATA = `CASE";
  const fim = "      AND status <> ${STATUS_POR_DATA}`, [today]);\n";
  const i = unico(ini), j = s.indexOf(fim, i);
  if (j < 0) throw new Error('fim do status por data não achado');
  s = s.slice(0, i) + bloco('2026-11-06_comprovacao_unica_status_bloco.txt') + s.slice(j + fim.length);
}

// 10) lista: devolve a raiz da família de cada OT
troca("  const rows = await query(`\n    SELECT s.*, c.name AS colaborador_name, c.cargo AS colaborador_cargo,",
      "  const rows = await query(`\n    ${FAMILIA_CTE}\n    SELECT s.*, f.raiz_id AS familia_raiz_id, c.name AS colaborador_name, c.cargo AS colaborador_cargo,");
troca("    FROM erp_viaticos_solicitacoes s JOIN erp_colaboradores c ON c.id=s.colaborador_id\n    ${escopo ? 'WHERE s.colaborador_id = ANY($1)' : ''}",
      "    FROM erp_viaticos_solicitacoes s JOIN erp_colaboradores c ON c.id=s.colaborador_id\n    LEFT JOIN fam f ON f.id = s.id\n    ${escopo ? 'WHERE s.colaborador_id = ANY($1)' : ''}");

// 11) painéis: a família conta uma vez
troca("const aguardando = await query(`SELECT id, destino, data_expiracao_flash, valor_liberado FROM erp_viaticos_solicitacoes",
      "const aguardando = await query(`SELECT id, destino, data_expiracao_flash, valor_liberado, solicitacao_pai_id FROM erp_viaticos_solicitacoes");
troca("aguardandoComprovacao: { n: aguardando.length,", "aguardandoComprovacao: { n: aguardando.filter(r => !r.solicitacao_pai_id).length,");
troca("FROM erp_viaticos_solicitacoes WHERE status='divergente' AND pendencia_resolvida=false${filtroColab}", "FROM erp_viaticos_solicitacoes WHERE status='divergente' AND solicitacao_pai_id IS NULL AND pendencia_resolvida=false${filtroColab}");
troca("`SELECT COUNT(*)::int AS n, COALESCE(SUM(s.valor_liberado),0) AS v\n       FROM erp_viaticos_solicitacoes s\n      WHERE s.status = 'aguardando_comprovacao'`",
      "`SELECT COUNT(*) FILTER (WHERE s.solicitacao_pai_id IS NULL)::int AS n, COALESCE(SUM(s.valor_liberado),0) AS v\n       FROM erp_viaticos_solicitacoes s\n      WHERE s.status = 'aguardando_comprovacao'`");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
