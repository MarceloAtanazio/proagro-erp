// Propósito: Suprimentos > Estoque: (1) botão Excluir item com justificativa obrigatória; (2) ações da linha em ícones (padrão .btn-ic das outras páginas: Ficha em verde cheio,
//   Excluir em vermelho afastado, rótulo no title/aria-label); (3) itens inativos/excluídos ficam escondidos por padrão, com a caixa "Mostrar inativos e excluídos".
//   Regra da exclusão (POST /api/suprimentos/itens/:id/excluir, sem migração): barra se houver equipamento em custódia; item sem nenhuma movimentação/unidade é apagado de vez;
//   item com histórico é INATIVADO (o histórico e as movimentações são preservados): o saldo restante vira uma saída de ajuste "Exclusão do item: <motivo>", as unidades em estoque
//   ficam "baixadas" e a justificativa é gravada no início das observações do item ("[Excluído em dd/mm/aaaa por Fulano] motivo") e no histórico de auditoria.
// Entrada: api/index.js, public/app.js, public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-16_suprimentos_excluir_item_acoes.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  s = fn(s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const troca = (s, de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 70)); return s.replace(de, () => para); };

edita('api/index.js', s => {
  if (s.includes('itens/:id/excluir')) throw new Error('api já aplicado');
  s = troca(s, "  'DELETE /api/suprimentos/itens/:id':",
    "  'POST /api/suprimentos/itens/:id/excluir': req => `Excluiu o item de estoque ID ${req.params.id} — justificativa: \"${String(req.body && req.body.motivo || '').slice(0, 200)}\"`,\n  'DELETE /api/suprimentos/itens/:id':");
  const ep = `// Excluir item com justificativa. Sem movimentação nem unidade: apaga de vez. Com histórico: inativa e preserva tudo (o saldo restante sai por ajuste, as
// unidades em estoque são baixadas e a justificativa fica nas observações do item e na auditoria). Equipamento em custódia com colaborador barra.
app.post('/api/suprimentos/itens/:id/excluir', requireAuth, SUP_EDIT, h(async (req, res) => {
  const motivo = String(sanitize(req.body && req.body.motivo) || '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Informe a justificativa da exclusão.' });
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [req.params.id]))[0];
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
  if (!item.ativo && /^\\[Excluído/.test(String(item.notes || ''))) return res.status(409).json({ error: 'Este item já foi excluído.' });
  const env = (await query("SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE item_id=$1 AND origem='envio' AND status <> 'devolvido'", [item.id]))[0].n;
  const cust = (await query("SELECT COUNT(*)::int AS n FROM erp_estoque_unidades WHERE item_id=$1 AND estado='em_custodia'", [item.id]))[0].n;
  if (env > 0 || cust > 0) return res.status(409).json({ error: \`Há \${Math.max(env, cust)} unidade(s) em custódia com colaboradores. Registre a devolução em "Envios a funcionários" antes de excluir.\` });
  const movs = (await query('SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE item_id=$1', [item.id]))[0].n;
  const unids = (await query('SELECT COUNT(*)::int AS n FROM erp_estoque_unidades WHERE item_id=$1', [item.id]))[0].n;
  if (!movs && !unids) {
    await query('DELETE FROM erp_estoque_itens WHERE id=$1', [item.id]);
    return res.json({ ok: true, modo: 'removido' });
  }
  const saldo = await estoqueAtualItem(item.id);
  if (saldo > 0) {
    await query(\`INSERT INTO erp_estoque_movimentos (item_id, tipo, origem, quantidade, data, notes, created_by)
      VALUES ($1,'saida','ajuste',$2,$3,$4,$5)\`, [item.id, saldo, hojeISO(), \`Exclusão do item: \${motivo}\`, req.user.id]);
  }
  await query("UPDATE erp_estoque_unidades SET estado='baixado' WHERE item_id=$1 AND estado='em_estoque'", [item.id]);
  const marca = \`[Excluído em \${brDateBR(hojeISO())} por \${req.user.name}] \${motivo}\`;
  await query("UPDATE erp_estoque_itens SET ativo=false, notes = CASE WHEN COALESCE(notes,'')='' THEN $2::text ELSE $2::text || E'\\\\n' || notes END WHERE id=$1", [item.id, marca]);
  res.json({ ok: true, modo: 'inativado', saldo_baixado: saldo });
}));

`;
  s = troca(s, "app.get('/api/suprimentos/movimentos', requireAuth, SUP_VIEW,", ep + "app.get('/api/suprimentos/movimentos', requireAuth, SUP_VIEW,");
  return s;
});

