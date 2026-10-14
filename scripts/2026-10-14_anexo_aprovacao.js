// Propósito: Contas a Pagar — no "Adicionar documento" dos anexos, "Contrato assinado" dá lugar a "Aprovação"
//   (documento do Approvals com a aprovação da diretoria). Os outros módulos (ex.: Contratos) mantêm "Contrato assinado".
// Entrada: api/index.js e public/app.js. Saída: os mesmos arquivos editados.
// Uso: node scripts/2026-10-14_anexo_aprovacao.js
const fs = require('fs'), path = require('path');
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 80)); o.s = o.s.replace(de, () => para); }

const A = abrir('api/index.js');
troca(A, "const ATTACH_KINDS = ['boleto', 'nota_fiscal', 'comprovante', 'contrato', 'outro'];", "const ATTACH_KINDS = ['boleto', 'nota_fiscal', 'comprovante', 'contrato', 'aprovacao', 'outro'];");
salvar(A);

const F = abrir('public/app.js');
troca(F, "contrato: 'Contrato', outro: 'Outro' };", "contrato: 'Contrato', aprovacao: 'Aprovação', outro: 'Outro' };");
troca(F, "contrato: '📑', outro: '📎' };", "contrato: '📑', aprovacao: '🖋️', outro: '📎' };");
troca(F, "            ${opt('contrato', 'Contrato assinado')}\n",
         "            ${type === 'payable' ? opt('aprovacao', 'Aprovação') : opt('contrato', 'Contrato assinado')}\n");
salvar(F);
console.log('ok');
