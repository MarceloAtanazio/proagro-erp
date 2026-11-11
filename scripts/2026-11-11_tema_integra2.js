// Propósito: segunda rodada do TEMA (visual novo de verdade): liga ao sistema a casca (public/tema-casca.js: paleta de comando Ctrl+K e esqueleto de
//   carregamento), o CSS da casca e do Dashboard (public/tema-novo.css) e o Dashboard redesenhado (public/tema-dashboard.js). No renderDashboard do app.js,
//   logo depois de buscar os dados, se o visual "Novo" está ligado a tela é entregue a ProagroNovo.dashboard(d, cf); no clássico nada muda.
// Entrada: public/index.html e public/app.js (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso (depois de 2026-11-11_tema_integra.js): node scripts/2026-11-11_tema_integra2.js [raiz]
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
  troca('  <link rel="stylesheet" href="/tema.css">\n', '  <link rel="stylesheet" href="/tema.css">\n  <link rel="stylesheet" href="/tema-novo.css">\n');
  troca('  <script src="/app.js"></script>\n', '  <script src="/app.js"></script>\n  <!-- Visual novo: casca (busca de comando, esqueleto) e Dashboard redesenhado; só agem com o visual "Novo" ligado -->\n  <script src="/tema-casca.js"></script>\n  <script src="/tema-dashboard.js"></script>\n');
});
edita('public/app.js', troca => {
  troca("  const [d, cf] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/cashflow/' + anoAtual)]);\n  const c = $('#content');",
        "  const [d, cf] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/cashflow/' + anoAtual)]);\n  // Visual novo (experimento): o Dashboard redesenhado vive em tema-dashboard.js e recebe os mesmos dados; no clássico, segue o de sempre.\n  if (window.ProagroNovo && window.ProagroTema && ProagroTema.ui === 'novo') return ProagroNovo.dashboard(d, cf);\n  const c = $('#content');");
});
console.log('ok');
