/* ============================================================
   CASCA DO VISUAL NOVO: paleta de comando (Ctrl+K) e carregamento
   com esqueleto. Só aparecem com o visual "Novo" ligado (tema.js).
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const SVG_BUSCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  // ---------- esqueleto enquanto a página carrega ----------
  const ESQUELETO = '<div class="nd-skel" aria-hidden="true">' +
    '<div class="nd-skel-linha" style="width:34%;height:30px"></div>' +
    '<div class="nd-skel-grade">' + '<div class="nd-skel-bloco"></div>'.repeat(4) + '</div>' +
    '<div class="nd-skel-grade dois"><div class="nd-skel-bloco alto"></div><div class="nd-skel-bloco alto"></div></div>' +
    '<div class="nd-skel-bloco alto"></div></div>';
  window.addEventListener('load', () => {
    if (typeof window.route !== 'function') return;
    const original = window.route;
    // route() do app.js põe "Carregando…" e dispara a página (assíncrona). Troca o aviso pelo esqueleto; a página substitui quando chega.
    window.route = function () {
      const r = original.apply(this, arguments);
      if (novo()) { const c = document.getElementById('content'); if (c && c.innerText.trim() === 'Carregando…') c.innerHTML = ESQUELETO; }
      return r;
    };
  });

  // ---------- paleta de comando ----------
  let aberta = false, idx = 0, itens = [];
  function montar() {
    const topo = document.querySelector('.topbar');
    if (topo && !topo.querySelector('.nd-cmdk-btn')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nd-cmdk-btn'; b.title = 'Buscar ou ir para uma página (Ctrl+K)';
      b.innerHTML = SVG_BUSCA + '<span>Buscar ou ir para…</span><kbd>Ctrl K</kbd>'; b.onclick = abrir;
      topo.insertBefore(b, topo.querySelector('.topbar-right'));
    }
    if (document.getElementById('nd-cmdk')) return;
    const d = document.createElement('div'); d.id = 'nd-cmdk'; d.className = 'nd-cmdk'; d.hidden = true;
    d.innerHTML = '<div class="nd-cmdk-fundo" data-fechar></div>' +
      '<div class="nd-cmdk-caixa" role="dialog" aria-label="Paleta de comando">' +
      '<div class="nd-cmdk-busca">' + SVG_BUSCA + '<input type="text" id="nd-cmdk-input" placeholder="Digite o nome de uma página ou ação…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>' +
      '<ul class="nd-cmdk-lista" id="nd-cmdk-lista" role="listbox"></ul>' +
      '<div class="nd-cmdk-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div></div>';
    document.body.appendChild(d);
    d.querySelector('[data-fechar]').onclick = fechar;
    const inp = d.querySelector('#nd-cmdk-input');
    inp.oninput = () => { idx = 0; render(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(itens.length - 1, idx + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (itens[idx]) executar(itens[idx]); }
      else if (e.key === 'Escape') fechar();
    };
  }
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const clicar = id => { const b = document.getElementById(id); if (b) b.click(); };
  function fontes() {
    const paginas = [...document.querySelectorAll('.nav a[data-hash]')].map(a => ({ tipo: 'Página', nome: a.textContent.trim(), icone: (a.querySelector('svg') || {}).outerHTML || '', acao: () => { location.hash = a.dataset.hash; } }));
    const acoes = [
      { tipo: 'Ação', nome: 'Solicitar viagem (Viáticos)', icone: '✈', acao: () => { location.hash = 'viaticos'; setTimeout(() => clicar('btn-solicitar-viagem'), 700); } },
      { tipo: 'Ação', nome: 'Nova conta a pagar', icone: '＋', acao: () => { location.hash = 'pagar'; setTimeout(() => clicar('btn-new'), 700); } },
      { tipo: 'Aparência', nome: ProagroTema.tema === 'escuro' ? 'Tema claro' : 'Tema escuro', icone: ProagroTema.tema === 'escuro' ? '☀' : '☾', acao: () => ProagroTema.alternarTema() },
      { tipo: 'Aparência', nome: 'Voltar ao visual clássico', icone: '↶', acao: () => ProagroTema.setUi('classico') },
      { tipo: 'Sessão', nome: 'Sair do sistema', icone: '⎋', acao: () => clicar(document.getElementById('btn-logout-top') ? 'btn-logout-top' : 'btn-logout') }
    ];
    return paginas.concat(acoes);
  }
  function render() {
    const q = normal(document.getElementById('nd-cmdk-input').value.trim());
    const todos = fontes();
    itens = q ? todos.map(it => { const n = normal(it.nome), i = n.indexOf(q); let pts = -1; if (i === 0) pts = 3; else if (i > 0) pts = 2; else if (q.split('').every(ch => n.includes(ch))) pts = 1; return { it, pts }; })
      .filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts).map(x => x.it) : todos;
    const ul = document.getElementById('nd-cmdk-lista');
    ul.innerHTML = itens.length ? itens.map((it, i) => '<li role="option" aria-selected="' + (i === idx) + '" data-i="' + i + '"><span class="nd-cmdk-ic">' + it.icone + '</span><span class="nd-cmdk-nome">' + it.nome + '</span><span class="nd-cmdk-tipo">' + it.tipo + '</span></li>').join('') : '<li class="nd-cmdk-nada">Nada encontrado.</li>';
    ul.querySelectorAll('[data-i]').forEach(li => {
      li.onmouseenter = () => { idx = Number(li.dataset.i); ul.querySelectorAll('[data-i]').forEach(x => x.setAttribute('aria-selected', String(x === li))); };
      li.onclick = () => executar(itens[Number(li.dataset.i)]);
    });
    const sel = ul.querySelector('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function executar(it) { fechar(); it.acao(); }
  function abrir() { if (!novo()) return; montar(); const d = document.getElementById('nd-cmdk'); d.hidden = false; aberta = true; idx = 0; const inp = d.querySelector('#nd-cmdk-input'); inp.value = ''; render(); setTimeout(() => inp.focus(), 30); }
  function fechar() { const d = document.getElementById('nd-cmdk'); if (d) d.hidden = true; aberta = false; }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { if (!novo()) return; e.preventDefault(); if (aberta) fechar(); else abrir(); }
    else if (e.key === 'Escape' && aberta) fechar();
  });
  // ---------- menu lateral em trilho: marca, fixador e busca ----------
  const K_PIN = 'proagro_rail_pin';
  const SVG_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>';
  function montarRail() {
    const app = document.getElementById('view-app'), side = document.querySelector('.sidebar'); if (!app || !side) return;
    const brand = side.querySelector('.brand');
    if (brand && !brand.querySelector('.nd-mark')) {
      const m = document.createElement('span'); m.className = 'nd-mark'; m.textContent = 'P'; m.setAttribute('aria-hidden', 'true'); brand.insertBefore(m, brand.firstChild);
      const p = document.createElement('button'); p.type = 'button'; p.className = 'nd-pin-btn'; p.title = 'Fixar o menu aberto'; p.setAttribute('aria-label', 'Fixar o menu aberto'); p.innerHTML = SVG_PIN;
      p.onclick = () => { const on = app.classList.toggle('nd-pin'); try { localStorage.setItem(K_PIN, on ? '1' : '0'); } catch (e) { /* sem armazenamento */ } p.title = on ? 'Soltar o menu' : 'Fixar o menu aberto'; };
      brand.appendChild(p);
    }
    if (!side.querySelector('.nd-rail-busca')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nd-rail-busca'; b.title = 'Buscar ou ir para… (Ctrl+K)';
      b.innerHTML = SVG_BUSCA + '<span>Buscar…</span><kbd>Ctrl K</kbd>'; b.onclick = abrir;
      const nav = side.querySelector('.nav'); side.insertBefore(b, nav);
    }
    let pin = false; try { pin = localStorage.getItem(K_PIN) === '1'; } catch (e) { /* ok */ }
    app.classList.toggle('nd-pin', pin);
  }
  const iniciar = () => { montarRail(); if (document.querySelector('.topbar')) montar(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.addEventListener('load', iniciar);
  window.ProagroCmdk = { abrir, fechar };
})();
