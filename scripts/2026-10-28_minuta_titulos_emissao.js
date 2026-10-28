// Propósito: a emissão do contrato passa os títulos de seção pelo padrão (src/docx-merge.js → padronizarTitulos), para o .docx e o PDF
//   saírem iguais em todas as minutas. Edita api/index.js: importa a função e a aplica ao XML já mesclado.
// Entrada: api/index.js (ou a pasta indicada em argv[2]). Saída: api/index.js editado.
// Uso: node scripts/2026-10-28_minuta_titulos_emissao.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 60)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 60)); s = s.replace(de, () => para); };
troca('reaisEmTexto, inteiroEmTexto, brl: docxBrl, docxParagrafos } = require(', 'reaisEmTexto, inteiroEmTexto, brl: docxBrl, docxParagrafos, padronizarTitulos } = require(');
troca('  const novoXml = mesclar(p.xml, p.slotsReais, p.valores.map(v => v.valor));',
      '  // Títulos de seção no padrão da empresa, qualquer que seja a minuta (ver padronizarTitulos).\n  const novoXml = padronizarTitulos(mesclar(p.xml, p.slotsReais, p.valores.map(v => v.valor)));');
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
