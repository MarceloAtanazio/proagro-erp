// Propósito: (1) no bloco da aba Envios (scripts/2026-10-06_suprimentos-envios-bloco.txt): botões Editar/Excluir
//   na tabela, edição completa do envio, campo da linha telefônica (celular) e linha no termo PDF;
//   (2) em public/app.js: categorias e subcategorias pré-definidas por tipo no cadastro do item.
//   Depois rode scripts/2026-10-06_suprimentos-envios-aplicar.js para levar o bloco ao app.js.
// Uso: node scripts/2026-10-06_envios_editar_excluir_front.js && node scripts/2026-10-06_suprimentos-envios-aplicar.js
const fs = require('fs'), path = require('path');
function carregar(arq) { let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { s: crlf ? s.replace(/\r\n/g, '\n') : s, crlf }; }
function gravar(arq, o) { fs.writeFileSync(arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function trocar(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 80)); o.s = o.s.replace(de, () => para); }

// ---------------- 1) bloco da aba Envios ----------------
const arqBloco = path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt');
const B = carregar(arqBloco);

trocar(B, "const SUP_ESTADO_UN = { em_estoque: ['ok', 'Em estoque'], em_custodia: ['warn', 'Em custódia'], baixado: ['off', 'Baixado'] };\n",
"const SUP_ESTADO_UN = { em_estoque: ['ok', 'Em estoque'], em_custodia: ['warn', 'Em custódia'], baixado: ['off', 'Baixado'] };\n" +
"// Celular leva a linha telefônica junto: vale para a subcategoria \"Celular\" ou nome com celular/smartphone.\n" +
"const supEhCelular = x => /^celular$/i.test(String(x.subcategoria || x.item_subcategoria || '').trim()) || /celular|smartphone/i.test(String(x.nome || x.item_nome || ''));\n" +
"const supLinhaTxt = m => m.linha_telefonica ? `Linha ${esc(m.linha_telefonica)}${m.operadora ? ' · ' + esc(m.operadora) : ''}` : '';\n");

trocar(B, `\${semUnidade ? '<br><small style="color:#B23A2F">Sem nº de série vinculado</small>' : ''}</td>`,
`\${semUnidade ? '<br><small style="color:#B23A2F">Sem nº de série vinculado</small>' : ''}\${m.linha_telefonica ? \`<br><small style="color:var(--muted)">\${supLinhaTxt(m)}</small>\` : ''}</td>`);

trocar(B, "${edit && equip && m.status !== 'devolvido' ? `<button class=\"btn sm\" data-devolver=\"${m.id}\">Registrar devolução</button>` : ''}</td>",
"${edit && equip && m.status !== 'devolvido' ? `<button class=\"btn sm\" data-devolver=\"${m.id}\">Registrar devolução</button>` : ''}\n" +
"            ${edit ? `<button class=\"btn sm\" data-edit-env=\"${m.id}\">Editar</button><button class=\"btn sm danger-ghost\" data-del-env=\"${m.id}\">Excluir</button>` : ''}</td>");

trocar(B, "supDetalheEnvio(achar(b.dataset.det), itens)", "supDetalheEnvio(achar(b.dataset.det), colaboradores)");

trocar(B, "      T.querySelectorAll('[data-devolver]').forEach(b => b.onclick = () => supFormDevolucao(b.dataset.devolver));\n",
"      T.querySelectorAll('[data-devolver]').forEach(b => b.onclick = () => supFormDevolucao(b.dataset.devolver));\n" +
"      T.querySelectorAll('[data-edit-env]').forEach(b => b.onclick = () => supFormEditarEnvio(achar(b.dataset.editEnv), colaboradores));\n" +
"      T.querySelectorAll('[data-del-env]').forEach(b => b.onclick = () => {\n" +
"        const m = achar(b.dataset.delEnv);\n" +
"        openModal('Excluir envio', `<p>Excluir o envio de <strong>${esc(m.item_nome)}</strong> para <strong>${esc(m.colaborador_name || '—')}</strong>?</p>\n" +
"          <p class=\"hint\">O item volta ao estoque${m.devolucao_registrada ? '' : ''} e o termo assinado anexado, se houver, é removido. Esta ação não pode ser desfeita.</p>`,\n" +
"          [{ label: 'Cancelar', onClick: closeModal },\n" +
"           { label: 'Excluir', cls: 'primary', onClick: async () => {\n" +
"              try { await api('/api/suprimentos/envios/' + m.id, { method: 'DELETE' }); closeModal(); toast('Envio excluído.'); renderSuprimentos(); }\n" +
"              catch (e) { modalError(e.message); }\n" +
"           }}]);\n" +
"      });\n");

