// Propósito: redesenho completo da seção "Onde estamos" (mapa de RH): KPIs no topo, faixa por região, filtros por departamento/modelo, busca por pessoa, painel com abas
//   Estados/Cidades/Pessoas e mapa com seleção, pulso e controles. O JS vive em public/rh-mapa.js (reescrito à mão); este script troca o CSS em public/styles.css:
//   remove as regras antigas (.rh-mapa*) e acrescenta as novas (rhm-*, de scripts/2026-11-13_rh_mapa_redesenho_css.txt).
// Entrada: public/styles.css (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-13_rh_mapa_redesenho.js [raiz]
const fs = require('fs'), path = require('path');
const arq = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/styles.css');
const novo = fs.readFileSync(path.join(__dirname, '2026-11-13_rh_mapa_redesenho_css.txt'), 'utf8').replace(/\r\n/g, '\n');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('.rhm-kpis')) throw new Error('já aplicado');
const antes = s.split('\n').length;
const linhas = s.split('\n').filter(l => !(/^\.rh-mapa/.test(l) || (/^@media/.test(l) && l.includes('.rh-mapa')) || l.includes('RH > Painel > "Onde estamos": mapa do Brasil com a distribuição dos colaboradores')));
s = linhas.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n') + novo;
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok — removidas', antes - linhas.length, 'linhas antigas');
