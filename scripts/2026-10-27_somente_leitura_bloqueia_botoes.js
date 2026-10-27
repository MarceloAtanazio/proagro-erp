// Propósito: quem tem só LEITURA numa página do Financeiro via os botões de lançar/editar/excluir normalmente
//   (o clique abria o formulário e só o "Salvar" era recusado). Agora esses botões ficam desabilitados, com a dica
//   "Somente leitura". O backend já recusava a escrita (403); isto só tira o clique inútil.
// Entrada: public/app.js e public/styles.css (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso: node scripts/2026-10-27_somente_leitura_bloqueia_botoes.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, trocas) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [de, para] of trocas) { if (!s.includes(de)) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 60)); s = s.replace(de, () => para); }
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', [
[`    .then(() => { if (READONLY) injectReadonlyBanner(); })`,
 `    .then(() => { if (READONLY) { injectReadonlyBanner(); bloquearEscritaSomenteLeitura(page.hash); } })`],
[`function injectReadonlyBanner() {`,
`// Botões que gravam dados nas páginas do Financeiro, por página. Viáticos, Suprimentos e Recursos Humanos já
// não desenham esses botões para quem só lê; aqui as páginas que os desenhavam sempre. A lista é por página
// porque [data-edit] e afins significam outra coisa em outras telas.
const ESCRITA_SOMENTE_LEITURA = {
  pagar: ['#btn-new', '[data-pay]', '[data-unpay]', '[data-edit]', '[data-del]'],
  receber: ['#btn-new', '[data-rec]', '[data-unrec]', '[data-edit]', '[data-del]'],
  fluxo: ['#fx-aporte'],
  fornecedores: ['#btn-new', '[data-edit]', '[data-del]'],
  contratos: ['#ct-new', '[data-gerar]', '[data-edit]', '[data-status]', '[data-del]'],
  conciliacao: ['#btn-manual', '#btn-import', '[data-rec]', '[data-unrec]', '[data-confirm]', '[data-del]'],
  orcamento: ['[data-addcat]', '[data-addcc]', '[data-delcat]', '[data-fill]', '[data-delline]', '#btn-save', 'input[data-month]']
};
let roObservador = null;
function bloquearEscritaSomenteLeitura(hash) {
  if (roObservador) { roObservador.disconnect(); roObservador = null; }
  const sel = (ESCRITA_SOMENTE_LEITURA[hash] || []).join(',');
  const c = $('#content');
  if (!sel || !c) return;
  const aplicar = () => c.querySelectorAll(sel).forEach(b => {
    if (b.disabled) return;
    b.disabled = true; b.classList.add('ro-bloqueado'); b.title = 'Somente leitura: seu acesso a esta seção não permite alterar dados.';
  });
  aplicar();
  // As tabelas se redesenham a cada filtro; sem observar, os botões novos nasceriam clicáveis.
  roObservador = new MutationObserver(aplicar);
  roObservador.observe(c, { childList: true, subtree: true });
}

function injectReadonlyBanner() {`]]);
edita('public/styles.css', [[`.ro-banner {`,
`.ro-bloqueado, .ro-bloqueado:hover { opacity: .4; cursor: not-allowed; pointer-events: auto; }
.ro-banner {`]]);
console.log('ok');
