// Propósito: liga o TEMA (claro/escuro + visual novo, experimento) ao sistema com o MÍNIMO de mudança nos arquivos existentes.
//   index.html: carrega tema.js no início do <head> (aplica o tema antes de pintar, sem piscar), tema-escuro.css e tema.css depois do styles.css, e a meta theme-color.
//   app.js: makeChart() chama ProagroTema.aplicarChart() (cores/estilo dos gráficos conforme o tema) e a tela é redesenhada quando o tema muda (evento proagro:tema).
//   Para DESFAZER o experimento por código: reverter este commit (ou remover tema.js, tema.css, tema-escuro.css e estas linhas). Para desfazer no uso: botão "Clássico".
// Entrada: public/index.html e public/app.js (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso: node scripts/2026-11-11_tema_integra.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca);
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/index.html', troca => {
  troca('  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <meta name="theme-color" content="#F5F7F6">\n  <!-- Tema claro/escuro + visual novo (experimento): primeiro, para aplicar antes de pintar a tela -->\n  <script src="/tema.js"></script>\n');
  troca('  <link rel="stylesheet" href="/styles.css">\n',
        '  <link rel="stylesheet" href="/styles.css">\n  <link rel="stylesheet" href="/tema-escuro.css">\n  <link rel="stylesheet" href="/tema.css">\n');
});
edita('public/app.js', troca => {
  troca("function makeChart(canvas, cfg) { const c = new Chart(canvas, cfg); charts.push(c); return c; }",
        "function makeChart(canvas, cfg) { if (window.ProagroTema) ProagroTema.aplicarChart(); const c = new Chart(canvas, cfg); charts.push(c); return c; }");
  troca("window.addEventListener('hashchange', () => { if (USER) route(); });",
        "window.addEventListener('hashchange', () => { if (USER) route(); });\n// Tema claro/escuro ou visual novo trocado: redesenha a tela para os gráficos pegarem as cores novas\nwindow.addEventListener('proagro:tema', () => { if (USER) route(); });");
});
console.log('ok');
