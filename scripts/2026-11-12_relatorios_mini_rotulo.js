// Propósito: Relatórios Gerenciais (visual Novo) — nos quadros de "Posição financeira" o valor (ex.: "Próximos 30 dias") aparecia minúsculo e em maiúsculas, porque a regra do rótulo
//   (.nd-rel-mini span) também pegava o <span> de cor que fica dentro do valor/detalhe. Passa a valer só para o rótulo (filho direto) e dá tamanho próprio ao valor e ao detalhe.
// Entrada: public/tema-relatorios.css (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-12_relatorios_mini_rotulo.js [raiz]
const fs = require('fs'), path = require('path');
const arq = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/tema-relatorios.css');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('trecho não achado: ' + de.slice(0, 70)); s = s.replace(de, () => para); };
troca('.nd-rel-mini span { font-size: 11px;', '.nd-rel-mini > span { font-size: 11px;');
troca('.nd-rel-mini span { font-size: 11.5px; } .nd-rel-mini small { font-size: 12.5px; }', '.nd-rel-mini > span { font-size: 12px; } .nd-rel-mini small { font-size: 13px; }\n.nd-rel-mini b { font-size: 22px; } .nd-rel-mini b span, .nd-rel-mini small span { font-size: inherit; font-weight: inherit; letter-spacing: inherit; text-transform: none; }');
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
