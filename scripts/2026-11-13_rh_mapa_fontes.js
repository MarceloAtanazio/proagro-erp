// Propósito: mapa de RH — aumentar as fontes (nomes de cidades 13px, números das bolhas 13–14px, siglas dos estados 11–12px) e a reserva de espaço dos nomes, porque na tela real
//   (monitor grande, escala reduzida) os rótulos ficavam pequenos. Entrada: public/rh-mapa.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-13_rh_mapa_fontes.js [raiz]
const fs = require('fs'), path = require('path');
const arq = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/rh-mapa.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('trecho não achado: ' + de.slice(0, 70)); s = s.replace(de, () => para); };
troca("c.font = '600 12px \"DM Sans\", \"Segoe UI\", sans-serif'", "c.font = '600 13px \"DM Sans\", \"Segoe UI\", sans-serif'");
troca("const nome = o.g.cidades[0].nome, w = medidor(nome) + 4, h = 15,", "const nome = o.g.cidades[0].nome, w = medidor(nome) + 6, h = 17,");
troca("style=\"font-size:${12 * u}px;stroke-width:${3.2 * u}px\">${E(nome)}", "style=\"font-size:${13 * u}px;stroke-width:${3.4 * u}px\">${E(nome)}");
troca("style=\"font-size:${(o.r >= 12 ? 13 : 11.5) * u}px\">${o.g.n}", "style=\"font-size:${(o.r >= 12 ? 14 : 12.5) * u}px\">${o.g.n}");
troca("style=\"font-size:${(porUF[uf] ? 11.5 : 10.5) * u}px;stroke-width:${3 * u}px\"", "style=\"font-size:${(porUF[uf] ? 12.5 : 11) * u}px;stroke-width:${3 * u}px\"");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