// formulário de envio: caixa da linha telefônica
trocar(B, "      <datalist id=\"en-serie-lista\"></datalist>\n      <p class=\"hint\" id=\"en-unid-hint\" style=\"margin-top:-4px\"></p>\n    </div>",
"      <datalist id=\"en-serie-lista\"></datalist>\n      <p class=\"hint\" id=\"en-unid-hint\" style=\"margin-top:-4px\"></p>\n    </div>\n" +
"    <div id=\"en-linha-wrap\" style=\"display:none\">\n" +
"      <div class=\"form-row\">\n" +
"        ${fld('en-linha', 'Nº da linha telefônica enviada', 'text', '', 'placeholder=\"(00) 00000-0000\" inputmode=\"tel\"')}\n" +
"        ${fld('en-operadora', 'Operadora', 'text', '', 'placeholder=\"Ex.: Vivo, Claro, TIM\"')}\n" +
"      </div>\n" +
"    </div>");
trocar(B, "patrimonio: equip ? $('#en-pat').value : null, quantidade", "patrimonio: equip ? $('#en-pat').value : null, linha_telefonica: $('#en-linha').value, operadora: $('#en-operadora').value, quantidade");
trocar(B, "    $('#en-unid-wrap').style.display = equip ? '' : 'none';\n",
"    $('#en-unid-wrap').style.display = equip ? '' : 'none';\n    $('#en-linha-wrap').style.display = supEhCelular(item) ? '' : 'none';\n");

// detalhes
trocar(B, "function supDetalheEnvio(m, itens) {", "function supDetalheEnvio(m, colaboradores) {");
trocar(B, "      ${linha('Marca / SKU', txt([m.item_marca, m.item_sku].filter(Boolean).join(' / ')))}\n",
"      ${linha('Marca / SKU', txt([m.item_marca, m.item_sku].filter(Boolean).join(' / ')))}\n      ${m.linha_telefonica ? linha('Linha telefônica', esc(m.linha_telefonica) + (m.operadora ? ' · ' + esc(m.operadora) : '')) : ''}\n");
trocar(B, "  if (edit && m.status !== 'devolvido') btns.push({ label: 'Editar dados', cls: 'primary', onClick: () => supFormEditarEnvio(m, itens) });",
"  if (edit) btns.push({ label: 'Editar', cls: 'primary', onClick: () => supFormEditarEnvio(m, colaboradores) });");

