// Propósito: liga a repaginada dos indicadores do Quadro de RH (visual Novo): public/tema-rh.js/.css.
//   public/app.js: ao fim de rhPainel dispara o evento 'proagro:rh' (o módulo novo transforma os cartões e barras); public/index.html: carrega tema-rh.css e tema-rh.js.
//   Sem mudança de comportamento no visual Clássico.
// Entrada: public/app.js e public/index.html (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_rh_painel_ganchos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', troca => {
  troca("    olho.title = olho.ariaLabel = RH_CUSTO_OCULTO ? 'Mostrar valores' : 'Ocultar valores';\n  };\n}\n\nfunction rhFormClima() {",
    "    olho.title = olho.ariaLabel = RH_CUSTO_OCULTO ? 'Mostrar valores' : 'Ocultar valores';\n  };\n  setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:rh')), 0);   // visual Novo (tema-rh.js)\n}\n\nfunction rhFormClima() {");
});
edita('public/index.html', troca => {
  troca('<link rel="stylesheet" href="/tema-orcado.css">', '<link rel="stylesheet" href="/tema-orcado.css">\n  <link rel="stylesheet" href="/tema-rh.css">');
  troca('<script src="/tema-orcado.js"></script>', '<script src="/tema-orcado.js"></script>\n  <script src="/tema-rh.js"></script>');
});
console.log('ok');
