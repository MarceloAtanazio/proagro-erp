/* ============================================================
   GRÁFICOS DO FLUXO DE CAIXA — VISUAL NOVO (experimento).
   Plugin do Chart.js que refina, SÓ com o visual "Novo" ligado, os dois
   gráficos da tela (os dados e a criação continuam os de app.js):
   · Evolução do saldo (#ch-saldo): linha suave, sem pontos em cada dado
     (só o último e o que estiver sob o mouse), trechos negativos em
     vermelho, linha de zero quando o saldo cruza o zero, marcadores de
     Máx. e Mín. do período, linha vertical que acompanha o mouse, dica
     com a variação contra o ponto anterior, eixos compactos (R$ 1,8 mi).
   · Entradas × Saídas (#ch-entsai): barras mais cheias, faixa que realça
     o período sob o mouse, linha de Resultado (entradas − saídas) e um
     seletor "Entradas e saídas | Resultado líquido" (este mostra só o
     líquido, verde acima de zero e vermelho abaixo).
   ============================================================ */
(function () {
  'use strict';
  if (!window.Chart) return;
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const escuro = () => window.ProagroTema && ProagroTema.tema === 'escuro';
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return a.toLocaleString('pt-BR'); };
  const moeda = v => (v < 0 ? '−' : '') + 'R$ ' + compacto(v);
  const curto = l => { const m = /^(\d{2}\/\d{2})\/\d{4}$/.exec(String(l)); return m ? m[1] : l; };
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '');
  const VERDE = '#3DAE43', VERMELHO = '#B23A2F';
  const ativos = chart => { const t = chart.tooltip; return t && t.opacity > 0 && t.getActiveElements ? t.getActiveElements() : []; };

  function eixos(o) {
    o.scales = o.scales || {}; const x = o.scales.x = o.scales.x || {}, y = o.scales.y = o.scales.y || {};
    x.ticks = Object.assign({}, x.ticks, { callback: function (v) { return curto(this.getLabelForValue(v)); }, maxTicksLimit: 8, maxRotation: 0, autoSkip: true, padding: 8 });
    x.grid = Object.assign({}, x.grid, { display: false }); x.border = { display: false };
    y.ticks = Object.assign({}, y.ticks, { callback: v => moeda(v), maxTicksLimit: 6, padding: 8 }); y.border = { display: false };
  }
  const tooltip = (o, extra) => { o.plugins = o.plugins || {}; const t = o.plugins.tooltip = Object.assign({}, o.plugins.tooltip); t.callbacks = Object.assign({}, t.callbacks, extra); t.padding = 14; t.boxPadding = 6; };

  function prepararSaldo(chart) {
    const o = chart.config.options, ds = chart.config.data.datasets[0]; if (!ds) return;
    eixos(o); o.interaction = { mode: 'index', intersect: false };
    const cor = typeof ds.borderColor === 'string' ? ds.borderColor : '#00783F';
    Object.assign(ds, {
      borderWidth: 3, tension: 0.35, fill: true, pointHoverRadius: 7, pointHoverBorderWidth: 3, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: cor,
      pointRadius: c => (c.dataIndex === c.dataset.data.length - 1 ? 5 : 0), pointBackgroundColor: cor, pointBorderColor: '#fff', pointBorderWidth: 2,
      segment: { borderColor: c => (c.p0.parsed.y < 0 || c.p1.parsed.y < 0 ? VERMELHO : undefined) }
    });
    o.plugins = o.plugins || {}; o.plugins.legend = Object.assign({}, o.plugins.legend, { display: false });
    tooltip(o, {
      afterLabel: c => { const i = c.dataIndex; if (!i) return ''; const d = c.parsed.y - c.dataset.data[i - 1]; return ' Variação: ' + sinal(d) + brl(Math.abs(d)) + ' vs. anterior'; }
    });
  }

  function prepararEntSai(chart) {
    const o = chart.config.options, dss = chart.config.data.datasets; if (dss.length < 2) return;
    eixos(o); o.interaction = { mode: 'index', intersect: false };
    dss.slice(0, 2).forEach(d => Object.assign(d, { borderRadius: 7, borderSkipped: false, categoryPercentage: 0.86, barPercentage: 0.94, maxBarThickness: 30 }));
    const ent = dss[0].data, sai = dss[1].data, liquido = ent.map((v, i) => Math.round((v - sai[i]) * 100) / 100);
    const corLinha = escuro() ? '#6AA5DB' : '#1F4E78';
    dss.push({ type: 'line', label: 'Resultado', data: liquido, borderColor: corLinha, backgroundColor: corLinha, borderWidth: 2.5, borderDash: [7, 5], tension: 0.35, pointRadius: 0, pointHoverRadius: 6, order: 0 });
    dss.push({ type: 'bar', label: 'Resultado líquido', data: liquido, hidden: true, backgroundColor: liquido.map(v => (v >= 0 ? VERDE : VERMELHO)), borderRadius: 7, borderSkipped: false, categoryPercentage: 0.86, barPercentage: 0.94, maxBarThickness: 30 });
    // um período muito acima dos demais achata todas as outras barras: corta o eixo no "normal" e marca o estouro com uma etiqueta
    const abs = ent.concat(sai, liquido).map(Math.abs).sort((a, b) => b - a), maior = abs[0], segundo = abs.find(v => v < maior * 0.6) || 0;
    if (maior > 0 && segundo > 0 && maior > segundo * 3) {
      const teto = Math.ceil(segundo * 1.3 / 1000) * 1000, y = o.scales.y; y.max = teto; y.min = Math.min(...liquido) < 0 ? -teto : 0; chart.$ndTeto = teto;
    }
    o.plugins = o.plugins || {};
    o.plugins.legend = Object.assign({}, o.plugins.legend, { labels: Object.assign({}, (o.plugins.legend || {}).labels, { filter: it => (chart.$ndModo === 'liq') === (it.datasetIndex === 3) }) });
    tooltip(o, {});
  }

  // Despesas / Receitas por categoria (barras horizontais): mais altura por categoria, barras arredondadas com respiro,
  // valor e % do total ao fim de cada barra e eixo compacto.
  function prepararCategorias(chart) {
    const o = chart.config.options, ds = chart.config.data.datasets[0], n = chart.config.data.labels.length; if (!ds || !n) return;
    const box = chart.canvas.parentElement; if (box) box.style.height = Math.max(300, n * 46 + 84) + 'px';
    Object.assign(ds, { borderRadius: 10, borderSkipped: false, barThickness: 20, categoryPercentage: 1, barPercentage: 1 });
    o.layout = { padding: { right: 118, top: 6 } };
    eixos(o); o.scales.y.ticks = Object.assign({}, o.scales.y.ticks, { autoSkip: false, maxTicksLimit: 99, padding: 12, font: { family: 'DM Sans', size: 13 }, callback: function (v) { return this.getLabelForValue(v); } });
    o.scales.x.grid = { display: true, color: escuro() ? 'rgba(255,255,255,.06)' : 'rgba(16,40,28,.07)', drawTicks: false }; o.scales.x.ticks = Object.assign({}, o.scales.x.ticks, { padding: 10, maxTicksLimit: 6, callback: v => moeda(v) });
    o.scales.y.grid = { display: false };
    const total = ds.data.reduce((t, v) => t + v, 0) || 1;
    tooltip(o, { afterLabel: c => ' ' + (c.parsed.x / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do total' });
    chart.$ndTotal = total;
  }

  function pilula(ctx, texto, x, y, area, claro) {
    ctx.save(); ctx.font = '600 11px "DM Sans", sans-serif'; const w = ctx.measureText(texto).width + 18, h = 22;
    const px = Math.min(Math.max(x - w / 2, area.left + 2), area.right - w - 2), py = y - h / 2;
    ctx.fillStyle = claro ? 'rgba(8,24,16,.92)' : '#e8f0ea'; ctx.beginPath(); ctx.roundRect(px, py, w, h, 11); ctx.fill();
    ctx.fillStyle = claro ? '#fff' : '#0b1f15'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(texto, px + w / 2, py + h / 2 + 0.5); ctx.restore();
  }

  Chart.register({
    id: 'proagroFluxoGraficos',
    beforeInit(chart) {
      if (!novo()) return; const id = chart.canvas && chart.canvas.id;
      if (id === 'ch-saldo') prepararSaldo(chart); else if (id === 'ch-entsai') prepararEntSai(chart); else if (id === 'ch-desp' || id === 'ch-rec') prepararCategorias(chart);
    },
    afterInit(chart) { if (novo() && chart.canvas && chart.canvas.id === 'ch-entsai') seletorModo(chart); },
    beforeDatasetsDraw(chart) {
      if (!novo() || !chart.canvas || chart.canvas.id !== 'ch-entsai') return;
      const a = ativos(chart); if (!a.length) return;
      const { ctx, chartArea: ar, scales } = chart, n = chart.data.labels.length, w = ar.width / n, x = scales.x.getPixelForValue(a[0].index);
      ctx.save(); ctx.fillStyle = escuro() ? 'rgba(255,255,255,.06)' : 'rgba(0,120,63,.07)'; ctx.beginPath(); ctx.roundRect(x - w / 2, ar.top, w, ar.height, 10); ctx.fill(); ctx.restore();
    },
    afterDatasetsDraw(chart) {
      if (novo() && chart.$ndTotal) {   // valor e % ao fim de cada barra
        const { ctx } = chart, ds = chart.data.datasets[0], meta = chart.getDatasetMeta(0);
        ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ds.data.forEach((v, i) => { const el = meta.data[i]; if (!el) return; const pct = v / chart.$ndTotal * 100;
          ctx.font = '700 12px "DM Sans", sans-serif'; ctx.fillStyle = escuro() ? '#e8f0ea' : '#10281c'; const t1 = 'R$ ' + compacto(v); ctx.fillText(t1, el.x + 10, el.y);
          ctx.font = '500 11px "DM Sans", sans-serif'; ctx.fillStyle = escuro() ? 'rgba(232,240,234,.6)' : 'rgba(16,40,28,.55)';
          ctx.fillText((pct < 0.1 ? '<0,1' : pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })) + '%', el.x + 14 + (ctx.measureText(t1).width * 1.0) + 8, el.y); });
        ctx.restore();
      }
      if (novo() && chart.$ndTeto && chart.canvas && chart.canvas.id === 'ch-entsai') {   // etiqueta "▲ valor" nas barras cortadas
        const { ctx, chartArea: ar } = chart, teto = chart.$ndTeto, claro = !escuro();
        chart.data.datasets.forEach((d, di) => {
          if (d.type === 'line' || !chart.isDatasetVisible(di)) return; const meta = chart.getDatasetMeta(di);
          d.data.forEach((v, i) => { if (Math.abs(v) <= teto) return; const el = meta.data[i]; if (el) pilula(ctx, (v > 0 ? '▲ ' : '▼ ') + moeda(v), el.x, v > 0 ? ar.top + 12 : ar.bottom - 12, ar, claro); });
        });
      }
      if (!novo() || !chart.canvas || chart.canvas.id !== 'ch-saldo') return;
      const { ctx, chartArea: ar, scales } = chart, ds = chart.data.datasets[0], dados = ds.data, meta = chart.getDatasetMeta(0), claro = !escuro();
      if (!dados.length || !meta.data.length) return;
      // linha de zero quando o saldo cruza o zero
      if (scales.y.min < 0 && scales.y.max > 0) {
        const y0 = scales.y.getPixelForValue(0); ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(178,58,47,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ar.left, y0); ctx.lineTo(ar.right, y0); ctx.stroke(); ctx.restore();
        pilula(ctx, 'Saldo zero', ar.left + 44, y0 - 14, ar, claro);
      }
      // linha vertical que acompanha o mouse
      const a = ativos(chart);
      if (a.length) { const x = a[0].element.x; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = escuro() ? 'rgba(255,255,255,.3)' : 'rgba(16,40,28,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, ar.top); ctx.lineTo(x, ar.bottom); ctx.stroke(); ctx.restore(); }
      // máximo e mínimo do período (só com variação e sem o mouse em cima, para não poluir)
      let iMin = 0, iMax = 0; dados.forEach((v, i) => { if (v < dados[iMin]) iMin = i; if (v > dados[iMax]) iMax = i; });
      if (dados.length > 3 && dados[iMin] !== dados[iMax] && !a.length) {
        [[iMax, 'Máx.', -16], [iMin, 'Mín.', 16]].forEach(([i, t, d]) => {
          const p = meta.data[i]; if (!p) return; const y = p.y + d; const yy = (d > 0 && y > ar.bottom - 14) ? p.y - 16 : y;
          ctx.save(); ctx.fillStyle = dados[i] < 0 ? VERMELHO : '#00783F'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
          pilula(ctx, t + ' ' + moeda(dados[i]), p.x, yy, ar, claro);
        });
      }
    }
  });

  // ---------- seletor do gráfico Entradas × Saídas ----------
  function modo(chart, m) {
    const liq = m === 'liq';
    [0, 1, 2].forEach(i => chart.setDatasetVisibility(i, !liq)); chart.setDatasetVisibility(3, liq);
    chart.$ndModo = m; chart.update();
    const card = chart.canvas.closest('.card'); if (!card) return;
    card.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
    document.querySelectorAll('.nd-fx-pequenos [data-serie]').forEach(k => k.classList.remove('nd-off'));
  }
  function seletorModo(chart) {
    const card = chart.canvas.closest('.card'), h3 = card && card.querySelector('h3'); if (!h3 || h3.querySelector('[data-modo]')) return;
    const box = document.createElement('div'); box.className = 'nd-seg nd-modo'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Modo do gráfico');
    box.innerHTML = '<button type="button" data-modo="ent" aria-pressed="true">Entradas e saídas</button><button type="button" data-modo="liq" aria-pressed="false">Resultado líquido</button>';
    box.querySelectorAll('button').forEach(b => { b.onclick = () => modo(chart, b.dataset.modo); }); h3.appendChild(box);
  }
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { modoEntSai: modo });
})();
