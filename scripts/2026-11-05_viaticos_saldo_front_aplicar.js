// Propósito: aplicar em public/app.js a tela do novo fechamento: saldo sem reprovadas, leitura do estorno do Flash e bloco "a conferir".
// Entrada: caminho do public/app.js (argumento 1). Saída: arquivo alterado no lugar; aborta se algum trecho não for encontrado.
// Executar: node scripts/2026-11-05_viaticos_saldo_front_aplicar.js <caminho/public/app.js>
const fs = require('fs'); const f = process.argv[2];
let t = fs.readFileSync(f, 'utf8'); const crlf = t.includes('\r\n'); if (crlf) t = t.replace(/\r\n/g, '\n');
function sub(a, b) { if (!t.includes(a)) { console.error('NÃO ACHOU:\n' + a.slice(0, 140)); process.exit(1); } t = t.replace(a, () => b); }

// categorias que o Flash escreve com mais de uma palavra ("Táxi e apps", "Passagens aéreas", "Aluguel de veículo")
sub(`'estacionamento': 'estacionamento', 'taxi': 'taxi_uber', 'uber': 'taxi_uber'`,
    `'estacionamento': 'estacionamento', 'taxi': 'taxi_uber', 'uber': 'taxi_uber',
  'apps': 'taxi_uber', 'aereas': 'passagem_aviao', 'veiculo': 'aluguel_carro'`);

// carregar a conferência junto com a viagem
sub(`  const [s, despesas, tud, km, reprovadasFlash] = await Promise.all([`, `  const [s, despesas, tud, km, reprovadasFlash, conferir] = await Promise.all([`);
sub("    api(`/api/viaticos/solicitacoes/${id}/reprovadas`).catch(() => [])\n  ]);",
    "    api(`/api/viaticos/solicitacoes/${id}/reprovadas`).catch(() => []),\n    // Estorno do Flash / diferença a conferir: também é seção a mais, não pode derrubar a tela.\n    api(`/api/viaticos/solicitacoes/${id}/conferir`).catch(() => null)\n  ]);");

// saldo sem reprovadas
sub(`  const detalheDevolvido = totRepr > 0 && dif - totRepr > -0.005
    ? \`<div style="font-size:11.5px; color:var(--muted)">sobra \${brl(Math.max(0, dif - totRepr))} + reprovadas \${brl(totRepr)}</div>\` : '';`,
    `  // A reprovada saiu da conta do Flash e será abatida na próxima OT: NÃO volta ao saldo.
  const saldoCard = dif >= 0 ? Math.max(0, Math.round((dif - totRepr) * 100) / 100) : dif;
  const detalheDevolvido = dif >= 0 && totRepr > 0
    ? \`<div style="font-size:11.5px; color:var(--muted)">liberado − comprovado = \${brl(dif)}, menos \${brl(totRepr)} de reprovadas (descontadas na próxima OT)</div>\` : '';
  const confValor = conferir ? Number(conferir.conferir_valor || 0) : 0;
  const conferirHtml = conferir && (confValor > 0 || conferir.conferir_decisao || conferir.estorno_flash !== null) ? \`
    <h4 style="margin:18px 0 6px">Estorno do Flash e diferença a conferir\${confValor > 0 && !conferir.conferir_decisao ? \` <span class="badge late">\${brl(confValor)}</span>\` : ''}</h4>
    <p class="hint" style="margin:0 0 8px">Estorno recebido no extrato: <strong>\${conferir.estorno_flash === null ? 'não importado' : brl(conferir.estorno_flash)}</strong>.
      \${confValor > 0 && !conferir.conferir_decisao ? \`<strong>\${brl(confValor)} saíram do saldo e não voltaram como estorno</strong> — confira no Flash (cancelamentos e retenções).\` : ''}
      \${conferir.conferir_decisao ? \`<br>Decisão: <strong>\${conferir.conferir_decisao === 'cobrado' ? 'cobrado (vira pendência)' : 'justificado'}</strong> — \${esc(conferir.conferir_nota || '')}\` : ''}</p>
    \${confValor > 0 && !conferir.conferir_decisao && finalizada && USER.role === 'admin' && !somenteLeitura ? \`
      <button class="btn" type="button" data-conf="justificar">Conferido no Flash — justificar</button>
      <button class="btn" type="button" data-conf="cobrar">Cobrar do colaborador</button>\` : ''}\` : '';`);
