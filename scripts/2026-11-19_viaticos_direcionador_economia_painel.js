// Propósito: Direcionador de mobilidade (Viáticos): (1) tira o "Resumo para enviar à coordenação" (caixa de texto e botão copiar) da tela e do que é gravado na solicitação;
//   (2) a economia apurada pelo direcionador fica guardada em cada OT (transporte_detalhes.direcionador: indicada, km, custos, economia) e passa a aparecer no painel de gestão de viáticos:
//   cartão "Economia do Direcionador" na lista de Viáticos e, no "Painel do período" (visual Novo), um indicador e um quadro por colaborador, respeitando os filtros da tela.
//   A conta é feita por viaEconomiaDirecionador (public/via-direcionador.js): soma a economia das OTs não canceladas que têm o retrato do direcionador, por colaborador.
// Entrada: public/via-direcionador.js, public/tema-viaticos.js, public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-19_viaticos_direcionador_economia_painel.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  const r = fn(troca, () => s, x => { s = x; }); if (typeof r === 'string') s = r; fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/via-direcionador.js', (troca, get, set) => {
  if (get().includes('viaEconomiaDirecionador')) throw new Error('já aplicado');
  // 1) tira o resumo da tela
  let linhas = get().split('\n');
  const i = linhas.findIndex(l => l.includes('<div class="dm-resumo">'));
  if (i < 0 || !linhas[i + 1].includes('id="dm-copiar"')) throw new Error('bloco do resumo não achado');
  linhas.splice(i, 2, '      <div class="dm-acoes"><button class="btn sm primary" id="dm-usar" type="button">Usar a opção indicada na solicitação</button></div>`;');
  const j = linhas.findIndex(l => l.includes("$('#dm-copiar').onclick"));
  if (j < 0) throw new Error('copiar não achado'); linhas.splice(j, 1);
  set(linhas.join('\n'));
  // 2) não grava mais o texto do resumo
  troca(", resumo: viaDirecionadorResumo(r, p), calculado_em:", ", calculado_em:");
  // 3) modal da OT sem a caixa de texto: mostra os números
  troca("      <textarea rows=\"7\" readonly style=\"width:100%;font-size:12.5px\">${esc(d.resumo || '')}</textarea>\n",
    "      <div class=\"dm-ind\" style=\"grid-template-columns:repeat(2,1fr)\"><div><span>Indicada</span><b>${d.sem_carro ? 'Carro próprio (sem carro locado)' : d.indicada === 'locado' ? 'Carro locado' : 'Carro próprio'}</b></div><div><span>Economia</span><b>${d.economia != null ? brl(d.economia) : '—'}</b></div>\n        <div><span>Carro próprio</span><b>${brl(d.proprio_total)}</b></div><div><span>Carro locado</span><b>${d.locado_total != null ? brl(d.locado_total) : '—'}</b></div>\n        <div><span>Quilometragem</span><b>${kmFmt(d.km)} km</b></div><div><span>Diária informada</span><b>${d.diaria ? brl(d.diaria) : '—'}</b></div></div>\n");
  // 4) conta pura da economia, para o painel
  troca("  if (typeof window !== 'undefined') {",
    "  // Soma da economia apurada pelo direcionador nas OTs (sem as canceladas), no total e por colaborador. Só conta OT que tem o retrato gravado e economia positiva.\n  function viaEconomiaDirecionador(sols) {\n    const por = new Map(); let total = 0, ots = 0, comRetrato = 0;\n    (sols || []).forEach(s => {\n      const d = s && s.transporte_detalhes && s.transporte_detalhes.direcionador; if (!d || s.status === 'cancelada') return;\n      comRetrato++;\n      const e = Number(d.economia); if (!(e > 0)) return;\n      total += e; ots++;\n      const k = s.colaborador_id != null ? s.colaborador_id : s.colaborador_name; const l = por.get(k) || { nome: s.colaborador_name || '—', ots: 0, economia: 0 };\n      l.ots++; l.economia += e; por.set(k, l);\n    });\n    return { total: Math.round(total * 100) / 100, ots, comRetrato, porColaborador: [...por.values()].sort((a, b) => b.economia - a.economia) };\n  }\n  if (typeof window !== 'undefined') {");
  troca("window.viaDirecionadorSnapshot = viaDirecionadorSnapshot;", "window.viaDirecionadorSnapshot = viaDirecionadorSnapshot; window.viaEconomiaDirecionador = viaEconomiaDirecionador;");
  troca("module.exports = { viaDirecionadorCalc, viaDirecionadorResumo, viaDirecionadorSnapshot };", "module.exports = { viaDirecionadorCalc, viaDirecionadorResumo, viaDirecionadorSnapshot, viaEconomiaDirecionador };");
});
edita('public/tema-viaticos.js', (troca) => {
  troca("        ${tile('', 'Ticket médio', brl(ticket), 'liberado por OT')}\n      </div>\n      ${prazoSecao(V.filtrados)}",
    "        ${tile('', 'Ticket médio', brl(ticket), 'liberado por OT')}\n        ${eco.comRetrato ? tile('', 'Economia do Direcionador', brl(eco.total), eco.ots + ' OT(s) com carro próprio ou locado mais barato') : ''}\n      </div>\n      ${eco.comRetrato ? `<article class=\"nd-card nd-pn-largo\"><div class=\"nd-card-cab\"><h3>Economia do Direcionador por colaborador</h3><span class=\"nd-chip\">${brl(eco.total)}</span></div>\n        <div class=\"nd-pn-rolagem\"><table class=\"nd-pn-tb\"><thead><tr><th>Colaborador</th><th class=\"num\">OTs com economia</th><th class=\"num\">Economia</th></tr></thead><tbody>${eco.porColaborador.map(l => `<tr><td><b>${E(l.nome)}</b></td><td class=\"num\">${l.ots}</td><td class=\"num\">${brl(l.economia)}</td></tr>`).join('') || '<tr><td colspan=\"3\">Nenhuma economia apurada no filtro atual.</td></tr>'}</tbody></table></div></article>` : ''}\n      ${prazoSecao(V.filtrados)}");
  troca("    const dica = $('#nd-via-dica'); if (dica) dica.textContent = V.rotulo;\n",
    "    const dica = $('#nd-via-dica'); if (dica) dica.textContent = V.rotulo;\n    const eco = typeof viaEconomiaDirecionador === 'function' ? viaEconomiaDirecionador(V.filtrados) : { total: 0, ots: 0, comRetrato: 0, porColaborador: [] };\n");
});
edita('public/app.js', (troca) => {
  troca("      <div class=\"card kpi ${dash.divergentes.n ? 'red' : ''}\"><div class=\"label\">Divergentes (estouro)</div>\n        <div class=\"value ${dash.divergentes.n ? 'neg' : ''}\">${dash.divergentes.n}</div><div class=\"detail\">${brl(dash.divergentes.v)}</div></div>\n    </div>",
    "      <div class=\"card kpi ${dash.divergentes.n ? 'red' : ''}\"><div class=\"label\">Divergentes (estouro)</div>\n        <div class=\"value ${dash.divergentes.n ? 'neg' : ''}\">${dash.divergentes.n}</div><div class=\"detail\">${brl(dash.divergentes.v)}</div></div>\n      ${(() => { const e = typeof viaEconomiaDirecionador === 'function' ? viaEconomiaDirecionador(sols) : null; return e && e.comRetrato ? `<div class=\"card kpi blue\"><div class=\"label\">Economia do Direcionador</div><div class=\"value\">${brl(e.total)}</div><div class=\"detail\">${e.ots} OT(s) com economia</div></div>` : ''; })()}\n    </div>");
});
console.log('ok');