// edição completa
const ini = B.s.indexOf('function supFormEditarEnvio(m, itens) {');
const fim = B.s.indexOf('// Unidades físicas de um equipamento');
if (ini < 0 || fim < 0) throw new Error('marcadores da edição');
B.s = B.s.slice(0, ini) + `function supFormEditarEnvio(m, colaboradores) {
  const equip = m.item_tipo === 'equipamento', devolvido = m.status === 'devolvido';
  const colabs = colaboradores.some(c => c.id === m.colaborador_id) ? colaboradores
    : [{ id: m.colaborador_id, name: m.colaborador_name || '—', cargo: '' }, ...colaboradores];
  const celular = supEhCelular(m) || m.linha_telefonica;
  openModal(\`Editar envio #\${m.id}\`, \`
    <p class="hint" style="margin-top:0"><strong>\${esc(m.item_nome)}</strong> — para trocar o item, exclua este envio e registre outro.</p>
    <div class="form-row">
      \${fldSel('ee-colab', 'Colaborador destinatário', colabs.map(c => ({ v: c.id, t: \`\${c.name}\${c.cargo ? ' — ' + c.cargo : ''}\` })), m.colaborador_id)}
      \${fld('ee-data', 'Data do envio', 'date', (m.data || '').slice(0, 10))}
    </div>
    \${equip ? \`<div class="form-row">
      \${fld('ee-serie', 'Nº de série do equipamento', 'text', m.unidade_serie || '', devolvido ? 'disabled title="Envio já devolvido"' : 'placeholder="Número individual deste aparelho"')}
      \${fld('ee-pat', 'Patrimônio / etiqueta', 'text', m.unidade_patrimonio || '', 'placeholder="Opcional"')}
    </div>\` : fld('ee-qtd', 'Quantidade', 'number', m.quantidade, 'step="0.001" min="0.001"')}
    <div class="form-row">
      \${fldSel('ee-forma', 'Forma de envio', [{ v: '', t: '—' }, ...SUP_FORMAS_ENVIO.map(f => ({ v: f, t: f }))], m.forma_envio || '')}
      \${fld('ee-rastreio', 'Código de rastreio', 'text', m.codigo_rastreio || '')}
    </div>
    \${celular ? \`<div class="form-row">
      \${fld('ee-linha', 'Nº da linha telefônica enviada', 'text', m.linha_telefonica || '', 'placeholder="(00) 00000-0000" inputmode="tel"')}
      \${fld('ee-operadora', 'Operadora', 'text', m.operadora || '', 'placeholder="Ex.: Vivo, Claro, TIM"')}
    </div>\` : ''}
    \${fld('ee-cond', 'Condição / acessórios na saída', 'text', m.condicao_saida || '')}
    \${devolvido ? fld('ee-cond-dev', 'Condição na devolução', 'text', m.condicao_devolucao || '') : ''}
    \${fld('ee-notes', 'Observações', 'text', m.notes || '')}\`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Salvar', cls: 'primary', onClick: async () => {
        const v = id => { const el = $('#' + id); return el ? el.value : undefined; };
        try {
          await api('/api/suprimentos/envios/' + m.id, { method: 'PUT', body: {
            colaborador_id: v('ee-colab'), data: v('ee-data'), numero_serie: v('ee-serie'), patrimonio: v('ee-pat'),
            quantidade: v('ee-qtd'), forma_envio: v('ee-forma'), codigo_rastreio: v('ee-rastreio'),
            linha_telefonica: v('ee-linha'), operadora: v('ee-operadora'),
            condicao_saida: v('ee-cond'), condicao_devolucao: v('ee-cond-dev'), notes: v('ee-notes') } });
          closeModal(); toast('Envio atualizado.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}], { wide: true });
}

` + B.s.slice(fim);

// termo em PDF: linha telefônica
trocar(B, "        ['Código de rastreio', v(m.codigo_rastreio)],\n",
"        ['Código de rastreio', v(m.codigo_rastreio)],\n        ...(m.linha_telefonica ? [['Linha telefônica', v(m.linha_telefonica) + (m.operadora ? ' (' + m.operadora + ')' : '')]] : []),\n");
gravar(arqBloco, B);

// ---------------- 2) categorias pré-definidas no cadastro do item ----------------
const arqApp = path.join(__dirname, '..', 'public/app.js');
const A = carregar(arqApp);

