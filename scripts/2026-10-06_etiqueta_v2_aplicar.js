// Propósito: troca a função supEtiquetaPDF do bloco da aba Envios pela versão 2 (layout redesenhado, sem "conteúdo").
// Entrada: scripts/2026-10-06_etiqueta_v2_funcao.txt e scripts/2026-10-06_suprimentos-envios-bloco.txt.
// Saída: bloco atualizado. Uso: node scripts/2026-10-06_etiqueta_v2_aplicar.js && node scripts/2026-10-06_suprimentos-envios-aplicar.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const nova = fs.readFileSync(path.join(__dirname, '2026-10-06_etiqueta_v2_funcao.txt'), 'utf8').replace(/\r\n/g, '\n');
const ini = s.indexOf('// Etiqueta de envio 10x15 cm');
const fim = s.indexOf('// Termo de responsabilidade do equipamento');
if (ini < 0 || fim < 0 || fim < ini) throw new Error('marcadores não encontrados');
s = s.slice(0, ini) + nova + s.slice(fim);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
