/* ============================================================
   TEMA: claro/escuro + "visual novo" (experimento).
   - Carrega no <head>, ANTES do CSS ser pintado: aplica os atributos
     data-tema e data-ui no <html> para a tela não "piscar".
   - A escolha fica salva no navegador de cada pessoa (localStorage).
     Padrão: claro + clássico = o sistema exatamente como era.
   - Cria os botões no topo (e na tela de entrada).
   - Configura os gráficos (Chart.js) conforme o tema: cores de texto e
     grade, e, no visual novo, animação, dica ao passar o mouse,
     barras arredondadas, linhas suaves com degradê e rosca.
   Para desfazer: botão "Clássico" no topo (ou remover este arquivo,
   tema.css, tema-escuro.css e as linhas do index.html).
   ============================================================ */
(function () {
  'use strict';
  const K_TEMA = 'proagro_tema', K_UI = 'proagro_ui';
  const root = document.documentElement;
  const ler = (k, padrao, validos) => { try { const v = localStorage.getItem(k); return validos.includes(v) ? v : padrao; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegador sem armazenamento: vale só nesta sessão */ } };
  let tema = ler(K_TEMA, 'claro', ['claro', 'escuro']);
  let ui = ler(K_UI, 'classico', ['classico', 'novo']);
  const aplicar = () => { root.setAttribute('data-tema', tema); root.setAttribute('data-ui', ui); };
  aplicar();                                   // já no <head>: sem piscar

  // ---------- gráficos ----------
  const original = {};                         // o que o Chart.js trazia, para o visual clássico voltar idêntico
  const rgba = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return null;
    const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const gradeEscuro = 'rgba(255,255,255,.07)', gradeClaro = '#EDF1EE';
  // no tema escuro, cores de série muito escuras (ex.: #0B3B24, #5C1B14) somem no fundo: clareia só essas, mantendo o matiz
  const clareiaSeEscura = cor => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(cor).trim()); if (!m) return cor;
    const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (l >= 0.28) return cor;
    const d = mx - mn; let h = 0; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    const L = 0.46, a = Math.min(s, 0.6) * Math.min(L, 1 - L), f = k => { const q = (k + h / 30) % 12; return L - a * Math.max(-1, Math.min(q - 3, Math.min(9 - q, 1))); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };
  let pluginRegistrado = false;
  function aplicarChart() {
    if (!window.Chart) return;
    const d = Chart.defaults, escuro = tema === 'escuro', novo = ui === 'novo';
    if (!original.salvo) {
      original.salvo = true;
      original.color = d.color; original.borderColor = d.borderColor;
      original.animation = { duration: d.animation.duration, easing: d.animation.easing };
      original.interaction = { mode: d.interaction.mode, intersect: d.interaction.intersect };
      original.elements = JSON.parse(JSON.stringify({ bar: d.elements.bar, line: d.elements.line, point: d.elements.point, arc: d.elements.arc }));
      const pega = (o, ks) => { const r = {}; ks.forEach(k => { r[k] = o[k]; }); return r; };
      original.tooltipKeys = ['backgroundColor', 'titleColor', 'bodyColor', 'borderColor', 'borderWidth', 'padding', 'cornerRadius', 'boxPadding', 'usePointStyle', 'caretSize', 'titleFont', 'displayColors'];
      original.tooltip = pega(d.plugins.tooltip, original.tooltipKeys);
      original.legendKeys = ['usePointStyle', 'pointStyle', 'boxWidth', 'boxHeight', 'padding'];
      original.legend = pega(d.plugins.legend.labels, original.legendKeys);
    }
    d.color = escuro ? '#BBC9C0' : (novo ? '#43554B' : original.color);
    d.borderColor = escuro ? 'rgba(255,255,255,.08)' : (novo ? 'rgba(16,40,28,.07)' : original.borderColor);
    if (novo) {
      d.animation.duration = 900; d.animation.easing = 'easeOutQuart';
      d.interaction.mode = 'index'; d.interaction.intersect = false;
      Object.assign(d.elements.bar, { borderRadius: 8, borderSkipped: false });
      Object.assign(d.elements.line, { tension: 0.38, borderWidth: 2.5, borderCapStyle: 'round' });
      Object.assign(d.elements.point, { radius: 0, hoverRadius: 6, hitRadius: 14, hoverBorderWidth: 3 });
      Object.assign(d.elements.arc, { borderWidth: 3, borderRadius: 6, hoverOffset: 10 });
      d.plugins.tooltip = Object.assign(d.plugins.tooltip || {}, {
        backgroundColor: escuro ? 'rgba(6,12,9,.96)' : 'rgba(8,24,16,.94)', titleColor: '#fff', bodyColor: '#E8F0EA',
        borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, padding: 12, cornerRadius: 12, boxPadding: 6, usePointStyle: true,
        titleFont: { weight: '700' }, caretSize: 6, displayColors: true
      });
      d.plugins.legend.labels = Object.assign(d.plugins.legend.labels || {}, { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16 });
      Chart.overrides.doughnut.interaction = { mode: 'nearest', intersect: true };
      Chart.overrides.pie.interaction = { mode: 'nearest', intersect: true };
    } else {
      Object.assign(d.animation, original.animation); Object.assign(d.interaction, original.interaction);
      ['bar', 'line', 'point', 'arc'].forEach(k => { Object.keys(d.elements[k]).forEach(p => { if (!(p in original.elements[k])) delete d.elements[k][p]; }); Object.assign(d.elements[k], original.elements[k]); });
      Object.assign(d.plugins.tooltip, original.tooltip);
      Object.assign(d.plugins.legend.labels, original.legend);
      delete Chart.overrides.doughnut.interaction; delete Chart.overrides.pie.interaction;
    }
    if (!pluginRegistrado) {
      pluginRegistrado = true;
      Chart.register({
        id: 'proagroTema',
        // o app define a grade de cada gráfico com a cor clara fixa (#EDF1EE): troca pela do tema
        beforeInit(chart) {
          const o = chart.config.options || {}, esc = tema === 'escuro', nov = ui === 'novo', tipo = chart.config.type;
          Object.values(o.scales || {}).forEach(sc => {
            if (sc && sc.grid && sc.grid.color === gradeClaro) sc.grid.color = esc ? gradeEscuro : (nov ? 'rgba(16,40,28,.06)' : gradeClaro);
            if (nov && sc) { sc.border = Object.assign({ display: false }, sc.border); }
          });
          if (nov && (tipo === 'doughnut') && o.cutout === undefined) o.cutout = '68%';
          if (esc) (chart.config.data.datasets || []).forEach(ds => { if (Array.isArray(ds.backgroundColor)) ds.backgroundColor = ds.backgroundColor.map(clareiaSeEscura); else if (typeof ds.backgroundColor === 'string') ds.backgroundColor = clareiaSeEscura(ds.backgroundColor); });
          // visual novo: linha única vira área com degradê
          if (nov && tipo === 'line' && (chart.config.data.datasets || []).length === 1) {
            const ds = chart.config.data.datasets[0]; if (ds.fill === undefined || ds.fill === false) ds.fill = true; ds.tension = ds.tension || 0.38;
          }
        },
        afterLayout(chart) {
          if (ui !== 'novo' || chart.config.type !== 'line' || !chart.chartArea) return;
          const { ctx, chartArea } = chart;
          chart.data.datasets.forEach(ds => {
            if (!ds.fill || typeof ds.borderColor !== 'string') return;
            const topo = rgba(ds.borderColor, 0.32), base = rgba(ds.borderColor, 0); if (!topo) return;
            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom); g.addColorStop(0, topo); g.addColorStop(1, base);
            ds.backgroundColor = g;
          });
        }
      });
    }
  }

  // ---------- botões ----------
  const SVG_LUA = '<svg class="i-lua" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const SVG_SOL = '<svg class="i-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const marcacao = classes => `<div class="tema-ctl ${classes || ''}" data-tema-ctl>
      <div class="tema-seg" role="group" aria-label="Aparência do sistema">
        <button type="button" data-ui-acao="classico" title="Visual clássico (o atual)">Clássico</button>
        <button type="button" data-ui-acao="novo" title="Experimentar o novo visual — dá para voltar ao clássico a qualquer momento">Novo ✦</button>
      </div>
      <button type="button" class="tema-icone" data-tema-acao title="Alternar entre tema claro e escuro" aria-label="Alternar entre tema claro e escuro">${SVG_LUA}${SVG_SOL}</button>
    </div>`;
  function sincronizar() {
    document.querySelectorAll('[data-ui-acao]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-ui-acao') === ui)));
    document.querySelectorAll('[data-tema-acao]').forEach(b => { b.setAttribute('aria-pressed', String(tema === 'escuro')); b.title = tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'; });
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', tema === 'escuro' ? '#0A0F0C' : '#F5F7F6');
  }
  function montarControles() {
    const topo = document.querySelector('.topbar-right');
    if (topo && !topo.querySelector('[data-tema-ctl]')) topo.insertAdjacentHTML('afterbegin', marcacao());
    const login = document.getElementById('view-login');
    if (login && !login.querySelector('[data-tema-ctl]')) login.insertAdjacentHTML('beforeend', marcacao('flutuante'));
    sincronizar();
  }
  function mudou() {
    aplicar(); sincronizar(); aplicarChart();
    // quem desenha gráficos/telas se redesenha com as novas cores (o app escuta este evento)
    window.dispatchEvent(new CustomEvent('proagro:tema', { detail: { tema, ui } }));
  }
  window.ProagroTema = {
    get tema() { return tema; }, get ui() { return ui; },
    setTema(t) { if (t === tema || !['claro', 'escuro'].includes(t)) return; tema = t; gravar(K_TEMA, t); mudou(); },
    setUi(u) { if (u === ui || !['classico', 'novo'].includes(u)) return; ui = u; gravar(K_UI, u); mudou(); },
    alternarTema() { this.setTema(tema === 'escuro' ? 'claro' : 'escuro'); },
    aplicarChart
  };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-ui-acao]'); if (a) return window.ProagroTema.setUi(a.getAttribute('data-ui-acao'));
    if (e.target.closest && e.target.closest('[data-tema-acao]')) window.ProagroTema.alternarTema();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarControles); else montarControles();
  window.addEventListener('load', () => { aplicarChart(); montarControles(); });
})();
