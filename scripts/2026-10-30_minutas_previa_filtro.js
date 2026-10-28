// Propósito: (1) aba Minutas ganha o filtro Todas / Ativas / Aposentadas (com contagem) e o botão "Pré-visualizar" por minuta;
//   (2) emissão do contrato ganha "Pré-visualizar" (contrato preenchido, sem emitir), também disponível no card do processo.
//   Backend: GET /api/rh/minutas/:id/previa e GET /api/rh/admissoes/:id/contrato/documento. O PDF é o mesmo gerador da emissão.
// Entrada: api/index.js e public/app.js (ou a pasta indicada em argv[2]) e os blocos scripts/2026-10-30_*_bloco.txt. Saída: os dois arquivos editados.
// Uso: node scripts/2026-10-30_minutas_previa_filtro.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => {
    const i = s.indexOf(m);
    if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 70));
    if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 70));
  };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    antes: (m, t) => { unico(m); const i = s.indexOf(m); s = s.slice(0, i) + t + s.slice(i); }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('api/index.js', ({ antes }) => {
  antes("app.put('/api/rh/minutas/:id/mapa', requireAuth, requireEdit('rh'),", bloco('2026-10-30_minutas_previa_api_bloco.txt'));
  antes("app.post('/api/rh/admissoes/:id/contrato', requireAuth, requireEdit('rh'),", bloco('2026-10-30_contrato_documento_api_bloco.txt'));
});

