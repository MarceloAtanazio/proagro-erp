// Propósito: terceira rodada do TEMA (visual novo): liga ao sistema as listas repaginadas (public/tema-listas.js e tema-listas.css: Contas a Pagar e Contas a Receber
//   com resumo, abas de status, seleção e barra de totais; demais listas ganham as linhas em cartões só pelo CSS) e o novo menu lateral em trilho (tema-casca.js).
//   index.html: carrega tema-listas.css e tema-listas.js. app.js: renderPagar/renderReceber entregam suas linhas a window.ProagroFin (o módulo novo lê de lá);
//   route() avisa o visual novo quando a página termina de desenhar (ProagroNovo.pagina). No clássico nada disso age.
// Entrada: public/index.html e public/app.js (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso (depois de 2026-11-11_tema_integra2.js): node scripts/2026-11-12_tema_integra3.js [raiz]
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
  troca('  <link rel="stylesheet" href="/tema-novo.css">\n', '  <link rel="stylesheet" href="/tema-novo.css">\n  <link rel="stylesheet" href="/tema-listas.css">\n');
  troca('  <script src="/tema-dashboard.js"></script>\n', '  <script src="/tema-dashboard.js"></script>\n  <script src="/tema-listas.js"></script>\n');
});
edita('public/app.js', troca => {
  troca("  const [rows, sups] = await Promise.all([api('/api/payables'), api('/api/suppliers')]);\n  const c = $('#content');",
        "  const [rows, sups] = await Promise.all([api('/api/payables'), api('/api/suppliers')]);\n  window.ProagroFin = { tipo: 'pagar', rows };   // visual novo (tema-listas.js) lê as linhas daqui\n  const c = $('#content');");
  troca("  const rows = await api('/api/receivables');\n  const c = $('#content');",
        "  const rows = await api('/api/receivables');\n  window.ProagroFin = { tipo: 'receber', rows };   // visual novo (tema-listas.js) lê as linhas daqui\n  const c = $('#content');");
  troca("    .then(() => { if (READONLY) { injectReadonlyBanner(); bloquearEscritaSomenteLeitura(page.hash); } })",
        "    .then(() => { if (READONLY) { injectReadonlyBanner(); bloquearEscritaSomenteLeitura(page.hash); } if (window.ProagroNovo && ProagroNovo.pagina) ProagroNovo.pagina(page.hash); })");
});
console.log('ok');
