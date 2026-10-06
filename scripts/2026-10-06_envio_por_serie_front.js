// Propósito: no bloco da aba Envios (scripts/2026-10-06_suprimentos-envios-bloco.txt) troca a lista de
//   unidades pré-cadastradas por campo de nº de série digitado; e no cadastro do item o rótulo vira "Nº do modelo".
//   Depois rode scripts/2026-10-06_suprimentos-envios-aplicar.js para levar o bloco ao public/app.js.
// Uso: node scripts/2026-10-06_envio_por_serie_front.js
const fs = require('fs'), path = require('path');
function editar(arq, trocas) {
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [de, para] of trocas) { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 70)); s = s.replace(de, () => para); }
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
}
editar(path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt'), [
[`    <div id="en-unid-wrap" style="display:none">
      \${fldSel('en-unid', 'Unidade (nº de série) *', [], '')}
      <p class="hint" id="en-unid-hint" style="margin-top:-4px"></p>
    </div>`,
`    <div id="en-unid-wrap" style="display:none">
      <div class="form-row">
        \${fld('en-serie', 'Nº de série do equipamento *', 'text', '', 'list="en-serie-lista" autocomplete="off" placeholder="Número individual deste aparelho"')}
        \${fld('en-pat', 'Patrimônio / etiqueta', 'text', '', 'placeholder="Opcional"')}
      </div>
      <datalist id="en-serie-lista"></datalist>
      <p class="hint" id="en-unid-hint" style="margin-top:-4px"></p>
    </div>`],
[`unidade_id: equip ? $('#en-unid').value : null, quantidade`, `numero_serie: equip ? $('#en-serie').value : null, patrimonio: equip ? $('#en-pat').value : null, quantidade`],
[`      const lista = unids.filter(u => u.item_id == item.id);
      $('#en-unid').innerHTML = lista.map(u => \`<option value="\${u.id}">\${esc([u.numero_serie ? 'Série ' + u.numero_serie : '', u.patrimonio ? 'Pat. ' + u.patrimonio : ''].filter(Boolean).join(' · '))}</option>\`).join('');
      $('#en-unid-hint').textContent = lista.length ? '' : 'Nenhuma unidade disponível. Cadastre em Estoque > Unidades deste item.';`,
`      const lista = unids.filter(u => u.item_id == item.id && u.numero_serie);
      $('#en-serie-lista').innerHTML = lista.map(u => \`<option value="\${esc(u.numero_serie)}">\${esc(u.patrimonio || '')}</option>\`).join('');
      $('#en-unid-hint').textContent = 'Digite o nº de série impresso no aparelho (o do modelo fica no cadastro do item). Ele fica registrado neste envio e no histórico do equipamento.';`],
[`Equipamentos saem por unidade (nº de série) e ficam`, `Equipamentos saem com o nº de série individual e ficam`],
[`      \${equip && !m.unidade_id ? fldSel('ee-unid', 'Vincular unidade (nº de série)', [{ v: '', t: '— escolha —' }, ...unids.map(u => ({ v: u.id, t: [u.numero_serie ? 'Série ' + u.numero_serie : '', u.patrimonio ? 'Pat. ' + u.patrimonio : ''].filter(Boolean).join(' · ') }))], '') : ''}`,
`      \${equip && !m.unidade_id ? \`<div class="form-row">\${fld('ee-serie', 'Nº de série do equipamento', 'text', '', 'placeholder="Número individual deste aparelho"')}\${fld('ee-pat', 'Patrimônio / etiqueta', 'text', '', 'placeholder="Opcional"')}</div>\` : ''}`],
[`unidade_id: $('#ee-unid') ? $('#ee-unid').value || null : null, forma_envio`, `numero_serie: $('#ee-serie') ? $('#ee-serie').value : null, patrimonio: $('#ee-pat') ? $('#ee-pat').value : null, forma_envio`],
[`<p class="hint" style="margin-top:0">Saldo em estoque:`, `<p class="hint" style="margin-top:0">Registro de cada aparelho (criado automaticamente a cada envio; use para corrigir ou dar baixa). Saldo em estoque:`],
]);
editar(path.join(__dirname, '..', 'public/app.js'), [
[`fld('it-serie', 'Número de série', 'text', i.numero_serie || '', 'placeholder="Para eletrônicos / controle de garantia"')`, `fld('it-serie', 'Nº do modelo (do fabricante)', 'text', i.numero_serie || '', 'placeholder="Igual para todos os aparelhos deste modelo. O nº de série individual é informado no envio."')`],
[`linha('Número de série', txt(i.numero_serie))`, `linha('Nº do modelo', txt(i.numero_serie))`],
]);
console.log('ok');
