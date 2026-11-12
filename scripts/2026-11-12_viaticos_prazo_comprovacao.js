// Propósito: Viáticos — prazo de comprovação de 3 dias úteis após o fim da viagem.
//   1) Lista de solicitações: mensagem sob o status ("Faltam N dias para comprovar" / "Comprovação em atraso há N dias"), cadeado e botão 🔓 Liberar (só administrador).
//   2) Bloqueio no servidor (423) de lançar/editar/apagar despesas, lançar reprovadas e fechar uma comprovação vencida e não liberada; liberação com justificativa registrada.
//   3) Painel do período (visual Novo): seção "Prazo de comprovação" (% no prazo, em atraso agora, atraso médio, tempo médio, faixas e ranking por colaborador) e
//      o cartão "Aguardando comprovação" passa a dizer quantas estão em atraso.
//   Depende da migração supabase/migrations/2026-11-12-viaticos-prazo-comprovacao.sql (colunas comprovacao_fechada_em e comprovacao_liberada_*).
// Entradas: api/index.js, public/app.js, public/styles.css, public/tema-viaticos.js, public/tema-viaticos.css (ou a pasta em argv[2]) e o arquivo de blocos
//   scripts/2026-11-12_viaticos_prazo_comprovacao_blocos.txt. Saída: arquivos editados.
// Como executar: node scripts/2026-11-12_viaticos_prazo_comprovacao.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const blocos = {};
fs.readFileSync(path.join(__dirname, '2026-11-12_viaticos_prazo_comprovacao_blocos.txt'), 'utf8').replace(/\r\n/g, '\n').split(/^@@/m).slice(1).forEach(b => {
  const i = b.indexOf('\n'); blocos[b.slice(0, i).trim()] = b.slice(i + 1);
});
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
const BL = 'if (await respondeSeBloqueada(req.params.id, res)) return;';

edita('api/index.js', troca => {
  troca('// ---- Despesas reprovadas no Flash ----\n', blocos.API_HELPERS + '// ---- Despesas reprovadas no Flash ----\n');
  troca('// ---- Despesas (itens de comprovação) ----\n', blocos.API_LIBERAR + '// ---- Despesas (itens de comprovação) ----\n');
  // lista: data do fechamento (fuso do Brasil) e campos comprov_*
  troca('SELECT s.*, f.raiz_id AS familia_raiz_id, c.name AS colaborador_name,', "SELECT s.*, (s.comprovacao_fechada_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS comprov_fechada_dia, f.raiz_id AS familia_raiz_id, c.name AS colaborador_name,");
  troca('res.json(rows.map(r => ({ ...r, valor_solicitado: n(r.valor_solicitado), valor_liberado: n(r.valor_liberado),', 'res.json(anexarPrazoComprovacao(rows, hojeISO()).map(r => ({ ...r, valor_solicitado: n(r.valor_solicitado), valor_liberado: n(r.valor_liberado),');
  // bloqueios
  troca("app.post('/api/viaticos/solicitacoes/:id/despesas', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body;\n", "app.post('/api/viaticos/solicitacoes/:id/despesas', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  " + BL + "\n  const b = req.body;\n");
  troca("app.put('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body;\n", "app.put('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  if (await respondeSeBloqueadaDespesa(req.params.id, res)) return;\n  const b = req.body;\n");
  troca("app.delete('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n", "app.delete('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  if (await respondeSeBloqueadaDespesa(req.params.id, res)) return;\n");
  troca("  const apagadas = await query('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) RETURNING valor', [await idsFamilia(req.params.id)]);", "  " + BL + "\n  const apagadas = await query('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[]) RETURNING valor', [await idsFamilia(req.params.id)]);");
  troca("app.post('/api/viaticos/solicitacoes/:id/reprovadas', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n", "app.post('/api/viaticos/solicitacoes/:id/reprovadas', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  " + BL + "\n");
  troca("  const s = (await query('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1', [rid]))[0];\n  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });\n  const ids = await idsFamilia(rid);\n  // Complementar ainda em aprovação",
    "  const s = (await query('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1', [rid]))[0];\n  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });\n  if (await respondeSeBloqueada(rid, res)) return;\n  const ids = await idsFamilia(rid);\n  // Complementar ainda em aprovação");
  // fechamento grava a data; reabrir (admin) já libera, para não prender de novo uma comprovação que o administrador acabou de reabrir
  troca("await query(`UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=$2, valor_pendencia=$3, pendencia_resolvida=$4 WHERE id=$5`,", "await query(`UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=$2, valor_pendencia=$3, pendencia_resolvida=$4, comprovacao_fechada_em=NOW() WHERE id=$5`,");
  troca("      conferir_valor=0, conferir_decisao=NULL, conferir_nota=NULL, conferir_decidida_em=NULL\n    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente') RETURNING id`, [rid]);",
    "      conferir_valor=0, conferir_decisao=NULL, conferir_nota=NULL, conferir_decidida_em=NULL, comprovacao_fechada_em=NULL,\n      comprovacao_liberada_em=COALESCE(comprovacao_liberada_em, NOW()), comprovacao_liberada_por=COALESCE(comprovacao_liberada_por, $2),\n      comprovacao_liberada_motivo=COALESCE(comprovacao_liberada_motivo, 'Comprovação reaberta pelo administrador')\n    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente') RETURNING id`, [rid, req.user.name]);");
  // auditoria
  troca("  'POST /api/viaticos/solicitacoes/:id/reabrir': req =>", "  'POST /api/viaticos/solicitacoes/:id/liberar-comprovacao': req => `Liberou (admin) a comprovação em atraso da solicitação de viático ID ${req.params.id}: ${String(req.body && req.body.motivo || '').slice(0, 200)}`,\n  'POST /api/viaticos/solicitacoes/:id/reabrir': req =>");
});

