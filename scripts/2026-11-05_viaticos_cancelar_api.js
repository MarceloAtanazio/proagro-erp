// Propósito: cancelar uma solicitação de Viáticos antes de a viagem começar (backend). Novo status 'cancelada' com motivo, quem e quando.
//   Quem pode: o próprio colaborador (dono da OT) ou quem edita Viáticos. Quando: 'Em Approvals' a qualquer momento; 'Transferência Agendada' ou
//   'Liberado' só antes da data de saída. Se já houve valor transferido, ele vira pendência de devolução (valor_pendencia, aberta) para ser
//   descontada na próxima OT pelo painel Transferência; origem "cancelamento".
// Entrada: api/index.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado. Uso: node scripts/2026-11-05_viaticos_cancelar_api.js [raiz]
// Requer a migração supabase/migrations/2026-11-05-viaticos-cancelada.sql ANTES de publicar.
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80));
  s = s.replace(de, () => para);
};

troca("  'POST /api/viaticos/solicitacoes/autosservico': (req, body) =>",
  "  'POST /api/viaticos/solicitacoes/:id/cancelar': req => `Cancelou a solicitação de viático ID ${req.params.id}: ${String(req.body && req.body.motivo || '').slice(0, 200)}`,\n  'POST /api/viaticos/solicitacoes/autosservico': (req, body) =>");

// origem da pendência: cancelamento
troca("  return status === 'divergente' ? (flash > 0 ? 'estouro+flash' : 'estouro')\n    : flash > 0",
      "  return status === 'cancelada' ? 'cancelamento' : status === 'divergente' ? (flash > 0 ? 'estouro+flash' : 'estouro')\n    : flash > 0");
troca("    const origem = r.status === 'divergente' ? (fl > 0 ? 'estouro+flash' : 'estouro')",
      "    const origem = r.status === 'cancelada' ? 'cancelamento' : r.status === 'divergente' ? (fl > 0 ? 'estouro+flash' : 'estouro')");

troca("// Soma dos excessos da TUD que foram REPROVADOS e tiveram o valor guardado na reprovação.",
`// Cancelamento pelo solicitante (ou por quem edita Viáticos): só ANTES de a viagem começar. Em Approvals vale sempre (não há dinheiro);
// Transferência Agendada e Liberado só antes da data de saída. O valor já transferido, se houver, vira pendência de devolução — o mesmo
// mecanismo das demais (aparece no painel Transferência da próxima OT, para descontar ou dispensar). Não apaga nada: fica no histórico.
app.post('/api/viaticos/solicitacoes/:id/cancelar', requireAuth, h(async (req, res) => {
  const motivo = sanitize(req.body && req.body.motivo);
  if (!motivo) return res.status(400).json({ error: 'Informe o motivo do cancelamento.' });
  const s = (await query(\`SELECT s.id, s.colaborador_id, s.status, s.data_inicio, s.valor_liberado, c.usuario_id
      FROM erp_viaticos_solicitacoes s JOIN erp_colaboradores c ON c.id=s.colaborador_id WHERE s.id=$1\`, [req.params.id]))[0];
  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (!(s.usuario_id === req.user.id || req.user.role === 'admin' || canEdit(req.user, 'viaticos'))) {
    return res.status(403).json({ error: 'Só o solicitante ou quem edita Viáticos pode cancelar esta OT.' });
  }
  if (!['em_approvals', 'transferencia_agendada', 'liberado'].includes(s.status)) {
    return res.status(400).json({ error: s.status === 'cancelada' ? 'Esta OT já está cancelada.' : 'Só dá para cancelar antes da viagem começar. Para esta OT, fale com o administrador.' });
  }
  const iso = v => (v == null ? '' : typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
  if (s.status !== 'em_approvals' && hojeISO() >= iso(s.data_inicio)) {
    return res.status(400).json({ error: 'A viagem já começou: só dá para cancelar antes da data de saída. Fale com o administrador.' });
  }
  const lib = n(s.valor_liberado);
  await query(\`UPDATE erp_viaticos_solicitacoes SET status='cancelada', status_manual=true, cancelada_em=now(), cancelada_por=$2, cancelamento_motivo=$3,
      valor_devolvido=0, valor_pendencia=$4, pendencia_resolvida=$5 WHERE id=$1\`, [s.id, req.user.id, motivo, lib, lib <= 0]);
  res.json({ ok: true, pendencia: lib });
}));

// Soma dos excessos da TUD que foram REPROVADOS e tiveram o valor guardado na reprovação.`);

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
