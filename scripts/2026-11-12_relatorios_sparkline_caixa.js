// Propósito: Relatórios Gerenciais (visual Novo) — os minigráficos dos KPIs ficavam esticados (rótulo do último mês minúsculo) porque o canvas não tinha uma caixa própria.
//   Passa cada canvas para dentro de uma caixa de 64px (.nd-rel-spbox) e ajusta o CSS.
// Entrada: public/tema-relatorios.js e public/tema-relatorios.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_relatorios_sparkline_caixa.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const js = path.join(raiz, 'public/tema-relatorios.js'), css = path.join(raiz, 'public/tema-relatorios.css');
let s = fs.readFileSync(js, 'utf8');
for (const id of ['rec', 'desp', 'liq']) {
  const de = `'<canvas class="nd-rel-sp" id="nd-rel-sp-${id}" height="64"></canvas>'`, para = `'<div class="nd-rel-spbox"><canvas id="nd-rel-sp-${id}"></canvas></div>'`;
  if (!s.includes(de)) throw new Error('trecho não achado: ' + id); s = s.replace(de, () => para);
}
fs.writeFileSync(js, s);
let c = fs.readFileSync(css, 'utf8'); if (c.includes('nd-rel-spbox')) throw new Error('já aplicado');
fs.writeFileSync(css, c.replace(/\s+$/, '\n') + '.nd-rel-spbox { position: relative; height: 64px; margin-top: 10px; }\n');
console.log('ok');
