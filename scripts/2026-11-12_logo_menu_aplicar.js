// Propósito: troca a marca do menu lateral em trilho (visual novo): RECOLHIDO mostra só o símbolo do logo em branco (public/logo-simbolo-branco.png), sem o "P" de antes;
//   EXPANDIDO mostra o logo completo em branco (public/logo-completo-branco.png) no lugar do logo verde pequeno, com tamanho e alinhamento ajustados e altura fixa da área da
//   marca (o menu não "pula" ao abrir). No clássico o logo original (public/logo-white.png) continua como era.
// Entrada: public/tema-casca.js e public/tema-listas.css (ou a pasta indicada em argv[2]); logos gerados por scripts/2026-11-12_gera_logos_brancos.ps1. Saída: os dois editados.
// Uso (depois de 2026-11-12_tema_integra5.js): node scripts/2026-11-12_logo_menu_aplicar.js [raiz]
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
  troca("const m = document.createElement('span'); m.className = 'nd-mark'; m.textContent = 'P'; m.setAttribute('aria-hidden', 'true'); brand.insertBefore(m, brand.firstChild);",
        "const m = document.createElement('span'); m.className = 'nd-mark'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = '<img src=\"/logo-simbolo-branco.png\" alt=\"\">'; brand.insertBefore(m, brand.firstChild);");
  troca("    let pin = false; try { pin = localStorage.getItem(K_PIN) === '1'; } catch (e) { /* ok */ }\n    app.classList.toggle('nd-pin', pin);\n  }",
        "    let pin = false; try { pin = localStorage.getItem(K_PIN) === '1'; } catch (e) { /* ok */ }\n    app.classList.toggle('nd-pin', pin);\n    aplicarLogoMenu();\n  }\n" +
        "  // Menu aberto: logo completo em branco (no clássico segue o logo original, que fica em data-orig)\n" +
        "  function aplicarLogoMenu() {\n    const img = document.querySelector('.sidebar .brand > img'); if (!img) return;\n    if (!img.dataset.orig) img.dataset.orig = img.getAttribute('src');\n    img.setAttribute('src', novo() ? '/logo-completo-branco.png' : img.dataset.orig);\n  }\n  window.addEventListener('proagro:tema', aplicarLogoMenu);");
});

edita('public/tema-listas.css', troca => {
  // área da marca com altura fixa
  troca("  html[data-ui=\"novo\"] .app.visible .sidebar .brand { padding: 18px 0 14px 14px; gap: 12px; justify-content: flex-start; border-bottom: 0; position: relative; }",
        "  html[data-ui=\"novo\"] .app.visible .sidebar .brand { box-sizing: border-box; min-height: 78px; padding: 16px 0 12px 14px; gap: 0; align-items: center; justify-content: flex-start; border-bottom: 0; position: relative; }");
  // logo completo (aberto)
  troca("{ display: block; height: 24px; animation: nd-fade .35s both; }",
        "{ display: block; height: 34px; width: auto; max-width: 168px; margin-left: 4px; animation: nd-fade .35s both; }");
  // símbolo (recolhido): só o desenho em branco, sem o quadrado verde com o "P"
  troca("  html[data-ui=\"novo\"] .nd-mark { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 15px; font: 800 17px var(--font); color: #fff; letter-spacing: -.03em; background: linear-gradient(135deg, #3DDC84, #00783F); box-shadow: 0 8px 20px -8px rgba(61,220,132,.8), inset 0 1px 0 rgba(255,255,255,.35); }",
        "  html[data-ui=\"novo\"] .nd-mark { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; }\n" +
        "  html[data-ui=\"novo\"] .nd-mark img { width: 46px; height: auto; display: block; filter: drop-shadow(0 4px 12px rgba(61,220,132,.45)); transition: transform .3s var(--curva); }\n" +
        "  html[data-ui=\"novo\"] .nd-mark:hover img { transform: scale(1.08); }\n" +
        "  html[data-ui=\"novo\"] .app.visible .sidebar:hover .nd-mark, html[data-ui=\"novo\"] .app.visible .sidebar:focus-within .nd-mark, html[data-ui=\"novo\"] .app.visible.nd-pin .sidebar .nd-mark { display: none; }");
  // botão de fixar alinhado ao centro da marca
  troca("position: absolute; right: 14px; top: 24px; width: 30px; height: 30px;", "position: absolute; right: 14px; top: 24px; width: 30px; height: 30px;");
});
console.log('ok');
