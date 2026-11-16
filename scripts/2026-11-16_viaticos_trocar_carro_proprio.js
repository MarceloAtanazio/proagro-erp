// Propósito: Viáticos > Comprovar viagem: botão "Trocar para carro próprio" (admin e quem edita Viáticos) para o caso em que o colaborador solicitou aluguel
//   de carro, não achou veículo disponível e rodou com o próprio (ex.: OT 180). A viagem passa a aceitar a comprovação de km como carro próprio (reembolso por km,
//   fila de aprovação normal). O valor do aluguel já liberado NÃO é zerado: sem comprovação nesse item ele cai em "A devolver ao Flash". Sem migração:
//   a troca fica registrada dentro de transporte_detalhes (troca_veiculo) e no histórico de auditoria.
// Entrada: api/index.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-16_viaticos_trocar_carro_proprio.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  s = fn(s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const troca = (s, de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 70)); return s.replace(de, () => para); };

edita('api/index.js', s => {
  if (s.includes('trocar-carro-proprio')) throw new Error('api já aplicado');
  // 1) auditoria legível
  s = troca(s, "  'POST /api/viaticos/solicitacoes/:id/liberar-comprovacao':",
    "  'POST /api/viaticos/solicitacoes/:id/trocar-carro-proprio': req => `Trocou de aluguel para CARRO PRÓPRIO (uso do veículo do colaborador) na solicitação de viático ID ${req.params.id}: ${String(req.body && req.body.motivo || '').slice(0, 200)}`,\n  'POST /api/viaticos/solicitacoes/:id/liberar-comprovacao':");
  // 2) km "alugado" não vale depois da troca
  s = troca(s, "  if (modelo === 'alugado' && !t.aluguel_carro) {",
    "  if (modelo === 'alugado' && t.troca_veiculo) {\n    return res.status(409).json({ error: 'Esta viagem foi trocada de aluguel para carro próprio: informe a quilometragem como carro próprio.' });\n  }\n  if (modelo === 'alugado' && !t.aluguel_carro) {");
  // 3) endpoint da troca, logo antes de liberar-comprovacao
  const ep = `// Trocar de aluguel para carro próprio (admin e quem edita Viáticos). Caso real: o colaborador pediu aluguel, não havia carro na locadora e rodou com o
// próprio. O valor do aluguel que o Flash já repassou continua na solicitação — sem comprovação nesse item ele volta ao Flash em "a devolver". A
// quilometragem passa a ser comprovada e reembolsada como carro próprio. A documentação do veículo NÃO bloqueia (a justificativa fica no histórico), mas
// a resposta avisa o que está pendente. Previsão de km = soma das distâncias do aluguel; combustível/pedágio/estacionamento seguem nos itens do aluguel
// (zerados na rota própria para não contar duas vezes se a solicitação for recalculada).
app.post('/api/viaticos/solicitacoes/:id/trocar-carro-proprio', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const motivo = String(sanitize(req.body && req.body.motivo) || '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Informe a justificativa da troca.' });
  const solId = Number(req.params.id);
  const sol = (await query('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1', [solId]))[0];
  if (!sol) return res.status(404).json({ error: 'Viagem não encontrada.' });
  if (sol.status !== 'aguardando_comprovacao') return res.status(409).json({ error: 'A troca só é possível enquanto a viagem aguarda comprovação.' });
  const t = (sol.transporte_detalhes && typeof sol.transporte_detalhes === 'object') ? { ...sol.transporte_detalhes } : {};
  if (t.troca_veiculo) return res.status(409).json({ error: 'Esta viagem já foi trocada para carro próprio.' });
  if (!t.aluguel_carro) return res.status(409).json({ error: 'Esta viagem não foi solicitada com aluguel de carro.' });
  if (t.carro_proprio) return res.status(409).json({ error: 'Esta viagem já tem carro próprio.' });
  const kmAlugado = await query("SELECT 1 FROM erp_viaticos_km WHERE solicitacao_id=$1 AND modelo='alugado' AND status <> 'rejeitado' LIMIT 1", [solId]);
  if (kmAlugado.length) return res.status(409).json({ error: 'Já existe quilometragem de carro alugado nesta viagem. Exclua esse registro antes de trocar.' });

  const alugueis = Array.isArray(t.alugueis) ? t.alugueis : [];
  const dist = alugueis.reduce((a, x) => a + (Number(x && x.distancia_km) || 0), 0);
  const diaria = a => (String(a && a.valor_diaria || '').includes(',') ? Number(String(a.valor_diaria).replace(/\\./g, '').replace(',', '.')) : Number(a && a.valor_diaria)) || 0;
  const aluguelValor = Number(alugueis.reduce((a, x) => a + diaria(x) * (Number(x && x.dias) || 0), 0).toFixed(2));
  t.carro_proprio = true;
  t.carro_proprio_rota = { distancia_km: dist > 0 ? Number(dist.toFixed(1)) : '', combustivel_valor: 0, pedagio_valor: 0, estacionamento_qtd: 0, estacionamento_valor: 0, trechos: [], manual_override: false, de_aluguel: true };
  t.troca_veiculo = { de: 'aluguel_carro', para: 'carro_proprio', em: new Date().toISOString(), por: req.user.name, motivo: motivo.slice(0, 500), aluguel_valor_mantido: aluguelValor };
  await query('UPDATE erp_viaticos_solicitacoes SET transporte_detalhes=$2 WHERE id=$1', [solId, JSON.stringify(t)]);

  const colab = (await query('SELECT * FROM erp_colaboradores WHERE id=$1', [sol.colaborador_id]))[0];
  const hab = colab ? viaBloqueiosDirecao(colab) : { proprio: [] };
  res.json({ ok: true, aluguel_valor_mantido: aluguelValor, km_previsto: dist > 0 ? Number(dist.toFixed(1)) : null, avisos: hab.podeCarroProprio === false ? hab.proprio : [] });
}));

`;
  s = troca(s, "app.post('/api/viaticos/solicitacoes/:id/liberar-comprovacao',", ep + "app.post('/api/viaticos/solicitacoes/:id/liberar-comprovacao',");
  return s;
});

