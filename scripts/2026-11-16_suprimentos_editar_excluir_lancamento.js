// Propósito: Suprimentos > Estoque > Histórico: editar e excluir lançamentos feitos errado (compras e ajustes), sempre com justificativa. O custo médio (CMP) é RECALCULADO repetindo o
//   histórico do item em ordem (entrada com custo pondera; entrada sem custo e saída só mexem na quantidade; com CMP zero a entrada define o custo), então apagar ou corrigir um lançamento errado
//   desfaz o efeito dele na média. Itens cujo histórico não tem nenhuma entrada com custo mantêm o CMP gravado. Regras: só compra e ajuste (envio/devolução se corrigem em "Envios a funcionários");
//   compra que gerou título em Contas a Pagar existente é barrada; não deixa o estoque ficar negativo; exclusão de baixa de unidade devolve a unidade ao estoque; edição de baixa de unidade é barrada.
//   A exclusão remove a linha e grava no histórico de auditoria o que foi apagado e por quê; a edição grava a justificativa nas observações e na auditoria. Sem migração.
// Entrada: api/index.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-16_suprimentos_editar_excluir_lancamento.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  s = fn(s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const troca = (s, de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 70)); return s.replace(de, () => para); };

edita('api/index.js', s => {
  if (s.includes('recalcularCmpItem')) throw new Error('api já aplicado');
  s = troca(s, "  'DELETE /api/suprimentos/itens/:id':",
    "  'PUT /api/suprimentos/movimentos/:id': req => `Editou o lançamento de estoque ID ${req.params.id}: ${req.body && req.body.quantidade} un${req.body && req.body.custo_unitario !== undefined && req.body.custo_unitario !== '' ? ', custo R$ ' + req.body.custo_unitario : ''}, data ${req.body && req.body.data} — justificativa: \"${String(req.body && req.body.motivo || '').slice(0, 200)}\"`,\n  'POST /api/suprimentos/movimentos/:id/excluir': (req, body) => `Excluiu o lançamento de estoque ID ${req.params.id}${body && body.resumo ? ' (' + body.resumo + ')' : ''} — justificativa: \"${String(req.body && req.body.motivo || '').slice(0, 200)}\"`,\n  'DELETE /api/suprimentos/itens/:id':");
  const ep = `// ---- Corrigir lançamentos errados (editar / excluir) ----
// Recalcula o CMP repetindo o histórico do item em ordem. Sem nenhuma entrada com custo no histórico, mantém o CMP gravado (itens que só têm o custo do cadastro).
async function recalcularCmpItem(itemId) {
  const movs = await query('SELECT tipo, quantidade, custo_unitario FROM erp_estoque_movimentos WHERE item_id=$1 ORDER BY data, id', [itemId]);
  let qtd = 0, cmp = 0, tem = false;
  for (const m of movs) {
    const q = Number(m.quantidade);
    if (m.tipo === 'entrada') { const c = Number(m.custo_unitario); if (c > 0) { cmp = cmpNovo(cmp, Math.max(0, qtd), q, q * c); tem = true; } qtd += q; }
    else qtd -= q;
  }
  if (!tem) return null;
  cmp = Number(cmp.toFixed(2));
  await query('UPDATE erp_estoque_itens SET custo_medio=$1 WHERE id=$2', [cmp, itemId]);
  return cmp;
}
async function carregaLancamentoEditavel(id) {
  const mov = (await query('SELECT * FROM erp_estoque_movimentos WHERE id=$1', [id]))[0];
  if (!mov) return { st: 404, erro: 'Lançamento não encontrado.' };
  if (!['ajuste', 'compra'].includes(mov.origem)) return { st: 409, erro: 'Envios e devoluções se corrigem na aba "Envios a funcionários". Aqui só dá para corrigir compras e ajustes.' };
  if (mov.payable_id) {
    const pg = await query('SELECT 1 FROM erp_payables WHERE id=$1', [mov.payable_id]);
    if (pg.length) return { st: 409, erro: \`Esta compra gerou o título #\${mov.payable_id} em Contas a Pagar. Resolva o título primeiro (exclua ou ajuste lá) e depois corrija o lançamento.\` };
  }
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [mov.item_id]))[0];
  return { mov, item };
}
const efeitoEstoque = (tipo, q) => (tipo === 'entrada' ? q : -q);

app.put('/api/suprimentos/movimentos/:id', requireAuth, SUP_EDIT, h(async (req, res) => {
  const c = await carregaLancamentoEditavel(req.params.id);
  if (c.erro) return res.status(c.st).json({ error: c.erro });
  const { mov, item } = c, b = req.body || {};
  if (mov.unidade_id) return res.status(409).json({ error: 'Esta é a baixa de uma unidade específica. Exclua o lançamento (a unidade volta ao estoque) e refaça a baixa.' });
  const motivo = String(sanitize(b.motivo) || '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Informe a justificativa da alteração.' });
  const qtd = Number(b.quantidade);
  if (!isFinite(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
  let custo = mov.custo_unitario != null ? Number(mov.custo_unitario) : null;
  if (mov.tipo === 'entrada') {
    if (b.custo_unitario === '' || b.custo_unitario == null) {
      if (mov.origem === 'compra') return res.status(400).json({ error: 'Informe o custo unitário da compra.' });
      custo = null;
    } else { custo = Number(b.custo_unitario); if (!isFinite(custo) || custo < 0) return res.status(400).json({ error: 'Custo unitário inválido.' }); }
  }
  if (mov.origem === 'ajuste' && !sanitize(b.notes)) return res.status(400).json({ error: 'Descreva o motivo do ajuste.' });
  const saldo = await estoqueAtualItem(item.id), novoSaldo = saldo - efeitoEstoque(mov.tipo, Number(mov.quantidade)) + efeitoEstoque(mov.tipo, qtd);
  if (novoSaldo < 0) return res.status(409).json({ error: \`Com essa alteração o estoque ficaria negativo (\${novoSaldo} \${item.unidade}).\` });
  const trilha = \`[Editado em \${brDateBR(hojeISO())} por \${req.user.name}: \${motivo}]\`;
  const notes = [sanitize(b.notes) || '', trilha].filter(Boolean).join(' ');
  await query('UPDATE erp_estoque_movimentos SET quantidade=$1, custo_unitario=$2, valor_total=$3, data=COALESCE($4::date, data), notes=$5 WHERE id=$6',
    [qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, isDate(b.data) ? b.data : null, notes, mov.id]);
  const cmp = await recalcularCmpItem(item.id);
  res.json({ ok: true, custo_medio: cmp });
}));

app.post('/api/suprimentos/movimentos/:id/excluir', requireAuth, SUP_EDIT, h(async (req, res) => {
  const c = await carregaLancamentoEditavel(req.params.id);
  if (c.erro) return res.status(c.st).json({ error: c.erro });
  const { mov, item } = c;
  const motivo = String(sanitize(req.body && req.body.motivo) || '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Informe a justificativa da exclusão.' });
  const saldo = await estoqueAtualItem(item.id), novoSaldo = saldo - efeitoEstoque(mov.tipo, Number(mov.quantidade));
  if (novoSaldo < 0) return res.status(409).json({ error: \`Excluir esta entrada deixaria o estoque negativo (\${novoSaldo} \${item.unidade}). Há saídas posteriores que dependem dela.\` });
  const resumo = \`\${mov.tipo} por \${mov.origem}, \${Number(mov.quantidade)} \${item.unidade}\${mov.custo_unitario != null ? ' a R$ ' + Number(mov.custo_unitario) : ''}, \${brDateBR(mov.data)}, item "\${item.nome}"\${mov.notes ? ', obs.: ' + String(mov.notes).slice(0, 120) : ''}\`;
  if (mov.unidade_id) await query("UPDATE erp_estoque_unidades SET estado='em_estoque' WHERE id=$1 AND estado='baixado'", [mov.unidade_id]);
  await query('DELETE FROM erp_estoque_movimentos WHERE id=$1', [mov.id]);
  const cmp = await recalcularCmpItem(item.id);
  res.json({ ok: true, custo_medio: cmp, resumo });
}));

`;
  s = troca(s, "app.get('/api/suprimentos/movimentos', requireAuth, SUP_VIEW,", ep + "app.get('/api/suprimentos/movimentos', requireAuth, SUP_VIEW,");
  return s;
});

