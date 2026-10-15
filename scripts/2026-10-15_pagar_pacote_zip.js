// Propósito: pacote ZIP da tesouraria em Contas a Pagar (Exportar > "Pacote ZIP (tesouraria)").
//   Reúne, dos títulos FILTRADOS na tela: PDF + Excel (com colunas Aprovação/Boleto) + Boletos/ + Aprovacoes/ (cada
//   aprovação uma vez só, Aprov-01…) + LEIAME.txt em espanhol (México). Usa JSZip (CDN) no navegador.
//   O código novo está em scripts/2026-10-15_pagar_pacote_zip_bloco.txt (texto puro) e é inserido em public/app.js.
// Entrada: public/app.js, public/styles.css, public/index.html e o bloco. Saída: os três arquivos editados.
// Uso: node scripts/2026-10-15_pagar_pacote_zip.js
const fs = require('fs'), path = require('path');
const BT = String.fromCharCode(96);
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); o.s = o.s.replace(de, () => para); }
function trecho(o, ini, fim, novo) {
  const a = o.s.indexOf(ini); const b = a < 0 ? -1 : o.s.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('marcadores não achados: ' + ini.slice(0, 70));
  o.s = o.s.slice(0, a) + novo + o.s.slice(b + fim.length);
}

const F = abrir('public/app.js');
const bloco = fs.readFileSync(path.join(__dirname, '2026-10-15_pagar_pacote_zip_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');

// ---- Excel: o fechamento passa a usar o montador global ----
trecho(F, "  const exportarPagarExcel = () => {\n", "    toast('Excel exportado.');\n  };\n",
  "  const exportarPagarExcel = () => {\n" +
  "    if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');\n" +
  "    XLSX.writeFile(pagarMontarExcel(lastFiltered), " + BT + "contas_a_pagar_${todayISO()}.xlsx" + BT + ");\n" +
  "    toast('Excel exportado.');\n  };\n");

// ---- PDF: o texto dos filtros vem de um helper (também usado no pacote) ----
trecho(F, "  const exportarPagarPDF = () => {\n    const parts = [];", "    exportPagarPDF(lastFiltered, parts.join('   ·   '));\n  };\n",
  "  const exportarPagarPDF = () => exportPagarPDF(lastFiltered, pagarFiltrosTexto('pt'));\n");

// ---- janela "Exportar" ----
trecho(F, "  $('#btn-export').onclick = () => openModal('Exportar Contas a Pagar',", "    ]);\n",
  "  $('#btn-export').onclick = () => openModal('Exportar Contas a Pagar',\n" +
  "    '<p style=\"font-size:13.5px; color:var(--ink-2)\">Em qual formato você quer exportar (respeitando os filtros aplicados na tela)?</p>' +\n" +
  "    '<p style=\"font-size:12.5px; color:var(--muted); margin-top:8px\">O <strong>pacote ZIP da tesouraria</strong> reúne, dos títulos filtrados, o PDF, o Excel, os boletos e as aprovações (cada aprovação uma vez só), mais um LEIAME.txt em espanhol.</p>',\n" +
  "    [\n" +
  "      { label: 'Cancelar', onClick: closeModal },\n" +
  "      { label: 'CSV', onClick: () => { closeModal(); exportarPagarCSV(); } },\n" +
  "      { label: 'Excel', onClick: () => { closeModal(); exportarPagarExcel(); } },\n" +
  "      { label: 'PDF', onClick: () => { closeModal(); exportarPagarPDF(); } },\n" +
  "      { label: 'Pacote ZIP (tesouraria)', cls: 'primary', onClick: () => { closeModal(); pagarGerarPacote(lastFiltered); } }\n" +
  "    ]);\n");

// ---- funções novas ----
troca(F, "function baixaPagar(r) {", bloco + "function baixaPagar(r) {");

// ---- exportPagarPDF: modo pacote (colunas Aprovação/Boleto e devolver o arquivo em vez de baixar) ----
troca(F, "async function exportPagarPDF(rows, filtersLabel) {", "async function exportPagarPDF(rows, filtersLabel, opts = {}) {");
troca(F, "      r.status === 'pago' ? " + BT + "Pago em ${brDate(r.payment_date)}" + BT + " : (r.due_date < todayISO() ? 'Vencido' : 'Pendente')\n    ]);",
         "      r.status === 'pago' ? " + BT + "Pago em ${brDate(r.payment_date)}" + BT + " : (r.due_date < todayISO() ? 'Vencido' : 'Pendente'),\n" +
         "      ...(opts.refs ? [(opts.refs[r.id] && opts.refs[r.id].aprov) || '—', (opts.refs[r.id] && opts.refs[r.id].boleto) || '—'] : [])\n    ]);");
troca(F, "head: [['ID', 'Venc.', 'Descrição', 'Fornecedor', 'Categoria', 'Centro de Custo', 'Forma de Pagamento', 'Valor', 'Status']],",
         "head: [['ID', 'Venc.', 'Descrição', 'Fornecedor', 'Categoria', 'Centro de Custo', 'Forma de Pagamento', 'Valor', 'Status', ...(opts.refs ? ['Aprovação', 'Boleto'] : [])]],");
troca(F, "0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 22 }, 7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 24 }",
         "0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 22 }, 7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 24 }, 9: { cellWidth: 22 }, 10: { cellWidth: 14 }");
troca(F, "    doc.save(" + BT + "contas_a_pagar_${todayISO()}.pdf" + BT + ");\n    toast('PDF gerado com sucesso.');",
         "    if (opts.blob) return doc.output('blob');\n    doc.save(" + BT + "contas_a_pagar_${todayISO()}.pdf" + BT + ");\n    toast('PDF gerado com sucesso.');");
salvar(F);

// ---- CSS da janela de progresso ----
const C = abrir('public/styles.css');
troca(C, ".att-vinc-count { display: block; margin-top: 6px; color: var(--muted); }",
".att-vinc-count { display: block; margin-top: 6px; color: var(--muted); }\n\n" +
"/* ===== Pacote ZIP da tesouraria: janela de progresso e resumo ===== */\n" +
".pk-barra { height: 8px; background: #E4EAE6; border-radius: 6px; overflow: hidden; }\n" +
".pk-barra > div { height: 100%; width: 0; background: var(--verde-500); transition: width .2s ease; }\n" +
".pk-resumo { margin: 6px 0 0 18px; padding: 0; font-size: 13px; line-height: 1.55; }");
salvar(C);

// ---- biblioteca de ZIP ----
const H = abrir('public/index.html');
troca(H, '<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>',
         '<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>\n  <!-- JSZip: monta o pacote ZIP da tesouraria (Contas a Pagar) no próprio navegador. -->\n  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>');
salvar(H);
console.log('ok');