edita('public/app.js', s => {
  if (s.includes('viaTrocarCarroProprioModal')) throw new Error('front já aplicado');
  // 1) seção de km: não oferece km do alugado depois da troca; botão de trocar; aviso da troca feita
  s = troca(s, "  if (t.aluguel_carro && !jaTem('alugado')) novos.push('alugado');",
    "  if (t.aluguel_carro && !t.troca_veiculo && !jaTem('alugado')) novos.push('alugado');\n  const finalizadaKm = ['comprovado', 'devolvido', 'divergente', 'arquivado'].includes(s.status);\n  const podeTrocar = !READONLY && t.aluguel_carro && !t.carro_proprio && !t.troca_veiculo && !finalizadaKm && !regs.some(k => k.modelo === 'alugado' && k.status !== 'rejeitado');\n  const tv = t.troca_veiculo;");
  s = troca(s, "    ${linhas || '<div class=\"via-km-vazio\">Nenhuma quilometragem informada nesta viagem.</div>'}",
    "    ${tv ? `<div class=\"rh-nota\" style=\"margin-bottom:10px\">🚙 <strong>Trocado de aluguel para carro próprio</strong> por ${esc(tv.por || '—')} em ${brDate(String(tv.em || '').slice(0, 10))}. Justificativa: <em>${esc(tv.motivo || '—')}</em>. O valor do aluguel liberado (${brl(tv.aluguel_valor_mantido || 0)}) permanece na solicitação e, sem comprovação, volta ao Flash.</div>` : ''}\n    ${linhas || '<div class=\"via-km-vazio\">Nenhuma quilometragem informada nesta viagem.</div>'}");
  s = troca(s, "    ${!terminou ? `<div class=\"via-km-vazio\">A viagem termina em ${brDate(s.data_fim)}. A quilometragem se comprova depois do retorno.</div>`",
    "    ${podeTrocar ? `<div class=\"via-km-acoes\"><button class=\"btn sm\" data-trocarprop=\"${s.id}\" title=\"Para quando o colaborador pediu aluguel, não havia carro disponível e ele rodou com o próprio\">🚙 Trocar para carro próprio</button></div>` : ''}\n    ${!terminou ? `<div class=\"via-km-vazio\">A viagem termina em ${brDate(s.data_fim)}. A quilometragem se comprova depois do retorno.</div>`");
  // 2) clique do botão
  s = troca(s, "  document.querySelectorAll('[data-kmnovo]').forEach(b =>",
    "  document.querySelectorAll('[data-trocarprop]').forEach(b => b.onclick = () => viaTrocarCarroProprioModal(s, voltar));\n  document.querySelectorAll('[data-kmnovo]').forEach(b =>");
  // 3) modal
  s = troca(s, "function viaPodeCancelar(s) {",
    `function viaTrocarCarroProprioModal(s, depois) {
  const t = (s.transporte_detalhes && typeof s.transporte_detalhes === 'object') ? s.transporte_detalhes : {};
  const diaria = a => (String(a && a.valor_diaria || '').includes(',') ? Number(String(a.valor_diaria).replace(/\\./g, '').replace(',', '.')) : Number(a && a.valor_diaria)) || 0;
  const alug = (Array.isArray(t.alugueis) ? t.alugueis : []).reduce((a, x) => a + diaria(x) * (Number(x && x.dias) || 0), 0);
  openModal(\`Trocar para carro próprio — \${esc(s.colaborador_name)}\`, \`
    <p style="font-size:13.5px; color:var(--ink-2); margin:0 0 10px">Use quando <strong>\${esc(s.colaborador_name)}</strong> pediu aluguel, não havia carro disponível na locadora e ele rodou com o <strong>próprio veículo</strong>.</p>
    <ul style="font-size:13.5px; color:var(--ink-2); margin:0 0 12px; padding-left:18px; line-height:1.55">
      <li>A quilometragem passa a ser comprovada e <strong>reembolsada como carro próprio</strong> (valor por km, fila de aprovação normal).</li>
      <li>O valor do aluguel já liberado (<strong>\${brl(alug)}</strong>) <strong>não é alterado</strong>: sem comprovação nesse item, ele aparece em "A devolver ao Flash".</li>
      <li>A troca e a justificativa ficam registradas no histórico. A documentação do veículo não bloqueia, mas você será avisado se houver pendência.</li>
    </ul>
    <div class="field"><label for="tc-motivo">Justificativa</label><textarea id="tc-motivo" rows="3" placeholder="Ex.: locadora sem veículo disponível na retirada; viagem feita com o carro próprio."></textarea></div>\`,
    [{ label: 'Voltar', onClick: () => { closeModal(); if (depois) depois(); } },
     { label: 'Trocar para carro próprio', cls: 'primary', onClick: async (ev) => {
        const motivo = $('#tc-motivo').value.trim();
        if (motivo.length < 5) return modalError('Informe a justificativa da troca.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Trocando…'; }
        try {
          const r = await api(\`/api/viaticos/solicitacoes/\${s.id}/trocar-carro-proprio\`, { method: 'POST', body: { motivo } });
          closeModal(); toast('Viagem trocada para carro próprio.' + ((r.avisos || []).length ? ' Atenção: ' + r.avisos.join('; ') + '.' : ''));
          if (depois) depois();
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Trocar para carro próprio'; } }
     } }]);
}
function viaPodeCancelar(s) {`);
  return s;
});
console.log('ok');
