// Propósito: corrige o símbolo do logo que sumia no menu em trilho (visual novo) para quem já tinha o menu do clássico "recolhido" salvo no navegador. Nesse estado o #view-app ganha
//   a classe side-collapsed e a regra antiga ".app.side-collapsed .brand img { display:none }" (styles.css) escondia também a imagem do símbolo novo. Correção em duas camadas:
//   (1) tema-casca.js: no visual novo a classe side-collapsed é retirada (o trilho tem o próprio modo recolhido/aberto) e, ao voltar ao clássico, é reposta conforme a preferência
//       salva (proagro_sidebar_collapsed); (2) tema-listas.css: a regra do símbolo passa a ter especificidade maior que a da regra antiga.
// Entrada: public/tema-casca.js e public/tema-listas.css (ou a pasta indicada em argv[2]). Saída: os dois editados.
// Uso (depois de 2026-11-12_logo_menu_aplicar.js): node scripts/2026-11-12_logo_menu_corrige_recolhido.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca);
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/tema-casca.js', troca => {
  troca("    if (!img.dataset.orig) img.dataset.orig = img.getAttribute('src');\n    img.setAttribute('src', novo() ? '/logo-completo-branco.png' : img.dataset.orig);\n  }",
        "    if (!img.dataset.orig) img.dataset.orig = img.getAttribute('src');\n    img.setAttribute('src', novo() ? '/logo-completo-branco.png' : img.dataset.orig);\n" +
        "    // o \"menu recolhido\" do clássico (salvo no navegador) não vale para o trilho: a classe side-collapsed escondia o símbolo; volta ao trocar para o clássico\n" +
        "    const app = document.getElementById('view-app'); if (!app) return;\n" +
        "    if (novo()) app.classList.remove('side-collapsed');\n" +
        "    else { let c = false; try { c = localStorage.getItem('proagro_sidebar_collapsed') === '1'; } catch (e) { /* ok */ } app.classList.toggle('side-collapsed', c); }\n  }");
});
edita('public/tema-listas.css', troca => {
  troca("  html[data-ui=\"novo\"] .nd-mark img { width: 46px;", "  html[data-ui=\"novo\"] .app.visible .sidebar .brand .nd-mark img { width: 46px;");
});
console.log('ok');
