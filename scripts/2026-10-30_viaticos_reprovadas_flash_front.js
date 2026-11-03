// Propósito: telas das despesas reprovadas no Flash. (1) O importador do Excel deixa de descartar em silêncio as linhas
//   "Reprovado": mostra numa área própria ("Reprovadas no Flash"), marcadas por padrão, e as registra à parte (não entram no
//   comprovado). Também passa a reconhecer o que JÁ está lançado na solicitação (mesma data e valor) e a não importar de novo —
//   reimportar o mesmo arquivo duplicava as despesas. (2) A tela da solicitação lista as reprovadas, mostra a composição do
//   "A devolver ao Flash" (sobra + reprovadas) e avisa da pendência a descontar. (3) O aviso da próxima OT diz de onde vem
//   cada pendência ("despesa reprovada no Flash").
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: public/app.js editado.
// Uso: node scripts/2026-10-30_viaticos_reprovadas_flash_front.js [raiz]   (depois do backend: 2026-10-30_viaticos_reprovadas_flash_api.js)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80));
  s = s.replace(de, () => para);
};

// ---- Aviso da próxima OT: origem de cada pendência ----
troca("${x.origem === 'excesso' ? 'excesso reprovado' : 'gasto acima do liberado'}", '${VIA_ORIGEM_PEND[x.origem] || \'pendência\'}');

// ---- Leitura do Excel: reprovadas ----
troca("const FLASH_STATUS_OK = ['finaliz', 'aprovad', 'aprobad', 'conclu', 'complet', 'pago', 'pagad'];",
  "const FLASH_STATUS_OK = ['finaliz', 'aprovad', 'aprobad', 'conclu', 'complet', 'pago', 'pagad'];\n" +
  "// Linha REPROVADA no Flash: o colaborador usou o valor, mas a despesa não foi aceita. Não entra no comprovado (e portanto já conta\n" +
  "// no \"a devolver ao Flash\"); é registrada à parte para virar pendência a descontar na próxima OT dele.\n" +
  "const FLASH_STATUS_REPROVADA = ['reprov', 'reprob', 'rechaz', 'rejeit', 'negad', 'recus', 'denegad'];\n" +
  "// Identifica a linha pela data e pelo valor, para reconhecer o que já está lançado na solicitação.\n" +
  "const flashChaveLinha = (data, valor) => `${String(data).slice(0, 10)}|${Number(valor).toFixed(2)}`;\n" +
  "// Hash do CONTEÚDO do arquivo (renomear a planilha não libera uma reimportação): identifica a origem das reprovadas.\n" +
  "async function flashHashArquivo(file) {\n" +
  "  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());\n" +
  "  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');\n" +
  "}");

troca("  const out = [];\n  for (let i = headerIdx + 1; i < rows.length; i++) {",
  "  const out = [];\n  const reprovadas = [];\n  for (let i = headerIdx + 1; i < rows.length; i++) {");

troca("      if (st && !FLASH_STATUS_OK.some(k => st.includes(k))) {\n        diag.descartes.status++;",
  "      if (st && !FLASH_STATUS_OK.some(k => st.includes(k))) {\n" +
  "        if (FLASH_STATUS_REPROVADA.some(k => st.includes(k))) {\n" +
  "          const dR = flashParseData(row[col.data]), vR = flashParseValor(row[col.valor]), mR = String(row[col.mov] ?? '').trim();\n" +
  "          if (dR && vR !== null && vR > 0 && mR) {\n" +
  "            const cR = mR.split(/\\s+/).pop() || '';\n" +
  "            reprovadas.push({ data: dR, valor: vR, descricao: mR, pessoa: col.pessoa > -1 ? String(row[col.pessoa] ?? '').trim() : '',\n" +
  "              categoria: FLASH_CONCEITO_MAP[normalizeTxt(cR)] || '', linha: i });\n" +
  "          }\n" +
  "          continue;\n" +
  "        }\n" +
  "        diag.descartes.status++;");

troca("  return { linhas: out, diag };\n}", "  return { linhas: out, reprovadas, diag };\n}");

