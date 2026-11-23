// Propósito: o Pacote ZIP da tesouraria passa a perguntar a data de pagamento do lote Santander antes de gerar.
// Entradas: public/app.js. Saídas: public/app.js alterado (nova função pagarPacoteComData e parâmetro dataPg em pagarGerarPacote).
// Como executar: node scripts/2026-11-23_pacote_data_pagamento.js (na raiz do projeto).
const fs = require('fs');
let s = fs.readFileSync('public/app.js', 'utf8');
const troca = (a, b) => { if (s.split(a).length !== 2) throw new Error('trecho não único: ' + a.slice(0, 50)); s = s.replace(a, () => b); };
troca("async function pagarGerarPacote(rows) {", `// Antes do pacote: pergunta a data de pagamento que vai nas planilhas do lote Santander (vazio = vencimento de cada título).
function pagarPacoteComData(rows) {
  if (!rows.length) return toast('Nenhum título nos filtros atuais para exportar.');
  openModal('Data de pagamento do lote', \`
    <p style="font-size:13.5px;color:var(--ink-2)">Os \${rows.length} título(s) da tela entram no pacote. Informe a data em que a tesouraria deve pagar; ela vai nas planilhas de PIX e de boleto do Santander.</p>
    <div class="field" style="margin-top:12px"><label for="pk-data">Data de pagamento</label><input type="date" id="pk-data" value="\${todayISO()}" min="\${todayISO()}"></div>
    <p class="hint" style="margin-top:8px">Deixe em branco para usar o vencimento de cada título.</p>\`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Gerar pacote', cls: 'primary', onClick: () => {
        const d = $('#pk-data').value;
        if (d && d < todayISO()) return modalError('A data de pagamento não pode ser anterior a hoje.');
        closeModal(); pagarGerarPacote(rows, d || null);
     } }]);
}

async function pagarGerarPacote(rows, dataPg) {`);
troca("body: { ids: rows.map(r => r.id), simular: false, reenviar: true } }); }", "body: { ids: rows.map(r => r.id), simular: false, reenviar: true, data_pagamento: dataPg || null } }); }");
troca("zip: () => pagarGerarPacote(lastFiltered)", "zip: () => pagarPacoteComData(lastFiltered)");
fs.writeFileSync('public/app.js', s);
