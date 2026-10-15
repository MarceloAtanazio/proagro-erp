// Propósito: interface da APROVAÇÃO COMPARTILHADA em Contas a Pagar (um anexo "Aprovação" vale para vários títulos).
//   - No modal de anexos: ao escolher "Aprovação", aparece "Esta aprovação vale também para:" com os títulos
//     FILTRADOS na tela e ainda sem aprovação (marcar / marcar todos / limpar); ao anexar, vincula os marcados.
//   - Botão "Usar uma aprovação já anexada…" (vincula este título, e os marcados, a uma aprovação existente).
//   - Na lista: aprovação compartilhada vem marcada, com "Desvincular"; o dono mostra "vale para N outros" e avisa
//     antes de excluir.
//   - A coluna Aprov. e o contador 📎 acompanham, inclusive para os títulos vinculados e ao filtrar de novo.
// Entrada: public/app.js e public/styles.css. Saída: os mesmos arquivos editados.
// Uso: node scripts/2026-10-15_pagar_aprovacao_compartilhada_front.js
const fs = require('fs'), path = require('path');
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); o.s = o.s.replace(de, () => para); }

const F = abrir('public/app.js');

// ---------- globais + sincronização da linha ----------
troca(F, `function updateAprovCell(id, tem) {
  const b = document.querySelector(\`[data-aprov="\${id}"]\`);
  if (!b) return;
  const i = pagarAprovInfo(tem, b.dataset.venc);
  b.className = 'aprov-btn ' + i.cls; b.textContent = i.glifo; b.title = i.titulo;
}
`,
`// Linhas de Contas a Pagar em memória: todas, e as que passam pelo filtro da tela. O modal de anexos usa as
// filtradas para oferecer a aprovação compartilhada.
let PAGAR_TODOS = [], PAGAR_FILTRADOS = [];

// Mantém a linha (dados em memória, coluna Aprov. e contador 📎) em sincronia com o que o modal de anexos fez —
// inclusive ao filtrar de novo, quando a tabela é redesenhada a partir dos dados em memória.
function pagarSyncAprov(id, nAprov, nAnexos) {
  const r = PAGAR_TODOS.find(x => x.id === id);
  if (r) { if (nAprov != null) r.aprovacao_count = nAprov; if (nAnexos != null) r.attachment_count = nAnexos; }
  const b = document.querySelector(\`[data-aprov="\${id}"]\`);
  if (b) {
    const n = nAprov != null ? nAprov : (r ? r.aprovacao_count : 0);
    const i = pagarAprovInfo(n > 0, b.dataset.venc);
    b.className = 'aprov-btn ' + i.cls; b.textContent = i.glifo; b.title = i.titulo;
  }
  if (nAnexos != null) updateAttBadge('payable', id, nAnexos);
}

// Lista de títulos com caixa de seleção (aprovação compartilhada).
function pagarListaVincularHtml(cands) {
  return \`<div class="att-vinc">
    <div class="att-vinc-head">
      <span><strong>Esta aprovação vale também para</strong><br><small>Títulos filtrados na tela e ainda sem aprovação</small></span>
      <span class="att-vinc-bts"><button type="button" class="btn sm" data-vinc-all>Marcar todos</button><button type="button" class="btn sm" data-vinc-none>Limpar</button></span>
    </div>
    <div class="att-vinc-list">\${cands.map(r => \`<label class="att-vinc-item">
      <input type="checkbox" value="\${r.id}">
      <span class="v-id">\${r.id}</span>
      <span class="v-desc">\${esc(r.description)}<small>\${esc(r.supplier_name || '—')} · venc. \${brDate(r.due_date)}</small></span>
      <span class="v-val">\${brl(r.amount)}</span></label>\`).join('')}</div>
    <small class="att-vinc-count" data-vinc-count>0 selecionado(s)</small>
  </div>\`;
}
function pagarLigarLista(raiz) {
  const caixas = () => [...raiz.querySelectorAll('.att-vinc-item input')];
  const contar = () => { const n = caixas().filter(c => c.checked).length; raiz.querySelector('[data-vinc-count]').textContent = n + ' selecionado(s)'; };
  raiz.querySelector('[data-vinc-all]').onclick = () => { caixas().forEach(c => { c.checked = true; }); contar(); };
  raiz.querySelector('[data-vinc-none]').onclick = () => { caixas().forEach(c => { c.checked = false; }); contar(); };
  caixas().forEach(c => { c.onchange = contar; });
}
const pagarMarcados = raiz => raiz ? [...raiz.querySelectorAll('.att-vinc-item input:checked')].map(c => Number(c.value)) : [];

// "Usar uma aprovação já anexada": liga este título (e os marcados) a uma aprovação que já existe.
async function pagarUsarAprovacaoExistente(id, label) {
  let lista;
  try { lista = await api('/api/payables/aprovacoes/existentes'); } catch (e) { return toast(e.message); }
  if (!lista.length) return toast('Ainda não há nenhuma aprovação anexada em Contas a Pagar.');
  const cands = PAGAR_FILTRADOS.filter(r => r.id !== id && !(r.aprovacao_count > 0));
  openModal('Usar uma aprovação já anexada', \`
    <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:12px">Escolha a aprovação: ela passa a valer para este título e para os que você marcar abaixo.</p>
    <div class="field"><label for="ue-sel">Aprovação</label><select id="ue-sel">\${lista.map(a =>
      \`<option value="\${a.id}">\${esc(a.file_name)} — #\${a.dono_id}\${a.dono_descricao ? ' ' + esc(a.dono_descricao) : ''} (\${a.titulos} título\${a.titulos > 1 ? 's' : ''})</option>\`).join('')}</select></div>
    \${cands.length ? pagarListaVincularHtml(cands) : ''}\`,
    [{ label: 'Voltar', onClick: () => openAttachments('payable', id, label) },
     { label: 'Vincular', cls: 'primary', onClick: async () => {
        const attId = Number($('#ue-sel').value), marcados = pagarMarcados($('.att-vinc'));
        try {
          const r = await api('/api/payables/aprovacoes/vincular', { method: 'POST', body: { attachment_id: attId, payable_ids: [id, ...marcados] } });
          [id, ...marcados].forEach(vid => { const row = PAGAR_TODOS.find(x => x.id === vid); if (row) pagarSyncAprov(vid, (row.aprovacao_count || 0) + 1, (row.attachment_count || 0) + 1); });
          toast(r.vinculados ? \`Aprovação vinculada a \${r.vinculados} título(s).\` : 'Nenhum título novo para vincular.');
          openAttachments('payable', id, label);
        } catch (e) { modalError(e.message); }
     } }]);
  if (cands.length) pagarLigarLista($('.att-vinc'));
}
`);

