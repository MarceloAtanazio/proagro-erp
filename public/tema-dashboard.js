/* ============================================================
   DASHBOARD — VISUAL NOVO (experimento). Só é usado quando o visual
   "Novo" está ligado (ProagroTema.ui === 'novo'); no clássico, o
   renderDashboard original de app.js continua intacto. Recebe os MESMOS
   dados (d = /api/reports/dashboard, cf = /api/reports/cashflow/ano) e
   usa as mesmas funções de app.js (brl, brDate, esc, makeChart…).
   Elementos: saudação com resumo do dia e atalhos; grade "bento" com o
   saldo de caixa e minigráficos nos indicadores; alertas como feed;
   gráficos em abas com período e CLICÁVEIS (levam à lista); vencimentos
   em linha do tempo; aging em barra segmentada; números que contam.
   ============================================================ */
(function () {
  'use strict';
  const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const cor = () => ({ verde: '#00783F', verdeMed: '#3DAE43', azul: '#1F4E78', vermelho: '#B23A2F', ambar: '#C9922A', cinza: '#9AA8A0' });
  const esc_ = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
  const pct = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1).replace('.', ',') + '%');
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const primeiroNome = () => { const n = (typeof USER !== 'undefined' && USER && USER.name) ? String(USER.name).trim() : ''; return n ? n.split(/\s+/)[0] : ''; };
  const diasAte = iso => Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00') - new Date(new Date().toDateString())) / 86400000);
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return v.toLocaleString('pt-BR'); };
  const ir = hash => { location.hash = hash; };

  // Números que contam do zero até o valor ao entrar na tela (respeita "reduzir movimento").
  function contar(root) {
    const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-conta]').forEach(el => {
      const alvo = Number(el.dataset.conta), fmt = el.dataset.fmt || 'brl';
      const mostra = v => { el.textContent = fmt === 'int' ? Math.round(v).toLocaleString('pt-BR') : brl(v); };
      if (reduz || !isFinite(alvo)) return mostra(alvo);
      const t0 = performance.now(), dur = 900;
      const passo = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); mostra(alvo * e); if (k < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    });
  }

  // Minigráfico: linha sem eixos dentro de um cartão.
  function sparkline(canvas, valores, corLinha, labels) {
    if (!canvas) return;
    makeChart(canvas, {
      type: 'line',
      data: { labels: labels || valores.map((_, i) => i + 1), datasets: [{ data: valores, borderColor: corLinha, borderWidth: 2, pointRadius: 0, fill: true, tension: .4 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 1100 }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { enabled: !!labels, displayColors: false, callbacks: { label: c => ' ' + brl(c.parsed.y) } } },
        scales: { x: { display: false }, y: { display: false } }, layout: { padding: 2 } }
    });
  }

  function dashboard(d, cf) {
    const c = document.getElementById('content');
    const C = cor();
    const anoAtual = new Date().getFullYear(), mesIdx = new Date().getMonth();
    const cur = d.last12[11], prev = d.last12[10];
    const deltaRec = prev.receitas ? ((cur.receitas - prev.receitas) / prev.receitas) * 100 : null;
    const deltaDesp = prev.despesas ? ((cur.despesas - prev.despesas) / prev.despesas) * 100 : null;
    const arr12 = () => Array(12).fill(0);
    const entR = arr12(), entP = arr12(), saiR = arr12(), saiP = arr12();
    cf.entradas.realizado.forEach(r => entR[r.month - 1] = r.total); cf.entradas.projetado.forEach(r => entP[r.month - 1] = r.total);
    cf.saidas.realizado.forEach(r => saiR[r.month - 1] = r.total); cf.saidas.projetado.forEach(r => saiP[r.month - 1] = r.total);
    let acumMes = 0; for (let i = 0; i <= mesIdx; i++) acumMes += (entR[i] + entP[i]) - (saiR[i] + saiP[i]);
    const proj = d.projecaoDiaria || [], projFim = proj.length ? proj[proj.length - 1].saldo : d.saldoAtual;
    const projMin = proj.length ? Math.min(...proj.map(p => p.saldo)) : d.saldoAtual;

    // ---- alertas (mesma lógica do clássico) ----
    const alerts = [];
    if (d.pagarVencido.n > 0) alerts.push({ sev: 'red', hash: 'pagar', t: `${d.pagarVencido.n} conta(s) a pagar vencida(s)`, v: brl(d.pagarVencido.v) });
    if (d.receberVencido.n > 0) alerts.push({ sev: 'red', hash: 'receber', t: `${d.receberVencido.n} conta(s) a receber vencida(s)`, v: brl(d.receberVencido.v) });
    if (d.saldoNegativoEm) alerts.push({ sev: 'red', hash: 'fluxo', t: `Caixa negativo a partir de ${brDate(d.saldoNegativoEm)}`, v: 'sem novas entradas' });
    if (d.naoConciliados > 0) alerts.push({ sev: 'warn', hash: 'conciliacao', t: `${d.naoConciliados} lançamento(s) a conciliar`, v: brl(d.naoConciliadosValor) });
    if (d.orcadoDespesaMes > 0) { const p = ((d.pagoMes - d.orcadoDespesaMes) / d.orcadoDespesaMes) * 100; if (Math.abs(p) >= 5) alerts.push({ sev: p > 0 ? 'warn' : 'info', hash: 'orcadoreal', t: `Despesas ${p > 0 ? 'acima' : 'abaixo'} do orçado`, v: pct(p) }); }
    const totalCatMes = d.categoriaMes.reduce((s, x) => s + x.realizado, 0);
    if (totalCatMes > 0 && d.categoriaMes[0]) { const sh = (d.categoriaMes[0].realizado / totalCatMes) * 100; if (sh >= 35) alerts.push({ sev: 'info', hash: 'relatorios', t: `"${d.categoriaMes[0].category}" concentra as despesas`, v: sh.toFixed(0) + '% do mês' }); }
    if (d.maiorClienteInadimplente) alerts.push({ sev: 'warn', hash: 'receber', t: `Maior inadimplência: ${d.maiorClienteInadimplente.cliente}`, v: brl(d.maiorClienteInadimplente.total) });
    if (d.maiorFornecedorAberto) alerts.push({ sev: 'info', hash: 'pagar', t: `Maior fornecedor em aberto: ${d.maiorFornecedorAberto.fornecedor}`, v: brl(d.maiorFornecedorAberto.total) });
    const nRed = alerts.filter(a => a.sev === 'red').length;

    // ---- aging ----
    const agingK = ['1-30', '31-60', '61-90', '90+'], agingL = ['1–30 d', '31–60 d', '61–90 d', '+90 d'], agingC = ['#C9922A', '#B23A2F', '#8A2A20', '#5C1B14'];
    const agingTot = agingK.reduce((s, k) => s + (Number(d.agingPagar[k]) || 0), 0);

    const kpi = (cls, label, valor, sub, spark, hash, fmt) => `
      <article class="nd-kpi ${cls}" ${hash ? `role="button" tabindex="0" data-ir="${hash}"` : ''}>
        <div class="nd-kpi-top"><span class="nd-kpi-label">${label}</span>${sub ? `<span class="nd-chip ${sub.cls || ''}">${sub.t}</span>` : ''}</div>
        <div class="nd-kpi-valor" data-conta="${valor}" ${fmt ? `data-fmt="${fmt}"` : ''}>${fmt === 'int' ? '0' : 'R$ 0,00'}</div>
        ${spark ? `<div class="nd-spark"><canvas id="${spark}"></canvas></div>` : ''}
      </article>`;

    c.innerHTML = `
    <section class="nd-hero">
      <div>
        <div class="nd-hero-data">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 class="nd-hero-titulo">${saudacao()}${primeiroNome() ? ', ' + esc_(primeiroNome()) : ''} <span class="nd-wave">👋</span></h1>
        <p class="nd-hero-sub">Caixa em <strong>${brl(d.saldoAtual)}</strong>${nRed ? ` · <span class="nd-sub-red">${nRed} alerta${nRed > 1 ? 's' : ''} crítico${nRed > 1 ? 's' : ''}</span>` : ' · nada crítico hoje'} · ${d.pagar7.n} vencimento(s) nos próximos 7 dias</p>
      </div>
      <div class="nd-acoes">
        <button class="nd-acao" data-ir="pagar"><span>＋</span>Conta a pagar</button>
        <button class="nd-acao" data-ir="receber"><span>＋</span>Conta a receber</button>
        <button class="nd-acao" data-ir="viaticos"><span>✈</span>Viáticos</button>
        <button class="nd-acao" data-ir="conciliacao"><span>⇄</span>Conciliar</button>
      </div>
    </section>

    <section class="nd-bento">
      <article class="nd-card nd-saldo" role="button" tabindex="0" data-ir="fluxo">
        <div class="nd-kpi-top"><span class="nd-kpi-label">Saldo de caixa</span><span class="nd-chip ${projFim >= d.saldoAtual ? 'ok' : 'warn'}">30 d → ${compacto(projFim)}</span></div>
        <div class="nd-saldo-valor" data-conta="${d.saldoAtual}">R$ 0,00</div>
        <div class="nd-saldo-meta">
          <span>Acumulado do ano <strong class="${acumMes >= 0 ? 'pos' : 'neg'}">${brl(acumMes)}</strong></span>
          <span>Mínimo projetado <strong class="${projMin >= 0 ? '' : 'neg'}">${brl(projMin)}</strong></span>
        </div>
        <div class="nd-saldo-spark"><canvas id="nd-sp-saldo"></canvas></div>
        <div class="nd-saldo-rodape">
          <span><i style="background:${C.verdeMed}"></i>Entradas 30 d <strong>${brl(d.receber30.v)}</strong></span>
          <span><i style="background:${C.vermelho}"></i>Saídas 30 d <strong>${brl(d.pagar30.v)}</strong></span>
        </div>
      </article>

      ${kpi('', 'Receitas do mês', cur.receitas, deltaRec == null ? null : { t: pct(deltaRec) + ' vs. anterior', cls: deltaRec >= 0 ? 'ok' : 'late' }, 'nd-sp-rec', 'receber')}
      ${kpi('', 'Despesas do mês', cur.despesas, deltaDesp == null ? null : { t: pct(deltaDesp) + ' vs. anterior', cls: deltaDesp <= 0 ? 'ok' : 'late' }, 'nd-sp-desp', 'pagar')}
      ${kpi('red', 'Pagamentos vencidos', d.pagarVencido.v, { t: d.pagarVencido.n + ' título(s)', cls: d.pagarVencido.n ? 'late' : 'ok' }, null, 'pagar')}
      ${kpi('blue', 'A receber no mês', d.receberMesAtual.v, { t: 'recebido ' + compacto(d.receberMesRecebido.v), cls: 'pend' }, null, 'receber')}

      <aside class="nd-card nd-feed">
        <div class="nd-card-cab"><h3>Alertas</h3><span class="nd-contador ${nRed ? 'late' : 'ok'}">${alerts.length}</span></div>
        ${alerts.length ? `<ul class="nd-feed-lista">${alerts.map(a => `<li class="nd-feed-item" data-ir="${a.hash}" role="button" tabindex="0"><i class="nd-ponto ${a.sev}"></i><div><div class="nd-feed-t">${esc_(a.t)}</div><div class="nd-feed-v">${esc_(a.v)}</div></div><span class="nd-feed-seta">›</span></li>`).join('')}</ul>`
          : '<div class="nd-vazio">✅ Nenhum alerta — contas em dia e conciliação em ordem.</div>'}
      </aside>
    </section>

    <section class="nd-linha">
      <article class="nd-card nd-graficos">
        <div class="nd-card-cab">
          <div class="nd-abas" role="tablist">
            <button role="tab" aria-selected="true" data-aba="recdesp">Receitas × Despesas</button>
            <button role="tab" data-aba="cat">Categorias</button>
            <button role="tab" data-aba="cc">Centros de custo</button>
            <button role="tab" data-aba="orc">Orçado × Realizado</button>
          </div>
          <div class="nd-seg" id="nd-periodo"><button data-p="6">6 m</button><button data-p="12" aria-pressed="true">12 m</button></div>
        </div>
        <div class="nd-grafico-area"><canvas id="nd-ch"></canvas></div>
        <p class="nd-dica" id="nd-dica">Clique em uma barra para abrir a lista daquele mês.</p>
      </article>

      <article class="nd-card nd-aging" role="button" tabindex="0" data-ir="pagar">
        <div class="nd-card-cab"><h3>Contas vencidas por faixa</h3><span class="nd-kpi-label">${brl(agingTot)}</span></div>
        ${agingTot > 0 ? `<div class="nd-barra-seg">${agingK.map((k, i) => { const v = Number(d.agingPagar[k]) || 0; return v ? `<span style="width:${(v / agingTot * 100).toFixed(1)}%; background:${agingC[i]}" title="${agingL[i]}: ${brl(v)}"></span>` : ''; }).join('')}</div>
        <ul class="nd-legenda">${agingK.map((k, i) => `<li><i style="background:${agingC[i]}"></i>${agingL[i]}<strong>${brl(Number(d.agingPagar[k]) || 0)}</strong></li>`).join('')}</ul>`
          : '<div class="nd-vazio">Nenhuma conta vencida. 🎉</div>'}
        <div class="nd-mini-grid">
          <div><small>Hoje</small><strong>${compacto(d.pagarHoje.v)}</strong><span>${d.pagarHoje.n} tít.</span></div>
          <div><small>7 dias</small><strong>${compacto(d.pagar7.v)}</strong><span>${d.pagar7.n} tít.</span></div>
          <div><small>15 dias</small><strong>${compacto(d.pagar15.v)}</strong><span>${d.pagar15.n} tít.</span></div>
          <div><small>30 dias</small><strong>${compacto(d.pagar30.v)}</strong><span>${d.pagar30.n} tít.</span></div>
        </div>
      </article>
    </section>

    <section class="nd-linha nd-linha-3">
      <article class="nd-card">
        <div class="nd-card-cab"><h3>Próximos vencimentos</h3><button class="nd-link" data-ir="pagar">ver todos ›</button></div>
        ${d.vencendoPagar.length ? `<ul class="nd-timeline">${d.vencendoPagar.slice(0, 7).map(v => { const dias = diasAte(v.due_date); return `<li data-ir="pagar" role="button" tabindex="0">
            <span class="nd-tl-dia ${dias <= 0 ? 'late' : dias <= 3 ? 'warn' : ''}"><b>${String(new Date(String(v.due_date).slice(0, 10) + 'T12:00:00').getDate()).padStart(2, '0')}</b><small>${MESES_CURTO[new Date(String(v.due_date).slice(0, 10) + 'T12:00:00').getMonth()]}</small></span>
            <div class="nd-tl-txt"><div>${esc_(v.party || v.description || '—')}</div><small>${esc_(v.category || '')}${dias === 0 ? ' · vence hoje' : dias === 1 ? ' · amanhã' : dias > 1 ? ` · em ${dias} dias` : ' · atrasado'}</small></div>
            <strong>${brl(v.amount)}</strong></li>`; }).join('')}</ul>` : '<div class="nd-vazio">Nenhum vencimento nos próximos 30 dias.</div>'}
      </article>

      <article class="nd-card">
        <div class="nd-card-cab"><h3>Maiores em aberto</h3><button class="nd-link" data-ir="pagar">contas a pagar ›</button></div>
        ${d.maioresPagarAbertos.length ? (() => { const mx = Math.max(...d.maioresPagarAbertos.map(x => x.amount)); return `<ul class="nd-ranking">${d.maioresPagarAbertos.slice(0, 6).map(v => `<li>
            <div class="nd-rk-cab"><span>${esc_(v.fornecedor || '—')}</span><strong>${brl(v.amount)}</strong></div>
            <div class="nd-rk-barra"><span style="width:${(v.amount / mx * 100).toFixed(1)}%"></span></div>
            <small>${esc_(v.description)} · vence ${brDate(v.due_date)}</small></li>`).join('')}</ul>`; })() : '<div class="nd-vazio">Nenhum título em aberto.</div>'}
      </article>

      <article class="nd-card">
        <div class="nd-card-cab"><h3>Orçado × Realizado — ${MESES_CURTO[mesIdx]}/${anoAtual}</h3><button class="nd-link" data-ir="orcadoreal">detalhes ›</button></div>
        ${d.categoriaMes.length ? `<ul class="nd-orc">${d.categoriaMes.slice(0, 6).map(x => { const p = x.orcado > 0 ? Math.min(140, x.realizado / x.orcado * 100) : (x.realizado > 0 ? 140 : 0); const estourou = x.orcado > 0 && x.realizado > x.orcado; return `<li>
            <div class="nd-rk-cab"><span>${esc_(x.category)}</span><strong class="${estourou ? 'neg' : ''}">${compacto(x.realizado)} <small>/ ${compacto(x.orcado)}</small></strong></div>
            <div class="nd-orc-barra"><span class="${estourou ? 'estouro' : ''}" style="width:${Math.min(100, p).toFixed(1)}%"></span>${estourou ? `<em style="width:${Math.min(40, p - 100).toFixed(1)}%"></em>` : ''}</div></li>`; }).join('')}</ul>` : '<div class="nd-vazio">Sem categorias orçadas no mês.</div>'}
      </article>
    </section>`;

    // ---- interações ----
    c.querySelectorAll('[data-ir]').forEach(el => {
      el.addEventListener('click', e => { if (e.target.closest('[data-aba], [data-p]')) return; ir(el.dataset.ir); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(el.dataset.ir); } });
    });
    contar(c);

    // ---- minigráficos ----
    sparkline(document.getElementById('nd-sp-saldo'), proj.map(p => p.saldo), C.verde, proj.map(p => brDate(p.date)));
    sparkline(document.getElementById('nd-sp-rec'), d.last12.map(m => m.receitas), C.azul);
    sparkline(document.getElementById('nd-sp-desp'), d.last12.map(m => m.despesas), C.vermelho);

    // ---- gráfico principal com abas e período ----
    let aba = 'recdesp', periodo = 12, grafico = null;
    const CAT = ['#00783F', '#3DAE43', '#1F4E78', '#6FBF87', '#4A78A8', '#A9CDB8', '#C9922A', '#8898A0', '#0B3B24', '#D3DFD8'];
    const eixoMil = { ticks: { callback: v => compacto(v) }, grid: { color: '#EDF1EE' } };
    const desenhar = () => {
      if (grafico) { grafico.destroy(); if (typeof charts !== 'undefined') { const i = charts.indexOf(grafico); if (i >= 0) charts.splice(i, 1); } grafico = null; }
      const cv = document.getElementById('nd-ch'); if (!cv) return;
      const dica = document.getElementById('nd-dica');
      document.getElementById('nd-periodo').style.visibility = aba === 'recdesp' ? 'visible' : 'hidden';
      let cfg;
      if (aba === 'recdesp') {
        const serie = d.last12.slice(12 - periodo);
        cfg = { type: 'bar', data: { labels: serie.map(m => m.label), datasets: [
          { label: 'Receitas', data: serie.map(m => m.receitas), backgroundColor: C.verdeMed },
          { label: 'Despesas', data: serie.map(m => m.despesas), backgroundColor: C.vermelho }] },
          options: { plugins: { tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + brl(x.parsed.y) } } }, scales: { y: eixoMil, x: { grid: { display: false } } },
            onClick: (e, els) => { if (els.length) ir(els[0].datasetIndex === 0 ? 'receber' : 'pagar'); } } };
        dica.textContent = 'Clique em uma barra para abrir a lista correspondente.';
      } else if (aba === 'cat') {
        const top = d.despesasPorCategoria.slice(0, 8);
        cfg = { type: 'bar', data: { labels: top.map(x => x.category), datasets: [{ label: 'Total pago', data: top.map(x => x.total), backgroundColor: CAT }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + brl(x.parsed.x) } } }, scales: { x: eixoMil, y: { grid: { display: false } } },
            onClick: (e, els) => { if (els.length) ir('relatorios'); } } };
        dica.textContent = 'Despesas pagas por categoria nos últimos 12 meses. Clique para ir aos relatórios.';
      } else if (aba === 'cc') {
        const top = d.centrosCusto.slice(0, 8);
        cfg = { type: 'doughnut', data: { labels: top.map(x => x.centro), datasets: [{ data: top.map(x => x.total), backgroundColor: CAT, borderColor: getComputedStyle(document.body).getPropertyValue('--card').trim() || '#fff' }] },
          options: { plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: x => ' ' + x.label + ': ' + brl(x.parsed) + (d.centrosCustoTotal ? ' (' + (x.parsed / d.centrosCustoTotal * 100).toFixed(1).replace('.', ',') + '%)' : '') } } },
            onClick: (e, els) => { if (els.length) ir('relatorios'); } } };
        dica.textContent = 'Distribuição do que foi pago por centro de custo nos últimos 12 meses.';
      } else {
        cfg = { type: 'bar', data: { labels: d.categoriaMes.map(x => x.category), datasets: [
          { label: 'Orçado', data: d.categoriaMes.map(x => x.orcado), backgroundColor: C.azul },
          { label: 'Realizado', data: d.categoriaMes.map(x => x.realizado), backgroundColor: C.verdeMed }] },
          options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + brl(x.parsed.x) } } }, scales: { x: eixoMil, y: { grid: { display: false } } },
            onClick: (e, els) => { if (els.length) ir('orcadoreal'); } } };
        dica.textContent = 'Mês atual. Clique para abrir Orçado × Realizado.';
      }
      cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; } }, cfg.options);
      grafico = makeChart(cv, cfg);
    };
    c.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; c.querySelectorAll('[data-aba]').forEach(x => x.setAttribute('aria-selected', String(x === b))); desenhar(); });
    c.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { periodo = Number(b.dataset.p); c.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); desenhar(); });
    desenhar();
    return Promise.resolve();
  }

  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { dashboard, contar });
})();
