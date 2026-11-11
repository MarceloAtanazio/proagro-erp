/* ============================================================
   FLUXO DE CAIXA — VISUAL NOVO (experimento). Repaginado POR CIMA da
   tela original (filtros, Solicitar aporte, CSV/Excel/PDF, gráficos e
   tabelas continuam os de app.js). Aqui entram, no lugar do alerta e
   dos cinco indicadores antigos:
     · banner de alerta com ação (Solicitar aporte);
     · atalhos de período e de granularidade (comandam os filtros);
     · saldo atual em destaque com minigráfico do período;
     · indicadores em grade com minigráfico, contagem animada e
       interação: Entradas e Saídas ligam/desligam a série no gráfico,
       o Saldo leva ao gráfico, Cobertura mostra o quanto as entradas
       pagam das saídas num medidor circular.
   Só age com o visual "Novo" ligado. Dados: window.ProagroFluxo.d.
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $ = (s, r) => (r || document).querySelector(s);
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return v.toLocaleString('pt-BR'); };
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '');
  const pct1 = v => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

  function presets() {
    const hoje = todayISO(), [a, m] = hoje.split('-').map(Number);
    const fim = new Date(a, m, 0).toLocaleDateString('en-CA'), add = n => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
    return [
      { id: 'mes', t: 'Este mês', de: hoje.slice(0, 8) + '01', ate: fim },
      { id: '30', t: 'Próx. 30 dias', de: hoje, ate: add(30) },
      { id: '90', t: 'Próx. 90 dias', de: hoje, ate: add(90) },
      { id: 'ano', t: 'Este ano', de: a + '-01-01', ate: a + '-12-31' }
    ];
  }

  function fluxo() {
    const F = window.ProagroFluxo; if (!F || !F.d) return;
    const d = F.d, r = d.resumo, b = d.buckets || [], c = document.getElementById('content');
    const toolbar = $('#fluxo-toolbar'); if (!c || !toolbar || c.querySelector('.nd-fx')) return;
    c.classList.add('nd-fx-page');

    // esconde o alerta e os cinco indicadores antigos (continuam no DOM, só ocultos)
    const alertaOriginal = toolbar.nextElementSibling; if (alertaOriginal && alertaOriginal.classList.contains('card')) alertaOriginal.classList.add('nd-fx-orig');
    [...c.children].forEach((el, i, arr) => { if (el.classList.contains('dash-section-title') && /Resumo financeiro/i.test(el.textContent)) { el.classList.add('nd-fx-orig'); if (arr[i + 1] && arr[i + 1].classList.contains('kpis')) arr[i + 1].classList.add('nd-fx-orig'); } });

    const resultado = Math.round((r.totalEntradas - r.totalSaidas) * 100) / 100;
    const mov = r.totalEntradas + r.totalSaidas, shareEnt = mov ? r.totalEntradas / mov * 100 : 0;
    const cobertura = r.totalSaidas > 0 ? r.totalEntradas / r.totalSaidas * 100 : (r.totalEntradas > 0 ? 100 : 0);
    const dif = Math.round((r.saldoPrevisto - r.saldoAtual) * 100) / 100;
    const variacao = Math.round((r.saldoAtual - r.saldoInicial) * 100) / 100;
    const varPct = r.saldoInicial ? variacao / Math.abs(r.saldoInicial) * 100 : null;
    const critico = !!d.alerta.diaCritico;

    const alerta = critico
      ? `<div class="nd-fx-alerta red"><span class="nd-fx-alerta-ic">⚠</span><div><strong>O caixa fica negativo em ${brDate(d.alerta.diaCritico)}</strong>
          <p>Pior momento em ${brDate(d.alerta.diaPior)}: faltariam <b>${brl(d.alerta.necessidade)}</b>. É o aporte mínimo para o caixa não faltar nos próximos 90 dias (até ${brDate(d.alerta.horizonte)}).</p></div>
          <button type="button" class="nd-fx-cta" data-fx="aporte">💰 Solicitar aporte</button></div>`
      : `<div class="nd-fx-alerta ok"><span class="nd-fx-alerta-ic">✓</span><div><strong>Sem risco de saldo negativo</strong>
          <p>Até ${brDate(d.alerta.horizonte)}, considerando o saldo real e os títulos já lançados.</p></div></div>`;

    const per = presets(), ativo = per.find(p => p.de === d.de && p.ate === d.ate);
    const granAtual = ($('#fx-gran') || {}).value || 'dia';
    const GRAN = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']];

    const kpi = (cls, rotulo, valor, chip, extra, atr, dica) => `
      <article class="nd-kpi ${cls}" ${atr || ''} ${dica ? `title="${dica}"` : ''}>
        <div class="nd-kpi-top"><span class="nd-kpi-label">${rotulo}</span>${chip ? `<span class="nd-chip ${chip.cls || ''}">${chip.t}</span>` : ''}</div>
        <div class="nd-kpi-valor" data-conta="${valor}">R$ 0,00</div>${extra || ''}
      </article>`;
    const raio = 50, circ = 2 * Math.PI * raio, corG = cobertura >= 100 ? 'var(--verde-500)' : cobertura >= 70 ? 'var(--warn)' : 'var(--danger)';

    const sec = document.createElement('section'); sec.className = 'nd-fx';
    sec.innerHTML = `
      ${alerta}
      <div class="nd-fx-controles">
        <div class="nd-fx-periodos" role="group" aria-label="Período">${per.map(p => `<button type="button" data-per="${p.id}" aria-pressed="${ativo && ativo.id === p.id}">${p.t}</button>`).join('')}</div>
        <div class="nd-seg" role="group" aria-label="Agrupar por">${GRAN.map(([v, t]) => `<button type="button" data-gran="${v}" aria-pressed="${granAtual === v}">${t}</button>`).join('')}</div>
      </div>
      <div class="nd-fx-bento">
        <article class="nd-card nd-fx-hero" role="button" tabindex="0" data-fx="saldo" title="Clique para ver a evolução do saldo">
          <div class="nd-kpi-top"><span class="nd-kpi-label">Saldo atual</span><span class="nd-chip ${dif >= 0 ? 'ok' : 'warn'}" title="Saldo previsto considerando todo o pendente a pagar e a receber">previsto ${brl(r.saldoPrevisto)}</span></div>
          <div class="nd-saldo-valor ${r.saldoAtual < 0 ? 'neg' : ''}" data-conta="${r.saldoAtual}">R$ 0,00</div>
          <div class="nd-saldo-meta"><span>Desde o início do período <strong class="${variacao >= 0 ? 'pos' : 'neg'}">${sinal(variacao)}${brl(Math.abs(variacao))}${varPct == null ? '' : ' · ' + pct1(varPct)}</strong></span></div>
          <div class="nd-saldo-spark"><canvas id="nd-fx-sp-saldo"></canvas></div>
          <div class="nd-saldo-rodape"><span><i style="background:var(--verde-500)"></i>Entradas <strong>${brl(r.totalEntradas)}</strong></span><span><i style="background:var(--danger)"></i>Saídas <strong>${brl(r.totalSaidas)}</strong></span></div>
        </article>
        <div class="nd-fx-pequenos">
          ${kpi('', 'Saldo inicial', r.saldoInicial, { t: 'em ' + brDate(d.de) }, '', '', 'Saldo no primeiro dia do período filtrado')}
          ${kpi('', 'Entradas', r.totalEntradas, { t: pct1(shareEnt) + ' do movimento', cls: 'ok' }, '<div class="nd-spark"><canvas id="nd-fx-sp-ent"></canvas></div>', 'role="button" tabindex="0" data-serie="0"', 'Clique para ligar ou desligar as entradas no gráfico')}
          ${kpi('red', 'Saídas', r.totalSaidas, { t: pct1(100 - shareEnt) + ' do movimento', cls: 'late' }, '<div class="nd-spark"><canvas id="nd-fx-sp-sai"></canvas></div>', 'role="button" tabindex="0" data-serie="1"', 'Clique para ligar ou desligar as saídas no gráfico')}
          ${kpi('blue', 'Resultado do período', resultado, { t: resultado >= 0 ? 'superávit' : 'déficit', cls: resultado >= 0 ? 'ok' : 'late' },
            `<div class="nd-fx-fluxo" title="Entradas × saídas"><span style="width:${shareEnt.toFixed(1)}%"></span></div><div class="nd-prop-leg">entradas × saídas</div>`, '', 'Entradas menos saídas no período')}
          ${kpi(r.saldoPrevisto >= 0 ? '' : 'warn', 'Saldo previsto', r.saldoPrevisto, { t: (dif >= 0 ? '↑ ' : '↓ ') + compacto(Math.abs(dif)) + ' vs. hoje', cls: dif >= 0 ? 'ok' : 'warn' }, '', '', 'Considera todo o pendente a pagar e a receber')}
          <article class="nd-kpi nd-fx-cob" title="Quanto das saídas do período as entradas cobrem">
            <div class="nd-kpi-top"><span class="nd-kpi-label">Cobertura</span><span class="nd-chip ${cobertura >= 100 ? 'ok' : cobertura >= 70 ? 'warn' : 'late'}">${cobertura >= 100 ? 'folga' : 'aperto'}</span></div>
            <div class="nd-gauge-box"><svg class="nd-gauge" viewBox="0 0 120 120" aria-hidden="true"><circle class="g-fundo" cx="60" cy="60" r="${raio}"/><circle class="g-valor" cx="60" cy="60" r="${raio}" stroke="${corG}" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${circ.toFixed(2)}" data-alvo="${(circ * (1 - Math.min(cobertura, 100) / 100)).toFixed(2)}"/></svg>
              <div class="nd-gauge-txt"><b data-conta="${cobertura}" data-fmt="pct">0%</b><small>das saídas</small></div></div>
          </article>
        </div>
      </div>`;
    toolbar.parentNode.insertBefore(sec, toolbar.nextSibling);
    if (ProagroNovo.contar) ProagroNovo.contar(sec);
    setTimeout(() => sec.querySelectorAll('.g-valor').forEach(g => { g.style.strokeDashoffset = g.dataset.alvo; }), 80);

    // ---------- minigráficos ----------
    const rot = b.map(x => x.label);
    if (ProagroNovo.sparkline && b.length) {
      ProagroNovo.sparkline($('#nd-fx-sp-saldo'), b.map(x => x.saldo), '#00783F', rot);
      ProagroNovo.sparkline($('#nd-fx-sp-ent'), b.map(x => x.entradas), '#3DAE43', rot);
      ProagroNovo.sparkline($('#nd-fx-sp-sai'), b.map(x => x.saidas), '#B23A2F', rot);
    }

    // ---------- interações ----------
    const clicar = (el, fn) => { el.addEventListener('click', fn); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); };
    const ap = sec.querySelector('[data-fx="aporte"]'); if (ap) ap.onclick = () => { const o = $('#fx-aporte'); if (o) o.click(); };
    clicar(sec.querySelector('[data-fx="saldo"]'), () => { const cv = $('#ch-saldo'); const card = cv && cv.closest('.card'); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('nd-pisca'); void card.offsetWidth; card.classList.add('nd-pisca'); } });
    sec.querySelectorAll('[data-serie]').forEach(el => clicar(el, () => {
      const ch = window.Chart && Chart.getChart('ch-entsai'); if (!ch) return;
      if (ch.$ndModo === 'liq' && ProagroNovo.modoEntSai) ProagroNovo.modoEntSai(ch, 'ent');   // estava no resultado líquido: volta às barras de entradas e saídas
      const i = Number(el.dataset.serie), vis = ch.isDatasetVisible(i);
      ch.setDatasetVisibility(i, !vis); ch.update(); el.classList.toggle('nd-off', vis);
      const card = $('#ch-entsai').closest('.card'); if (card && vis === true) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }));
    // atalhos de período e granularidade comandam os filtros originais
    sec.querySelectorAll('[data-per]').forEach(bt => bt.onclick = () => {
      const p = per.find(x => x.id === bt.dataset.per), de = $('#fx-de'), ate = $('#fx-ate'); if (!p || !de || !ate) return;
      de.value = p.de; ate.value = p.ate; ate.dispatchEvent(new Event('change'));
    });
    sec.querySelectorAll('[data-gran]').forEach(bt => bt.onclick = () => { const s = $('#fx-gran'); if (!s) return; s.value = bt.dataset.gran; s.dispatchEvent(new Event('change')); });
  }

  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { fluxo: () => { if (novo()) fluxo(); } });
})();
