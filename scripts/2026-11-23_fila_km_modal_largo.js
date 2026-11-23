// Propósito: Viáticos > "Reembolsos de quilometragem a aprovar": alarga o modal (de 900 para 1100px, classe modal-xwide) e reduz o min-width da tabela (930 -> 880px) para a coluna "A ressarcir"
//   e as ações aparecerem sem rolagem horizontal.
// Entrada: public/app.js e public/styles.css. Saída: arquivos editados (já aplicado por sed nesta sessão; este arquivo documenta a troca).
// Como executar: node scripts/2026-11-23_fila_km_modal_largo.js [raiz]
const fs = require('fs'), path = require('path'); const r = process.argv[2] || path.join(__dirname, '..');
let a = fs.readFileSync(path.join(r, 'public/app.js'), 'utf8'), c = fs.readFileSync(path.join(r, 'public/styles.css'), 'utf8');
const i = a.indexOf("openModal('Reembolsos de quilometragem a aprovar'"), j = a.indexOf("{ wide: true });", i);
if (i < 0 || j < 0 || j - i > 4000) throw new Error('âncora não achada (já aplicado?)');
a = a.slice(0, j) + '{ xwide: true });' + a.slice(j + '{ wide: true });'.length);
c = c.replace('.tbl-rh-km { min-width: 930px; }', '.tbl-rh-km { min-width: 880px; }');
fs.writeFileSync(path.join(r, 'public/app.js'), a); fs.writeFileSync(path.join(r, 'public/styles.css'), c); console.log('ok');