// ---------- modal de anexos ----------
troca(F, `        <small style="color:var(--muted)">Até 3 MB por arquivo (PDF, imagem, XML, planilha…).</small>
      </div>
    </div>\` : ''}`,
`        <small style="color:var(--muted)">Até 3 MB por arquivo (PDF, imagem, XML, planilha…).</small>
        \${type === 'payable' ? \`<div id="att-vinc-box" style="display:none; margin-top:12px">\${pagarCands.length
          ? pagarListaVincularHtml(pagarCands)
          : '<small style="color:var(--muted)">Não há outros títulos filtrados na tela sem aprovação para compartilhar.</small>'}</div>
        <div style="margin-top:8px"><button class="btn sm" id="att-usar-existente" type="button">Usar uma aprovação já anexada…</button></div>\` : ''}
      </div>
    </div>\` : ''}`);
troca(F, `  const opt = (v, t) => \`<option value="\${v}"\${v === kindPadrao ? ' selected' : ''}>\${t}</option>\`;
  openModal('Anexos — ' + label, \``,
`  const opt = (v, t) => \`<option value="\${v}"\${v === kindPadrao ? ' selected' : ''}>\${t}</option>\`;
  // Aprovação compartilhada (Contas a Pagar): candidatos = títulos filtrados na tela, sem aprovação, exceto este.
  const pagarCands = type === 'payable' ? PAGAR_FILTRADOS.filter(r => r.id !== id && !(r.aprovacao_count > 0)) : [];
  openModal('Anexos — ' + label, \``);

