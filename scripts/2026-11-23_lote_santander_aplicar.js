// Propósito: liga o lote de pagamento Santander (PIX + boleto) ao ERP: (API) tipo da chave PIX em fornecedor e título, endpoint de geração do lote que marca os títulos como
//   "enviados à tesouraria" e endpoint para desfazer o envio, reembolso de km já nascendo como PIX com a chave do colaborador; (tela) filtros e selo "Enviado à tesouraria", botão
//   "Lote Santander" na exportação e na barra de seleção, campo "Tipo da chave PIX" nos formulários de título e de fornecedor. O formato dos arquivos está em src/lote-santander.js.
//   REQUER a migração supabase/migrations/2026-11-23-lote-bancario-santander.sql aplicada antes de publicar.
// Entrada: api/index.js, public/app.js, public/tema-listas.js, public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-23_lote_santander_aplicar.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, x => { s = x; }); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const BT = '`', CIF = '$';
edita('api/index.js', (troca, get) => {
  if (get().includes('lote-santander')) throw new Error('já aplicado');
  troca("const { query, n } = require('../src/db');", "const { query, n } = require('../src/db');\nconst lote = require('../src/lote-santander');");
  // fornecedor: tipo da chave
  troca("payment_terms, pix_key, status, notes, colaborador_id)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,",
        "payment_terms, pix_key, status, notes, colaborador_id, pix_key_tipo)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,");
  troca("sanitize(b.notes),\n     Number(b.colaborador_id) > 0 ? Number(b.colaborador_id) : null]);\n  res.json({ ok: true, id: rows[0].id });",
        "sanitize(b.notes),\n     Number(b.colaborador_id) > 0 ? Number(b.colaborador_id) : null, pixTipoValido(b.pix_key_tipo)]);\n  res.json({ ok: true, id: rows[0].id });");
  troca("payment_terms=$7, pix_key=$8, status=$9, notes=$10, colaborador_id=$11 WHERE id=$12`,", "payment_terms=$7, pix_key=$8, status=$9, notes=$10, colaborador_id=$11, pix_key_tipo=$13 WHERE id=$12`,");
  troca("b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes), dono, req.params.id]);", "b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes), dono, req.params.id, pixTipoValido(b.pix_key_tipo)]);");
  troca("app.post('/api/suppliers', requireAuth,", "// Tipo da chave PIX: só os cinco que o banco reconhece; vazio = deduzir pelo formato na hora de gerar o lote.\nconst pixTipoValido = v => (lote.TIPOS_CHAVE.includes(String(v || '')) ? String(v) : null);\n\napp.post('/api/suppliers', requireAuth,");
  // título: tipo da chave
  troca("payment_method, pix_key, boleto_line, notes, created_by)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,",
        "payment_method, pix_key, boleto_line, notes, created_by, pix_key_tipo)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,");
  troca("boletoLinhaDigitos(b, pm), sanitize(b.notes), req.user.id]);\n  res.json({ ok: true, id: rows[0].id });", "boletoLinhaDigitos(b, pm), sanitize(b.notes), req.user.id, pm === 'pix' ? pixTipoValido(b.pix_key_tipo) : null]);\n  res.json({ ok: true, id: rows[0].id });");
  troca("payment_method=$8, pix_key=$9, boleto_line=$10, notes=$11 WHERE id=$12`,", "payment_method=$8, pix_key=$9, boleto_line=$10, notes=$11, pix_key_tipo=$13 WHERE id=$12`,");
  troca("boletoLinhaDigitos(b, pm), sanitize(b.notes), req.params.id]);\n  res.json({ ok: true });", "boletoLinhaDigitos(b, pm), sanitize(b.notes), req.params.id, pm === 'pix' ? pixTipoValido(b.pix_key_tipo) : null]);\n  res.json({ ok: true });");
  // endpoints do lote
  troca("// ---- Aprovação compartilhada: um mesmo anexo",
[
"// ---- Lote de pagamento Santander: gera os arquivos de PIX e de boleto dos títulos informados ----",
"// simular=true só confere e devolve contagens e problemas (sem CSV e sem marcar nada). Sem simular, gera os CSV e marca os títulos",
"// incluídos como \"enviados à tesouraria\"; quem não está completo fica de fora e volta na lista de problemas.",
"app.post('/api/payables/lote-santander', requireAuth, requireEdit('pagar'), h(async (req, res) => {",
"  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];",
"  if (!ids.length) return res.status(400).json({ error: 'Nenhum título informado.' });",
"  if (ids.length > 1000) return res.status(400).json({ error: 'Selecione no máximo 1000 títulos por lote.' });",
"  const dp = req.body.data_pagamento ? String(req.body.data_pagamento).slice(0, 10) : '';",
"  if (dp && !isDate(dp)) return res.status(400).json({ error: 'Data de pagamento inválida.' });",
"  const rows = await query(" + BT + "SELECT p.id, p.amount, p.due_date, p.status, p.description, p.payment_method, p.pix_key, p.pix_key_tipo, p.boleto_line, p.enviado_tesouraria_em,",
"      s.name AS supplier_name, s.cnpj AS supplier_doc, s.pix_key AS supplier_pix_key, s.pix_key_tipo AS supplier_pix_key_tipo",
"    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id = p.supplier_id WHERE p.id = ANY($1::int[])" + BT + ", [ids]);",
"  rows.forEach(r => { r.due_date = r.due_date instanceof Date ? r.due_date.toLocaleDateString('en-CA', { timeZone: TZ_BR }) : r.due_date; r.amount = n(r.amount); });",
"  const out = lote.montarLote(rows, { dataPagamento: dp || null, hoje: hojeISO(), reenviar: !!req.body.reenviar });",
"  const resumo = x => ({ qtd: x.qtd, total: x.total });",
"  if (req.body.simular) return res.json({ simular: true, pix: resumo(out.pix), boleto: resumo(out.boleto), problemas: out.problemas, ignorados: out.ignorados });",
"  const incluidos = out.pix.ids.concat(out.boleto.ids);",
"  if (!incluidos.length) return res.status(400).json({ error: 'Nenhum título está completo para entrar no lote. Confira a lista de pendências.' });",
"  await query(" + BT + "UPDATE erp_payables SET enviado_tesouraria_em = now(), enviado_tesouraria_por = $1 WHERE id = ANY($2::int[]) AND status = 'pendente'" + BT + ", [req.user.id, incluidos]);",
"  req.auditAction = " + BT + "Gerou o lote Santander: " + CIF + "{out.pix.qtd} PIX e " + CIF + "{out.boleto.qtd} boleto(s) (títulos " + CIF + "{incluidos.join(', ')}), marcados como enviados à tesouraria" + BT + ";",
"  res.json({ ok: true, pix: { ...resumo(out.pix), csv: out.pix.csv }, boleto: { ...resumo(out.boleto), csv: out.boleto.csv }, problemas: out.problemas, ignorados: out.ignorados });",
"}));",
"",
"// Desfaz a marca de enviado (ex.: o lote não foi para o banco).",
"app.post('/api/payables/:id/desenviar', requireAuth, requireEdit('pagar'), h(async (req, res) => {",
"  await query('UPDATE erp_payables SET enviado_tesouraria_em = NULL, enviado_tesouraria_por = NULL WHERE id = $1', [req.params.id]);",
"  res.json({ ok: true });",
"}));",
"",
"// ---- Aprovação compartilhada: um mesmo anexo"].join('\n'));
  // reembolso de km: nasce como PIX, com a chave cadastrada no colaborador
  troca("const colab = (await query('SELECT name FROM erp_colaboradores WHERE id=$1', [dados.sol.colaborador_id]))[0];", "const colab = (await query('SELECT name, pix_chave FROM erp_colaboradores WHERE id=$1', [dados.sol.colaborador_id]))[0];");
  troca("let forn = (await query('SELECT id FROM erp_suppliers WHERE lower(name)=lower($1) LIMIT 1', [nome]))[0];", "let forn = (await query('SELECT id, cnpj, pix_key FROM erp_suppliers WHERE lower(name)=lower($1) LIMIT 1', [nome]))[0];");
  troca("`INSERT INTO erp_suppliers (name, category, status) VALUES ($1,'Viáticos','ativo') RETURNING id`, [nome]))[0];", "`INSERT INTO erp_suppliers (name, category, status) VALUES ($1,'Viáticos','ativo') RETURNING id, cnpj, pix_key`, [nome]))[0];");
  troca("`INSERT INTO erp_payables (supplier_id, description, category, amount, due_date, status, notes, created_by)\n       VALUES ($1,$2,'Viáticos',$3,$4,'pendente',$5,$6) RETURNING id`,",
        "`INSERT INTO erp_payables (supplier_id, description, category, amount, due_date, status, notes, created_by, payment_method, pix_key, pix_key_tipo)\n       VALUES ($1,$2,'Viáticos',$3,$4,'pendente',$5,$6,$7,$8,$9) RETURNING id`,");
  troca("`${n(dados.km.km_rodado)} km x R$ ${n(dados.km.taxa_km).toFixed(2)}/km — viagem ${dados.km.solicitacao_id}`,\n       req.user.id]);",
        "`${n(dados.km.km_rodado)} km x R$ ${n(dados.km.taxa_km).toFixed(2)}/km — viagem ${dados.km.solicitacao_id}`,\n       req.user.id, chavePix ? 'pix' : null, chavePix || null, chavePix ? lote.pixTipoDeduzir(chavePix, String(forn.cnpj || '').replace(/\\D/g, '')) : null]);");
  troca("    const ot = dados.sol.ordem_trabalho ? ` - OT ${dados.sol.ordem_trabalho}` : '';\n    const vencimento = kmVencimentoReembolso(hojeISO());",
        "    const ot = dados.sol.ordem_trabalho ? ` - OT ${dados.sol.ordem_trabalho}` : '';\n    // A chave PIX é a do cadastro do colaborador; na falta dela, a do fornecedor. Sem nenhuma, o título nasce sem forma e a revisão completa.\n    const chavePix = (colab && String(colab.pix_chave || '').trim()) || String(forn.pix_key || '').trim();\n    const vencimento = kmVencimentoReembolso(hojeISO());");
});
edita('public/app.js', (troca) => {
  // filtros e selo de status
  troca("<option value=\"pendente\" ${saved.status === 'pendente' ? 'selected' : ''}>Pendentes</option>\n        <option value=\"vencido\" ${saved.status === 'vencido' ? 'selected' : ''}>Vencidos</option>\n        <option value=\"pago\" ${saved.status === 'pago' ? 'selected' : ''}>Pagos</option></select>",
        "<option value=\"pendente\" ${saved.status === 'pendente' ? 'selected' : ''}>Pendentes</option>\n        <option value=\"aenviar\" ${saved.status === 'aenviar' ? 'selected' : ''}>A enviar à tesouraria</option>\n        <option value=\"enviado\" ${saved.status === 'enviado' ? 'selected' : ''}>Enviados à tesouraria</option>\n        <option value=\"vencido\" ${saved.status === 'vencido' ? 'selected' : ''}>Vencidos</option>\n        <option value=\"pago\" ${saved.status === 'pago' ? 'selected' : ''}>Pagos</option></select>");
  troca("      if (fs === 'pago' && r.status !== 'pago') return false;\n      if (fs === 'vencido' && !late) return false;",
        "      if (fs === 'pago' && r.status !== 'pago') return false;\n      if (fs === 'enviado' && !(r.status === 'pendente' && r.enviado_tesouraria_em)) return false;\n      if (fs === 'aenviar' && !(r.status === 'pendente' && !r.enviado_tesouraria_em)) return false;\n      if (fs === 'vencido' && !late) return false;");
  troca("            : late ? '<span class=\"badge late\">Vencido</span>' : '<span class=\"badge pend\">Pendente</span>'}</td>\n          <td class=\"c-aprov-cell\">",
        "            : r.enviado_tesouraria_em ? `<span class=\"badge env\" title=\"Enviado à tesouraria em ${brDate(String(r.enviado_tesouraria_em).slice(0, 10))}${late ? ' (vencido)' : ''}\">Enviado à tesouraria</span>`\n            : late ? '<span class=\"badge late\">Vencido</span>' : '<span class=\"badge pend\">Pendente</span>'}</td>\n          <td class=\"c-aprov-cell\">");
  troca("              ? `<button class=\"btn-ic ok\" data-pay=\"${r.id}\" title=\"Dar baixa neste título\" aria-label=\"Dar baixa\">✓</button>`",
        "              ? `<button class=\"btn-ic ok\" data-pay=\"${r.id}\" title=\"Dar baixa neste título\" aria-label=\"Dar baixa\">✓</button>${r.enviado_tesouraria_em ? `<button class=\"btn-ic\" data-desenviar=\"${r.id}\" title=\"Desfazer o envio à tesouraria\" aria-label=\"Desfazer envio\">⎌</button>` : ''}`");
  troca("    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formPagar(rows.find(r => r.id == b.dataset.edit), sups));",
        "    $('#tbl').querySelectorAll('[data-desenviar]').forEach(b => b.onclick = async () => { await api(`/api/payables/${b.dataset.desenviar}/desenviar`, { method: 'POST' }); toast('Envio à tesouraria desfeito.'); renderPagar(); });\n    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formPagar(rows.find(r => r.id == b.dataset.edit), sups));");
  // exportação
  troca("      { label: 'Pacote ZIP (tesouraria)', cls: 'primary', onClick: () => { closeModal(); pagarGerarPacote(lastFiltered); } }",
        "      { label: 'Lote Santander (PIX e boleto)', onClick: () => { closeModal(); pagarLoteSantander(lastFiltered); } },\n      { label: 'Pacote ZIP (tesouraria)', cls: 'primary', onClick: () => { closeModal(); pagarGerarPacote(lastFiltered); } }");
  // formulário de título
  troca("        ${fld('p-pix', 'Chave PIX *', 'text', r.pix_key || '', 'placeholder=\"CPF/CNPJ, e-mail, telefone ou chave aleatória\"')}\n        <small",
        "        ${fld('p-pix', 'Chave PIX *', 'text', r.pix_key || '', 'placeholder=\"CPF/CNPJ, e-mail, telefone ou chave aleatória\"')}\n        ${fldSel('p-pixtipo', 'Tipo da chave PIX', PIX_TIPOS, r.pix_key_tipo || '')}\n        <small");
  troca("pix_key: $('#p-pix').value, boleto_line: $('#p-boleto').value,", "pix_key: $('#p-pix').value, pix_key_tipo: $('#p-pixtipo').value, boleto_line: $('#p-boleto').value,");
  troca("      if (sup && sup.pix_key) $('#p-pix').value = sup.pix_key;\n    }\n  };", "      if (sup && sup.pix_key) { $('#p-pix').value = sup.pix_key; $('#p-pixtipo').value = sup.pix_key_tipo || ''; }\n    }\n  };");
  troca("      $('#p-pix').value = (sup && sup.pix_key) || '';\n    }\n  };", "      $('#p-pix').value = (sup && sup.pix_key) || ''; $('#p-pixtipo').value = (sup && sup.pix_key_tipo) || '';\n    }\n  };");
  // formulário de fornecedor
  troca("    ${fld('s-pix', 'Chave PIX', 'text', r.pix_key || '', 'placeholder=\"CPF/CNPJ, e-mail, telefone ou chave aleatória\"')}\n",
        "    <div class=\"form-row\">\n      ${fld('s-pix', 'Chave PIX', 'text', r.pix_key || '', 'placeholder=\"CPF/CNPJ, e-mail, telefone ou chave aleatória\"')}\n      ${fldSel('s-pixtipo', 'Tipo da chave PIX', PIX_TIPOS, r.pix_key_tipo || '')}\n    </div>\n");
  troca("payment_terms: $('#s-terms').value, pix_key: $('#s-pix').value, status:", "payment_terms: $('#s-terms').value, pix_key: $('#s-pix').value, pix_key_tipo: $('#s-pixtipo').value, status:");
  // tela do lote
  troca("async function pagarGerarPacote(rows) {", fs.readFileSync(path.join(__dirname, '2026-11-23_lote_santander_tela.txt'), 'utf8').replace(/\s+$/, '\n') + "\nasync function pagarGerarPacote(rows) {");
});
edita('public/tema-listas.js', (troca) => {
  troca("'<button data-exp=\"excel\">Excel</button><button data-exp=\"pdf\">PDF</button>'", "'<button data-exp=\"excel\">Excel</button><button data-exp=\"pdf\">PDF</button><button data-exp=\"lote\">Lote Santander</button>'");
  troca("          else exportPagarPDF(sel, 'Seleção manual (' + sel.length + ' título(s))');", "          else if (formato === 'lote') pagarLoteSantander(sel);\n          else exportPagarPDF(sel, 'Seleção manual (' + sel.length + ' título(s))');");
});
edita('public/styles.css', (troca, get, set) => { set(get().replace(/\s+$/, '\n') + '.badge.env { background: color-mix(in srgb, var(--verde-500) 14%, var(--card)); color: var(--verde-700); }\n'); });
console.log('ok');
