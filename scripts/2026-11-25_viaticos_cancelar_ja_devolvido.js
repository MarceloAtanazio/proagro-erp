// Propósito: no cancelamento de uma OT de viáticos com valor já transferido, perguntar se o valor JÁ FOI devolvido (estorno feito à mão no Flash).
//   Se foi, registra o valor devolvido e não gera pendência de devolução; se não, mantém a pendência (comportamento anterior).
// Entradas: api/index.js, public/app.js. Saídas: os mesmos arquivos alterados.
// Como executar: node scripts/2026-11-25_viaticos_cancelar_ja_devolvido.js (na raiz do projeto).
const fs = require('fs');
function aplica(arq, trocas) {
  let s = fs.readFileSync(arq, 'utf8');
  const crlf = s.includes('\r\n');
  if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of trocas) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`${arq}: trecho aparece ${n}x: ${a.slice(0, 70)}`);
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(arq, s);
}
aplica('api/index.js', [
  ["  const lib = n(s.valor_liberado);\n  await query(`UPDATE erp_viaticos_solicitacoes SET status='cancelada', status_manual=true, cancelada_em=now(), cancelada_por=$2, cancelamento_motivo=$3,\n      valor_devolvido=0, valor_pendencia=$4, pendencia_resolvida=$5 WHERE id=$1`, [s.id, req.user.id, motivo, lib, lib <= 0]);\n  res.json({ ok: true, pendencia: lib });",
   "  const lib = n(s.valor_liberado);\n  // O valor transferido pode já ter sido devolvido (estorno feito à mão no Flash): nesse caso informa-se quanto, e só o resto vira pendência.\n  let dev = 0;\n  if (req.body && req.body.valor_devolvido !== undefined && req.body.valor_devolvido !== null && req.body.valor_devolvido !== '') {\n    dev = Math.round(Number(req.body.valor_devolvido) * 100) / 100;\n    if (!Number.isFinite(dev) || dev < 0 || dev > lib + 0.005) return res.status(400).json({ error: `O valor devolvido deve ficar entre R$ 0,00 e o valor transferido (${fmtBRL(lib)}).` });\n  }\n  const pend = Math.max(0, Math.round((lib - dev) * 100) / 100);\n  await query(`UPDATE erp_viaticos_solicitacoes SET status='cancelada', status_manual=true, cancelada_em=now(), cancelada_por=$2, cancelamento_motivo=$3,\n      valor_devolvido=$6, valor_pendencia=$4, pendencia_resolvida=$5 WHERE id=$1`, [s.id, req.user.id, motivo, pend, pend <= 0.005, dev]);\n  res.json({ ok: true, pendencia: pend, devolvido: dev });"]
]);
aplica('public/app.js', [
  ["    ${lib > 0 ? `<div class=\"alert-item warn\" style=\"margin-bottom:10px\">⚠️ Já foram transferidos <strong>${brl(lib)}</strong> para esta OT. Ao cancelar, esse valor vira uma\n      <strong>pendência de devolução</strong> e aparece no painel Transferência da próxima OT para ser descontado.</div>` : ''}",
   "    ${lib > 0 ? `<div class=\"alert-item warn\" style=\"margin-bottom:10px\">⚠️ Já foram transferidos <strong>${brl(lib)}</strong> para esta OT. Se o valor ainda não voltou, ele vira uma\n      <strong>pendência de devolução</strong> e aparece no painel Transferência da próxima OT para ser descontado.</div>\n      <div class=\"field\" style=\"margin-bottom:10px\"><label>O valor transferido já foi devolvido (estorno no Flash)?</label>\n        <label style=\"display:flex;align-items:center;gap:8px;font-weight:400;margin:4px 0\"><input type=\"radio\" name=\"cn-dev\" value=\"sim\" style=\"width:auto;margin:0\"> Sim, já foi devolvido</label>\n        <div id=\"cn-dev-box\" style=\"display:none;margin:2px 0 6px 26px\"><label for=\"cn-dev-val\" style=\"font-weight:400\">Valor devolvido (R$)</label>\n          <input id=\"cn-dev-val\" type=\"number\" step=\"0.01\" min=\"0\" max=\"${lib}\" value=\"${lib.toFixed(2)}\" style=\"max-width:180px\"></div>\n        <label style=\"display:flex;align-items:center;gap:8px;font-weight:400;margin:4px 0\"><input type=\"radio\" name=\"cn-dev\" value=\"nao\" style=\"width:auto;margin:0\"> Não, ainda não foi devolvido (gera pendência)</label></div>` : ''}"],
  ["        const motivo = $('#cn-motivo').value.trim();\n        if (!motivo) return modalError('Informe o motivo do cancelamento.');",
   "        const motivo = $('#cn-motivo').value.trim();\n        if (!motivo) return modalError('Informe o motivo do cancelamento.');\n        let valor_devolvido;\n        if (lib > 0) {\n          const op = document.querySelector('input[name=\"cn-dev\"]:checked');\n          if (!op) return modalError('Informe se o valor transferido já foi devolvido.');\n          valor_devolvido = op.value === 'sim' ? Number($('#cn-dev-val').value) : 0;\n          if (op.value === 'sim' && (!(valor_devolvido >= 0) || valor_devolvido > lib + 0.005)) return modalError('Informe o valor devolvido (entre 0 e ' + brl(lib) + ').');\n        }"],
  ["await api(`/api/viaticos/solicitacoes/${s.id}/cancelar`, { method: 'POST', body: { motivo }, autosservico: true });\n          closeModal(); toast('OT cancelada.'); renderViaticos();",
   "await api(`/api/viaticos/solicitacoes/${s.id}/cancelar`, { method: 'POST', body: { motivo, valor_devolvido }, autosservico: true });\n          closeModal(); toast('OT cancelada.'); renderViaticos();"],
  ["    <div class=\"field\"><label for=\"cn-motivo\">Motivo do cancelamento</label>", "    <div class=\"field\"><label for=\"cn-motivo\">Motivo do cancelamento</label>"]
]);
console.log('ok');

// ---- 2ª parte: a pergunta só para o admin (quem faz o estorno no Flash) e o campo de valor aparece ao marcar "Sim" ----
aplica('public/app.js', [
  ["  const iniciada = ['em_viagem',", "  const perguntaDev = lib > 0 && typeof USER !== 'undefined' && USER.role === 'admin';\n  const iniciada = ['em_viagem',"],
  ["\n      <div class=\"field\" style=\"margin-bottom:10px\"><label>O valor transferido já foi devolvido (estorno no Flash)?</label>", "\n      ${perguntaDev ? `<div class=\"field\" style=\"margin-bottom:10px\"><label>O valor transferido já foi devolvido (estorno no Flash)?</label>"],
  ["Não, ainda não foi devolvido (gera pendência)</label></div>` : ''}", "Não, ainda não foi devolvido (gera pendência)</label></div>` : ''}` : ''}"],
  ["        if (lib > 0) {\n          const op = document.querySelector", "        if (perguntaDev) {\n          const op = document.querySelector"],
  ["btn.textContent = 'Cancelar a OT'; } }\n     } }]);\n}", "btn.textContent = 'Cancelar a OT'; } }\n     } }]);\n  document.querySelectorAll('input[name=\"cn-dev\"]').forEach(r => r.onchange = () => { const b = $('#cn-dev-box'); if (b) b.style.display = r.value === 'sim' && r.checked ? 'block' : 'none'; });\n}"]
]);
console.log('ok2');
