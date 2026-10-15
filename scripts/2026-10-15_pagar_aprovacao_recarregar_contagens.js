// Propósito: ao EXCLUIR uma aprovação compartilhada (arquivo do título dono), os outros títulos perdem a aprovação no
//   servidor; a tabela precisa refletir isso na hora. Recarrega as contagens (Aprov. e 📎) de todos os títulos
//   depois dessa exclusão, em vez de atualizar só o título aberto.
// Entrada: public/app.js. Saída: public/app.js editado. Uso: node scripts/2026-10-15_pagar_aprovacao_recarregar_contagens.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

troca(s.includes('') ? "// Lista de títulos com caixa de seleção (aprovação compartilhada).\n" : '',
`// Busca de novo as contagens de anexos/aprovação de todos os títulos e atualiza a tabela. Usado depois de excluir uma
// aprovação compartilhada: outros títulos, que não estão abertos no modal, também perderam a aprovação.
async function pagarRecarregarContagens() {
  try {
    const novas = await api('/api/payables');
    novas.forEach(n => { if (PAGAR_TODOS.some(x => x.id === n.id)) pagarSyncAprov(n.id, n.aprovacao_count, n.attachment_count); });
  } catch { /* a tabela se corrige na próxima carga */ }
}

// Lista de títulos com caixa de seleção (aprovação compartilhada).
`);
troca("try { await api(`/api/attachments/${b.dataset.attdel}`, { method: 'DELETE' }); toast('Anexo excluído.'); openAttachments(type, id, label); }",
      "try {\n                await api(`/api/attachments/${b.dataset.attdel}`, { method: 'DELETE' }); toast('Anexo excluído.');\n                if (type === 'payable' && alvo.vale_para_outros) await pagarRecarregarContagens();\n                openAttachments(type, id, label);\n              }");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
