/* ============================================================
   ORÇADO × REALIZADO — VISUAL NOVO (experimento). Por cima da tela original
   (ano, escopo, exportar, tabelas e gráficos continuam os de app.js):
   · escopo em abas (YTD | Ano completo) e ano com setas;
   · "Execução do orçamento" em destaque: medidor circular, orçado, realizado
     e saldo, + cartões (variação, categorias acima, maiores desvios, receitas,
     projeção do ano pelo ritmo atual); os cartões antigos ficam ocultos;
   · pontos de atenção (os mesmos do relatório "Análise completa");
   · mês a mês (despesas | receitas | resultado acumulado);
   · tabelas com barra de execução na coluna "% realizado".
   Os dois gráficos originais são refinados em tema-graficos.js.
   Dados: window.ProagroOvr (publicado por renderOrcadoReal em app.js).
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return a.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  const moeda = v => (v < 0 ? '−' : '') + 'R$ ' + compacto(v);
  const p1 = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '');
  let graficos = [], modoMes = 'desp';

  function clique(el, fn) { el.onclick = fn; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; }

  function barraSuperior() {
    const tb = $('#content .toolbar'); if (!tb || $('.nd-ovr-seg', tb)) return;
    const sel = $('#v-scope', tb), ano = $('#v-year', tb); if (!sel || !ano) return;
    sel.classList.add('nd-ovr-orig');
    const seg = document.createElement('div'); seg.className = 'nd-seg nd-ovr-seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Período');
    seg.innerHTML = `<button type="button" data-escopo="ytd">Acumulado (YTD)</button><button type="button" data-escopo="full">Ano completo</button>`;
    $$('button', seg).forEach(b => { b.setAttribute('aria-pressed', String(sel.value === b.dataset.escopo)); b.onclick = () => { sel.value = b.dataset.escopo; sel.dispatchEvent(new Event('change')); }; });
    sel.after(seg);
    const passo = d => { ano.value = String(Number(ano.value) + d); ano.dispatchEvent(new Event('change')); };
    const bt = (t, d, rot) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'nd-ovr-ano'; b.textContent = t; b.title = rot; b.setAttribute('aria-label', rot); b.onclick = () => passo(d); return b; };
    ano.before(bt('‹', -1, 'Ano anterior')); ano.after(bt('›', 1, 'Próximo ano'));
  }

  function hero(O) {
    const c = $('#content'), orig = $('.grid.kpis', c); if (!orig || $('.nd-ovr', c)) return;
    const titulo = orig.previousElementSibling; if (titulo && titulo.classList.contains('dash-section-title')) titulo.classList.add('nd-ovr-orig');
    orig.classList.add('nd-ovr-orig');
    const a = O.analise();
    const d = O.desp, comOrc = d.filter(r => r.orc > 0), tOrc = d.reduce((s, r) => s + r.orc, 0), tReal = d.reduce((s, r) => s + r.real, 0), dif = tReal - tOrc;
    const pct = tOrc ? tReal / tOrc * 100 : null, acima = comOrc.filter(r => r.real > r.orc);
    const maiorR = [...comOrc].sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))[0], maiorP = [...comOrc].sort((x, y) => y.pct - x.pct)[0];
    const tOrcR = O.rec.reduce((s, r) => s + r.orc, 0), tRealR = O.rec.reduce((s, r) => s + r.real, 0), pctR = tOrcR ? tRealR / tOrcR * 100 : null;
    const orcAno = O.budgets.filter(b => b.type === 'despesa').reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const proj = O.maxM > 0 && O.maxM < 12 ? tReal / O.maxM * 12 : null, projPct = proj != null && orcAno ? proj / orcAno * 100 : null;
    const periodo = O.scope === 'ytd' ? 'Jan–' + MESES[O.maxM - 1] : 'ano completo';
    const raio = 62, circ = 2 * Math.PI * raio, ocup = pct == null ? 0 : Math.min(1.5, pct / 100) / 1.5;   // o anel vai a 150%; a marca de 100% fica em 2/3
    const corAnel = pct == null ? 'var(--muted)' : pct <= 100 ? 'var(--verde-500)' : pct <= 110 ? 'var(--warn)' : 'var(--danger)';
    const estado = pct == null ? ['pend', 'sem orçamento'] : pct <= 100 ? ['ok', 'dentro do orçado'] : pct <= 110 ? ['warn', 'até 10% acima'] : ['late', 'acima do orçado'];
    const kpi = (cls, rotulo, valor, det, atr, fmt) => `
      <article class="nd-kpi nd-ovr-k ${cls}" ${atr || ''}>
        <div class="nd-kpi-top"><span class="nd-kpi-label">${rotulo}</span></div>
        <div class="nd-kpi-valor" ${typeof valor === 'number' ? `data-conta="${valor}" data-fmt="${fmt || 'brl'}"` : ''}>${typeof valor === 'number' ? '0' : valor}</div>
        <div class="nd-via-det">${det}</div></article>`;
    const sec = document.createElement('section'); sec.className = 'nd-ovr';
    sec.innerHTML = `
      <p class="nd-ovr-rotulo">Despesas — ${periodo} de ${O.year}</p>
      <div class="nd-ovr-bento">
        <article class="nd-card nd-ovr-hero">
          <div class="nd-kpi-top"><span class="nd-kpi-label">Execução do orçamento</span><span class="nd-chip ${estado[0]}">${estado[1]}</span></div>
          <div class="nd-ovr-hero-corpo">
            <div class="nd-ovr-anel"><svg viewBox="0 0 150 150" class="nd-gauge"><circle class="g-fundo" cx="75" cy="75" r="${raio}"/><circle class="g-valor" cx="75" cy="75" r="${raio}" stroke="${corAnel}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - ocup)}"/></svg>
              <div class="nd-ovr-anel-tx"><b>${pct == null ? '—' : p1(pct)}</b><small>do orçado</small></div></div>
            <dl class="nd-ovr-valores">
              <div><dt>Orçado</dt><dd data-conta="${tOrc}">R$ 0,00</dd></div>
              <div><dt>Realizado</dt><dd data-conta="${tReal}">R$ 0,00</dd></div>
              <div class="${dif <= 0 ? 'ok' : 'late'}"><dt>${dif <= 0 ? 'Ainda disponível' : 'Acima do orçado'}</dt><dd data-conta="${Math.abs(dif)}">R$ 0,00</dd></div>
            </dl></div>
        </article>
        <div class="nd-ovr-grade">
          ${kpi(dif > 0 ? 'red' : 'ok', 'Variação total', sinal(dif) + brl(Math.abs(dif)), pct == null ? 'sem orçamento' : (dif <= 0 ? 'abaixo do orçado · ' : 'acima do orçado · ') + p1(pct) + ' do orçado')}
          ${kpi(acima.length ? 'warn' : 'ok', 'Categorias acima do orçado', `${acima.length} / ${comOrc.length}`, acima.length ? 'clique para ver as categorias acima' : 'todas dentro do orçado', acima.length ? 'role="button" tabindex="0" data-ovr="acima"' : '')}
          ${kpi(maiorR ? (maiorR.dif > 0 ? 'red' : 'ok') : '', 'Maior desvio (R$)', maiorR ? sinal(maiorR.dif) + brl(Math.abs(maiorR.dif)) : '—', maiorR ? E(maiorR.cat) + (maiorR.dif > 0 ? ' · acima' : ' · abaixo') : 'sem dados')}
          ${kpi(maiorP && maiorP.pct > 100 ? 'red' : 'ok', 'Maior desvio (%)', maiorP ? p1(maiorP.pct) : '—', maiorP ? E(maiorP.cat) + ' do orçado' : 'sem dados')}
          ${kpi(pctR == null ? '' : pctR >= 100 ? 'ok' : 'warn', 'Receitas', pctR == null ? '—' : p1(pctR), tOrcR ? `${brl(tRealR)} de ${brl(tOrcR)}` : 'sem orçamento de receitas')}
          ${proj != null ? kpi(projPct > 100 ? 'red' : 'blue', 'Projeção do ano', brl(proj), `no ritmo atual · ${p1(projPct)} do orçado anual`) : kpi('blue', 'Orçado do ano', brl(orcAno), 'despesas, ano completo')}
        </div></div>
      ${a.alertas && a.alertas.length ? `<article class="nd-card nd-ovr-alertas"><div class="nd-card-cab"><h3>Pontos de atenção</h3><span class="nd-chip warn">${a.alertas.length}</span></div><ul>${a.alertas.map(t => `<li><span aria-hidden="true">⚠</span>${E(t)}</li>`).join('')}</ul></article>` : ''}
      <article class="nd-card nd-ovr-mes"><div class="nd-card-cab"><h3>Mês a mês <small>orçado × realizado</small></h3>
        <div class="nd-seg" role="group" aria-label="Visão mensal"><button type="button" data-mes="desp">Despesas</button><button type="button" data-mes="rec">Receitas</button><button type="button" data-mes="res">Resultado acumulado</button></div></div>
        <div class="nd-ovr-mes-cv"><canvas id="nd-ovr-mes"></canvas></div></article>`;
    orig.parentNode.insertBefore(sec, orig);
    if (window.ProagroNovo && ProagroNovo.contar) ProagroNovo.contar(sec);
    $$('[data-mes]', sec).forEach(b => { b.onclick = () => { modoMes = b.dataset.mes; mensal(O, a, sec); }; });
    $$('[data-ovr="acima"]', sec).forEach(el => clique(el, () => { const alvo = $$('#content h3').find(h => /^Despesas$/.test(h.textContent.trim())); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    mensal(O, a, sec);
  }

  function mensal(O, a, sec) {
    $$('[data-mes]', sec).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mes === modoMes)));
    graficos.forEach(g => { try { g.destroy(); } catch (e) { /* já destruído */ } }); graficos = [];
    const cv = $('#nd-ovr-mes', sec); if (!cv || !window.Chart) return; const m = a.porMes, rot = m.map(x => x.mes.slice(0, 3));
    const claro = !(window.ProagroTema && ProagroTema.tema === 'escuro'), orcCor = claro ? 'rgba(31,78,120,.35)' : 'rgba(106,165,219,.45)';
    let cfg;
    if (modoMes === 'res') {
      cfg = { type: 'line', data: { labels: rot, datasets: [
        { label: 'Resultado acumulado orçado', data: m.map(x => x.acumuladoOrc), borderColor: claro ? '#1F4E78' : '#6AA5DB', borderDash: [7, 5], borderWidth: 2.5, tension: .3, pointRadius: 0, pointHoverRadius: 6, fill: false },
        { label: 'Resultado acumulado realizado', data: m.map(x => x.acumuladoReal), borderColor: '#3DAE43', borderWidth: 3, tension: .3, pointRadius: 3, pointHoverRadius: 7, fill: false }] } };
    } else {
      const desp = modoMes === 'desp', orc = m.map(x => desp ? x.despesaOrc : x.receitaOrc), real = m.map(x => desp ? x.despesaReal : x.receitaReal);
      const ruim = (r, o) => (desp ? r > o : r < o);
      cfg = { type: 'bar', data: { labels: rot, datasets: [
        { label: 'Orçado', data: orc, backgroundColor: orcCor, borderRadius: 8, borderSkipped: false, maxBarThickness: 26 },
        { label: 'Realizado', data: real, backgroundColor: real.map((r, i) => (ruim(r, orc[i]) ? '#B23A2F' : '#3DAE43')), borderRadius: 8, borderSkipped: false, maxBarThickness: 26 }] } };
    }
    cfg.options = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { padding: 14, callbacks: { label: c => ' ' + c.dataset.label + ': ' + brl(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, border: { display: false } }, y: { border: { display: false }, ticks: { maxTicksLimit: 6, callback: v => moeda(v) } } } };
    graficos.push(typeof makeChart === 'function' ? makeChart(cv, cfg) : new Chart(cv, cfg));
  }

  function tabelas(O) {
    const tbs = $$('#content .table-wrap table'); if (tbs.length < 2) return;
    [[tbs[0], O.rec, true], [tbs[1], O.desp, false]].forEach(([t, rows, receita]) => {
      $$('tbody tr', t).forEach((tr, i) => {
        const r = rows[i], td = tr.children[4]; if (!r || !td || td.querySelector('.nd-ovr-pct')) return;
        if (r.pct == null) { td.innerHTML = '<span class="nd-ovr-sem">—</span>'; return; }
        const ok = receita ? r.dif >= 0 : r.dif <= 0, aviso = !ok && Math.abs(r.dif) / (r.orc || 1) <= 0.1, tom = ok ? 'ok' : aviso ? 'warn' : 'late';
        td.innerHTML = `<div class="nd-ovr-pct ${tom}"><span title="A marca é o 100% do orçado"><i style="width:${(Math.min(r.pct, 150) / 150 * 100).toFixed(1)}%"></i></span><b>${p1(r.pct)}</b></div>`;
      });
      const h = t.closest('.table-wrap').previousElementSibling; if (h && h.tagName === 'H3') h.classList.add('nd-ovr-h');
    });
  }

  function aplica() {
    if (!novo()) return; const O = window.ProagroOvr, c = $('#content'); if (!O || !c || !$('#v-year', c)) return;
    c.classList.add('nd-ovr-page'); barraSuperior(); hero(O); tabelas(O);
  }
  document.addEventListener('proagro:ovr', aplica);
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { orcado: aplica });
})();
