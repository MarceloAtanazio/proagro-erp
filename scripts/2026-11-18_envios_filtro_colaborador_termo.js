// Propósito: Suprimentos > Envios: (1) filtro por colaborador em lista suspensa com todos os colaboradores (trocar o filtro limpa a seleção do termo); (2) o botão "Gerar termo único" sai de perto
//   dos filtros e vai para a direita, à esquerda do "+ Registrar envio", em dourado com destaque (sombra e, quando há equipamentos marcados, um pulso discreto); desabilitado fica em dourado
//   claro tracejado; (3) caixa no cabeçalho da coluna de seleção para marcar todos os equipamentos visíveis (útil depois de filtrar por colaborador). Só aparência e usabilidade.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_envios_filtro_colaborador_termo.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/app.js', (troca, get) => {
  if (get().includes('en-fcolab')) throw new Error('js já aplicado');
  troca("      ${edit ? '<button class=\"btn\" id=\"en-termo-lote\" disabled>Gerar termo único</button>' : ''}\n      <div class=\"spacer\"></div>${edit ? '<button class=\"btn primary\" id=\"sup-new-envio\">+ Registrar envio</button>' : ''}",
    "      <select id=\"en-fcolab\" title=\"Filtrar pelo colaborador\"><option value=\"\">Todos os colaboradores</option>${colaboradores.map(c => `<option value=\"${c.id}\">${esc(c.name)}</option>`).join('')}</select>\n      <div class=\"spacer\"></div>${edit ? '<button class=\"btn btn-termo\" id=\"en-termo-lote\" disabled>📄 Gerar termo único</button><button class=\"btn primary\" id=\"sup-new-envio\">+ Registrar envio</button>' : ''}");
  troca("const fs = $('#en-fstatus').value, q = $('#en-q').value.toLowerCase().trim();\n    const rows = movs.filter(m => (!fs || m.status === fs) && (!q ||",
    "const fs = $('#en-fstatus').value, fc = $('#en-fcolab').value, q = $('#en-q').value.toLowerCase().trim();\n    const rows = movs.filter(m => (!fs || m.status === fs) && (!fc || String(m.colaborador_id) === fc) && (!q ||");
  troca("${edit ? '<th style=\"width:28px\"></th>' : ''}<th>Data</th>", "${edit ? '<th style=\"width:28px\"><input type=\"checkbox\" id=\"en-sel-todos\" title=\"Marcar todos os equipamentos visíveis\" aria-label=\"Marcar todos os equipamentos visíveis\"></th>' : ''}<th>Data</th>");
  troca("bt.textContent = n ? `Gerar termo único (${n})` : 'Gerar termo único';", "bt.textContent = n ? `📄 Gerar termo único (${n})` : '📄 Gerar termo único'; bt.classList.toggle('pronto', n > 0);");
  troca("    atualizaSel();\n    T.querySelectorAll('[data-det]')",
    "    atualizaSel();\n    const cabSel = $('#en-sel-todos');\n    if (cabSel) {\n      const vis = rows.filter(x => x.item_tipo === 'equipamento' && x.status !== 'devolvido' && !x.termo_id);\n      cabSel.disabled = !vis.length; cabSel.checked = vis.length > 0 && vis.every(x => SUP_TERMO_SEL.has(x.id));\n      cabSel.onchange = () => { vis.forEach(x => { if (cabSel.checked) SUP_TERMO_SEL.add(x.id); else SUP_TERMO_SEL.delete(x.id); }); draw(); };\n    }\n    T.querySelectorAll('[data-det]')");
  troca("  $('#en-fstatus').oninput = draw;\n  $('#en-q').oninput = draw;", "  $('#en-fstatus').oninput = draw;\n  $('#en-fcolab').oninput = () => { SUP_TERMO_SEL.clear(); draw(); };\n  $('#en-q').oninput = draw;");
  return get();
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.btn-termo')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `
/* Suprimentos > Envios: botão "Gerar termo único" em destaque (dourado), ao lado de "+ Registrar envio". */
.btn.btn-termo { background: linear-gradient(135deg, #E3A92B, #C97A2B); color: #fff; border-color: transparent; font-weight: 700; box-shadow: 0 6px 16px -6px rgba(201, 122, 43, .7); transition: filter .15s, transform .15s, box-shadow .15s; }
.btn.btn-termo:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
.btn.btn-termo:disabled { background: color-mix(in srgb, #E3A92B 13%, var(--card)); color: #9A6A17; border: 1px dashed color-mix(in srgb, #C9922A 55%, var(--line)); box-shadow: none; opacity: 1; cursor: not-allowed; }
.btn.btn-termo.pronto { animation: termo-pulso 1.9s ease-out infinite; }
@keyframes termo-pulso { 0% { box-shadow: 0 6px 16px -6px rgba(201, 122, 43, .7), 0 0 0 0 rgba(227, 169, 43, .55); } 100% { box-shadow: 0 6px 16px -6px rgba(201, 122, 43, .7), 0 0 0 13px rgba(227, 169, 43, 0); } }
@media (prefers-reduced-motion: reduce) { .btn.btn-termo.pronto { animation: none; } }
`;
});
console.log('ok');