// ---- Janela de importação ----
troca("  let avisos = [];\n  let diag = null; // preenchido pelo parse; explica na tela quando nada entra",
  "  let avisos = [];\n  let reprovadas = []; // linhas \"Reprovado\" do Flash: registradas à parte, não entram no comprovado\n" +
  "  let loteReprovadas = null; // hash do arquivo: reimportar o mesmo arquivo não duplica as reprovadas\n" +
  "  let diag = null; // preenchido pelo parse; explica na tela quando nada entra");

troca("    if (!rows.length) { box.innerHTML = avisosHtml + flashDiagnosticoHtml(diag); return; }\n    const prontos = rows.filter(r => r.categoria).length;\n    const pendentes = rows.length - prontos;",
  "    if (!rows.length && !reprovadas.length) { box.innerHTML = avisosHtml + flashDiagnosticoHtml(diag); return; }\n" +
  "    // O que já está lançado na solicitação (mesma data e valor) não é importado de novo.\n" +
  "    const novas = rows.filter(r => !r.jaLancada);\n" +
  "    const prontos = novas.filter(r => r.categoria).length;\n    const pendentes = novas.length - prontos;\n" +
  "    const jaN = rows.length - novas.length;\n" +
  "    const totalRepr = reprovadas.reduce((t, r) => t + r.valor, 0);\n" +
  "    const reprHtml = reprovadas.length ? `\n" +
  "      <div class=\"alert-item late\" style=\"margin:18px 0 8px\">🚫 <strong>${reprovadas.length} despesa(s) reprovada(s) no Flash — ${brl(totalRepr)}</strong>\n" +
  "        <div style=\"font-size:12.5px; margin-top:4px\">Não entram no comprovado. O colaborador usou o valor: ele conta como devolvido ao Flash e será registrado como\n" +
  "        <strong>pendência a descontar na próxima OT</strong> dele.</div></div>\n" +
  "      <div class=\"table-wrap\"><table class=\"tbl-flash\">\n" +
  "        <thead><tr><th>Data</th><th>Descrição</th><th class=\"num\">Valor</th><th class=\"c-inc\">Registrar</th></tr></thead>\n" +
  "        <tbody>${reprovadas.map((r, i) => `<tr><td>${brDate(r.data)}</td><td>${esc(r.descricao)}</td><td class=\"num\">${brl(r.valor)}</td>\n" +
  "          <td class=\"c-inc\"><input type=\"checkbox\" class=\"fl-repr\" data-idx=\"${i}\" checked></td></tr>`).join('')}</tbody>\n" +
  "      </table></div>` : '';");

troca("lançamento(s) prontos para importar${pendentes ?",
  "lançamento(s) prontos para importar${jaN ? ` · ${jaN} já lançado(s) antes (mesma data e valor) — não serão importados de novo` : ''}${pendentes ?");

troca("<td>${esc(r.descricao)}${!r.categoria ? `<small class=\"fl-aviso\">Conceito \"${esc(r.conceitoOriginal)}\" não reconhecido</small>` : ''}</td>",
  "<td>${esc(r.descricao)}${r.jaLancada ? '<small class=\"fl-aviso\">já lançada nesta solicitação — desmarcada para não duplicar</small>' : ''}${!r.categoria ? `<small class=\"fl-aviso\">Conceito \"${esc(r.conceitoOriginal)}\" não reconhecido</small>` : ''}</td>");

troca("<input type=\"checkbox\" class=\"fl-inc\" data-idx=\"${i}\" ${r.categoria ? 'checked' : ''}>",
  "<input type=\"checkbox\" class=\"fl-inc\" data-idx=\"${i}\" ${r.categoria && !r.jaLancada ? 'checked' : ''}>");

troca("      <button class=\"btn primary\" id=\"fl-confirm\" type=\"button\" style=\"margin-top:14px\">Confirmar importação</button>`;",
  "      ${reprHtml}\n      <button class=\"btn primary\" id=\"fl-confirm\" type=\"button\" style=\"margin-top:14px\">Confirmar importação</button>`;");