// ---------- lista ----------
troca(F, `      updateAttBadge(type, id, items.length);
      if (type === 'payable') updateAprovCell(id, items.some(a => a.kind === 'aprovacao'));
`,
`      if (type === 'payable') pagarSyncAprov(id, items.filter(a => a.kind === 'aprovacao').length, items.length);
      else updateAttBadge(type, id, items.length);
`);
troca(F, `            <div class="att-meta">\${KIND_LABELS[a.kind] || 'Outro'} · \${fmtSize(a.byte_size)} · \${brDate(a.created_at.slice(0, 10))}</div>
          </div>
          <div class="att-act">
            <button class="btn sm" data-attview="\${a.id}">Ver</button>
            \${editable ? \`<button class="btn sm danger-ghost" data-attdel="\${a.id}">Excluir</button>\` : ''}
          </div>
        </div>\`).join('');`,
`            <div class="att-meta">\${KIND_LABELS[a.kind] || 'Outro'} · \${fmtSize(a.byte_size)} · \${brDate(a.created_at.slice(0, 10))}\${
              a.vale_para_outros ? \` · <strong>vale para \${a.vale_para_outros} outro\${a.vale_para_outros > 1 ? 's' : ''} título\${a.vale_para_outros > 1 ? 's' : ''}</strong>\` : ''}\${
              a.compartilhada ? \` · <strong>aprovação compartilhada</strong>, anexada no título #\${a.dono_id}\${a.dono_descricao ? ' — ' + esc(a.dono_descricao) : ''}\` : ''}</div>
          </div>
          <div class="att-act">
            <button class="btn sm" data-attview="\${a.id}">Ver</button>
            \${editable ? (a.compartilhada
              ? \`<button class="btn sm danger-ghost" data-attunlink="\${a.id}" title="Tira só este título; o arquivo continua valendo para os outros">Desvincular</button>\`
              : \`<button class="btn sm danger-ghost" data-attdel="\${a.id}">Excluir</button>\`) : ''}
          </div>
        </div>\`).join('');`);
troca(F, `      box.querySelectorAll('[data-attdel]').forEach(b => b.onclick = () => {
        openModal('Excluir anexo', '<p>Deseja excluir este documento? Esta ação não pode ser desfeita.</p>',`,
`      box.querySelectorAll('[data-attunlink]').forEach(b => b.onclick = () => {
        openModal('Desvincular aprovação', '<p>Este título deixa de usar essa aprovação. O arquivo <strong>continua valendo</strong> para os outros títulos.</p>',
          [{ label: 'Cancelar', onClick: () => openAttachments(type, id, label) },
           { label: 'Desvincular', cls: 'primary', onClick: async () => {
              try { await api(\`/api/payables/\${id}/aprovacoes/\${b.dataset.attunlink}\`, { method: 'DELETE' }); toast('Título desvinculado da aprovação.'); openAttachments(type, id, label); }
              catch (e) { modalError(e.message); }
           } }]);
      });
      box.querySelectorAll('[data-attdel]').forEach(b => b.onclick = () => {
        const alvo = items.find(x => String(x.id) === String(b.dataset.attdel)) || {};
        const aviso = alvo.vale_para_outros
          ? \`<p>Esta aprovação também vale para <strong>\${alvo.vale_para_outros} outro\${alvo.vale_para_outros > 1 ? 's' : ''} título\${alvo.vale_para_outros > 1 ? 's' : ''}</strong>. Excluir o arquivo <strong>remove a aprovação de todos eles</strong>.</p><p>Para tirar só este título, exclua os outros vínculos pelos próprios títulos. Esta ação não pode ser desfeita.</p>\`
          : '<p>Deseja excluir este documento? Esta ação não pode ser desfeita.</p>';
        openModal('Excluir anexo', aviso,`);

