// Propósito: ajuste do botão "Trocar para carro próprio" (Viáticos): se o colaborador JÁ lançou a quilometragem como "carro alugado" (caso da OT 180, aguardando
//   aprovação), a troca deixa de ser bloqueada e passa a CONVERTER esses registros para carro próprio: modelo='proprio', taxa vigente por km, valor do reembolso recalculado
//   (km rodado x taxa), km previsto da rota própria; um registro já aprovado como alugado volta para "aguardando aprovação" para poder gerar a conta a pagar.
//   No front, o botão aparece mesmo com km de alugado lançado e o modal avisa da conversão e do valor.
// Entrada: api/index.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-16_viaticos_trocar_converte_km.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  s = fn(s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const troca = (s, de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 70)); return s.replace(de, () => para); };

edita('api/index.js', s => {
  if (s.includes('km_convertidos')) throw new Error('api já aplicado');
  s = troca(s, `  const kmAlugado = await query("SELECT 1 FROM erp_viaticos_km WHERE solicitacao_id=$1 AND modelo='alugado' AND status <> 'rejeitado' LIMIT 1", [solId]);
  if (kmAlugado.length) return res.status(409).json({ error: 'Já existe quilometragem de carro alugado nesta viagem. Exclua esse registro antes de trocar.' });
`, `  const kmAlugados = await query("SELECT id, km_rodado, status FROM erp_viaticos_km WHERE solicitacao_id=$1 AND modelo='alugado' ORDER BY id", [solId]);
`);
  s = troca(s, `  await query('UPDATE erp_viaticos_solicitacoes SET transporte_detalhes=$2 WHERE id=$1', [solId, JSON.stringify(t)]);
`, `  await query('UPDATE erp_viaticos_solicitacoes SET transporte_detalhes=$2 WHERE id=$1', [solId, JSON.stringify(t)]);
  // Km já lançado como "alugado" (sem reembolso) vira carro próprio: taxa vigente, valor recalculado, previsto da rota própria. Um registro já aprovado como
  // alugado volta para a fila (status enviado) para poder gerar a conta a pagar; os demais mantêm o status (rascunho, enviado ou devolvido).
  let kmConvertidos = 0, kmValor = 0;
  if (kmAlugados.length) {
    const taxa = await kmTaxaVigente(), previsto = kmPrevistoDe({ transporte_detalhes: t }, 'proprio');
    for (const k of kmAlugados) {
      const valor = Number((n(k.km_rodado) * taxa).toFixed(2));
      await query(\`UPDATE erp_viaticos_km SET modelo='proprio', taxa_km=$2, valor_reembolso=$3, km_previsto=$4,
          status = CASE WHEN status='aprovado' THEN 'enviado' ELSE status END,
          decisao_motivo = CASE WHEN status='aprovado' THEN NULL ELSE decisao_motivo END, updated_at=now() WHERE id=$1\`, [k.id, taxa, valor, previsto]);
      kmConvertidos++; kmValor += valor;
    }
  }
`);
  s = troca(s, "  res.json({ ok: true, aluguel_valor_mantido: aluguelValor,", "  res.json({ ok: true, km_convertidos: kmConvertidos, km_valor_reembolso: Number(kmValor.toFixed(2)), aluguel_valor_mantido: aluguelValor,");
  return s;
});

edita('public/app.js', s => {
  if (s.includes('alugRegs')) throw new Error('front já aplicado');
  s = troca(s, " && !t.troca_veiculo && !finalizadaKm && !regs.some(k => k.modelo === 'alugado' && k.status !== 'rejeitado');", " && !t.troca_veiculo && !finalizadaKm;");
  s = troca(s, "viaTrocarCarroProprioModal(s, voltar));", "viaTrocarCarroProprioModal(s, voltar, (km.registros || []).filter(k => k.modelo === 'alugado'), taxaKm));");
  s = troca(s, "function viaTrocarCarroProprioModal(s, depois) {", "function viaTrocarCarroProprioModal(s, depois, alugRegs, taxa) {\n  alugRegs = alugRegs || [];\n  const kmJa = alugRegs.reduce((a, k) => a + Number(k.km_rodado || 0), 0), valorKm = Math.round(kmJa * (taxa || 0.7) * 100) / 100;");
  s = troca(s, "      <li>A troca e a justificativa ficam registradas no histórico.",
    "      ${alugRegs.length ? `<li><strong>A quilometragem já lançada como alugado (${kmNum(kmJa)} km) será convertida para carro próprio</strong>: reembolso de <strong>${brl(valorKm)}</strong> (${brl(taxa || 0.7)}/km), seguindo para aprovação normal. ${alugRegs.some(k => k.status === 'aprovado') ? 'O registro já aprovado volta para aprovação.' : ''}</li>` : ''}\n      <li>A troca e a justificativa ficam registradas no histórico.");
  return s;
});
console.log('ok');
