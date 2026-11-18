// Propósito: no PDF do termo único, alargar a coluna Estado do bloco de cada equipamento (de 22 para 30 mm, tirando de Categoria, Fabricante e Modelo; soma continua 182 mm) para
//   "Recondicionado" não quebrar no meio da palavra. Só aparência.
// Entrada: public/app.js e o bloco scripts/2026-11-18_termo_front.txt (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_termo_estado_coluna.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const de = "columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 26 }, 2: { cellWidth: 50 }, 3: { cellWidth: 36 }, 4: { cellWidth: 22 }, 5: { cellWidth: 22 } } });";
const para = "columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 24 }, 2: { cellWidth: 46 }, 3: { cellWidth: 36 }, 4: { cellWidth: 22 }, 5: { cellWidth: 30 } } });";
for (const p of [path.join(raiz, 'public/app.js'), path.join(__dirname, '2026-11-18_termo_front.txt')]) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (s.split(de).length !== 2) throw new Error(p + ': âncora não única/achada');
  s = s.replace(de, () => para); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
console.log('ok');