// ---------- envio ----------
troca(F, `        await api(\`/api/attachments/\${type}/\${id}\`, { method: 'POST', body: {
          file_name: file.name, mime_type: file.type || 'application/octet-stream', kind: $('#att-kind').value, data
        }});
        toast('Documento anexado.'); input.value = '';
        loadList();
      } catch (e) { toast(e.message); }`,
`        const kindEscolhido = $('#att-kind').value;
        const novo = await api(\`/api/attachments/\${type}/\${id}\`, { method: 'POST', body: {
          file_name: file.name, mime_type: file.type || 'application/octet-stream', kind: kindEscolhido, data
        }});
        input.value = '';
        // Aprovação compartilhada: liga os títulos marcados ao anexo que acabou de ser guardado.
        const marcados = (type === 'payable' && kindEscolhido === 'aprovacao') ? pagarMarcados($('#att-vinc-box')) : [];
        if (marcados.length) {
          try {
            const r = await api('/api/payables/aprovacoes/vincular', { method: 'POST', body: { attachment_id: novo.id, payable_ids: marcados } });
            marcados.forEach(vid => { const row = PAGAR_TODOS.find(x => x.id === vid); if (row) pagarSyncAprov(vid, (row.aprovacao_count || 0) + 1, (row.attachment_count || 0) + 1); });
            toast(\`Aprovação anexada e vinculada a \${r.vinculados} outro(s) título(s).\`);
          } catch (e) { toast('Aprovação anexada, mas não foi possível vincular aos outros títulos: ' + e.message); }
          openAttachments(type, id, label);
          return;
        }
        toast('Documento anexado.');
        loadList();
      } catch (e) { toast(e.message); }`);

// ---------- ligações da tela ----------
troca(F, `  if (editable) {
    $('#att-send').onclick = async () => {`,
`  if (editable && type === 'payable') {
    const kindSel = $('#att-kind'), caixa = $('#att-vinc-box');
    const alternar = () => { caixa.style.display = kindSel.value === 'aprovacao' ? '' : 'none'; };
    kindSel.onchange = alternar; alternar();
    if (pagarCands.length) pagarLigarLista(caixa);
    $('#att-usar-existente').onclick = () => pagarUsarAprovacaoExistente(id, label);
  }
  if (editable) {
    $('#att-send').onclick = async () => {`);

// ---------- a tabela alimenta as listas em memória ----------
const iReceber = F.s.indexOf('async function renderReceber()');
const iFilt = F.s.indexOf('    lastFiltered = filtered;\n');
if (iFilt < 0 || iFilt > iReceber) throw new Error('lastFiltered fora de renderPagar');
F.s = F.s.slice(0, iFilt) + '    lastFiltered = filtered; PAGAR_FILTRADOS = filtered; PAGAR_TODOS = rows;\n' + F.s.slice(iFilt + '    lastFiltered = filtered;\n'.length);
salvar(F);

// ---------- CSS ----------
const C = abrir('public/styles.css');
troca(C, `.tbl-fin.tbl-pagar td.num { font-variant-numeric: tabular-nums; }`,
`.tbl-fin.tbl-pagar td.num { font-variant-numeric: tabular-nums; }

/* ===== Aprovação compartilhada (modal de anexos de Contas a Pagar) ===== */
.att-vinc { border: 1px solid var(--line); border-radius: 10px; background: #FAFBFA; padding: 10px 12px; }
.att-vinc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; font-size: 13px; }
.att-vinc-head small { color: var(--muted); }
.att-vinc-bts { display: flex; gap: 6px; flex: none; }
.att-vinc-list { max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.att-vinc .att-vinc-item { display: grid; margin: 0; font-weight: 400; color: var(--ink); grid-template-columns: 18px 44px 1fr auto; align-items: center; gap: 8px; padding: 7px 10px;
  border-bottom: 1px solid var(--line); font-size: 13px; cursor: pointer; }
.att-vinc .att-vinc-item:last-child { border-bottom: 0; }
.att-vinc .att-vinc-item:hover { background: #F4F8F5; }
.att-vinc .att-vinc-item .v-id { color: var(--muted); font-variant-numeric: tabular-nums; }
.att-vinc .att-vinc-item .v-desc small { display: block; color: var(--muted); font-size: 11.5px; }
.att-vinc .att-vinc-item .v-val { font-variant-numeric: tabular-nums; white-space: nowrap; }
.att-vinc-count { display: block; margin-top: 6px; color: var(--muted); }`);
salvar(C);
console.log('ok');