troca("      const selecionados = rows.filter((r, i) => box.querySelector(`.fl-inc[data-idx=\"${i}\"]`).checked && r.categoria);\n      if (!selecionados.length) { liberar(); return toast('Nenhum lançamento selecionado.'); }",
  "      const selecionados = rows.filter((r, i) => box.querySelector(`.fl-inc[data-idx=\"${i}\"]`).checked && r.categoria);\n" +
  "      const reprSel = reprovadas.filter((r, i) => { const c = box.querySelector(`.fl-repr[data-idx=\"${i}\"]`); return c && c.checked; });\n" +
  "      if (!selecionados.length && !reprSel.length) { liberar(); return toast('Nenhum lançamento selecionado.'); }");

troca("      toast(`${ok} de ${selecionados.length} lançamento(s) importado(s).`);\n      viewSolicitacao(s.id);",
  "      // Reprovadas do Flash: registradas à parte (reimportar o mesmo arquivo não duplica).\n" +
  "      let reprRegistradas = 0, reprJaExistiam = 0;\n" +
  "      const reprErros = [];\n" +
  "      for (const r of reprSel) {\n" +
  "        try {\n" +
  "          const resp = await api(`/api/viaticos/solicitacoes/${s.id}/reprovadas`, { method: 'POST',\n" +
  "            body: { data: r.data, valor: r.valor, descricao: r.descricao, categoria: r.categoria, import_batch: loteReprovadas, import_linha: r.linha } });\n" +
  "          if (resp && resp.duplicada) reprJaExistiam++; else reprRegistradas++;\n" +
  "        } catch (e) { reprErros.push(`${brDate(r.data)} ${brl(r.valor)}: ${e.message}`); }\n" +
  "      }\n" +
  "      const partes = selecionados.length ? [`${ok} de ${selecionados.length} lançamento(s) importado(s)`] : [];\n" +
  "      if (reprRegistradas) partes.push(`${reprRegistradas} reprovada(s) registrada(s) para desconto`);\n" +
  "      if (reprJaExistiam) partes.push(`${reprJaExistiam} reprovada(s) já registrada(s) antes`);\n" +
  "      if (reprErros.length) partes.push(`${reprErros.length} reprovada(s) com erro (${reprErros.join('; ')})`);\n" +
  "      toast(partes.join(' · ') + '.');\n" +
  "      viewSolicitacao(s.id);");

troca("      rows = parsed.linhas; diag = parsed.diag;",
  "      rows = parsed.linhas; reprovadas = parsed.reprovadas || []; diag = parsed.diag;\n" +
  "      loteReprovadas = await flashHashArquivo(file);\n" +
  "      // Reimportar o mesmo arquivo duplicava as despesas: o que já está lançado (mesma data e valor) é reconhecido e fica de fora.\n" +
  "      try {\n" +
  "        const jaLancadas = await api(`/api/viaticos/solicitacoes/${s.id}/despesas`);\n" +
  "        const pool = {};\n" +
  "        jaLancadas.forEach(d => { const k = flashChaveLinha(d.data, d.valor); pool[k] = (pool[k] || 0) + 1; });\n" +
  "        rows.forEach(r => { const k = flashChaveLinha(r.data, r.valor); if (pool[k] > 0) { pool[k]--; r.jaLancada = true; } });\n" +
  "      } catch { /* sem a conferência, segue como antes */ }");

troca("      rows = []; diag = e.diag || null;", "      rows = []; reprovadas = []; diag = e.diag || null;");

// ---- Tela da solicitação ----
troca("async function viewSolicitacao(id) {\n  const [s, despesas, tud, km] = await Promise.all([",
  "// De onde vem cada pendência a descontar na próxima OT (o servidor diz a origem).\n" +
  "const VIA_ORIGEM_PEND = { estouro: 'gasto acima do liberado', excesso: 'excesso reprovado', flash: 'despesa reprovada no Flash',\n" +
  "  'excesso+flash': 'excesso e despesa reprovada no Flash', 'estouro+flash': 'gasto acima do liberado e despesa reprovada no Flash' };\n\n" +
  "async function viewSolicitacao(id) {\n  const [s, despesas, tud, km, reprovadasFlash] = await Promise.all([");

