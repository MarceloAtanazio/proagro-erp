// Propósito: sexta rodada do TEMA (visual novo): refina os dois gráficos do Fluxo de Caixa (public/tema-graficos.js, plugin do Chart.js só ativo no visual novo) e liga ao sistema.
//   index.html: carrega tema-graficos.js depois de tema-fluxo.js. tema-fluxo.js: clicar em Entradas/Saídas nos KPIs volta o gráfico ao modo "Entradas e saídas" antes de ligar/desligar a série.
//   tema-fluxo.css: estilo do seletor de modo no cabeçalho do cartão. Dados e criação dos gráficos continuam os de app.js.
// Entrada: public/ (ou a pasta indicada em argv[2]). Saída: arquivos editados. Uso (depois de 2026-11-12_menu_centraliza_icones.js): node scripts/2026-11-12_tema_integra6.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/index.html', troca => {
  troca('  <script src="/tema-fluxo.js"></script>\n', '  <script src="/tema-fluxo.js"></script>\n  <script src="/tema-graficos.js"></script>\n');
});
edita('public/tema-fluxo.js', troca => {
  troca("      const ch = window.Chart && Chart.getChart('ch-entsai'); if (!ch) return;\n",
        "      const ch = window.Chart && Chart.getChart('ch-entsai'); if (!ch) return;\n      if (ch.$ndModo === 'liq' && ProagroNovo.modoEntSai) ProagroNovo.modoEntSai(ch, 'ent');   // estava no resultado líquido: volta às barras de entradas e saídas\n");
});
edita('public/tema-fluxo.css', (troca, ler, grava) => {
  if (ler().includes('seletor de modo do gráfico')) throw new Error('bloco já aplicado');
  grava(ler().replace(/\s+$/, '\n') + "\n/* seletor de modo do gráfico Entradas × Saídas (cabeçalho do cartão) */\n.nd-modo { margin-left: auto; }\n.nd-modo button { white-space: nowrap; }\nhtml[data-ui=\"novo\"] .nd-fx-page .nd-modo button[aria-pressed=\"true\"] { background: var(--verde-700); color: #fff; }\n/* colunas sem esticar com o conteúdo (o seletor de modo no título alargava a grade) */\n@media (min-width: 981px) { html[data-ui=\"novo\"] .nd-fx-page .two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\nhtml[data-ui=\"novo\"] .nd-fx-page .two-col > .card { min-width: 0; }\nhtml[data-ui=\"novo\"] .nd-fx-page .card h3:has(.nd-modo) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }\n");
});
console.log('ok');
