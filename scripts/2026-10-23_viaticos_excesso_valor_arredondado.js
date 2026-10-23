// Propósito: o valor do excesso reprovado sai da tela já arredondado em centavos (150,45 − 130,00 dava 20.44999999999999).
// Entrada: public/app.js. Saída: public/app.js editado. Uso: node scripts/2026-10-23_viaticos_excesso_valor_arredondado.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const de = "status: 'reprovado', valor: ex.valor } });";
if (!s.includes(de)) throw new Error('trecho não achado');
s = s.replace(de, () => "status: 'reprovado', valor: Math.round(Number(ex.valor) * 100) / 100 } });");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