sub(`<div class="label">\${dif >= 0 ? 'A devolver ao Flash' : 'Estouro (pendência)'}</div>
        <div class="value \${dif < 0 ? 'neg' : 'pos'}">\${brl(Math.abs(dif))}</div>`,
    `<div class="label">\${dif >= 0 ? 'A devolver ao Flash' : 'Estouro (pendência)'}</div>
        <div class="value \${dif < 0 ? 'neg' : 'pos'}">\${brl(Math.abs(saldoCard))}</div>`);
sub(`o colaborador usou o valor, que conta como devolvido ao Flash e é descontado na próxima OT dele.`,
    `o colaborador usou o valor: ele saiu da conta do Flash, não volta ao saldo e é descontado na próxima OT dele.`);
sub(`</table></div>\${reprovadasHtml}\``, `</table></div>\${reprovadasHtml}\${conferirHtml}\``);

// botões da conferência
sub(`  document.querySelectorAll('[data-delrepr]').forEach(b => b.onclick = async () => {`,
`  document.querySelectorAll('[data-conf]').forEach(b => b.onclick = async () => {
    const cobrar = b.dataset.conf === 'cobrar';
    const nota = prompt(cobrar ? 'Por que cobrar esta diferença do colaborador? (fica registrado)' : 'Explique o que foi conferido no Flash (fica registrado):');
    if (nota === null) return;
    try {
      await api(\`/api/viaticos/solicitacoes/\${id}/conferir-decisao\`, { method: 'POST', body: { decisao: b.dataset.conf, nota } });
      toast(cobrar ? 'Diferença cobrada: virou pendência a descontar na próxima OT.' : 'Diferença justificada e registrada.');
      viewSolicitacao(id);
    } catch (e) { toast(e.message); }
  });
  document.querySelectorAll('[data-delrepr]').forEach(b => b.onclick = async () => {`);

// toast do fechamento
sub(`r.status === 'devolvido' ? \`Encerrado — \${brl(r.valor_devolvido)} devolvido à carteira.\` : 'Encerrado — valores batem exatamente.');`,
    `(r.status === 'devolvido' ? \`Encerrado — \${brl(r.valor_devolvido)} a devolver à carteira.\` : 'Encerrado — valores batem exatamente.') + (r.conferir_valor > 0 ? \` Atenção: \${brl(r.conferir_valor)} a conferir no Flash.\` : ''));`);

// parse: estorno
sub(`  const out = [];
  const reprovadas = [];`, `  const out = [];
  const reprovadas = [];
  let estorno = null; // soma das linhas "Estorno de saldo": o que voltou de fato à carteira`);
sub(`      const st = normalizeTxt(row[col.status]);
      if (st && !FLASH_STATUS_OK.some(k => st.includes(k))) {
        if (FLASH_STATUS_REPROVADA`, `      const st = normalizeTxt(row[col.status]);
      if (st && !FLASH_STATUS_OK.some(k => st.includes(k))) {
        if (/^estorno/.test(normalizeTxt(row[col.mov]))) {
          const vE = flashParseValor(row[col.valor]);
          if (vE !== null && vE > 0) estorno = Math.round(((estorno || 0) + vE) * 100) / 100;
          continue;
        }
        if (FLASH_STATUS_REPROVADA`);
sub(`  return { linhas: out, reprovadas, diag };`, `  return { linhas: out, reprovadas, estorno, diag };`);
sub(`  let loteReprovadas = null;`, `  let estornoArquivo = null; // estorno do Flash lido do arquivo (null = arquivo sem estorno)
  let loteReprovadas = null;`);
sub(`rows = parsed.linhas; reprovadas = parsed.reprovadas || [];`, `rows = parsed.linhas; reprovadas = parsed.reprovadas || []; estornoArquivo = parsed.estorno;`);
sub(`      const partes = selecionados.length ?`, `      // Estorno do Flash: substitui o valor guardado (reimportar não soma de novo).
      if (estornoArquivo !== null) {
        try { await api(\`/api/viaticos/solicitacoes/\${s.id}/estorno\`, { method: 'POST', body: { valor: estornoArquivo } }); }
        catch (e) { reprErros.push(\`estorno \${brl(estornoArquivo)}: \${e.message}\`); }
      }
      const partes = selecionados.length ?`);
if (crlf) t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(f, t); console.log('ok');
