// Propósito: botão "Cancelar" na linha da OT de Viáticos (tela). Aparece para o solicitante (dono da OT) e para quem edita Viáticos, enquanto a
//   OT é cancelável: 'Em Approvals', ou 'Transferência Agendada'/'Liberado' antes da data de saída. Abre um pedido de motivo (obrigatório),
//   avisa quando já há valor transferido (vira pendência de devolução, a descontar na próxima OT) e chama POST /api/viaticos/solicitacoes/:id/cancelar.
//   Novo status "Cancelada" (selo cinza, com o motivo no detalhe) e a origem "cancelamento" nas pendências.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado. Uso: node scripts/2026-11-05_viaticos_cancelar_front.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 90));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 90));
  s = s.replace(de, () => para);
};

troca("  comprovado: 'Comprovado', devolvido: 'Devolvido (sobrou)', divergente: 'Divergente (estourou)', arquivado: 'Arquivado'\n};",
      "  comprovado: 'Comprovado', devolvido: 'Devolvido (sobrou)', divergente: 'Divergente (estourou)', arquivado: 'Arquivado', cancelada: 'Cancelada'\n};");
troca("  comprovado: 'ok', devolvido: 'ok', divergente: 'late', arquivado: 'off'", "  comprovado: 'ok', devolvido: 'ok', divergente: 'late', arquivado: 'off', cancelada: 'off'");
troca("  'excesso+flash': 'excesso e despesa reprovada no Flash',", "  cancelamento: 'OT cancelada com valor já transferido', 'excesso+flash': 'excesso e despesa reprovada no Flash',");

// janela de cancelamento (igual à do servidor) + modal
troca("async function viewSolicitacao(id) {",
`// Cancelável = antes de a viagem começar. Em Approvals vale sempre; Transferência Agendada e Liberado só antes da data de saída (igual ao servidor).
function viaPodeCancelar(s) {
  if (s.status === 'em_approvals') return true;
  return ['transferencia_agendada', 'liberado'].includes(s.status) && todayISO() < String(s.data_inicio).slice(0, 10);
}
function viaCancelarModal(s) {
  const lib = Number(s.valor_liberado) || 0;
  openModal(\`Cancelar OT \${esc(s.ordem_trabalho || s.id)}\`, \`
    <p style="font-size:13.5px; color:var(--ink-2); margin:0 0 10px">Use quando a solicitação foi feita por engano ou a viagem não vai mais acontecer.
      A OT não é apagada: fica no histórico como <strong>Cancelada</strong>, com o motivo.</p>
    \${lib > 0 ? \`<div class="alert-item warn" style="margin-bottom:10px">⚠️ Já foram transferidos <strong>\${brl(lib)}</strong> para esta OT. Ao cancelar, esse valor vira uma
      <strong>pendência de devolução</strong> e aparece no painel Transferência da próxima OT para ser descontado.</div>\` : ''}
    <div class="field"><label for="cn-motivo">Motivo do cancelamento</label><textarea id="cn-motivo" rows="3" placeholder="Ex.: solicitação duplicada, viagem desnecessária…"></textarea></div>\`,
    [{ label: 'Voltar', onClick: closeModal },
     { label: 'Cancelar a OT', cls: 'danger', onClick: async (ev) => {
        const motivo = $('#cn-motivo').value.trim();
        if (!motivo) return modalError('Informe o motivo do cancelamento.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Cancelando…'; }
        try {
          await api(\`/api/viaticos/solicitacoes/\${s.id}/cancelar\`, { method: 'POST', body: { motivo }, autosservico: true });
          closeModal(); toast('OT cancelada.'); renderViaticos();
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Cancelar a OT'; } }
     } }]);
}

async function viewSolicitacao(id) {`);

// botão na linha (antes do "Complementar") e o clique
troca("            ${meuColaborador && s.colaborador_id === meuColaborador.id && ['transferencia_agendada', 'liberado', 'em_viagem'].includes(s.status) ? ",
      "            ${viaPodeCancelar(s) && ((meuColaborador && s.colaborador_id === meuColaborador.id) || !READONLY) ? `<button class=\"btn sm danger-ghost\" data-cancelar=\"${s.id}\" title=\"Cancelar esta OT (antes de a viagem começar)\">Cancelar</button>` : ''}\n" +
      "            ${meuColaborador && s.colaborador_id === meuColaborador.id && ['transferencia_agendada', 'liberado', 'em_viagem'].includes(s.status) ? ");
troca("    $('#tbl').querySelectorAll('[data-compl]').forEach(",
      "    $('#tbl').querySelectorAll('[data-cancelar]').forEach(b => b.onclick = () => viaCancelarModal(sols.find(s => s.id == b.dataset.cancelar)));\n" +
      "    $('#tbl').querySelectorAll('[data-compl]').forEach(");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
