// Propósito: centraliza os ícones do menu em trilho (visual novo) quando recolhido. Medido: o centro do menu era 48, o ícone do item ativo ficava em 50 e a "pílula" em 43, porque
//   (1) a barra de rolagem do menu tomava ~10px de largura (a pílula encolhia para 34px e o ícone, com padding de 14px, transbordava) e
//   (2) o texto escondido do item (opacity 0) continuava ocupando espaço no fluxo (a rolagem interna chegava a 188px).
//   Recolhido: sem barra de rolagem visível (a rolagem continua funcionando), texto fora do fluxo, padding simétrico de 12px (ícone de 20px no meio dos 44px); aberto: volta o padding
//   de 14px, o espaço entre ícone e texto e a barra fina. O mesmo no botão de busca do menu.
// Entrada: public/tema-listas.css (ou a pasta indicada em argv[2]). Saída: o arquivo com um bloco novo no fim.
// Uso (depois de 2026-11-12_logo_menu_corrige_recolhido.js): node scripts/2026-11-12_menu_centraliza_icones.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/tema-listas.css');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('MENU EM TRILHO — ÍCONES CENTRALIZADOS')) throw new Error('bloco já aplicado');
const ABERTO = [':hover', ':focus-within'].map(p => `html[data-ui="novo"] .app.visible .sidebar${p}`).concat('html[data-ui="novo"] .app.visible.nd-pin .sidebar');
const abre = parte => ABERTO.map(a => `${a} ${parte}`).join(',\n  ');
s = s.replace(/\s+$/, '\n') + `
/* ============================================================
   MENU EM TRILHO — ÍCONES CENTRALIZADOS (recolhido) e texto fora do fluxo
   ============================================================ */
@media (min-width: 981px) {
  html[data-ui="novo"] .app.visible .sidebar .nav { scrollbar-width: none; }
  html[data-ui="novo"] .app.visible .sidebar .nav::-webkit-scrollbar { width: 0; height: 0; }
  ${abre('.nav')} { scrollbar-width: thin; }
  html[data-ui="novo"] .app.visible .sidebar .nav a { padding: 11px 12px; gap: 0; }
  html[data-ui="novo"] .app.visible .sidebar .nav a span { position: absolute; left: 54px; top: 50%; margin-top: -10px; pointer-events: none; }
  ${abre('.nav a')} { padding: 11px 14px; gap: 16px; }
  ${abre('.nav a span')} { position: static; margin: 0; pointer-events: auto; }
  html[data-ui="novo"] .app.visible .sidebar .nd-rail-busca { padding: 11px 12px; gap: 0; position: relative; }
  html[data-ui="novo"] .app.visible .sidebar .nd-rail-busca span { position: absolute; left: 50px; top: 50%; margin-top: -9px; pointer-events: none; }
  ${abre('.nd-rail-busca')} { padding: 11px 14px; gap: 14px; }
  ${abre('.nd-rail-busca span')} { position: static; margin: 0; pointer-events: auto; }
}
`;
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
