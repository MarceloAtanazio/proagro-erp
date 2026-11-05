// Propósito: COMPROVAÇÃO ÚNICA da família de OTs em Viáticos (tela). (1) Lista: uma linha por OT de origem, com a etiqueta "↪ N complementares" que abre o
//   histórico; valores da linha = soma da família (sem as canceladas); cada complementar mantém status, valores e ações próprios. (2) Comprovar/Ver em
//   qualquer OT da família abre a comprovação da OT de origem, com liberado/solicitado somados, memória de cálculo por OT, período e tetos da TUD da família
//   (hospedagem = soma das noites de cada OT; alimentação por dia; prazo = o mais tardio). (3) Fechar mostra a recusa do servidor quando há complementar em
//   aprovação. Os relatórios exportados continuam com uma linha por OT.
// Entrada: public/app.js e public/styles.css (ou a pasta indicada em argv[2]) e scripts/2026-11-06_comprovacao_unica_*_bloco.txt. Saída: os dois arquivos editados.
// Uso (depois de 2026-11-06_custo_extra_pdf_front.js): node scripts/2026-11-06_comprovacao_unica_front.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => { const i = s.indexOf(m); if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 90)); if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 90)); return i; };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    regiao: (ini, fim, para) => { const i = unico(ini); const j = s.indexOf(fim, i); if (j < 0) throw new Error(rel + ': fim da região não achado'); s = s.slice(0, i) + para + s.slice(j + fim.length); },
    fim: t => { s += t; }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('public/app.js', ({ troca, regiao }) => {
  // 1) lista agrupada
  regiao("    lastFiltered = filtered;\n    $('#tbl').innerHTML = `\n      <thead><tr><th>Colaborador</th><th>Tier</th><th>Local</th><th>Período</th>","      }).join('') || '<tr><td colspan=\"9\"><div class=\"empty\">Nenhuma solicitação encontrada.</div></td></tr>'}</tbody>`;\n",
         bloco('2026-11-06_comprovacao_unica_lista_bloco.txt'));
  troca("      const s = filtered.find(x => x.id == b.dataset.del);", "      const s = sols.find(x => x.id == b.dataset.del);");
  troca("viaConfirmarExclusao(s || filtered.find(x => x.id == b.dataset.del) || { id: b.dataset.del });", "viaConfirmarExclusao(s || { id: b.dataset.del });");

  // 2) comprovação: abre a da OT de origem e carrega a família
  troca("async function viewSolicitacao(id) {\n  const [s, despesas, tud, km, reprovadasFlash, conferir] = await Promise.all([\n    api('/api/viaticos/solicitacoes').then(all => all.find(x => x.id === id)),\n    api(`/api/viaticos/solicitacoes/${id}/despesas`), api('/api/viaticos/tud'),",
        bloco('2026-11-06_comprovacao_unica_ajudantes_front_bloco.txt') +
`async function viewSolicitacao(id) {
  const todas = await api('/api/viaticos/solicitacoes');
  const alvo = todas.find(x => x.id === id);
  // Comprovação única: abrir uma complementar leva à comprovação da OT de origem, onde ficam as despesas da família inteira.
  if (alvo && viaRaizDe(alvo) !== id) return viewSolicitacao(viaRaizDe(alvo));
  const familia = viaFamiliaDe(todas, id).sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : viaDia(a.data_inicio).localeCompare(viaDia(b.data_inicio)) || a.id - b.id));
  const [despesas, tud, km, reprovadasFlash, conferir] = await Promise.all([
    api(\`/api/viaticos/solicitacoes/\${id}/despesas\`), api('/api/viaticos/tud'),`);
  troca("    api(`/api/viaticos/solicitacoes/${id}/conferir`).catch(() => null)\n  ]);\n  const finalizada",
        "    api(`/api/viaticos/solicitacoes/${id}/conferir`).catch(() => null)\n  ]);\n  const s = alvo;\n  const totaisFam = viaFamiliaTotais(familia);\n  const finalizada");
  troca("  const comprovado = despesas.reduce((sum, d) => sum + d.valor, 0);\n  const dif = s.valor_liberado - comprovado;",
        "  const comprovado = despesas.reduce((sum, d) => sum + d.valor, 0);\n  const liberadoTot = totaisFam.liberado;      // liberado da família (sem as canceladas)\n  const solicitadoTot = totaisFam.solicitado;\n  const dif = liberadoTot - comprovado;");

  // 3) tetos e período da família
  troca("  const limite = s.data_expiracao_flash || s.data_fim;\n  const foraDoPeriodo = despesas.filter(d => d.data < s.data_inicio || d.data > limite);",
`  // COMPROVAÇÃO ÚNICA: o período aceito vai do início da primeira OT ao prazo mais tardio da família (Flash ou fim da OT).
  const ativos = familia.filter(m => m.status !== 'cancelada');
  const iniFam = totaisFam.inicio || viaDia(s.data_inicio);
  const limite = ativos.map(m => viaDia(m.data_expiracao_flash || m.data_fim)).sort().pop() || (s.data_expiracao_flash || s.data_fim);
  const foraDoPeriodo = despesas.filter(d => viaDia(d.data) < iniFam || viaDia(d.data) > viaDia(limite));`);
  troca("  const excessos = []; // { chave, msg, valor }",
`  // Hospedagem: o teto é a soma, por OT da família, de noites × diária da TUD da OT (categoria de local e tier de cada uma; custo extra não tem noite).
  const tetoHospFam = ativos.reduce((t, m) => {
    const nn = m.complementar_tipo === 'custo_extra' ? 0 : viaDiasNoites(m.data_inicio, m.data_fim, !!m.solicitacao_pai_id).noites;
    const hd = viaHospedagemDevida(m.destinos, s.colaborador_cidade_base_uf, s.colaborador_cidade_base_municipio);
    const th = tud.find(x => x.tier === m.tier && x.categoria_local === m.categoria_local && x.tipo_despesa === 'hospedagem');
    return t + (th && hd ? th.valor_diaria * nn : 0);
  }, 0);
  // Alimentação: teto do DIA = a maior diária entre as OTs que cobrem aquele dia (na dúvida, a da OT de origem).
  const capAlim = data => {
    const c = ativos.filter(m => viaDia(m.data_inicio) <= data && data <= viaDia(m.data_fim))
      .map(m => tud.find(x => x.tier === m.tier && x.categoria_local === m.categoria_local && x.tipo_despesa === 'alimentacao')).filter(Boolean).map(x => x.valor_diaria);
    return c.length ? Math.max(...c) : tudAlim.valor_diaria;
  };
  const excessos = []; // { chave, msg, valor }`);
  troca("    const tetoHosp = tudHosp.valor_diaria * noites;", "    const tetoHosp = familia.length > 1 ? tetoHospFam : tudHosp.valor_diaria * noites;");
  troca("        msg: !hospDevida\n", "        msg: familia.length > 1\n          ? `Hospedagem acima do teto da TUD: ${brl(gastoHosp)} gasto contra um limite de ${brl(tetoHosp)} (soma das noites previstas nesta OT e nas complementares).`\n          : !hospDevida\n");
  troca("      const gasto = porDia[data];\n      if (gasto > tudAlim.valor_diaria) {\n        excessos.push({ chave: `alimentacao_${data}`, valor: gasto - tudAlim.valor_diaria,\n          msg: `Alimentação do dia ${brDate(data)} acima da TUD diária: ${brl(gasto)} gasto contra um limite de ${brl(tudAlim.valor_diaria)}/dia.` });",
        "      const gasto = porDia[data];\n      const tetoDia = capAlim(viaDia(data));\n      if (gasto > tetoDia) {\n        excessos.push({ chave: `alimentacao_${data}`, valor: gasto - tetoDia,\n          msg: `Alimentação do dia ${brDate(data)} acima da TUD diária: ${brl(gasto)} gasto contra um limite de ${brl(tetoDia)}/dia.` });");

  // 4) cabeçalho, memória de cálculo e KPIs da família
  troca("<div><small style=\"color:var(--muted)\">Período</small><br><strong>${brDate(s.data_inicio)} – ${brDate(s.data_fim)}</strong></div>",
        "<div><small style=\"color:var(--muted)\">Período${familia.length > 1 ? ' (todas as OTs)' : ''}</small><br><strong>${brDate(totaisFam.inicio || s.data_inicio)} – ${brDate(totaisFam.fim || s.data_fim)}</strong></div>");
  troca("  const memoriaHtml = prevLinhas.length ? `\n", bloco('2026-11-06_comprovacao_unica_memoria_bloco.txt') + "  const memoriaHtml = familia.length > 1 ? memoriaFamiliaHtml : prevLinhas.length ? `\n");
  // (o cartão "Solicitado" também existe no painel Transferência: por isso os dois cartões entram juntos, que só aparecem assim aqui)
  troca("<div class=\"card kpi\"><div class=\"label\">Solicitado</div><div class=\"value\">${brl(solicitado)}</div></div>\n      <div class=\"card kpi\"><div class=\"label\">Liberado</div><div class=\"value\">${brl(s.valor_liberado)}</div>\n        ${!s.valor_liberado && solicitado > 0 ?",
        "<div class=\"card kpi\"><div class=\"label\">Solicitado${familia.length > 1 ? ' (OTs somadas)' : ''}</div><div class=\"value\">${brl(solicitadoTot)}</div></div>\n      <div class=\"card kpi\"><div class=\"label\">Liberado${familia.length > 1 ? ' (OTs somadas)' : ''}</div><div class=\"value\">${brl(liberadoTot)}</div>\n        ${!liberadoTot && solicitadoTot > 0 ?");
  // 5) título com o período da família
  troca("— ${esc(s.colaborador_name)} (${brDate(s.data_inicio)}–${brDate(s.data_fim)})`,",
        "— ${esc(s.colaborador_name)} (${brDate(totaisFam.inicio || s.data_inicio)}–${brDate(totaisFam.fim || s.data_fim)})${familia.length > 1 ? ` · ${familia.length} OTs` : ''}`,");
  // 6) fechar: mostra a recusa do servidor (complementar em aprovação) em vez de deixar o botão sem resposta
  troca("      const r = await api(`/api/viaticos/solicitacoes/${id}/fechar`, { method: 'POST' });\n      closeModal();",
        "      let r;\n      try { r = await api(`/api/viaticos/solicitacoes/${id}/fechar`, { method: 'POST' }); } catch (e) { return toast(e.message); }\n      closeModal();");
});

edita('public/styles.css', ({ fim }) => {
  fim(`
/* Viáticos: OT de origem com as complementares dentro (comprovação única). A etiqueta abre o histórico; as sub-linhas são mais leves e recuadas. */
.via-fam-chip { margin-top: 4px; padding: 2px 9px; font-size: 11.5px; font-weight: 600; color: var(--verde-700); background: var(--verde-050, #EAF5EC); border: 1px solid #CDE5D6; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.via-fam-chip:hover { background: #DDEFE2; }
tr.via-fam-filho td { background: #F7FAF8; font-size: 12.5px; border-top: 1px dashed var(--line); }
tr.via-fam-filho td:first-child { padding-left: 26px; }
.via-fam-seta-filho { color: var(--muted); }
.via-fam-aviso { color: #8A6100; font-weight: 600; }
tr.via-fam-cab td { padding-top: 8px; }
tr.via-fam-linha td { font-size: 12.5px; color: var(--ink-2); padding-left: 18px; }
tr.via-fam-linha td.num { padding-left: 0; }
`);
});
console.log('ok');
