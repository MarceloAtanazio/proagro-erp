// Propósito: reorganiza o modal "Exportar Contas a Pagar" (botões quebrados e desproporcionais) em uma grade de opções.
// Entradas: public/app.js, public/styles.css. Saídas: os mesmos arquivos alterados.
// Como executar: node scripts/2026-11-23_exportar_pagar_botoes.js (na raiz do projeto).
const fs = require('fs');
let s = fs.readFileSync('public/app.js', 'utf8');
const ini = s.indexOf("  $('#btn-export').onclick = () => openModal('Exportar Contas a Pagar',");
const fim = s.indexOf("\n  draw();\n}", ini);
if (ini < 0 || fim < 0) throw new Error('trecho não encontrado');
const bloco = `  $('#btn-export').onclick = () => {
    const op = (k, t, d, cls) => '<button type="button" class="exp-op ' + (cls || '') + '" data-exp="' + k + '"><strong>' + t + '</strong><span>' + d + '</span></button>';
    openModal('Exportar Contas a Pagar',
      '<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato você quer exportar (respeitando os filtros aplicados na tela)?</p>' +
      '<div class="exp-grade">' +
        op('zip', 'Pacote ZIP (tesouraria)', 'PDF, Excel, boletos e aprovações (cada aprovação uma vez só), LEIAME.txt em espanhol e as planilhas do lote Santander. Marca os títulos como enviados à tesouraria.', 'exp-main') +
        op('lote', 'Lote Santander', 'Só as planilhas de PIX e de boleto no layout do banco.') +
        op('pdf', 'PDF', 'Relatório da tela.') +
        op('excel', 'Excel', 'Planilha .xlsx.') +
        op('csv', 'CSV', 'Arquivo de texto separado por ponto e vírgula.') +
      '</div>',
      [{ label: 'Cancelar', onClick: closeModal }], { wide: true });
    const acao = { zip: () => pagarGerarPacote(lastFiltered), lote: () => pagarLoteSantander(lastFiltered), pdf: exportarPagarPDF, excel: exportarPagarExcel, csv: exportarPagarCSV };
    document.querySelectorAll('.exp-op').forEach(b => { b.onclick = () => { closeModal(); acao[b.dataset.exp](); }; });
  };
`;
s = s.slice(0, ini) + bloco + s.slice(fim);
fs.writeFileSync('public/app.js', s);
let c = fs.readFileSync('public/styles.css', 'utf8');
if (!c.includes('.exp-grade')) c += `
/* Modal Exportar Contas a Pagar: opções em grade, todas do mesmo tamanho */
.exp-grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.exp-op { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; padding: 12px 14px; border: 1px solid var(--line, #dfe4e1); border-radius: 12px; background: var(--surface, #fff); color: var(--ink, inherit); cursor: pointer; font: inherit; transition: border-color .15s, box-shadow .15s; }
.exp-op strong { font-size: 14px; }
.exp-op span { font-size: 12px; line-height: 1.4; color: var(--muted); }
.exp-op:hover, .exp-op:focus-visible { border-color: var(--verde-600, #0f8a4f); box-shadow: 0 0 0 3px rgba(15,138,79,.12); outline: none; }
.exp-op.exp-main { grid-column: 1 / -1; background: linear-gradient(135deg, #0f8a4f, #0b6b3d); border-color: transparent; }
.exp-op.exp-main strong, .exp-op.exp-main span { color: #fff; }
.exp-op.exp-main span { opacity: .9; }
@media (max-width: 560px) { .exp-grade { grid-template-columns: 1fr; } }
`;
fs.writeFileSync('public/styles.css', c);
