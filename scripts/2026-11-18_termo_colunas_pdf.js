// Propósito: ajustar a largura das colunas do inventário do PDF do termo único para "Patrimônio" e "Recondicionado" não quebrarem no meio da palavra (soma continua 182 mm). Só aparência.
// Entrada: public/app.js e o bloco scripts/2026-11-18_termo_front.txt (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_termo_colunas_pdf.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const de = "columnStyles: { 0: { cellWidth: 9, halign: 'center', fontStyle: 'bold', textColor: VERDE }, 1: { cellWidth: 19 }, 2: { cellWidth: 17 }, 3: { cellWidth: 34 }, 4: { cellWidth: 29 }, 5: { cellWidth: 17 }, 6: { cellWidth: 17 }, 7: { cellWidth: 20 }, 8: { cellWidth: 20 } } });";
const para = "columnStyles: { 0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: VERDE }, 1: { cellWidth: 18 }, 2: { cellWidth: 16 }, 3: { cellWidth: 31 }, 4: { cellWidth: 27 }, 5: { cellWidth: 20 }, 6: { cellWidth: 25 }, 7: { cellWidth: 19 }, 8: { cellWidth: 18 } } });";
for (const p of [path.join(raiz, 'public/app.js'), path.join(__dirname, '2026-11-18_termo_front.txt')]) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (s.split(de).length !== 2) throw new Error(p + ': âncora não única/achada');
  s = s.replace(de, () => para); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
console.log('ok');
