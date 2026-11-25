// Propósito: permite que o ADMIN cancele uma OT de viáticos mesmo depois de a viagem ter começado (ex.: colaborador afastado por atestado),
//   com justificativa obrigatória. Antes só dava para cancelar antes da data de saída.
// Entradas: api/index.js, public/app.js. Saídas: os mesmos arquivos alterados.
// Regras: só admin; só OT em transferencia_agendada/liberado/em_viagem/aguardando_comprovacao; recusa se já houver despesa lançada
//   na OT (a comprovação precisa ser resolvida antes); o valor já transferido vira pendência de devolução (mecanismo existente).
// Como executar: node scripts/2026-11-25_viaticos_admin_cancela_ot_iniciada.js (na raiz do projeto).
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
  ["  if (!['em_approvals', 'transferencia_agendada', 'liberado'].includes(s.status)) {\n    return res.status(400).json({ error: s.status === 'cancelada' ? 'Esta OT já está cancelada.' : 'Só dá para cancelar antes da viagem começar. Para esta OT, fale com o administrador.' });\n  }\n  const iso = v => (v == null ? '' : typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));\n  if (s.status !== 'em_approvals' && hojeISO() >= iso(s.data_inicio)) {\n    return res.status(400).json({ error: 'A viagem já começou: só dá para cancelar antes da data de saída. Fale com o administrador.' });\n  }",
   "  const admin = req.user.role === 'admin';\n  // O administrador também cancela com a viagem em curso (ex.: colaborador afastado por atestado); os demais, só antes da saída.\n  const cancelaveis = admin ? ['em_approvals', 'transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'] : ['em_approvals', 'transferencia_agendada', 'liberado'];\n  if (!cancelaveis.includes(s.status)) {\n    return res.status(400).json({ error: s.status === 'cancelada' ? 'Esta OT já está cancelada.' : (admin ? 'Esta OT já foi comprovada ou fechada e não pode mais ser cancelada.' : 'Só dá para cancelar antes da viagem começar. Para esta OT, fale com o administrador.') });\n  }\n  const iso = v => (v == null ? '' : typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));\n  if (!admin && s.status !== 'em_approvals' && hojeISO() >= iso(s.data_inicio)) {\n    return res.status(400).json({ error: 'A viagem já começou: só dá para cancelar antes da data de saída. Fale com o administrador.' });\n  }\n  if (admin && !['em_approvals', 'transferencia_agendada', 'liberado'].includes(s.status)) {\n    const dsp = n((await query('SELECT COUNT(*) AS c FROM erp_viaticos_despesas WHERE solicitacao_id = ANY($1::int[])', [await idsFamilia(s.id)]))[0].c);\n    if (dsp > 0) return res.status(400).json({ error: `Esta OT já tem ${dsp} despesa(s) lançada(s). Resolva a comprovação (exclua as despesas ou feche a OT) antes de cancelar.` });\n  }"]
]);
aplica('public/app.js', [
  ["function viaPodeCancelar(s) {\n  if (s.status === 'em_approvals') return true;", "function viaPodeCancelar(s) {\n  if (s.status === 'em_approvals') return true;\n  // administrador: também com a viagem em curso (ex.: colaborador afastado), com justificativa\n  if (typeof USER !== 'undefined' && USER.role === 'admin' && !READONLY && ['transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'].includes(s.status)) return true;"],
  ["  const lib = Number(s.valor_liberado) || 0;\n  openModal(`Cancelar OT ${esc(s.ordem_trabalho || s.id)}`, `\n    <p style=\"font-size:13.5px; color:var(--ink-2); margin:0 0 10px\">Use quando a solicitação foi feita por engano ou a viagem não vai mais acontecer.",
   "  const lib = Number(s.valor_liberado) || 0;\n  const iniciada = ['em_viagem', 'aguardando_comprovacao'].includes(s.status) || (['transferencia_agendada', 'liberado'].includes(s.status) && todayISO() >= String(s.data_inicio).slice(0, 10));\n  openModal(`Cancelar OT ${esc(s.ordem_trabalho || s.id)}`, `\n    ${iniciada ? `<div class=\"alert-item warn\" style=\"margin-bottom:10px\">⚠️ A viagem já começou (saída em ${brDate(s.data_inicio)}). Só o administrador cancela nesta situação — use, por exemplo, quando o colaborador foi afastado e não viajou. Se já houver despesas lançadas, o sistema pede para resolvê-las antes.</div>` : ''}\n    <p style=\"font-size:13.5px; color:var(--ink-2); margin:0 0 10px\">Use quando a solicitação foi feita por engano ou a viagem não vai mais acontecer."],
  ["placeholder=\"Ex.: solicitação duplicada, viagem desnecessária…\"", "placeholder=\"Ex.: solicitação duplicada, colaborador afastado por atestado médico…\""]
]);
console.log('ok');
