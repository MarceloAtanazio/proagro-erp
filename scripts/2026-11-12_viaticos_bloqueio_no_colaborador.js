// Propósito: corrige o bloqueio do prazo de comprovação de Viáticos. A comprovação é feita pela equipe (a partir do Flash) e NUNCA deve travar.
//   O que fica bloqueado é o COLABORADOR com comprovação vencida (3 dias úteis) e sem liberação do administrador: não pode fazer nova solicitação (autosserviço) e
//   não se registra novo repasse (transferência/valor liberado) para ele, até regularizar. O administrador libera com justificativa (botão 🔓).
//   Remove o bloqueio de lançar/editar/apagar despesas, reprovadas e fechar; a tela de comprovação volta a abrir normal, com faixa de aviso.
// Entrada: api/index.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_bloqueio_no_colaborador.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  const entre = (ini, fim, para) => { const i = s.indexOf(ini), j = s.indexOf(fim, i); if (i < 0 || j < 0) throw new Error(rel + ': marcador não achado: ' + ini.slice(0, 60)); s = s.slice(0, i) + para + s.slice(j); };
  fn(troca, entre); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
const NOVO_HELPER = `// Bloqueio do COLABORADOR (não da comprovação): com comprovação sua vencida (3 dias úteis) e sem liberação do administrador, ele não pode fazer nova solicitação
// e não se registra novo repasse para ele, até regularizar. A comprovação em si NUNCA trava: é feita pela equipe a partir do Flash. \`ignorarRaiz\` = a própria
// família (complementar / custo extra da OT atrasada não deve ser barrado por ela mesma).
async function bloqueioDoColaborador(colabId, ignorarRaiz) {
  const rows = await query(\`\${FAMILIA_CTE},
    fim AS (SELECT f.raiz_id, MAX(m.data_fim) AS fim FROM fam f JOIN erp_viaticos_solicitacoes m ON m.id = f.id WHERE m.status NOT IN ('cancelada','em_approvals') GROUP BY f.raiz_id)
    SELECT r.id, r.ordem_trabalho, fi.fim FROM erp_viaticos_solicitacoes r JOIN fim fi ON fi.raiz_id = r.id
     WHERE r.colaborador_id = $1 AND r.status = 'aguardando_comprovacao' AND r.comprovacao_liberada_em IS NULL\`, [colabId]);
  const hoje = hojeISO();
  const venc = rows.filter(r => r.id !== Number(ignorarRaiz)).map(r => ({ ot: r.ordem_trabalho || r.id, prazo: somaDiasUteis(r.fim, PRAZO_COMPROVACAO_DIAS_UTEIS) })).filter(r => r.prazo < hoje).sort((a, b) => a.prazo.localeCompare(b.prazo));
  return venc.length ? venc[0] : null;
}
async function respondeSeColaboradorBloqueado(colabId, res, acao, ignorarRaiz) {
  const b = await bloqueioDoColaborador(colabId, ignorarRaiz);
  if (!b) return false;
  const [y, m, d] = b.prazo.split('-');
  res.status(423).json({ error: \`Há comprovação em atraso (OT \${b.ot}, o prazo venceu em \${d}/\${m}/\${y}). Enquanto ela não for regularizada, não é possível \${acao}. Um administrador pode liberar com justificativa.\` });
  return true;
}

`;
edita('api/index.js', (troca, entre) => {
  entre('// Bloqueio no servidor: com a comprovação vencida', '// ---- Despesas reprovadas no Flash ----', NOVO_HELPER);
  troca("  if (await respondeSeBloqueada(req.params.id, res)) return;\n  const b = req.body;\n", "  const b = req.body;\n");
  troca("  if (await respondeSeBloqueadaDespesa(req.params.id, res)) return;\n  const b = req.body;\n", "  const b = req.body;\n");
  troca("  if (await respondeSeBloqueadaDespesa(req.params.id, res)) return;\n  await query('DELETE FROM erp_viaticos_despesas WHERE id=$1'", "  await query('DELETE FROM erp_viaticos_despesas WHERE id=$1'");
  troca("  if (await respondeSeBloqueada(req.params.id, res)) return;\n  const apagadas", "  const apagadas");
  troca("  if (await respondeSeBloqueada(req.params.id, res)) return;\n  const b = req.body || {};", "  const b = req.body || {};");
  troca("  if (await respondeSeBloqueada(rid, res)) return;\n", "");
  troca("function anexarPrazoComprovacao(rows, hoje) {\n", "function anexarPrazoComprovacao(rows, hoje) {\n  const res = anexarPrazoBase(rows, hoje), bloq = {};\n  res.forEach(r => { if (r.comprov_bloqueada && (r.familia_raiz_id || r.id) === r.id) (bloq[r.colaborador_id] = bloq[r.colaborador_id] || []).push(r.ordem_trabalho || r.id); });\n  return res.map(r => ({ ...r, colab_bloqueios: bloq[r.colaborador_id] || [] }));\n}\nfunction anexarPrazoBase(rows, hoje) {\n");
  troca("  const colab = colabRows[0];\n  const b = req.body;\n  // OT complementar: parte de", "  const colab = colabRows[0];\n  const b = req.body;\n  { const paiRaiz = b.solicitacao_pai_id != null && b.solicitacao_pai_id !== '' ? await raizFamilia(b.solicitacao_pai_id) : null;\n    if (await respondeSeColaboradorBloqueado(colab.id, res, 'fazer uma nova solicitação', paiRaiz)) return; }\n  // OT complementar: parte de");
  troca("    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);",
    "    { const dono0 = (await query('SELECT colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];\n      if (dono0 && lib > 0 && await respondeSeColaboradorBloqueado(dono0.colaborador_id, res, 'registrar o repasse (transferência)', await raizFamilia(req.params.id))) return; }\n    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);");
  troca("return res.status(400).json({ error: OT_MSG }); }\n  const ins = await query(`INSERT INTO erp_viaticos_solicitacoes\n    (colaborador_id, tier, categoria_local, ordem_trabalho, destinos,", "return res.status(400).json({ error: OT_MSG }); }\n  if (Number(b.valor_liberado) > 0 && await respondeSeColaboradorBloqueado(b.colaborador_id, res, 'registrar o repasse', null)) return;\n  const ins = await query(`INSERT INTO erp_viaticos_solicitacoes\n    (colaborador_id, tier, categoria_local, ordem_trabalho, destinos,");
  troca("  // Decidir sobre a pendência é liberar (ou abrir mão de) valor: só administrador, e só antes da transferência.\n  const querDecidir", "  { const at = (await query('SELECT colaborador_id, valor_liberado FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];\n    if (at && Number(b.valor_liberado) > n(at.valor_liberado) + 0.005 && await respondeSeColaboradorBloqueado(at.colaborador_id, res, 'registrar o repasse', await raizFamilia(req.params.id))) return; }\n  // Decidir sobre a pendência é liberar (ou abrir mão de) valor: só administrador, e só antes da transferência.\n  const querDecidir");
});
edita('public/app.js', (troca, entre) => {
  troca("sub: s.comprov_bloqueada ? '🔒 bloqueada até a liberação'", "sub: s.comprov_bloqueada ? '🔒 sem nova solicitação nem repasse'");
  troca("${fechada ? 'Ver' : s.comprov_bloqueada ? 'Comprovação bloqueada por atraso: abrir' : 'Comprovar'}", "${fechada ? 'Ver' : 'Comprovar'}");
  troca("${fechada ? '👁' : s.comprov_bloqueada ? '🔒' : '✓'}", "${fechada ? '👁' : '✓'}");
  troca("'Liberar a comprovação em atraso (pede a justificativa)' : 'Só o administrador pode liberar uma comprovação em atraso'", "'Liberar o colaborador apesar do atraso (pede a justificativa): ele volta a poder solicitar e receber repasse' : 'Só o administrador pode liberar o bloqueio por comprovação em atraso'");
  entre("    <p style=\"font-size:13.5px; color:var(--ink-2); margin:0 0 10px\">A comprovação da OT", "    <div class=\"field\"><label for=\"lb-motivo\">", "    <p style=\"font-size:13.5px; color:var(--ink-2); margin:0 0 10px\">A comprovação da OT <strong>${esc(s.ordem_trabalho || s.id)}</strong> venceu em <strong>${brDate(s.comprov_prazo)}</strong>\n      (${s.comprov_atraso} dia${s.comprov_atraso > 1 ? 's' : ''} de atraso). Enquanto não for regularizada, <strong>${esc(s.colaborador_name)}</strong> não pode fazer nova solicitação e novos repasses ficam bloqueados.\n      Ao liberar, ele volta a poder solicitar e receber repasse. O lançamento da comprovação nunca é bloqueado; o atraso continua nos indicadores e a justificativa fica registrada.</p>\n");
  troca("openModal(`Liberar comprovação — ${esc(s.colaborador_name)}`", "openModal(`Liberar bloqueio — ${esc(s.colaborador_name)}`");
  troca("{ label: 'Liberar comprovação', cls: 'primary', onClick: async (ev) => {", "{ label: 'Liberar bloqueio', cls: 'primary', onClick: async (ev) => {");
  troca("btn.textContent = 'Liberar comprovação'; } }", "btn.textContent = 'Liberar bloqueio'; } }");
  troca("closeModal(); toast('Comprovação liberada.');", "closeModal(); toast('Bloqueio liberado.');");
  troca('aria-label="Liberar comprovação"', 'aria-label="Liberar bloqueio"');
  troca("  const somenteLeitura = READONLY || bloqueada;\n", "  const somenteLeitura = READONLY;\n");
  troca("${bloqueada ? 'Comprovação bloqueada' : somenteLeitura ? 'Detalhes da viagem'", "${somenteLeitura ? 'Detalhes da viagem'");
  entre("    ? `<div class=\"alert-item late\" style=\"margin-bottom:14px\">🔒 <strong>Comprovação bloqueada por atraso.</strong>", "\n    : prazoInfo ?", "    ? `<div class=\"alert-item late\" style=\"margin-bottom:14px\">⚠️ <strong>Comprovação em atraso.</strong> O prazo (3 dias úteis após o fim da viagem) venceu em <strong>${brDate(s.comprov_prazo)}</strong> — ${s.comprov_atraso} dia${s.comprov_atraso > 1 ? 's' : ''} de atraso. Você pode lançar e fechar a comprovação normalmente; enquanto ela não for regularizada, o colaborador não pode fazer nova solicitação e novos repasses ficam bloqueados.${USER.role === 'admin' ? ' Se houver justificativa, use <strong>Liberar bloqueio</strong> (abaixo).' : ''}</div>`");
  troca("  if (bloqueada) {\n    if (USER.role === 'admin' && !READONLY) botoes.push({ label: 'Liberar comprovação', cls: 'primary', onClick: () => { closeModal(); viaLiberarComprovacaoModal(s, () => viewSolicitacao(id)); } });\n  } else if (somenteLeitura) {",
    "  if (bloqueada && USER.role === 'admin' && !READONLY) botoes.push({ label: 'Liberar bloqueio', onClick: () => { closeModal(); viaLiberarComprovacaoModal(s, () => viewSolicitacao(id)); } });\n  if (somenteLeitura) {");
  troca("if ($('#btn-solicitar-viagem')) $('#btn-solicitar-viagem').onclick = () => renderSolicitacaoAutosservico();",
    "if ($('#btn-solicitar-viagem')) $('#btn-solicitar-viagem').onclick = () => {\n    const atras = meuColaborador ? sols.filter(x => x.colaborador_id === meuColaborador.id && viaRaizDe(x) === x.id && x.comprov_bloqueada) : [];\n    if (atras.length) return toast(`Você tem comprovação em atraso (OT ${atras[0].ordem_trabalho || atras[0].id}). Enquanto não for regularizada, não é possível fazer nova solicitação. Fale com o administrador.`);\n    renderSolicitacaoAutosservico();\n  };");
  troca("  const kpis = `<div class=\"grid kpis\" style=\"margin-bottom:12px\">", "  const avisoBloq = (s.colab_bloqueios || []).length ? `<div class=\"alert-item late\" style=\"margin-bottom:12px\">🔒 <strong>Repasse bloqueado:</strong> ${esc(s.colaborador_name)} tem comprovação em atraso (OT ${esc(s.colab_bloqueios.join(', '))}). Regularize a comprovação, ou um administrador pode liberar o bloqueio com justificativa (🔓 na lista).</div>` : '';\n  const kpis = avisoBloq + `<div class=\"grid kpis\" style=\"margin-bottom:12px\">");
});
console.log('ok');
