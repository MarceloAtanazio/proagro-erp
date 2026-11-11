/* ============================================================
   LISTAS — VISUAL NOVO (experimento). Contas a Pagar e Contas a Receber
   repaginadas POR CIMA da tela original: a lista, os filtros e todos os
   botões (baixa, estorno, anexos, aprovação, editar, excluir, exportar)
   continuam os de app.js; aqui só se acrescenta (e o CSS reveste):
     · faixa de resumo com os totais e atalhos para filtrar;
     · abas de status com contagem (comandam o filtro original);
     · em cada linha: situação do prazo ("vence em 3 d"), faixa de cor e
       caixa de seleção;
     · barra de totais flutuante, com soma dos selecionados e exportação
       só da seleção.
   Só age com o visual "Novo" ligado; no clássico nada disso existe.
   Recebe os dados de window.ProagroFin = { tipo, rows } (app.js).
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $ = (s, r) => (r || document).querySelector(s);
  const hojeISO = () => (typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10));
  const soma = (arr, f) => Math.round(arr.reduce((t, r) => t + (Number(f(r)) || 0), 0) * 100) / 100;
  const diasAte = iso => Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000);
  const tb = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  let selecionados = new Set();
  let observador = null;

  function limpar() {
    const d = document.getElementById('nd-dock'); if (d) d.remove();
    if (observador) { observador.disconnect(); observador = null; }
    selecionados = new Set();
    const c = document.getElementById('content'); if (c) c.classList.remove('nd-fin');   // a marca não pode vazar para outras telas nem para o clássico
  }
  window.addEventListener('hashchange', limpar);
  window.addEventListener('proagro:tema', limpar);   // trocou o visual: o app redesenha a tela; a pagina() volta a enfeitar só se for o novo

  function financeiro(tipo) {
    limpar();
    const F = window.ProagroFin; if (!F || F.tipo !== tipo || !Array.isArray(F.rows)) return;
    const rows = F.rows, pagar = tipo === 'pagar', hoje = hojeISO();
    const FEITO = pagar ? 'pago' : 'recebido', DATA_FEITO = pagar ? 'payment_date' : 'receipt_date', PARTE = pagar ? 'supplier_name' : 'client_name';
    const content = $('#content'), tbl = $('#tbl'), toolbar = $('.toolbar-spaced'); if (!content || !tbl || !toolbar) return;
    content.classList.add('nd-fin');

    // ---------- números ----------
    const abertos = rows.filter(r => r.status === 'pendente');
    const vencidos = abertos.filter(r => r.due_date < hoje);
    const prox7 = abertos.filter(r => r.due_date >= hoje && diasAte(r.due_date) <= 7);
    const mes = hoje.slice(0, 7);
    const feitosMes = rows.filter(r => r.status === FEITO && String(r[DATA_FEITO] || '').slice(0, 7) === mes);
    const vAb = soma(abertos, r => r.amount), vVenc = soma(vencidos, r => r.amount);
    const card = (cls, rotulo, valor, chip, filtro, extra) => `
      <article class="nd-kpi ${cls}" role="button" tabindex="0" data-filtro="${filtro}">
        <div class="nd-kpi-top"><span class="nd-kpi-label">${rotulo}</span><span class="nd-chip ${chip.cls || ''}">${chip.t}</span></div>
        <div class="nd-kpi-valor" data-conta="${valor}">R$ 0,00</div>${extra || ''}
      </article>`;
    const resumo = document.createElement('section');
    resumo.className = 'nd-resumo';
    resumo.innerHTML =
      card('', pagar ? 'Em aberto a pagar' : 'Em aberto a receber', vAb, { t: tb(abertos.length, 'título', 'títulos') }, 'pendente',
        vAb > 0 ? `<div class="nd-prop" title="Parte vencida do total em aberto"><span style="width:${(vVenc / vAb * 100).toFixed(1)}%"></span></div><div class="nd-prop-leg">${(vVenc / vAb * 100).toFixed(0)}% vencido</div>` : '') +
      card('red', 'Vencidos', vVenc, { t: tb(vencidos.length, 'título', 'títulos'), cls: vencidos.length ? 'late' : 'ok' }, 'vencido') +
      card('blue', 'Próximos 7 dias', soma(prox7, r => r.amount), { t: tb(prox7.length, 'título', 'títulos'), cls: 'pend' }, 'pendente') +
      card('', pagar ? 'Pago no mês' : 'Recebido no mês', soma(feitosMes, r => r.amount), { t: tb(feitosMes.length, 'título', 'títulos'), cls: 'ok' }, FEITO);
    content.insertBefore(resumo, content.firstChild);
    if (typeof ProagroNovo !== 'undefined' && ProagroNovo.contar) ProagroNovo.contar(resumo);

    // ---------- filtro original (select de status) comandado pelas abas ----------
    const selStatus = $('#f-status');
    const aplicarStatus = v => { if (!selStatus) return; selStatus.value = v; selStatus.dispatchEvent(new Event('input')); sincronizarAbas(); };
    resumo.querySelectorAll('[data-filtro]').forEach(el => {
      const ir = () => { aplicarStatus(el.dataset.filtro); const t = $('.nd-tabs'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      el.addEventListener('click', ir); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
    });
    const abas = document.createElement('div'); abas.className = 'nd-tabs'; abas.setAttribute('role', 'tablist');
    const def = [['', 'Todos', rows.length], ['pendente', 'Pendentes', abertos.length], ['vencido', 'Vencidos', vencidos.length], [FEITO, pagar ? 'Pagos' : 'Recebidos', rows.filter(r => r.status === FEITO).length]];
    abas.innerHTML = def.map(([v, t, n]) => `<button type="button" role="tab" data-st="${v}">${t}<b>${n}</b></button>`).join('');
    toolbar.insertBefore(abas, toolbar.firstChild);
    abas.querySelectorAll('[data-st]').forEach(b => b.onclick = () => aplicarStatus(b.dataset.st));
    function sincronizarAbas() { const v = selStatus ? selStatus.value : ''; abas.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.st === v))); }
    sincronizarAbas();

    // ---------- barra flutuante ----------
    const dock = document.createElement('div'); dock.id = 'nd-dock'; dock.className = 'nd-dock'; document.body.appendChild(dock);
    const porId = new Map(rows.map(r => [String(r.id), r]));
    const visiveis = () => [...tbl.querySelectorAll('tbody tr')].map(tr => tr.querySelector('.nd-sel')).filter(Boolean).map(i => porId.get(i.dataset.id)).filter(Boolean);
    function exportarSelecao(formato) {
      const sel = rows.filter(r => selecionados.has(String(r.id)));
      if (!sel.length) return;
      try {
        if (pagar) {
          if (formato === 'excel') { if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando.'); XLSX.writeFile(pagarMontarExcel(sel), `contas_a_pagar_selecao_${hoje}.xlsx`); toast('Excel exportado.'); }
          else exportPagarPDF(sel, 'Seleção manual (' + sel.length + ' título(s))');
        } else {
          exportCSV('contas_a_receber_selecao', ['Vencimento', 'Cliente', 'Descricao', 'Categoria', 'Documento', 'Valor', 'Status', 'Recebimento'],
            sel.map(r => [r.due_date, r.client_name, r.description, r.category, r.document || '', String(r.amount).replace('.', ','), r.status, r.receipt_date || '']));
        }
      } catch (e) { toast(e.message || 'Não foi possível exportar.'); }
    }
    function desenharDock() {
      const vis = visiveis(), tot = soma(vis, r => r.amount);
      const sel = rows.filter(r => selecionados.has(String(r.id))), totSel = soma(sel, r => r.amount);
      dock.classList.toggle('nd-dock-sel', sel.length > 0);
      dock.innerHTML = sel.length
        ? `<div class="nd-dock-info"><strong>${tb(sel.length, 'selecionado', 'selecionados')}</strong><span>${brl(totSel)}</span></div>
           <div class="nd-dock-acoes">${pagar ? '<button data-exp="excel">Excel</button><button data-exp="pdf">PDF</button>' : '<button data-exp="csv">CSV</button>'}<button data-limpar class="nd-dock-sec">Limpar</button></div>`
        : `<div class="nd-dock-info"><strong>${tb(vis.length, 'título', 'títulos')}</strong><span>${brl(tot)}</span></div><div class="nd-dock-dica">marque as linhas para somar e exportar só a seleção</div>`;
      dock.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => exportarSelecao(b.dataset.exp));
      const l = dock.querySelector('[data-limpar]'); if (l) l.onclick = () => { selecionados.clear(); tbl.querySelectorAll('.nd-sel').forEach(i => { i.checked = false; i.closest('tr').classList.remove('nd-marcada'); }); const a = $('#nd-sel-all'); if (a) a.checked = false; desenharDock(); };
    }

    // ---------- linhas ----------
    function melhorar() {
      sincronizarAbas();
      const th = tbl.querySelector('thead th:first-child');
      if (th && !th.querySelector('#nd-sel-all')) {
        th.innerHTML = '<input type="checkbox" id="nd-sel-all" title="Selecionar todos os visíveis" aria-label="Selecionar todos os visíveis">';
        th.querySelector('input').onchange = e => {
          tbl.querySelectorAll('.nd-sel').forEach(i => { i.checked = e.target.checked; if (e.target.checked) selecionados.add(i.dataset.id); else selecionados.delete(i.dataset.id); i.closest('tr').classList.toggle('nd-marcada', e.target.checked); });
          desenharDock();
        };
      }
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const idc = tr.querySelector('.id-cell'); if (!idc || tr.dataset.nd) return; tr.dataset.nd = '1';
        const id = idc.textContent.trim(), r = porId.get(id); if (!r) return;
        const atrasado = r.status === 'pendente' && r.due_date < hoje;
        tr.classList.add(atrasado ? 'nd-atrasada' : r.status === FEITO ? 'nd-feita' : 'nd-aberta');
        idc.innerHTML = `<label class="nd-sel-wrap"><input type="checkbox" class="nd-sel" data-id="${id}" aria-label="Selecionar título ${id}"><small>#${id}</small></label>`;
        const cb = idc.querySelector('input'); cb.checked = selecionados.has(id); tr.classList.toggle('nd-marcada', cb.checked);
        cb.onchange = () => { if (cb.checked) selecionados.add(id); else selecionados.delete(id); tr.classList.toggle('nd-marcada', cb.checked); desenharDock(); };
        const vc = tr.querySelector('.venc-cell');
        if (vc && r.status === 'pendente') {
          const d = diasAte(r.due_date);
          const txt = d < 0 ? `venceu há ${-d} d` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : d <= 30 ? `em ${d} dias` : '';
          if (txt) vc.insertAdjacentHTML('beforeend', `<small class="nd-rel ${d < 0 ? 'late' : d <= 3 ? 'warn' : ''}">${txt}</small>`);
        }
        const nums = tr.querySelectorAll('td.num'); if (nums.length) nums[nums.length - 1].classList.add('nd-valor');
        const parte = tr.children[3]; if (parte) parte.classList.add('nd-parte');
      });
      desenharDock();
    }
    observador = new MutationObserver(melhorar);
    observador.observe(tbl, { childList: true });
    melhorar();
  }

  const pagina = hash => { if (!novo()) return; if (hash === 'pagar' || hash === 'receber') financeiro(hash); };
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { pagina });
})();