trocar(A, "function supFormItem(i) {",
`// Categorias e subcategorias já definidas por tipo; "Outra (digitar)" cobre o que não estiver na lista.
const SUP_CATALOGO = {
  equipamento: {
    'TI': ['Notebook', 'Desktop', 'Celular', 'Tablet', 'Monitor', 'Impressora / Scanner', 'Periféricos (mouse, teclado, headset)', 'Rede e conectividade', 'Armazenamento', 'Outros'],
    'Campo e Operação': ['GPS / Navegação', 'Drone', 'Câmera / Fotografia', 'Medição (trena, balança, medidor)', 'Rádio comunicação', 'Outros'],
    'Mobiliário': ['Cadeira', 'Mesa', 'Armário / Estante', 'Outros'],
    'Ferramentas': ['Elétrica', 'Manual', 'Outros'],
    'Outros': ['Outros']
  },
  material: {
    'Escritório e Papelaria': ['Papel', 'Canetas e lápis', 'Pastas e arquivos', 'Etiquetas', 'Grampeadores e acessórios', 'Outros'],
    'EPI': ['Luvas', 'Capacete', 'Botas e calçados', 'Colete / Uniforme', 'Óculos de proteção', 'Protetor solar / repelente', 'Outros'],
    'Limpeza e Copa': ['Produtos de limpeza', 'Descartáveis', 'Café, água e alimentos', 'Outros'],
    'Informática (consumo)': ['Cabos e adaptadores', 'Pilhas e baterias', 'Toner e cartuchos', 'Mídias e pen drives', 'Outros'],
    'Campo e Operação': ['Formulários', 'Embalagens', 'Material de coleta', 'Sinalização', 'Outros'],
    'Brindes e Institucional': ['Brindes', 'Material de divulgação', 'Outros'],
    'Outros': ['Outros']
  }
};
const SUP_OUTRA = '__outra';
const supOpcoesClass = (lista, atual) => {
  const l = (!atual || lista.includes(atual)) ? lista : [...lista, atual];
  return '<option value="">— escolha —</option>' + l.map(x => \`<option value="\${esc(x)}"\${x === atual ? ' selected' : ''}>\${esc(x)}</option>\`).join('') +
    \`<option value="\${SUP_OUTRA}">Outra (digitar)…</option>\`;
};
const supValorClass = (selId, txtId) => { const v = $('#' + selId).value; return v === SUP_OUTRA ? $('#' + txtId).value.trim() : v; };
function supLigarClassificacao(i) {
  const tipo = $('#it-tipo'), cat = $('#it-cat'), sub = $('#it-subcat'), catO = $('#it-cat-outra'), subO = $('#it-subcat-outra');
  let catAtual = i.categoria || '', subAtual = i.subcategoria || '';
  const desenharSub = () => {
    const lista = (SUP_CATALOGO[tipo.value] || {})[cat.value] || [];
    sub.innerHTML = supOpcoesClass(lista, subAtual); subO.style.display = 'none';
  };
  const desenharCat = () => {
    cat.innerHTML = supOpcoesClass(Object.keys(SUP_CATALOGO[tipo.value] || {}), catAtual); catO.style.display = 'none';
    desenharSub();
  };
  tipo.onchange = () => { catAtual = ''; subAtual = ''; desenharCat(); };
  cat.onchange = () => { catO.style.display = cat.value === SUP_OUTRA ? '' : 'none'; subAtual = ''; if (cat.value !== SUP_OUTRA) desenharSub(); else { sub.innerHTML = supOpcoesClass([], ''); } };
  sub.onchange = () => { subO.style.display = sub.value === SUP_OUTRA ? '' : 'none'; };
  desenharCat();
}

function supFormItem(i) {`);

trocar(A, `      \${fld('it-cat', 'Categoria', 'text', i.categoria || '', 'placeholder="Ex.: EPI, Papelaria, TI"')}
      \${fld('it-subcat', 'Subcategoria', 'text', i.subcategoria || '')}`,
`      <div class="field"><label for="it-cat">Categoria</label><select id="it-cat"></select>
        <input id="it-cat-outra" placeholder="Digite a categoria" style="display:none;margin-top:6px"></div>
      <div class="field"><label for="it-subcat">Subcategoria</label><select id="it-subcat"></select>
        <input id="it-subcat-outra" placeholder="Digite a subcategoria" style="display:none;margin-top:6px"></div>`);

trocar(A, "categoria: $('#it-cat').value, subcategoria: $('#it-subcat').value,", "categoria: supValorClass('it-cat', 'it-cat-outra'), subcategoria: supValorClass('it-subcat', 'it-subcat-outra'),");
trocar(A, "     }}], { wide: true });\n}\n\n// Ficha completa do item (somente leitura)", "     }}], { wide: true });\n  supLigarClassificacao(i);\n}\n\n// Ficha completa do item (somente leitura)");
gravar(arqApp, A);
console.log('ok');
