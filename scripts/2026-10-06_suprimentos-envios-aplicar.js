// Propósito: substitui em public/app.js o bloco da aba "Envios a funcionários"
//   (de "// ---- Aba Envios a funcionários ----" até a seção CONCILIAÇÃO BANCÁRIA)
//   pelo conteúdo de scripts/2026-10-06_suprimentos-envios-bloco.txt.
// Entrada: scripts/2026-10-06_suprimentos-envios-bloco.txt e public/app.js.
// Saída: public/app.js atualizado (aborta sem gravar se não achar os marcadores).
// Uso: node scripts/2026-10-06_suprimentos-envios-aplicar.js
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const alvo = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(alvo, 'utf8');
const novo = fs.readFileSync(path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');
const ini = s.indexOf('// ---- Aba Envios a funcionários ----');
const marca = '// ============================================================\n// CONCILIAÇÃO BANCÁRIA';
const fim = s.indexOf(marca);
if (ini < 0 || fim < 0 || fim < ini) { console.error('Marcadores não encontrados — nada gravado.'); process.exit(1); }
s = s.slice(0, ini) + novo + s.slice(fim);
fs.writeFileSync(alvo, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok, crlf=' + crlf);