troca("    api(`/api/viaticos/km?solicitacao_id=${id}`).catch(() => ({ registros: [], taxa_vigente: 0.70 }))\n  ]);",
  "    api(`/api/viaticos/km?solicitacao_id=${id}`).catch(() => ({ registros: [], taxa_vigente: 0.70 })),\n" +
  "    // Despesas reprovadas no Flash: seção a mais, não pode derrubar a tela.\n" +
  "    api(`/api/viaticos/solicitacoes/${id}/reprovadas`).catch(() => [])\n  ]);");

troca("  const dif = s.valor_liberado - comprovado;\n\n  // Validações: período autorizado",
  "  const dif = s.valor_liberado - comprovado;\n" +
  "  // Reprovadas no Flash: ficam FORA do comprovado, então já estão dentro do \"a devolver ao Flash\" (liberado − comprovado); aqui\n" +
  "  // a tela só mostra a composição e lista as linhas.\n" +
  "  const totRepr = reprovadasFlash.reduce((t, r) => t + Number(r.valor || 0), 0);\n" +
  "  const detalheDevolvido = totRepr > 0 && dif - totRepr > -0.005\n" +
  "    ? `<div style=\"font-size:11.5px; color:var(--muted)\">sobra ${brl(Math.max(0, dif - totRepr))} + reprovadas ${brl(totRepr)}</div>` : '';\n" +
  "  const reprovadasHtml = reprovadasFlash.length ? `\n" +
  "    <h4 style=\"margin:18px 0 6px\">Despesas reprovadas no Flash <span class=\"badge late\">${brl(totRepr)}</span></h4>\n" +
  "    <p class=\"hint\" style=\"margin:0 0 8px\">Não entram no comprovado: o colaborador usou o valor, que conta como devolvido ao Flash e é descontado na próxima OT dele.\n" +
  "      ${finalizada && !s.pendencia_resolvida && Number(s.valor_pendencia) > 0 ? `<strong>Pendência a descontar na próxima OT: ${brl(s.valor_pendencia)}.</strong>` : ''}</p>\n" +
  "    <div class=\"table-wrap\"><table>\n" +
  "      <thead><tr><th>Data</th><th>Descrição</th><th class=\"num\">Valor</th><th class=\"actions\"></th></tr></thead>\n" +
  "      <tbody>${reprovadasFlash.map(r => `<tr><td>${brDate(r.data)}</td><td>${esc(r.descricao || '—')}</td><td class=\"num\">${brl(r.valor)}</td>\n" +
  "        <td class=\"actions\">${somenteLeitura ? '' : `<button class=\"btn sm danger-ghost\" data-delrepr=\"${r.id}\" type=\"button\">Excluir</button>`}</td></tr>`).join('')}</tbody>\n" +
  "    </table></div>` : '';\n\n  // Validações: período autorizado");

troca("        <div class=\"value ${dif < 0 ? 'neg' : 'pos'}\">${brl(Math.abs(dif))}</div></div>",
  "        <div class=\"value ${dif < 0 ? 'neg' : 'pos'}\">${brl(Math.abs(dif))}</div>${detalheDevolvido}</div>");

troca("    </table></div>`;\n\n  const botoes = [{ label: 'Fechar', onClick: closeModal }];",
  "    </table></div>${reprovadasHtml}`;\n\n  const botoes = [{ label: 'Fechar', onClick: closeModal }];");

troca("  // ---- quilometragem ----\n  const voltar = () => viewSolicitacao(id);",
  "  document.querySelectorAll('[data-delrepr]').forEach(b => b.onclick = async () => {\n" +
  "    if (!confirm('Excluir este registro de despesa reprovada? A pendência da viagem é recalculada.')) return;\n" +
  "    try { await api('/api/viaticos/reprovadas/' + b.dataset.delrepr, { method: 'DELETE' }); toast('Registro excluído.'); viewSolicitacao(id); }\n" +
  "    catch (e) { toast(e.message); }\n" +
  "  });\n\n" +
  "  // ---- quilometragem ----\n  const voltar = () => viewSolicitacao(id);");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