edita('public/app.js', s => {
  if (s.includes('supEditarLancamento')) throw new Error('front já aplicado');
  // cabeçalho e linhas do histórico
  s = troca(s, "      <thead><tr><th>Data</th><th>Movimento</th><th class=\"num\">Qtd</th><th>Detalhe</th><th>Por</th></tr></thead>\n      <tbody>${movs.map(m => {\n        const entrada = m.tipo === 'entrada';",
    "      <thead><tr><th>Data</th><th>Movimento</th><th class=\"num\">Qtd</th><th class=\"num\">Custo un.</th><th>Detalhe</th><th>Por</th>${edit ? '<th class=\"actions\">Ações</th>' : ''}</tr></thead>\n      <tbody>${movs.map(m => {\n        const entrada = m.tipo === 'entrada';\n        const corrigivel = edit && ['ajuste', 'compra'].includes(m.origem);\n        const bloqPag = corrigivel && m.payable_id ? `Compra lançada em Contas a Pagar (#${m.payable_id}): resolva o título antes de corrigir` : '';");
  s = troca(s, "          <td class=\"num\">${supNum(m.quantidade)} ${esc(i.unidade)}</td>\n          <td>${det || '—'}${m.status ? ` <small style=\"color:var(--muted)\">(${m.status})</small>` : ''}</td>\n          <td><small>${esc(m.created_by_name || '—')}</small></td>\n        </tr>`;\n      }).join('') || '<tr><td colspan=\"5\"><div class=\"empty\">Sem movimentações.</div></td></tr>'}</tbody>",
    "          <td class=\"num\">${supNum(m.quantidade)} ${esc(i.unidade)}</td>\n          <td class=\"num\">${m.custo_unitario != null ? brl(m.custo_unitario) : '—'}</td>\n          <td>${det || '—'}${m.status ? ` <small style=\"color:var(--muted)\">(${m.status})</small>` : ''}</td>\n          <td><small>${esc(m.created_by_name || '—')}</small></td>\n          ${edit ? `<td class=\"actions sup-acoes\">${corrigivel ? `<button class=\"btn-ic\" data-lcedit=\"${m.id}\" ${bloqPag || m.unidade_id ? 'disabled' : ''} title=\"${bloqPag || (m.unidade_id ? 'Baixa de unidade: exclua e refaça' : 'Editar este lançamento (pede a justificativa)')}\" aria-label=\"Editar lançamento\">✎</button><button class=\"btn-ic exc\" data-lcdel=\"${m.id}\" ${bloqPag ? 'disabled' : ''} title=\"${bloqPag || 'Excluir este lançamento (pede a justificativa)'}\" aria-label=\"Excluir lançamento\">🗑</button>` : ''}</td>` : ''}\n        </tr>`;\n      }).join('') || `<tr><td colspan=\"${edit ? 7 : 6}\"><div class=\"empty\">Sem movimentações.</div></td></tr>`}</tbody>");
  s = troca(s, "    [{ label: 'Fechar', onClick: closeModal }], { wide: true });\n}\n\n// ---- Aba Compras ----",
    `    [{ label: 'Fechar', onClick: closeModal }], { wide: true });
  const depois = async () => { closeModal(); const its = await api('/api/suprimentos/itens'); renderSuprimentos(); supHistorico(its.find(x => x.id === i.id) || i); };
  document.querySelectorAll('[data-lcedit]').forEach(b => b.onclick = () => supEditarLancamento(i, movs.find(m => m.id == b.dataset.lcedit), depois));
  document.querySelectorAll('[data-lcdel]').forEach(b => b.onclick = () => supExcluirLancamento(i, movs.find(m => m.id == b.dataset.lcdel), depois));
}

const SUP_ORIG_LANC = { compra: 'Compra', ajuste: 'Ajuste' };
function supEditarLancamento(i, m, depois) {
  const entrada = m.tipo === 'entrada';
  openModal(\`Editar lançamento — \${esc(i.nome)}\`, \`
    <p class="hint">\${SUP_ORIG_LANC[m.origem]} (\${entrada ? 'entrada' : 'saída'}) de <strong>\${brDate(m.data)}</strong>. Ao salvar, o custo médio do item é recalculado a partir do histórico.</p>
    <div class="form-row">
      \${fld('lc-qtd', 'Quantidade', 'number', m.quantidade, 'step="0.001" min="0.001"')}
      \${entrada ? fld('lc-custo', 'Custo unitário (R$)', 'number', m.custo_unitario == null ? '' : m.custo_unitario, 'step="0.01" min="0"') : ''}
    </div>
    <div class="form-row">
      \${fld('lc-data', 'Data', 'date', String(m.data).slice(0, 10))}
      \${fld('lc-notes', m.origem === 'ajuste' ? 'Motivo do ajuste *' : 'Observação', 'text', m.notes || '')}
    </div>
    \${entrada && m.origem === 'ajuste' ? '<p class="hint" style="margin-top:-4px">Custo em branco = entrada sem custo (não entra na média do custo médio).</p>' : ''}
    \${fld('lc-motivo', 'Justificativa da alteração *', 'text', '', 'placeholder="Ex.: quantidade digitada errada"')}\`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Salvar alteração', cls: 'primary', onClick: async (ev) => {
        const motivo = $('#lc-motivo').value.trim();
        if (motivo.length < 5) return modalError('Informe a justificativa da alteração.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
        try {
          const r = await api(\`/api/suprimentos/movimentos/\${m.id}\`, { method: 'PUT', body: { quantidade: $('#lc-qtd').value, custo_unitario: entrada ? $('#lc-custo').value : undefined, data: $('#lc-data').value, notes: $('#lc-notes').value, motivo } });
          toast('Lançamento corrigido.' + (r.custo_medio != null ? ' Custo médio: ' + brl(r.custo_medio) + '.' : '')); depois();
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Salvar alteração'; } }
     } }]);
}
function supExcluirLancamento(i, m, depois) {
  const entrada = m.tipo === 'entrada';
  openModal(\`Excluir lançamento — \${esc(i.nome)}\`, \`
    <p style="font-size:13.5px; color:var(--ink-2); margin:0 0 10px">\${SUP_ORIG_LANC[m.origem]} de <strong>\${brDate(m.data)}</strong>: <strong>\${entrada ? '+' : '−'} \${supNum(m.quantidade)} \${esc(i.unidade)}</strong>\${m.custo_unitario != null ? \` a \${brl(m.custo_unitario)}\` : ''}.
      O lançamento é <strong>apagado do histórico</strong> (fica registrado na auditoria com a justificativa) e o custo médio é recalculado.\${m.unidade_id ? ' A unidade baixada volta ao estoque.' : ''}</p>
    <div class="field"><label for="lx-motivo">Justificativa da exclusão</label><textarea id="lx-motivo" rows="3" placeholder="Ex.: lançamento feito por engano."></textarea></div>\`,
    [{ label: 'Voltar', onClick: closeModal },
     { label: 'Excluir lançamento', cls: 'primary', onClick: async (ev) => {
        const motivo = $('#lx-motivo').value.trim();
        if (motivo.length < 5) return modalError('Informe a justificativa da exclusão.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }
        try {
          const r = await api(\`/api/suprimentos/movimentos/\${m.id}/excluir\`, { method: 'POST', body: { motivo } });
          toast('Lançamento excluído.' + (r.custo_medio != null ? ' Custo médio: ' + brl(r.custo_medio) + '.' : '')); depois();
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Excluir lançamento'; } }
     } }]);
}

// ---- Aba Compras ----`);
  // histórico precisa saber se pode editar
  s = troca(s, "async function supHistorico(i) {\n  const movs = await api('/api/suprimentos/movimentos?item_id=' + i.id);", "async function supHistorico(i) {\n  const edit = !READONLY;\n  const movs = await api('/api/suprimentos/movimentos?item_id=' + i.id);");
  return s;
});
console.log('ok');