edita('public/app.js', troca => {
  troca('function viaPodeCancelar(s) {', blocos.APP_FUNCS + 'function viaPodeCancelar(s) {');
  // linha da lista: mensagem do prazo sob o status
  troca('<td><span class="badge ${VIA_STATUS_BADGE[s.status]}">${VIA_STATUS_LABEL[s.status]}</span>${pendAprov ?', '<td><span class="badge ${VIA_STATUS_BADGE[s.status]}">${VIA_STATUS_LABEL[s.status]}</span>${viaPrazoHtml(s)}${pendAprov ?');
  // ações: cadeado no lugar do ✓ + botão de liberar (habilitado só para administrador)
  troca("<button class=\"btn-ic ok\" data-view=\"${s.id}\" title=\"${fechada ? 'Ver' : 'Comprovar'}\" aria-label=\"${fechada ? 'Ver' : 'Comprovar'}\">${fechada ? '👁' : '✓'}</button>",
    "<button class=\"btn-ic ok\" data-view=\"${s.id}\" title=\"${fechada ? 'Ver' : s.comprov_bloqueada ? 'Comprovação bloqueada por atraso: abrir' : 'Comprovar'}\" aria-label=\"${fechada ? 'Ver' : 'Comprovar'}\">${fechada ? '👁' : s.comprov_bloqueada ? '🔒' : '✓'}</button>\n        ${s.comprov_bloqueada && !fechada ? `<button class=\"btn-ic\" data-liberar=\"${s.id}\" ${USER.role === 'admin' ? '' : 'disabled'} title=\"${USER.role === 'admin' ? 'Liberar a comprovação em atraso (pede a justificativa)' : 'Só o administrador pode liberar uma comprovação em atraso'}\" aria-label=\"Liberar comprovação\">🔓</button>` : ''}");
  troca("    $('#tbl').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewSolicitacao(Number(b.dataset.view)));\n",
    "    $('#tbl').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewSolicitacao(Number(b.dataset.view)));\n    $('#tbl').querySelectorAll('[data-liberar]').forEach(b => b.onclick = () => viaLiberarComprovacaoModal(sols.find(s => s.id == b.dataset.liberar)));\n");
  // cartão do topo (visual Clássico)
  troca("<div class=\"detail\">${brl(dash.aguardandoComprovacao.v)}</div></div>", "<div class=\"detail\">${brl(dash.aguardandoComprovacao.v)}${viaAtrasoQtd(sols).n ? ` · <strong style=\"color:var(--danger)\">${viaAtrasoQtd(sols).n} em atraso</strong>` : ''}</div></div>");
  // tela de comprovação: bloqueio + faixa de prazo + botão de liberar
  troca("  const somenteLeitura = READONLY;\n", "  const bloqueada = !!s.comprov_bloqueada && !finalizada;   // prazo vencido e sem liberação do administrador\n  const somenteLeitura = READONLY || bloqueada;\n");
  troca("  const body = `\n    ${infoOT}\n", blocos.APP_BANNER + "  const body = `\n    ${prazoBanner}\n    ${infoOT}\n");
  troca("  if (somenteLeitura) {\n    // consulta pura — nenhuma ação além de fechar\n  } else if (!finalizada) {",
    "  if (bloqueada) {\n    if (USER.role === 'admin' && !READONLY) botoes.push({ label: 'Liberar comprovação', cls: 'primary', onClick: () => { closeModal(); viaLiberarComprovacaoModal(s, () => viewSolicitacao(id)); } });\n  } else if (somenteLeitura) {\n    // consulta pura — nenhuma ação além de fechar\n  } else if (!finalizada) {");
  troca("openModal(`${somenteLeitura ? 'Detalhes da viagem' : finalizada ? 'Comprovação' : 'Comprovar viagem'}", "openModal(`${bloqueada ? 'Comprovação bloqueada' : somenteLeitura ? 'Detalhes da viagem' : finalizada ? 'Comprovação' : 'Comprovar viagem'}");
});