edita('public/app.js', s => {
  if (s.includes('supExcluirItem')) throw new Error('front já aplicado');
  // toolbar: caixa "mostrar inativos"
  s = troca(s, "      <div class=\"spacer\"></div>\n      ${edit ? '<button class=\"btn primary\" id=\"sup-new-item\">+ Novo item</button>' : ''}",
    "      <label class=\"sup-mostra-inat\"><input type=\"checkbox\" id=\"sup-inat\"> Mostrar inativos e excluídos</label>\n      <div class=\"spacer\"></div>\n      ${edit ? '<button class=\"btn primary\" id=\"sup-new-item\">+ Novo item</button>' : ''}");
  s = troca(s, "    const rows = itens.filter(i => (!ft || i.tipo === ft) && (!q ||",
    "    const mostraInat = $('#sup-inat').checked;\n    const rows = itens.filter(i => (mostraInat || i.ativo) && (!ft || i.tipo === ft) && (!q ||");
  s = troca(s, "        const sit = !i.ativo ? '<span class=\"badge off\">Inativo</span>'",
    "        const excl = !i.ativo && /^\\[Excluído/.test(String(i.notes || ''));\n        const sit = excl ? '<span class=\"badge late\" title=\"' + esc(String(i.notes).split('\\n')[0]) + '\">Excluído</span>' : !i.ativo ? '<span class=\"badge off\">Inativo</span>'");
  const antigo = `          <td class="actions">
            <button class="btn sm" data-ficha="\${i.id}">Ficha</button>
            \${i.tipo === 'equipamento' ? \`<button class="btn sm" data-unid="\${i.id}">Unidades</button>\` : ''}
            \${edit ? \`<button class="btn sm" data-mov="\${i.id}">Ajustar</button>
            <button class="btn sm" data-hist="\${i.id}">Histórico</button>
            <button class="btn sm" data-edit="\${i.id}">Editar</button>\` : ''}
          </td>`;
  const novo = `          <td class="actions sup-acoes">
            <button class="btn-ic ok" data-ficha="\${i.id}" title="Ficha do item" aria-label="Ficha do item">👁</button>
            \${i.tipo === 'equipamento' ? \`<button class="btn-ic" data-unid="\${i.id}" title="Unidades (nº de série e patrimônio)" aria-label="Unidades">🏷</button>\` : ''}
            \${edit ? \`\${excl ? '' : \`<button class="btn-ic" data-mov="\${i.id}" title="Ajustar o estoque (entrada ou saída manual)" aria-label="Ajustar estoque">±</button>\`}
            <button class="btn-ic" data-hist="\${i.id}" title="Histórico de movimentações" aria-label="Histórico">🕘</button>
            \${excl ? '' : \`<button class="btn-ic" data-edit="\${i.id}" title="Editar" aria-label="Editar">✎</button>
            <button class="btn-ic exc" data-exc="\${i.id}" title="Excluir o item (pede a justificativa)" aria-label="Excluir">🗑</button>\`}\` : ''}
          </td>`;
  s = troca(s, antigo, novo);
  s = troca(s, "      $('#sup-tbl').querySelectorAll('[data-mov]')", "      $('#sup-tbl').querySelectorAll('[data-exc]').forEach(b => b.onclick = () => supExcluirItem(itens.find(i => i.id == b.dataset.exc)));\n      $('#sup-tbl').querySelectorAll('[data-mov]')");
  s = troca(s, "  ['sup-q', 'sup-ftipo'].forEach(id => $('#' + id).oninput = draw);", "  ['sup-q', 'sup-ftipo'].forEach(id => $('#' + id).oninput = draw);\n  $('#sup-inat').onchange = draw;");
  s = troca(s, "// Origem da mercadoria (tabela B do SPED)", `function supExcluirItem(i) {
  const atual = Number(i.estoque_atual) || 0, valor = atual * Number(i.custo_medio || 0);
  openModal(\`Excluir item — \${esc(i.nome)}\`, \`
    <p style="font-size:13.5px; color:var(--ink-2); margin:0 0 10px">O item sai do estoque e das listas. O <strong>histórico de movimentações é preservado</strong> e a justificativa fica registrada (no item e no histórico de auditoria).</p>
    \${atual > 0 ? \`<div class="alert-item late" style="margin-bottom:10px">⚠️ Ainda há <strong>\${supNum(atual)} \${esc(i.unidade)}</strong> em estoque (\${brl(valor)}). Ao excluir, esse saldo é baixado do estoque.</div>\` : ''}
    <div class="field"><label for="ex-motivo">Justificativa da exclusão</label><textarea id="ex-motivo" rows="3" placeholder="Ex.: item cadastrado em duplicidade; equipamento descontinuado."></textarea></div>\`,
    [{ label: 'Voltar', onClick: closeModal },
     { label: 'Excluir item', cls: 'primary', onClick: async (ev) => {
        const motivo = $('#ex-motivo').value.trim();
        if (motivo.length < 5) return modalError('Informe a justificativa da exclusão.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }
        try {
          await api(\`/api/suprimentos/itens/\${i.id}/excluir\`, { method: 'POST', body: { motivo } });
          closeModal(); toast('Item excluído.'); renderSuprimentos();
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Excluir item'; } }
     } }]);
}

// Origem da mercadoria (tabela B do SPED)`);
  return s;
});

edita('public/styles.css', s => {
  if (s.includes('td.sup-acoes')) throw new Error('css já aplicado');
  return s.replace(/\s+$/, '\n') + `
/* Suprimentos > Estoque: ações da linha em ícones (padrão .btn-ic, como Viáticos). Ficha em verde cheio; Excluir em vermelho, afastado dos demais. */
td.sup-acoes { white-space: nowrap; }
td.sup-acoes .btn-ic { margin: 0 0 0 3px; }
td.sup-acoes .btn-ic.ok { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
td.sup-acoes .btn-ic.ok:hover { background: var(--verde-500); border-color: var(--verde-500); }
td.sup-acoes .btn-ic.exc { margin-left: 12px; color: var(--danger); border-color: var(--danger); }
td.sup-acoes .btn-ic.exc:hover { background: var(--danger-050); }
.sup-mostra-inat { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-2); cursor: pointer; white-space: nowrap; }
`;
});
console.log('ok');
