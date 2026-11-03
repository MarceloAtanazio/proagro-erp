// Propósito: botão "Transferência" na linha de cada OT de Viáticos (entre Comprovar e Editar). Abre um painel que junta as ocorrências anteriores do
//   colaborador (pendências em aberto, com a OT e a origem de cada uma), calcula o valor LÍQUIDO a transferir no Flash (bruto − desconto), tem
//   "Copiar valor" e REGISTRA a transferência (grava o líquido como valor liberado e a decisão sobre a pendência, de uma vez). Em OT que já teve o
//   valor registrado, ou fechada, ou para quem não é administrador, é só consulta (mostra o que foi descontado nela). Mostra também as outras OTs do
//   colaborador ainda não fechadas: a pendência delas só nasce no fechamento e vale para a próxima transferência. Sem mudança no banco.
//   Backend: GET /api/viaticos/solicitacoes/:id/transferencia (descontadas nesta transferência + outras OTs abertas). O registro usa a rota que já
//   existia (POST /api/viaticos/solicitacoes/:id/status), com as mesmas travas (administrador).
// Entrada: api/index.js e public/app.js (ou a pasta indicada em argv[2]) e os blocos scripts/2026-11-04_viaticos_transferencia_*_bloco.txt.
// Saída: os dois arquivos editados. Uso: node scripts/2026-11-04_viaticos_transferencia.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => {
    const i = s.indexOf(m);
    if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80));
    if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80));
  };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    antes: (m, t) => { unico(m); const i = s.indexOf(m); s = s.slice(0, i) + t + s.slice(i); }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('api/index.js', ({ antes }) => {
  antes('// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente', bloco('2026-11-04_viaticos_transferencia_api_bloco.txt'));
});

edita('public/app.js', ({ troca, antes }) => {
  antes('// De onde vem cada pendência a descontar na próxima OT (o servidor diz a origem).', bloco('2026-11-04_viaticos_transferencia_front_bloco.txt'));
  troca('            <button class="btn sm" data-edit="${s.id}">Editar</button>',
    '            <button class="btn sm" data-transf="${s.id}" title="Confere as ocorrências anteriores e registra o valor a transferir no Flash">Transferência</button>\n' +
    '            <button class="btn sm" data-edit="${s.id}">Editar</button>');
  troca("    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formSolicitacao(sols.find(s => s.id == b.dataset.edit)));",
    "    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formSolicitacao(sols.find(s => s.id == b.dataset.edit)));\n" +
    "    $('#tbl').querySelectorAll('[data-transf]').forEach(b => b.onclick = () => viaTransferenciaModal(sols.find(s => s.id == b.dataset.transf)));");
});
console.log('ok');