edita('public/styles.css', (troca, ler, grava) => {
  if (ler().includes('.via-prazo')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + blocos.CSS_CLASSIC);
});

edita('public/tema-viaticos.js', troca => {
  troca('  function aplica() {\n', blocos.TEMA_FUNC + '  function aplica() {\n');
  // cartão "Aguardando comprovação": quantas em atraso
  troca("      ${card('warn', ICONE.comp, 'Aguardando comprovação', num(d.aguardandoComprovacao.n), brl(d.aguardandoComprovacao.v) + ' · ver na lista', 'role=\"button\" tabindex=\"0\" data-via=\"aguardando_comprovacao\"')}",
    "      ${(() => { const at = typeof viaAtrasoQtd === 'function' ? viaAtrasoQtd(V.sols) : { n: 0, bloq: 0 }; return card(at.n ? 'red' : 'warn', ICONE.comp, 'Aguardando comprovação', num(d.aguardandoComprovacao.n), brl(d.aguardandoComprovacao.v) + ' · ' + (at.n ? `<b class=\"nd-via-atraso\">${at.n} em atraso</b>${at.bloq ? ' (' + at.bloq + ' bloqueada' + (at.bloq > 1 ? 's' : '') + ')' : ''}` : 'ver na lista'), 'role=\"button\" tabindex=\"0\" data-via=\"aguardando_comprovacao\"'); })()}");
  // seção no Painel, logo depois dos indicadores do período
  troca("      <div class=\"nd-pn-linha\">\n        <article class=\"nd-card\"><div class=\"nd-card-cab\"><h3>Prestação de contas por situação</h3>", "      ${prazoSecao(V.filtrados)}\n      <div class=\"nd-pn-linha\">\n        <article class=\"nd-card\"><div class=\"nd-card-cab\"><h3>Prestação de contas por situação</h3>");
  // clique no ranking de prazo filtra a lista (mesma interação do ranking do painel)
  troca("    ligaRank();\n    const mais =", "    ligaRank();\n    p.querySelectorAll('.nd-pn-prazo tr[data-nome]').forEach(tr => { tr.onclick = () => filtra({ q: tr.dataset.nome, status: '', lista: true }); });\n    const mais =");
});
edita('public/tema-viaticos.css', (troca, ler, grava) => {
  if (ler().includes('.nd-pn-pz-kpis')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + blocos.CSS_TEMA);
});
console.log('ok');
