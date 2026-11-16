// Propósito: Suprimentos > aba Compras: coluna Ações com ✎ Editar e 🗑 Excluir em cada compra (padrão .btn-ic), reaproveitando as janelas com justificativa obrigatória do histórico do item.
//   A edição de compra também altera Fornecedor e Documento/NF (além de quantidade, custo, data, observação e tamanho). Compra que gerou título ainda existente em Contas a Pagar fica com os
//   botões desabilitados (o servidor também barra). Depois de editar ou excluir uma compra, o "preço da última compra" do item passa a ser o da compra mais recente que sobrou (sem apagar o
//   preço do cadastro se não sobrar nenhuma) e o CMP é recalculado pelo histórico, como já era.
// Entrada: api/index.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-16_suprimentos_compras_editar_excluir.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s);
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}

edita('api/index.js', (troca, get) => {
  if (get().includes('atualizaPrecoUltimaCompra')) throw new Error('api já aplicado');
  troca("async function carregaLancamentoEditavel(id) {",
    "// Depois de corrigir ou apagar uma compra: o preço da última compra do item passa a ser o da compra mais recente que restou (sem apagar o preço do cadastro se não restar nenhuma).\nasync function atualizaPrecoUltimaCompra(itemId) {\n  await query(\"UPDATE erp_estoque_itens SET preco_ultima_compra = COALESCE((SELECT custo_unitario FROM erp_estoque_movimentos WHERE item_id=$1 AND origem='compra' ORDER BY data DESC, id DESC LIMIT 1), preco_ultima_compra) WHERE id=$1\", [itemId]);\n}\nasync function carregaLancamentoEditavel(id) {");
  // fornecedor e documento: valida antes de gravar qualquer coisa
  troca("  const trilha = `[Editado em ${brDateBR(hojeISO())} por ${req.user.name}: ${motivo}]`;",
    "  let fornecedor = mov.supplier_id == null ? null : mov.supplier_id, documento = mov.documento == null ? null : mov.documento;\n  if (mov.origem === 'compra') {\n    if (b.supplier_id !== undefined) {\n      fornecedor = (b.supplier_id === '' || b.supplier_id == null) ? null : Number(b.supplier_id);\n      if (fornecedor != null && !(await query('SELECT id FROM erp_suppliers WHERE id=$1', [fornecedor])).length) return res.status(400).json({ error: 'Fornecedor inválido.' });\n    }\n    if (b.documento !== undefined) documento = sanitize(b.documento) || null;\n  }\n  const trilha = `[Editado em ${brDateBR(hojeISO())} por ${req.user.name}: ${motivo}]`;");
  troca("  const cmp = await recalcularCmpItem(item.id);\n  res.json({ ok: true, custo_medio: cmp });",
    "  if (mov.origem === 'compra') {\n    await query('UPDATE erp_estoque_movimentos SET documento=$1, supplier_id=$2 WHERE id=$3', [documento, fornecedor, mov.id]);\n    await atualizaPrecoUltimaCompra(item.id);\n  }\n  const cmp = await recalcularCmpItem(item.id);\n  res.json({ ok: true, custo_medio: cmp });");
  troca("  const cmp = await recalcularCmpItem(item.id);\n  res.json({ ok: true, custo_medio: cmp, resumo });",
    "  if (mov.origem === 'compra') await atualizaPrecoUltimaCompra(item.id);\n  const cmp = await recalcularCmpItem(item.id);\n  res.json({ ok: true, custo_medio: cmp, resumo });");
});

edita('public/app.js', (troca, get) => {
  if (get().includes('data-cpedit')) throw new Error('front já aplicado');
  // janela de edição: fornecedor e NF quando é compra
  troca("function supEditarLancamento(i, m, depois) {", "function supEditarLancamento(i, m, depois, forn) {");
  troca("    ${entrada && m.origem === 'ajuste' ? '<p class=\"hint\" style=\"margin-top:-4px\">Custo em branco",
    "    ${m.origem === 'compra' ? `<div class=\"form-row\">${fldSel('lc-forn', 'Fornecedor', [{ v: '', t: '—' }, ...(forn || []).filter(s => s.status === 'ativo' || s.id === m.supplier_id).map(s => ({ v: s.id, t: s.name }))], m.supplier_id || '')}${fld('lc-doc', 'Documento / NF', 'text', m.documento || '')}</div>` : ''}\n    ${entrada && m.origem === 'ajuste' ? '<p class=\"hint\" style=\"margin-top:-4px\">Custo em branco");
  troca("tamanho: $('#lc-tam') ? $('#lc-tam').value : undefined } });", "tamanho: $('#lc-tam') ? $('#lc-tam').value : undefined,\n            documento: $('#lc-doc') ? $('#lc-doc').value : undefined, supplier_id: $('#lc-forn') ? $('#lc-forn').value : undefined } });");
  // aba Compras
  troca("<th>Documento</th><th>Financeiro</th></tr></thead>", "<th>Documento</th><th>Financeiro</th>${edit ? '<th class=\"actions\">Ações</th>' : ''}</tr></thead>");
  troca("        <td>${m.payable_id ? '<span class=\"badge ok\">Em Contas a Pagar</span>' : '<span class=\"badge off\">—</span>'}</td>\n      </tr>`).join('') || '<tr><td colspan=\"7\"><div class=\"empty\">Nenhuma compra registrada ainda.</div></td></tr>'}</tbody>",
    "        <td>${m.payable_id ? '<span class=\"badge ok\">Em Contas a Pagar</span>' : '<span class=\"badge off\">—</span>'}</td>\n        ${edit ? `<td class=\"actions sup-acoes\"><button class=\"btn-ic\" data-cpedit=\"${m.id}\" ${m.payable_id ? 'disabled' : ''} title=\"${m.payable_id ? 'Compra lançada em Contas a Pagar (#' + m.payable_id + '): resolva o título antes de corrigir' : 'Editar esta compra (pede a justificativa)'}\" aria-label=\"Editar compra\">✎</button><button class=\"btn-ic exc\" data-cpdel=\"${m.id}\" ${m.payable_id ? 'disabled' : ''} title=\"${m.payable_id ? 'Compra lançada em Contas a Pagar (#' + m.payable_id + '): resolva o título antes de corrigir' : 'Excluir esta compra (pede a justificativa)'}\" aria-label=\"Excluir compra\">🗑</button></td>` : ''}\n      </tr>`).join('') || `<tr><td colspan=\"${edit ? 9 : 8}\"><div class=\"empty\">Nenhuma compra registrada ainda.</div></td></tr>`}</tbody>");
  troca("  if (edit) $('#sup-new-compra').onclick = () => supFormCompra(itens, fornecedores);\n}",
    "  if (edit) $('#sup-new-compra').onclick = () => supFormCompra(itens, fornecedores);\n  const itemDe = m => itens.find(x => x.id === m.item_id) || { id: m.item_id, nome: m.item_nome, unidade: m.unidade, grade_tamanhos: m.item_grade };\n  const depois = () => { closeModal(); renderSuprimentos(); };\n  panel.querySelectorAll('[data-cpedit]').forEach(b => b.onclick = () => { const m = movs.find(x => x.id == b.dataset.cpedit); supEditarLancamento(itemDe(m), m, depois, fornecedores); });\n  panel.querySelectorAll('[data-cpdel]').forEach(b => b.onclick = () => { const m = movs.find(x => x.id == b.dataset.cpdel); supExcluirLancamento(itemDe(m), m, depois); });\n}");
});
console.log('ok');
