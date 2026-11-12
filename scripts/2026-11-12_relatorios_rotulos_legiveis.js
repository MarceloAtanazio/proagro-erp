// Propósito: Relatórios Gerenciais (visual Novo) — deixar legíveis os rótulos das visualizações: valores escritos em cima das barras e do ponto final da linha (formato 560k / 1,2M),
//   eixos, legendas e dicas dos gráficos com fonte 13–14px, minigráficos dos KPIs maiores e com o valor do último mês escrito, gráfico mensal em largura total e textos menores da página um pouco maiores.
// Entrada: public/tema-relatorios.js e public/tema-relatorios.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_relatorios_rotulos_legiveis.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  const entre = (ini, fim, para) => { const i = s.indexOf(ini), j = s.indexOf(fim, i); if (i < 0 || j < 0) throw new Error(rel + ': marcador não achado: ' + ini.slice(0, 60)); s = s.slice(0, i) + para + s.slice(j); };
  fn(troca, entre, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
const GRAFICOS = `  // ---------- gráficos ----------
  const FONTE = { family: 'DM Sans', size: 13 };
  const tinta = () => { try { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#10281c'; } catch (e) { return '#10281c'; } };
  const curto = v => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; if (a >= 1e6) return sg + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'; if (a >= 1e3) return sg + Math.round(a / 1e3).toLocaleString('pt-BR') + 'k'; return sg + Math.round(a).toLocaleString('pt-BR'); };
  // escreve o valor em cima de cada barra/ponto dos conjuntos que pedirem (dataset.rotulo = { fmt, valor?, so?, cor? })
  const ROTULOS = { id: 'ndRelRotulos', afterDatasetsDraw(chart) {
    const ctx = chart.ctx; ctx.save(); ctx.font = '700 12.5px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    chart.data.datasets.forEach((ds, di) => {
      const cfg = ds.rotulo; if (!cfg || !chart.isDatasetVisible(di)) return;
      ctx.fillStyle = cfg.cor || tinta();
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const v = ds.data[i]; if (v == null || (cfg.so && !cfg.so(i))) return;
        const topo = Math.min(el.y, el.base == null ? el.y : el.base), val = cfg.valor ? cfg.valor(i) : v;
        if (Math.abs(val) < 0.5) return;
        const txt = cfg.fmt(val, i), meia = ctx.measureText(txt).width / 2;
        ctx.fillText(txt, Math.max(meia + 2, Math.min(el.x, chart.width - meia - 2)), Math.max(topo - 8, chart.chartArea.top - 6));
      });
    });
    ctx.restore();
  } };
  const limpaGraficos = () => { S.graficos.forEach(g => { try { g.destroy(); } catch (e) { /* já destruído */ } }); S.graficos = []; };
  const novoGrafico = (el, cfg) => { if (!el || !window.Chart) return null; cfg.plugins = (cfg.plugins || []).concat([ROTULOS]); const g = typeof makeChart === 'function' ? makeChart(el, cfg) : new Chart(el, cfg); S.graficos.push(g); return g; };
  const DICA = { padding: 12, boxPadding: 6, titleFont: { family: 'DM Sans', size: 14, weight: '700' }, bodyFont: { family: 'DM Sans', size: 14 } };
  const eixoY = extra => Object.assign({ border: { display: false }, ticks: { maxTicksLimit: 5, font: FONTE, padding: 8, callback: v => (v < 0 ? '−' : '') + compacto(v) } }, extra || {});

  function graficos(m, K, d, ate) {
    const rotMes = MES.slice(0, 12), rec = m.receita.v.cur;
    const desp = rec.map((_, i) => -(m.tributos.v.cur[i] + m.gCustos.concat(m.gAdmin).reduce((t, g) => t + g.v.cur[i], 0) + Math.min(0, m.financ.v.cur[i]) + m.invest.v.cur[i]));
    const recBruta = rec.map((v, i) => v + Math.max(0, m.financ.v.cur[i]));
    const acum = m.acumulado.v.cur;
    novoGrafico($('#nd-rel-ch-mes'), { data: { labels: rotMes, datasets: [
      { type: 'line', label: 'Resultado acumulado', data: acum.map((v, i) => (i < ate ? v : null)), borderColor: CORES.dourado, backgroundColor: CORES.dourado, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, tension: .3, yAxisID: 'y2', order: 0, rotulo: { fmt: curto, so: i => i === ate - 1, cor: CORES.dourado } },
      { type: 'bar', label: 'Receitas', data: recBruta.map((v, i) => (i < ate ? v : null)), backgroundColor: CORES.verde2, borderRadius: 6, borderSkipped: false, maxBarThickness: 30, order: 2, rotulo: { fmt: curto } },
      { type: 'bar', label: 'Custos e despesas', data: desp.map((v, i) => (i < ate ? v : null)), backgroundColor: CORES.azul, borderRadius: 6, borderSkipped: false, maxBarThickness: 30, order: 1, rotulo: { fmt: curto } }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 26 } }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 9, padding: 18, font: FONTE } }, tooltip: Object.assign({}, DICA, { callbacks: { label: c => ' ' + c.dataset.label + ': ' + brlFull(c.parsed.y) } }) },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: FONTE } }, y: eixoY(), y2: eixoY({ position: 'right', grid: { display: false }, ticks: { maxTicksLimit: 5, font: FONTE, padding: 8, color: CORES.dourado, callback: v => (v < 0 ? '−' : '') + compacto(v) } }) } } });
    // ponte do resultado
    const T = x => tot(x, 'cur', ate);
    const passos = [[['Receita', 'líquida'], T(m.rLiq), 'total'], ['Pessoal', T(m.pessoal), 'step'], ['Campo', T(m.campo), 'step'], ['Serviços', T(m.gCustos[2]), 'step'],
      ['Admin.', m.gAdmin.reduce((t, g) => t + T(g), 0), 'step'], ['Financ.', T(m.financ) + T(m.invest), 'step'], [['Resultado', 'líquido'], T(m.liquido), 'total']];
    let corre = 0; const faixas = [], cores = [];
    passos.forEach(([, v, tipo]) => {
      if (tipo === 'total') { faixas.push(v >= 0 ? [0, v] : [v, 0]); cores.push(v >= 0 ? CORES.verde : CORES.vermelho); corre = v; }
      else { const ini = corre, fim = corre + v; faixas.push([Math.min(ini, fim), Math.max(ini, fim)]); cores.push(v >= 0 ? CORES.verde2 : CORES.azul); corre = fim; }
    });
    novoGrafico($('#nd-rel-ch-ponte'), { type: 'bar', data: { labels: passos.map(p => p[0]), datasets: [{ data: faixas, backgroundColor: cores, borderRadius: 6, borderSkipped: false, maxBarThickness: 52, rotulo: { fmt: curto, valor: i => passos[i][1] } }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 26 } }, plugins: { legend: { display: false }, tooltip: Object.assign({}, DICA, { callbacks: { title: c => ['Receita líquida', 'Pessoal e benefícios', 'Operação de campo e viagens', 'Serviços e suprimentos', 'Despesas administrativas', 'Resultado financeiro e investimentos', 'Resultado líquido'][c[0].dataIndex], label: c => ' ' + brlFull(passos[c.dataIndex][1]) } }) },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { family: 'DM Sans', size: 12 } } }, y: eixoY() } } });
    // minigráficos dos KPIs: último mês escrito e dica grande ao passar o mouse
    const spark = (id, vals, cor) => novoGrafico($('#' + id), { type: 'line', data: { labels: MES.slice(0, vals.length), datasets: [{ data: vals, borderColor: cor, backgroundColor: cor + '24', fill: true, borderWidth: 2.5, tension: .35, pointRadius: 0, pointHoverRadius: 5, rotulo: { fmt: curto, so: i => i === vals.length - 1, cor } }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20, right: 14, bottom: 2 } }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: Object.assign({}, DICA, { displayColors: false, callbacks: { label: c => ' ' + brlFull(c.parsed.y) } }) }, scales: { x: { display: false }, y: { display: false } } } });
    spark('nd-rel-sp-rec', K.mensal.rec, CORES.verde2);
    spark('nd-rel-sp-desp', K.mensal.desp, CORES.azul);
    spark('nd-rel-sp-liq', K.mensal.liq, K.liq >= 0 ? CORES.verde : CORES.vermelho);
  }

`;
edita('public/tema-relatorios.js', (troca, entre) => {
  entre('  // ---------- gráficos ----------', '  // ---------- Excel ----------', GRAFICOS);
  troca('class="nd-rel-sp" id="nd-rel-sp-rec" height="38"', 'class="nd-rel-sp" id="nd-rel-sp-rec" height="64"');
  troca('class="nd-rel-sp" id="nd-rel-sp-desp" height="38"', 'class="nd-rel-sp" id="nd-rel-sp-desp" height="64"');
  troca('class="nd-rel-sp" id="nd-rel-sp-liq" height="38"', 'class="nd-rel-sp" id="nd-rel-sp-liq" height="64"');
  // gráfico mensal em largura total; ponte ao lado dos custos por grupo; rankings em pares; clientes sozinho
  entre('      <div class="nd-rel-duo nd-rel-duo-graf">', '    ligaControles(root, m, d, ate);',
    "      <article class=\"nd-card\"><div class=\"nd-card-cab\"><h3>Receitas, custos e resultado acumulado</h3><span class=\"nd-chip\">${S.ano}</span></div><div class=\"nd-rel-graf nd-rel-graf-alto\"><canvas id=\"nd-rel-ch-mes\"></canvas></div></article>\n" +
    "      <div class=\"nd-rel-duo\">\n        <article class=\"nd-card\"><div class=\"nd-card-cab\"><h3>Ponte do resultado</h3><span class=\"nd-chip\">da receita líquida ao resultado</span></div><div class=\"nd-rel-graf nd-rel-graf-alto\"><canvas id=\"nd-rel-ch-ponte\"></canvas></div></article>\n        ${gruposCard(m, d, ate)}\n      </div>\n" +
    "      <div class=\"nd-rel-duo\">${rankingCard('Maiores categorias de despesa', topDesp, totDesp, 'Sem despesas no período.')}${rankingCard('Principais fornecedores', d.fornecedores, totForn, 'Sem pagamentos no período.')}</div>\n" +
    "      <div class=\"nd-rel-duo nd-rel-um\">${rankingCard('Origem da receita (clientes)', d.clientes, totCli, 'Sem receitas no período.')}</div>`;\n");
});
edita('public/tema-relatorios.css', (troca, entre, ler, grava) => {
  if (ler().includes('nd-rel-graf-alto')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + `
/* rótulos mais legíveis */
.nd-rel-sp { height: 64px !important; }
.nd-rel-graf-alto { height: 380px; }
.nd-rel-um { grid-template-columns: 1fr; }
.nd-rel-det { font-size: 13px; }
.nd-rel-nota { font-size: 12.5px; }
.nd-dre { font-size: 13px; }
.nd-dre td small { font-size: 11px; }
.nd-dre th { font-size: 11px; }
.nd-rel-mini span { font-size: 11.5px; } .nd-rel-mini small { font-size: 12.5px; }
.nd-rel-gr-t small, .nd-rel-rk-t small { font-size: 12.5px; }
.nd-rel-ins span { font-size: 13px; }
@media (max-width: 640px) { .nd-rel-graf-alto { height: 320px; } }
`);
});
console.log('ok');
