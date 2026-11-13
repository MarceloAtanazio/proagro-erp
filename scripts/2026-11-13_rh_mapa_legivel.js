// Propósito: mapa "Onde estamos" (RH) com rótulos legíveis e visual mais moderno. O JS (public/rh-mapa.js, editado à mão) passa a calcular a escala real
//   do SVG (antes usava só a largura; com max-height o mapa é limitado pela altura e todo texto saía ~35% menor), mostra o nome do estado ao aproximar,
//   bolhas com gradiente e sombra, e nomes de cidade em pílulas. Este script troca o bloco de CSS do mapa (de .rhm-fig até .rhm-leg-b.g) em public/styles.css
//   pelo conteúdo de scripts/2026-11-13_rh_mapa_legivel_css.txt.
// Entrada: public/styles.css (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-13_rh_mapa_legivel.js [raiz]
const fs = require('fs'), path = require('path');
const arq = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/styles.css');
const novo = fs.readFileSync(path.join(__dirname, '2026-11-13_rh_mapa_legivel_css.txt'), 'utf8').replace(/\r\n/g, '\n');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('.rhm-svg .lbl rect')) throw new Error('já aplicado');
const ini = s.indexOf('.rhm-fig {'), fimLinha = s.indexOf('.rhm-leg-b.g i {');
if (ini < 0 || fimLinha < 0) throw new Error('bloco do mapa não achado');
const fim = s.indexOf('\n', fimLinha) + 1;
s = s.slice(0, ini) + novo + s.slice(fim);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