edita('public/app.js', ({ troca }) => {
  // PDF devolvido em vez de baixado, quando for só para pré-visualizar.
  troca('function rhContratoPDF(paragrafos, nomeArquivo) {', 'function rhContratoPDF(paragrafos, nomeArquivo, opcoes) {');
  troca('  doc.save(nomeArquivo);\n}\n\n\n// ---------------- Minutas ----------------',
    '  if (opcoes && opcoes.retornar) return doc;\n  doc.save(nomeArquivo);\n}\n\n' + bloco('2026-10-30_minutas_previa_front_bloco.txt') + '\n// ---------------- Minutas ----------------');

  // Lista de minutas: filtro por situação e botão de pré-visualizar.
  troca("async function rhMinutas(c) {\n  const lista = await api('/api/rh/minutas');",
    "let RH_MINUTAS_FILTRO = 'todas';   // todas | ativas | aposentadas\n" +
    "async function rhMinutas(c) {\n" +
    "  const todas = await api('/api/rh/minutas');\n" +
    "  const nAtivas = todas.filter(m => m.ativa).length;\n" +
    "  const lista = RH_MINUTAS_FILTRO === 'ativas' ? todas.filter(m => m.ativa)\n" +
    "    : RH_MINUTAS_FILTRO === 'aposentadas' ? todas.filter(m => !m.ativa) : todas;");
  troca('      <button class="btn primary" id="rh-add-minuta">+ Cadastrar minuta</button></div>',
    '      <button class="btn primary" id="rh-add-minuta">+ Cadastrar minuta</button>\n' +
    '      <label style="margin-left:14px">Mostrar <select id="rh-min-filtro">\n' +
    "        <option value=\"todas\"${RH_MINUTAS_FILTRO === 'todas' ? ' selected' : ''}>Todas (${todas.length})</option>\n" +
    "        <option value=\"ativas\"${RH_MINUTAS_FILTRO === 'ativas' ? ' selected' : ''}>Ativas (${nAtivas})</option>\n" +
    "        <option value=\"aposentadas\"${RH_MINUTAS_FILTRO === 'aposentadas' ? ' selected' : ''}>Aposentadas (${todas.length - nAtivas})</option></select></label></div>");
  troca('<td class="actions"><button class="btn sm" data-mapa="${m.id}">Mapa</button>',
    '<td class="actions"><button class="btn sm" data-previa-min="${m.id}">Pré-visualizar</button> <button class="btn sm" data-mapa="${m.id}">Mapa</button>');
  troca("|| '<tr><td colspan=\"7\"><div class=\"empty\">Nenhuma minuta cadastrada.</div></td></tr>'}</tbody>",
    "|| `<tr><td colspan=\"7\"><div class=\"empty\">${todas.length ? 'Nenhuma minuta nesta situação.' : 'Nenhuma minuta cadastrada.'}</div></td></tr>`}</tbody>");
  troca("  $('#rh-add-minuta').onclick = rhFormMinuta;\n",
    "  $('#rh-add-minuta').onclick = rhFormMinuta;\n" +
    "  $('#rh-min-filtro').onchange = e => { RH_MINUTAS_FILTRO = e.target.value; rhMinutas(c); };\n" +
    "  c.querySelectorAll('[data-previa-min]').forEach(b => b.onclick = async () => {\n" +
    "    const m = todas.find(x => String(x.id) === b.dataset.previaMin);\n" +
    "    b.disabled = true;\n" +
    "    try {\n" +
    "      const r = await api(`/api/rh/minutas/${m.id}/previa`);\n" +
    "      rhMostrarPrevia(`Pré-visualização — ${m.nome}`, r.paragrafos, m.file_name.replace(/\\.docx$/i, '') + ' (prévia).pdf');\n" +
    "    } catch (e) { toast(e.message); } finally { b.disabled = false; }\n" +
    "  });\n");

  // Emissão: botão Pré-visualizar (volta para a mesma tela, com os mesmos valores).
  troca('function rhEmitirContrato(id, nome) {\n  const hoje = todayISO();',
    'function rhEmitirContrato(id, nome, v = {}) {\n  const hoje = todayISO();');
  troca("${fld('em-municipio', 'Cidade da assinatura', 'text', 'São Paulo')}\n      ${fldSel('em-uf', 'UF', rhOpcoes(RH_UF), 'SP')}\n      ${fld('em-data', 'Data', 'date', hoje)}",
    "${fld('em-municipio', 'Cidade da assinatura', 'text', v.municipio || 'São Paulo')}\n      ${fldSel('em-uf', 'UF', rhOpcoes(RH_UF), v.uf || 'SP')}\n      ${fld('em-data', 'Data', 'date', v.data || hoje)}");
  troca("    [{ label: 'Cancelar', onClick: () => rhAbrirCard(id) },\n     { label: 'Gerar', cls: 'primary', onClick: async (ev) => {",
    "    [{ label: 'Cancelar', onClick: () => rhAbrirCard(id) },\n" +
    "     { label: 'Pré-visualizar', onClick: async (ev) => {\n" +
    "        const btn = ev && ev.target;\n" +
    "        const vals = { municipio: $('#em-municipio').value, uf: $('#em-uf').value, data: $('#em-data').value };\n" +
    "        if (btn) { btn.disabled = true; btn.textContent = 'Montando…'; }\n" +
    "        try { await rhPreviaDocumento(id, nome, vals, () => rhEmitirContrato(id, nome, vals)); }\n" +
    "        catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Pré-visualizar'; } }\n" +
    "     }},\n" +
    "     { label: 'Gerar', cls: 'primary', onClick: async (ev) => {");

  // Card do processo: o mesmo botão ao lado de "Ver o que será preenchido".
  troca("        <button class=\"btn\" id=\"rh-previa\" ${d.minuta ? '' : 'disabled'}>Ver o que será preenchido</button>",
    "        <button class=\"btn\" id=\"rh-previa\" ${d.minuta ? '' : 'disabled'}>Ver o que será preenchido</button>\n" +
    "        <button class=\"btn\" id=\"rh-previa-doc\" ${d.minuta ? '' : 'disabled'}>Pré-visualizar contrato</button>");
  troca("  const bp = $('#rh-previa'); if (bp) bp.onclick = () => rhPreviaContrato(id);",
    "  const bp = $('#rh-previa'); if (bp) bp.onclick = () => rhPreviaContrato(id);\n" +
    "  const bpd = $('#rh-previa-doc'); if (bpd) bpd.onclick = async () => {\n" +
    "    bpd.disabled = true;\n" +
    "    try { await rhPreviaDocumento(id, a.colaborador_nome, { municipio: 'São Paulo', uf: 'SP', data: todayISO() }, () => rhAbrirCard(id)); }\n" +
    "    catch (e) { toast(e.message); } finally { bpd.disabled = false; }\n" +
    "  };");
});
console.log('ok');
