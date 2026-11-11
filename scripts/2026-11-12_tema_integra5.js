// Propósito: quinta rodada do TEMA (visual novo): Fluxo de Caixa no estilo do Dashboard (public/tema-fluxo.js e tema-fluxo.css), repaginado POR CIMA da tela original (filtros,
//   Solicitar aporte, exportações, gráficos e tabelas seguem os de app.js). Liga os arquivos e faz as mudanças mínimas nos existentes:
//   app.js: renderFluxo entrega os dados a window.ProagroFluxo; index.html: carrega tema-fluxo.css/.js; tema-dashboard.js: exporta sparkline e conta também porcentagem;
//   tema-paginas.js: chama ProagroNovo.fluxo() ao enfeitar a página 'fluxo' e mostra o período na etiqueta do cabeçalho.
// Entrada: public/ (ou a pasta indicada em argv[2]). Saída: arquivos editados. Uso (depois de 2026-11-12_tema_integra4.js): node scripts/2026-11-12_tema_integra5.js [raiz]
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
  troca('  <link rel="stylesheet" href="/tema-paginas.css">\n', '  <link rel="stylesheet" href="/tema-paginas.css">\n  <link rel="stylesheet" href="/tema-fluxo.css">\n');
  troca('  <script src="/tema-paginas.js"></script>\n', '  <script src="/tema-paginas.js"></script>\n  <script src="/tema-fluxo.js"></script>\n');
});
edita('public/app.js', troca => {
  troca("  const d = await api('/api/reports/fluxo-caixa?' + params.toString());\n  const c = $('#content');",
        "  const d = await api('/api/reports/fluxo-caixa?' + params.toString());\n  window.ProagroFluxo = { d };   // visual novo (tema-fluxo.js) lê os dados daqui\n  const c = $('#content');");
});
edita('public/tema-dashboard.js', troca => {
  troca("const mostra = v => { el.textContent = fmt === 'int' ? Math.round(v).toLocaleString('pt-BR') : brl(v); };",
        "const mostra = v => { el.textContent = fmt === 'int' ? Math.round(v).toLocaleString('pt-BR') : fmt === 'pct' ? Math.round(v).toLocaleString('pt-BR') + '%' : brl(v); };");
  troca("{ dashboard, contar });", "{ dashboard, contar, sparkline });");
});
edita('public/tema-paginas.js', troca => {
  troca("    if ((hash === 'pagar' || hash === 'receber') && window.ProagroNovo && ProagroNovo.financeiro) ProagroNovo.financeiro(hash);",
        "    if ((hash === 'pagar' || hash === 'receber') && window.ProagroNovo && ProagroNovo.financeiro) ProagroNovo.financeiro(hash);\n    if (hash === 'fluxo' && window.ProagroNovo && ProagroNovo.fluxo) ProagroNovo.fluxo();");
  troca("  const EXTRA = {\n", "  const EXTRA = {\n    fluxo: () => { const f = window.ProagroFluxo && ProagroFluxo.d; return f ? [{ t: brDate(f.de) + ' – ' + brDate(f.ate), cls: '' }] : []; },\n");
});
console.log('ok');
