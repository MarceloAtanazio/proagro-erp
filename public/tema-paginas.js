/* ============================================================
   PÁGINAS — VISUAL NOVO (experimento). Kit comum a TODAS as telas:
     · cabeçalho de página no estilo do Dashboard (seção, título grande,
       descrição de uma linha e etiquetas, como "23 fornecedores");
     · reaplica os enfeites quando uma tela se redesenha sozinha
       (ex.: depois de dar baixa ou de trocar de aba do RH), coisa que
       só a troca de página fazia antes.
   O visual dos componentes (abas, cartões, listas, formulários, avisos…)
   vem do tema-paginas.css. Só age com o visual "Novo" ligado.
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const app = () => document.getElementById('view-app');
  const conteudo = () => document.getElementById('content');

  const DESCRICAO = {
    pagar: 'Títulos a pagar, baixas, aprovações e o pacote da tesouraria.',
    receber: 'Títulos a receber, recebimentos e conciliação com o extrato.',
    fluxo: 'Entradas e saídas do caixa, realizadas e projetadas.',
    conciliacao: 'Confronte o extrato bancário com os lançamentos do sistema.',
    orcamento: 'Planeje receitas e despesas do ano, mês a mês.',
    orcadoreal: 'Compare o que foi orçado com o que de fato aconteceu.',
    relatorios: 'Relatórios gerenciais para acompanhar a empresa.',
    viaticos: 'Solicitações de viagem, transferências, comprovações e reembolsos de km.',
    suprimentos: 'Estoque, equipamentos e envios para a equipe.',
    rh: 'Pessoas, admissões, férias, benefícios e vagas.',
    fornecedores: 'Cadastro de fornecedores e condições de pagamento.',
    contratos: 'Contratos vigentes, vencimentos e geração de minutas.',
    usuarios: 'Quem acessa o sistema e o que cada pessoa pode fazer.',
    categorias: 'Categorias e centros de custo que alimentam os lançamentos e os relatórios.',
    config: 'Parâmetros gerais do sistema.'
  };
  // [singular, plural] do que a tabela principal da página lista
  const SUBSTANTIVO = {
    pagar: ['título', 'títulos'], receber: ['título', 'títulos'], viaticos: ['solicitação', 'solicitações'], fornecedores: ['fornecedor', 'fornecedores'],
    contratos: ['contrato', 'contratos'], usuarios: ['usuário', 'usuários'], suprimentos: ['item', 'itens']
  };
  // etiquetas extras por página, lidas da própria tela (ex.: ativos e inativos de Fornecedores)
  const EXTRA = {
    fluxo: () => { const f = window.ProagroFluxo && ProagroFluxo.d; return f ? [{ t: brDate(f.de) + ' – ' + brDate(f.ate), cls: '' }] : []; },
    fornecedores: c => { const ok = c.querySelectorAll('#tbl tbody .badge.ok').length, off = c.querySelectorAll('#tbl tbody .badge.off').length;
      return (ok ? [{ t: ok + (ok === 1 ? ' ativo' : ' ativos'), cls: 'ok' }] : []).concat(off ? [{ t: off + (off === 1 ? ' inativo' : ' inativos'), cls: '' }] : []); }
  };
  const CARREGANDO = c => { const t = c.innerText.trim(); return t === 'Carregando…' || !!c.querySelector('.nd-skel'); };
  let observaTabela = null;

  function contarLinhas(c) {
    const t = c.querySelector('.table-wrap table tbody'); if (!t) return null;
    return [...t.querySelectorAll('tr')].filter(tr => !tr.querySelector('.empty') && !tr.classList.contains('via-fam-filho') && !tr.querySelector('td[colspan]')).length;
  }
  function textoEtiqueta(hash, n) {
    const [s, p] = SUBSTANTIVO[hash] || ['registro', 'registros'];
    return n + ' ' + (n === 1 ? s : p);
  }

  function inserirHero(c, page) {
    const hash = page.hash;
    const secao = (typeof secaoDaPagina === 'function' ? secaoDaPagina(hash) : '') || '';
    const hero = document.createElement('header'); hero.className = 'nd-pagina-hero';
    const n = contarLinhas(c);
    hero.innerHTML = `<div class="nd-pagina-hero-txt">
        ${secao ? `<div class="nd-hero-data">${secao}</div>` : ''}
        <h1 class="nd-hero-titulo">${page.title}</h1>
        ${DESCRICAO[hash] ? `<p class="nd-hero-sub">${DESCRICAO[hash]}</p>` : ''}
      </div>
      <div class="nd-hero-chips"></div>`;
    const chipsEl = hero.querySelector('.nd-hero-chips');
    const montarChips = () => { const m = contarLinhas(c); let h = m != null ? '<span class="nd-chip">' + textoEtiqueta(hash, m) + '</span>' : ''; if (EXTRA[hash]) EXTRA[hash](c).forEach(x => { h += '<span class="nd-chip ' + x.cls + '">' + x.t + '</span>'; }); chipsEl.innerHTML = h; };
    montarChips();
    c.insertBefore(hero, c.firstChild);
    // a etiqueta acompanha a tabela quando ela é redesenhada (filtros, busca)
    if (observaTabela) { observaTabela.disconnect(); observaTabela = null; }
    const tabela = c.querySelector('.table-wrap table');
    if (tabela && n != null) {
      observaTabela = new MutationObserver(montarChips);
      observaTabela.observe(tabela, { childList: true });
    }
  }

  function aplicar(hash) {
    const a = app(), c = conteudo(); if (!a || !c) return;
    if (!novo()) { a.classList.remove('nd-tem-hero'); return; }
    if (hash !== 'fluxo') c.classList.remove('nd-fx-page');   // marca do Fluxo não vaza para outras telas
    if (CARREGANDO(c)) return;
    // já enfeitada (o Dashboard tem o cabeçalho próprio, de tema-dashboard.js)
    if (c.querySelector('.nd-hero, .nd-pagina-hero')) { a.classList.add('nd-tem-hero'); return; }
    const page = (typeof PAGES !== 'undefined') ? PAGES.find(p => p.hash === hash) : null;
    if (!page || hash === 'dashboard') return;
    if ((hash === 'pagar' || hash === 'receber') && window.ProagroNovo && ProagroNovo.financeiro) ProagroNovo.financeiro(hash);
    if (hash === 'fluxo' && window.ProagroNovo && ProagroNovo.fluxo) ProagroNovo.fluxo();
    inserirHero(c, page);
    a.classList.add('nd-tem-hero');
  }

  // Telas que se redesenham sozinhas (baixa, trocar aba, salvar…) trocam os filhos de #content: enfeita de novo.
  let agendado = null;
  function observarConteudo() {
    const c = conteudo(); if (!c || c.__ndObs) return; c.__ndObs = true;
    new MutationObserver(() => {
      if (agendado) clearTimeout(agendado);
      agendado = setTimeout(() => { agendado = null; aplicar(typeof CURRENT_PAGE !== 'undefined' ? CURRENT_PAGE : (location.hash || '').slice(1)); }, 30);
    }).observe(c, { childList: true });
  }
  const iniciar = () => { observarConteudo(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.addEventListener('load', iniciar);
  window.addEventListener('proagro:tema', () => { const a = app(); if (a && !novo()) a.classList.remove('nd-tem-hero'); });

  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { pagina: aplicar });
})();
