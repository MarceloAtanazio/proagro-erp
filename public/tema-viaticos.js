/* ============================================================
   VIÁTICOS — VISUAL NOVO (experimento). Por cima da tela original:
   · indicadores do topo repaginados (carteira em destaque + cartões que
     filtram a lista ao clicar) — os originais ficam ocultos no DOM;
   · abas "Lista | Painel": o Painel é o espelho do "Exportar > Fechamento
     do período" na tela, usando os MESMOS números (buildViaticosFechamento)
     e os mesmos filtros (busca, status, período): indicadores, prestação de
     contas por situação, gastos por categoria, quando se gastou, ranking por
     colaborador, quadro colaborador × categoria e maiores lançamentos, com
     botões para gerar o Fechamento em PDF/Excel.
   Dados: window.ProagroVia (publicado por renderViaticos em app.js).
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'; return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  const pct = (v, d) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 0 : d }) + '%';
  const num = v => Number(v) || 0;
  const CORES = ['#00783F', '#3DAE43', '#1F4E78', '#6FBF87', '#4A78A8', '#C9922A', '#8898A0', '#A9CDB8', '#B23A2F', '#0B3B24'];
  const STATUS_COR = { em_approvals: 'warn', transferencia_agendada: 'pend', liberado: '', em_viagem: 'pend', aguardando_comprovacao: 'warn', comprovado: 'ok', devolvido: 'ok', divergente: 'late', arquivado: '', cancelada: '' };
  let graficos = [], token = 0, timer = null;

  const abaAtual = () => { try { return sessionStorage.getItem('via-aba') === 'painel' ? 'painel' : 'lista'; } catch (e) { return 'lista'; } };
  const guardaAba = a => { try { sessionStorage.setItem('via-aba', a); } catch (e) { /* sem sessionStorage */ } };

  // ---------- filtros que os cliques do painel/indicadores comandam ----------
  function filtra(o) {
    if (o.status !== undefined && $('#f-status')) $('#f-status').value = o.status;
    if (o.q !== undefined && $('#q')) $('#q').value = o.q;
    ['#f-status', '#q'].forEach(s => { const el = $(s); if (el) el.dispatchEvent(new Event('input', { bubbles: true })); });
    if (o.lista) aba('lista');
    const alvo = $('.table-wrap'); if (o.lista && alvo) setTimeout(() => alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ---------- indicadores do topo ----------
  const ICONE = { carteira: '▣', mes: '⇄', km: '⛽', comp: '⏱', venc: '⚠', div: '≠', filtro: '◎' };
  function indicadores(V) {
    const c = $('#content'), orig = c && $('.grid.kpis', c); if (!orig || $('.nd-via-kpis', c)) return;
    orig.classList.add('nd-via-orig');
    const d = V.dash, tot = d.transferido || 0, saldo = d.saldoCarteira || 0, rest = tot > 0 ? Math.max(0, Math.min(1, saldo / tot)) : 0;
    const card = (cls, ic, rotulo, valor, detalhe, atr, moeda) => `
      <article class="nd-kpi nd-via-k ${cls}" ${atr || ''}>
        <div class="nd-kpi-top"><span class="nd-via-ic">${ic}</span><span class="nd-kpi-label">${rotulo}</span></div>
        <div class="nd-kpi-valor" ${typeof valor === 'number' ? `data-conta="${valor}" data-fmt="${moeda ? 'brl' : 'int'}"` : ''}>${typeof valor === 'number' ? '0' : valor}</div>
        <div class="nd-via-det">${detalhe}</div>
      </article>`;
    const sec = document.createElement('section'); sec.className = 'nd-via-kpis';
    const hero = V.escopoProprio ? '' : `
      <article class="nd-card nd-via-hero ${saldo < 0 ? 'neg' : ''}">
        <div class="nd-kpi-top"><span class="nd-kpi-label">Saldo da carteira Flash</span><span class="nd-chip ${saldo < 0 ? 'late' : 'ok'}">${saldo < 0 ? 'negativa' : 'disponível'}</span></div>
        <div class="nd-saldo-valor ${saldo < 0 ? 'neg' : ''}" data-conta="${saldo}">R$ 0,00</div>
        <div class="nd-via-medidor" title="Saldo em relação ao total já transferido"><span style="width:${(rest * 100).toFixed(1)}%"></span></div>
        <div class="nd-via-det">Transferido (total) <b>${brl(tot)}</b>${tot > 0 ? ` · restam ${pct(rest)}` : ''}</div>
      </article>`;
    const km = d.kmPendentes ? card(d.kmPendentes.n ? 'warn' : '', ICONE.km, 'Reembolsos de km', d.kmPendentes.n, d.kmPendentes.n ? `${brl(d.kmPendentes.valor)} · clique para revisar` : 'nada na fila',
      d.kmPendentes.n ? 'role="button" tabindex="0" data-via="km"' : '') : '';
    sec.innerHTML = `${hero}<div class="nd-via-grade">
      ${V.escopoProprio ? '' : card('blue', ICONE.mes, 'Transferido no mês', num(d.transferidoMes), 'Contas a Pagar, categoria "Viáticos"', '', true)}
      ${km}
      ${card('warn', ICONE.comp, 'Aguardando comprovação', num(d.aguardandoComprovacao.n), brl(d.aguardandoComprovacao.v) + ' · ver na lista', 'role="button" tabindex="0" data-via="aguardando_comprovacao"')}
      ${card(d.vencidas.n ? 'red' : '', ICONE.venc, 'Vencidas (Flash expirado)', num(d.vencidas.n), brl(d.vencidas.v))}
      ${card(d.divergentes.n ? 'red' : '', ICONE.div, 'Divergentes (estouro)', num(d.divergentes.n), brl(d.divergentes.v) + (d.divergentes.n ? ' · ver na lista' : ''), d.divergentes.n ? 'role="button" tabindex="0" data-via="divergente"' : '')}
      <article class="nd-kpi nd-via-k nd-via-filtro" role="button" tabindex="0" data-via="painel" title="Abrir o Painel do período">
        <div class="nd-kpi-top"><span class="nd-via-ic">${ICONE.filtro}</span><span class="nd-kpi-label">No filtro atual</span></div>
        <div class="nd-kpi-valor" id="nd-via-f-n">0</div><div class="nd-via-det" id="nd-via-f-d">—</div>
      </article></div>`;
    orig.parentNode.insertBefore(sec, orig);
    sec.querySelectorAll('[data-via]').forEach(el => {
      const ir = () => { const k = el.dataset.via; if (k === 'km') { const o = $('#via-km-fila-card') || $('#via-km-fila'); if (o) o.click(); } else if (k === 'painel') aba('painel'); else filtra({ status: k, lista: true }); };
      el.onclick = ir; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } };
    });
    if (window.ProagroNovo && ProagroNovo.contar) ProagroNovo.contar(sec);
  }
  function atualizaFiltro(V) {
    const n = $('#nd-via-f-n'), dd = $('#nd-via-f-d'); if (!n) return;
    const f = V.filtrados, lib = f.reduce((a, s) => a + num(s.valor_liberado), 0), comp = f.reduce((a, s) => a + num(s.valor_comprovado), 0);
    n.textContent = f.length.toLocaleString('pt-BR'); dd.textContent = f.length ? `liberado ${brl(lib)} · comprovado ${brl(comp)}` : 'nenhuma OT no filtro';
  }

  // ---------- abas Lista | Painel ----------
  function abas() {
    const c = $('#content'), tb = c && $('.toolbar', c); if (!tb || $('.nd-via-abas', c)) return;
    const barra = document.createElement('div'); barra.className = 'nd-via-abas';
    barra.innerHTML = `<div class="nd-seg nd-via-seg" role="tablist" aria-label="Visão"><button type="button" role="tab" data-aba="lista">Lista</button><button type="button" role="tab" data-aba="painel">Painel do período</button></div>
      <span class="nd-via-abas-dica" id="nd-via-dica"></span>`;
    tb.parentNode.insertBefore(barra, tb);
    barra.querySelectorAll('[data-aba]').forEach(b => { b.onclick = () => aba(b.dataset.aba); });
    const painel = document.createElement('section'); painel.id = 'nd-via-painel'; painel.className = 'nd-via-painel'; painel.hidden = true;
    const tw = $('.table-wrap', c); tw.parentNode.insertBefore(painel, tw);
    aba(abaAtual(), true);
  }
  function aba(qual, semRender) {
    const c = $('#content'); if (!c) return; guardaAba(qual);
    c.classList.toggle('nd-via-painel-on', qual === 'painel');
    $$('[data-aba]', c).forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === qual)));
    const p = $('#nd-via-painel'); if (p) p.hidden = qual !== 'painel';
    if (qual === 'painel' && !semRender) painelRender(); else if (qual === 'painel') painelRender();
  }

  // ---------- Painel ----------
  const tile = (cls, rotulo, valor, det, extra) => `<article class="nd-kpi nd-pn-k ${cls || ''}"><div class="nd-kpi-top"><span class="nd-kpi-label">${rotulo}</span></div><div class="nd-kpi-valor">${valor}</div>${det ? `<div class="nd-via-det">${det}</div>` : ''}${extra || ''}</article>`;
  function limpaGraficos() { graficos.forEach(g => { try { g.destroy(); } catch (e) { /* já destruído */ } }); graficos = []; }
  function novoGrafico(id, cfg) { const cv = document.getElementById(id); if (!cv || !window.Chart) return null; const g = typeof makeChart === 'function' ? makeChart(cv, cfg) : new Chart(cv, cfg); graficos.push(g); return g; }

  function agrupaPorTempo(itens) {
    const datas = itens.map(i => i.data).filter(Boolean).sort(); if (!datas.length) return null;
    const dia = datas.length && (new Date(datas[datas.length - 1] + 'T12:00:00') - new Date(datas[0] + 'T12:00:00')) / 864e5;
    const modo = dia <= 31 ? 'dia' : dia <= 150 ? 'semana' : 'mes';
    const chave = d => {
      const dt = new Date(d + 'T12:00:00');
      if (modo === 'dia') return d;
      if (modo === 'mes') return d.slice(0, 7);
      const k = new Date(dt); k.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return k.toLocaleDateString('en-CA');   // segunda-feira da semana
    };
    const m = new Map(); itens.forEach(i => { if (!i.data) return; const k = chave(i.data); m.set(k, (m.get(k) || 0) + num(i.valor)); });
    const ks = [...m.keys()].sort(), rot = k => modo === 'mes' ? new Date(k + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '') : brDate(k).slice(0, 5);
    return { modo, labels: ks.map(rot), valores: ks.map(k => Math.round(m.get(k) * 100) / 100), titulo: { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[modo] };
  }

  async function painelRender() {
    const V = window.ProagroVia, p = $('#nd-via-painel'); if (!V || !p || p.hidden) return;
    const meu = ++token;
    if (!V.filtrados.length) { limpaGraficos(); p.innerHTML = `<div class="nd-card nd-pn-vazio"><b>Nenhuma OT no filtro atual</b><span>Ajuste a busca, o status ou o período para ver o painel.</span></div>`; return; }
    if (!p.dataset.pronto) p.innerHTML = `<div class="nd-card nd-pn-carrega"><span class="nd-pn-spin"></span> Montando o painel de ${V.filtrados.length} OT(s)…</div>`; else p.classList.add('nd-pn-atualiza');
    let f; try { f = await V.build(V.filtrados, { rotulo: V.rotulo }); } catch (e) { if (meu === token) p.innerHTML = `<div class="nd-card nd-pn-vazio"><b>Não foi possível montar o painel</b><span>${E(e.message || '')}</span></div>`; return; }
    if (meu !== token || p.hidden) return;
    limpaGraficos(); p.classList.remove('nd-pn-atualiza'); p.dataset.pronto = '1';
    const k = f.kpis, taxa = k.liberado > 0 ? Math.min(1, k.comprovado / k.liberado) : 0, ticket = k.solicitacoes ? k.liberado / k.solicitacoes : 0;
    const aDescontar = k.pendencia, totalCat = f.porCategoria.reduce((a, c) => a + c.total, 0);
    const raio = 38, circ = 2 * Math.PI * raio, corG = taxa >= 0.9 ? 'var(--verde-500)' : taxa >= 0.5 ? 'var(--warn)' : 'var(--danger)';
    const dica = $('#nd-via-dica'); if (dica) dica.textContent = V.rotulo;

    // por situação
    const maxSit = Math.max(1, ...f.porStatus.map(l => Math.max(l.liberado, l.comprovado)));
    const sit = f.porStatus.map(l => `
      <button type="button" class="nd-pn-sit" data-status="${l.status}" title="Ver estas OTs na lista">
        <span class="nd-chip ${STATUS_COR[l.status] || ''}">${E(l.rotulo)}</span><b>${l.qtd}</b>
        <span class="nd-pn-barras"><i class="lib" style="width:${(l.liberado / maxSit * 100).toFixed(1)}%"></i><i class="comp" style="width:${(l.comprovado / maxSit * 100).toFixed(1)}%"></i></span>
        <span class="nd-pn-sit-v"><span><small>lib.</small>${brl(l.liberado)}</span><span><small>comp.</small>${brl(l.comprovado)}</span></span>
      </button>`).join('');

    // categorias (legenda)
    const topCat = f.porCategoria.slice(0, 8), resto = f.porCategoria.slice(8), outros = resto.reduce((a, c) => a + c.total, 0);
    const catLista = topCat.concat(outros > 0 ? [{ categoria: 'Outras (' + resto.length + ')', total: outros, lancamentos: resto.reduce((a, c) => a + c.lancamentos, 0), pct: totalCat ? outros / totalCat : 0 }] : []);
    const leg = catLista.map((c, i) => `<li><span class="nd-pn-cor" style="background:${CORES[i % CORES.length]}"></span><span class="nd-pn-cat">${E(c.categoria)}</span><b>${brl(c.total)}</b><small>${pct(c.pct, 1)}</small></li>`).join('');

    // ranking
    const MAXR = 10, rank = f.porColaborador;
    const linhaRank = (r, i) => { const t = r.liberado > 0 ? Math.min(1, r.comprovado / r.liberado) : 0; return `
      <tr data-nome="${E(r.nome)}" title="Filtrar a lista por ${E(r.nome)}"><td class="nd-pn-pos">${i + 1}</td><td><b>${E(r.nome)}</b></td><td class="num">${r.viagens}</td><td class="num">${brl(r.liberado)}</td><td class="num">${brl(r.comprovado)}</td>
      <td class="num">${r.devolvido ? brl(r.devolvido) : '—'}</td><td class="num ${r.pendencia ? 'neg' : ''}">${r.pendencia ? brl(r.pendencia) : '—'}</td>
      <td class="nd-pn-prog"><span title="Comprovado em relação ao liberado"><i style="width:${(t * 100).toFixed(0)}%"></i></span><small>${pct(t)}</small></td></tr>`; };

    // quadro colaborador x categoria
    const M = f.matriz, cols = M.categorias.slice(0, 8), linhas = M.linhas.slice(0, 12);
    const maxCel = Math.max(1, ...linhas.flatMap(l => l.valores.slice(0, cols.length)));
    const celulas = l => cols.map((_, ci) => { const v = l.valores[ci]; return `<td class="num ${v ? '' : 'zero'}" ${v ? `style="--i:${(10 + 62 * v / maxCel).toFixed(0)}%"` : ''}>${v ? compacto(v) : '·'}</td>`; }).join('');
    const quadro = `<div class="nd-pn-rolagem"><table class="nd-pn-mx"><thead><tr><th>Colaborador</th>${cols.map(c => `<th class="num">${E(c)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${E(l.nome)}</b></td>${celulas(l)}<td class="num tot">${brl(l.total)}</td></tr>`).join('')}
      <tr class="soma"><td>Total geral</td>${cols.map((_, ci) => `<td class="num">${compacto(M.totaisPorCategoria[ci])}</td>`).join('')}<td class="num tot">${brl(M.total)}</td></tr></tbody></table></div>
      ${(M.linhas.length > linhas.length || M.categorias.length > cols.length) ? `<p class="nd-pn-nota">Mostrando ${linhas.length} de ${M.linhas.length} colaboradores e ${cols.length} de ${M.categorias.length} categorias; o quadro completo está no Fechamento (PDF/Excel).</p>` : ''}`;

    // maiores lançamentos
    const maiores = [...f.itens].sort((a, b) => num(b.valor) - num(a.valor)).slice(0, 10);
    const tempo = agrupaPorTempo(f.itens);

    p.innerHTML = `
      <div class="nd-pn-cab">
        <div><h2>Painel do período</h2><p>${E(V.rotulo)} · <b>${k.solicitacoes}</b> OT(s) · <b>${k.colaboradores}</b> colaborador(es) · <b>${k.lancamentos}</b> lançamento(s) de despesa</p></div>
        <div class="nd-pn-acoes"><button type="button" class="nd-pn-bt" data-fech="pdf">Fechamento em PDF</button><button type="button" class="nd-pn-bt" data-fech="excel">Fechamento em Excel</button></div>
      </div>
      <div class="nd-pn-kpis">
        ${tile('', 'Solicitado', brl(k.solicitado), 'pedido nas OTs')}
        ${tile('', 'Liberado', brl(k.liberado), 'transferido ao colaborador')}
        ${tile('blue', 'Comprovado', brl(k.comprovado), 'despesas lançadas')}
        <article class="nd-kpi nd-pn-k nd-pn-taxa"><div class="nd-kpi-top"><span class="nd-kpi-label">Taxa de comprovação</span></div>
          <div class="nd-pn-anel"><svg viewBox="0 0 100 100" class="nd-gauge"><circle class="g-fundo" cx="50" cy="50" r="${raio}"/><circle class="g-valor" cx="50" cy="50" r="${raio}" stroke="${corG}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - taxa)}"/></svg><b>${pct(taxa)}</b></div>
          <div class="nd-via-det">comprovado ÷ liberado</div></article>
        ${tile('', 'Devolvido', brl(k.devolvido), 'sobras devolvidas')}
        ${tile(aDescontar ? 'warn' : '', 'A descontar', brl(aDescontar), aDescontar ? 'pendência na próxima OT' : 'sem pendências')}
        ${tile('', 'Ticket médio', brl(ticket), 'liberado por OT')}
      </div>
      <div class="nd-pn-linha">
        <article class="nd-card"><div class="nd-card-cab"><h3>Prestação de contas por situação</h3><span class="nd-chip">${f.porStatus.length} situação(ões)</span></div>
          <div class="nd-pn-legenda"><span><i class="lib"></i>liberado</span><span><i class="comp"></i>comprovado</span></div><div class="nd-pn-sits">${sit}</div></article>
        <article class="nd-card"><div class="nd-card-cab"><h3>Gastos por categoria</h3><span class="nd-chip">${brl(totalCat)}</span></div>
          ${f.porCategoria.length ? `<div class="nd-pn-donut"><div class="nd-pn-donut-cv"><canvas id="nd-pn-cat"></canvas><div class="nd-pn-donut-tx"><small>total</small><b>${compacto(totalCat)}</b></div></div><ul class="nd-pn-leg">${leg}</ul></div>` : '<p class="nd-pn-nota">Nenhuma despesa lançada no filtro.</p>'}</article>
      </div>
      ${tempo ? `<article class="nd-card nd-pn-largo"><div class="nd-card-cab"><h3>Quando se gastou <small>(${tempo.titulo})</small></h3><span class="nd-chip">${tempo.labels.length} ${tempo.modo === 'dia' ? 'dia(s)' : tempo.modo === 'semana' ? 'semana(s)' : 'mês(es)'}</span></div><div class="nd-pn-grafico"><canvas id="nd-pn-tempo"></canvas></div></article>` : ''}
      <article class="nd-card nd-pn-largo"><div class="nd-card-cab"><h3>Ranking por colaborador</h3><span class="nd-chip">${rank.length} colaborador(es)</span></div>
        <div class="nd-pn-rolagem"><table class="nd-pn-tb"><thead><tr><th></th><th>Colaborador</th><th class="num">OTs</th><th class="num">Liberado</th><th class="num">Comprovado</th><th class="num">Devolvido</th><th class="num">A descontar</th><th>Comprovação</th></tr></thead>
        <tbody id="nd-pn-rank">${rank.slice(0, MAXR).map(linhaRank).join('')}</tbody></table></div>
        ${rank.length > MAXR ? `<button type="button" class="nd-pn-mais" id="nd-pn-mais">Ver todos os ${rank.length} colaboradores</button>` : ''}</article>
      ${M.linhas.length ? `<article class="nd-card nd-pn-largo"><div class="nd-card-cab"><h3>Colaborador × categoria</h3><span class="nd-chip">mapa de calor</span></div>${quadro}</article>` : ''}
      ${maiores.length ? `<article class="nd-card nd-pn-largo"><div class="nd-card-cab"><h3>Maiores lançamentos</h3><span class="nd-chip">top ${maiores.length}</span></div>
        <div class="nd-pn-rolagem"><table class="nd-pn-tb"><thead><tr><th>Data</th><th>Colaborador</th><th>OT</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
        ${maiores.map(i => `<tr><td>${i.data ? brDate(i.data) : '—'}</td><td>${E(i.colaborador)}</td><td>${E(i.ot)}</td><td><span class="nd-chip">${E(i.categoria)}</span></td><td class="nd-pn-desc">${E(i.descricao)}</td><td class="num"><b>${brl(i.valor)}</b></td></tr>`).join('')}</tbody></table></div></article>` : ''}`;

    // interações
    p.querySelectorAll('[data-fech]').forEach(b => { b.onclick = () => (b.dataset.fech === 'pdf' ? V.pdf(f) : V.excel(f)); });
    p.querySelectorAll('.nd-pn-sit').forEach(b => { b.onclick = () => filtra({ status: b.dataset.status, lista: true }); });
    const ligaRank = () => p.querySelectorAll('#nd-pn-rank tr').forEach(tr => { tr.onclick = () => filtra({ q: tr.dataset.nome, status: '', lista: true }); });
    ligaRank();
    const mais = $('#nd-pn-mais', p); if (mais) mais.onclick = () => { $('#nd-pn-rank').innerHTML = rank.map(linhaRank).join(''); mais.remove(); ligaRank(); };
    if (f.porCategoria.length) novoGrafico('nd-pn-cat', { type: 'doughnut', data: { labels: catLista.map(c => c.categoria), datasets: [{ data: catLista.map(c => c.total), backgroundColor: catLista.map((_, i) => CORES[i % CORES.length]), borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + brl(c.parsed) + ' (' + pct(c.parsed / (totalCat || 1), 1) + ')' } } } } });
    if (tempo) novoGrafico('nd-pn-tempo', { type: 'bar', data: { labels: tempo.labels, datasets: [{ label: 'Gasto', data: tempo.valores, backgroundColor: '#3DAE43', borderRadius: 8, borderSkipped: false, maxBarThickness: 34 }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + brl(c.parsed.y) } } },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { border: { display: false }, ticks: { maxTicksLimit: 5, callback: v => 'R$ ' + compacto(v) } } } } });
  }

  function aplica() {
    if (!novo()) return; const V = window.ProagroVia, c = $('#content');
    if (!V || !c || !$('.toolbar #btn-export', c)) return;
    c.classList.add('nd-via-page'); indicadores(V); abas(); atualizaFiltro(V);
    clearTimeout(timer); timer = setTimeout(painelRender, 260);
  }
  document.addEventListener('proagro:via', aplica);
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { viaticos: aplica });
})();
