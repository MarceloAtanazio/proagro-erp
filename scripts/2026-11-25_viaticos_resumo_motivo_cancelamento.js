// Propósito: no quadro verde de resumo da OT (Viáticos > Comprovar viagem), (1) mostrar o motivo do cancelamento quando a OT está cancelada e
//   (2) alargar o modal e reorganizar o quadro para as informações não quebrarem (destinos em linha própria, largura total).
// Entradas: public/app.js. Saídas: o mesmo arquivo alterado. Não depende de migração (cancelamento_motivo/cancelada_em já existem e vêm em s.*).
// Como executar: node scripts/2026-11-25_viaticos_resumo_motivo_cancelamento.js (na raiz do projeto).
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
aplica('public/app.js', [
  ["      <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 16px; font-size:13px\">\n        <div><small style=\"color:var(--muted)\">Ordem de Trabalho</small><br><strong>${s.ordem_trabalho ? 'OT ' + esc(s.ordem_trabalho) : '—'}</strong></div>\n        <div><small style=\"color:var(--muted)\">Destinos</small><br><strong>${destinosTxt}</strong></div>\n        <div><small style=\"color:var(--muted)\">Local / Tier</small>",
   "      <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:12px 20px; font-size:13px\">\n        <div><small style=\"color:var(--muted)\">Ordem de Trabalho</small><br><strong>${s.ordem_trabalho ? 'OT ' + esc(s.ordem_trabalho) : '—'}</strong></div>\n        <div><small style=\"color:var(--muted)\">Local / Tier</small>"],
  ["        <div><small style=\"color:var(--muted)\">Status</small><br><span class=\"badge ${VIA_STATUS_BADGE[s.status]}\">${VIA_STATUS_LABEL[s.status]}</span></div>\n      </div>",
   "        <div><small style=\"color:var(--muted)\">Status</small><br><span class=\"badge ${VIA_STATUS_BADGE[s.status]}\">${VIA_STATUS_LABEL[s.status]}</span></div>\n        <div style=\"grid-column:1 / -1\"><small style=\"color:var(--muted)\">Destinos</small><br><strong>${destinosTxt}</strong></div>\n      </div>\n      ${s.status === 'cancelada' && s.cancelamento_motivo ? `<div class=\"alert-item warn\" style=\"margin-top:12px\"><strong>Motivo do cancelamento</strong>${s.cancelada_em ? ` <small style=\"color:var(--muted)\">· em ${brDate(String(s.cancelada_em).slice(0, 10))}</small>` : ''}<br>${esc(s.cancelamento_motivo)}</div>` : ''}"],
  ["    body, botoes, { wide: true });", "    body, botoes, { wide: true, xwide: true });"]
]);
console.log('ok');
