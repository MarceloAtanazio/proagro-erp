// Propósito: número da linha telefônica no formato (DD) 99999-9999 — máscara ao digitar (registro e edição)
//   e formatação ao exibir (lista, Detalhes, termo PDF), inclusive para linhas já gravadas só com dígitos.
//   Reaproveita rhMascaraTelefone/rhSoDigitos do módulo de RH.
// Entrada: scripts/2026-10-06_suprimentos-envios-bloco.txt. Saída: o mesmo arquivo editado.
// Uso: node scripts/2026-10-06_envios_formato_telefone.js && node scripts/2026-10-06_suprimentos-envios-aplicar.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 80)); s = s.replace(de, () => para); };

troca("const supLinhaTxt = m => m.linha_telefonica ? `Linha ${esc(m.linha_telefonica)}${m.operadora ? ' · ' + esc(m.operadora) : ''}` : '';\n",
"// Exibe o telefone como (DD) 99999-9999; o que não tiver 10 ou 11 dígitos aparece como foi digitado.\n" +
"const supFone = v => {\n" +
"  let d = rhSoDigitos(v);\n" +
"  if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2);\n" +
"  return (d.length === 10 || d.length === 11) ? rhMascaraTelefone(d) : String(v == null ? '' : v);\n" +
"};\n" +
"const supMascararFone = id => { const el = $('#' + id); if (el) el.oninput = () => { el.value = rhMascaraTelefone(el.value); }; };\n" +
"const supLinhaTxt = m => m.linha_telefonica ? `Linha ${esc(supFone(m.linha_telefonica))}${m.operadora ? ' · ' + esc(m.operadora) : ''}` : '';\n");

// registro do envio
troca("  $('#en-item').onchange = ajustar;\n  ajustar();\n", "  $('#en-item').onchange = ajustar;\n  supMascararFone('en-linha');\n  ajustar();\n");
troca("linha_telefonica: $('#en-linha').value, operadora", "linha_telefonica: supFone($('#en-linha').value), operadora");

// detalhes
troca("linha('Linha telefônica', esc(m.linha_telefonica) + (m.operadora", "linha('Linha telefônica', esc(supFone(m.linha_telefonica)) + (m.operadora");

// edição
troca("fld('ee-linha', 'Nº da linha telefônica enviada', 'text', m.linha_telefonica || '',", "fld('ee-linha', 'Nº da linha telefônica enviada', 'text', supFone(m.linha_telefonica || ''),");
troca("     }}], { wide: true });\n}\n\n// Unidades físicas", "     }}], { wide: true });\n  supMascararFone('ee-linha');\n}\n\n// Unidades físicas");
troca("linha_telefonica: v('ee-linha'),", "linha_telefonica: v('ee-linha') === undefined ? undefined : supFone(v('ee-linha')),");

// PDF
troca("v(m.linha_telefonica) + (m.operadora ? ' (' + m.operadora + ')' : '')", "supFone(m.linha_telefonica) + (m.operadora ? ' (' + m.operadora + ')' : '')");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
