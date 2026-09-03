/* ============================================================
   ProAgro ERP — Módulo Financeiro (frontend SPA)
   ============================================================ */
'use strict';

// ------------------ Constantes ------------------
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Populadas via /api/settings ao entrar no app (ver loadSettings()).
// Mantidas como const para que todas as telas compartilhem a mesma
// referência de array — o conteúdo é atualizado por push/splice, nunca reatribuído.
const CAT_DESPESA = [];
const CAT_RECEITA = [];
const CAT_FORNECEDOR = [];
const CENTROS = [];
const CORES = { verde: '#00783F', verdeMed: '#3DAE43', azul: '#1F4E78', cinza: '#9AA8A0', vermelho: '#B23A2F', ambar: '#C9922A' };

let USER = null;
let charts = [];
let READONLY = false;      // página atual é somente-leitura para este usuário?
let CURRENT_PAGE = 'dashboard';
let FORCE_MODAL = false;   // trava o modal (troca de senha obrigatória)

// Páginas com acesso configurável (espelha PERM_PAGES do backend)
const PERM_PAGES = ['dashboard','pagar','receber','fluxo','conciliacao','fornecedores','orcamento','orcadoreal','relatorios','viaticos','suprimentos','contratos'];
const PAGE_LABELS = {
  dashboard:'Dashboard', pagar:'Contas a Pagar', receber:'Contas a Receber', fluxo:'Fluxo de Caixa',
  conciliacao:'Conciliação Bancária', fornecedores:'Fornecedores', orcamento:'Orçamento Anual',
  orcadoreal:'Orçado x Realizado', relatorios:'Relatórios Gerenciais', viaticos:'Viáticos', suprimentos:'Suprimentos',
  contratos:'Contratos'
};

function permLevel(page) {
  if (!USER) return 'none';
  if (USER.role === 'admin') return 'edit';
  const p = (USER.permissions || {})[page];
  return (p === 'edit' || p === 'view') ? p : 'none';
}
const canViewPage = page => { const l = permLevel(page); return l === 'view' || l === 'edit'; };
const canEditPage = page => permLevel(page) === 'edit';

// Busca categorias/centros de custo configurados e popula os arrays globais
// usados em todos os formulários (Contas a Pagar/Receber, Fornecedores, Orçamento).
const COMPANY_INFO = {};

async function loadSettings() {
  try {
    const s = await api('/api/settings');
    CAT_DESPESA.length = 0; CAT_DESPESA.push(...s.categories.despesa);
    CAT_RECEITA.length = 0; CAT_RECEITA.push(...s.categories.receita);
    CAT_FORNECEDOR.length = 0; CAT_FORNECEDOR.push(...s.categories.fornecedor);
    CENTROS.length = 0; CENTROS.push(...s.costCenters);
  } catch { /* segue com o que já estava carregado */ }
  try {
    const comp = await api('/api/company');
    Object.assign(COMPANY_INFO, comp);
  } catch { /* segue com os dados padrão do relatório */ }
}

// Gerador de senha forte (16 chars: maiúscula, minúscula, número e símbolo,
// sem caracteres ambíguos como 0/O/1/l). Usa crypto para a escolha.
function gerarSenhaForte(len = 16) {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnopqrstuvwxyz', D = '23456789', S = '!@#$%&*?-_+=';
  const all = U + L + D + S;
  const r = new Uint32Array(len); crypto.getRandomValues(r);
  const pick = (set, i) => set[r[i] % set.length];
  const out = [pick(U, 0), pick(L, 1), pick(D, 2), pick(S, 3)];
  for (let i = 4; i < len; i++) out.push(pick(all, i));
  for (let i = out.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

// ------------------ Utilitários ------------------
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Aceita 'YYYY-MM-DD' e também o formato que o pg devolve para colunas DATE
// depois de virar JSON ('2027-05-05T03:00:00.000Z') — sem o slice, o dia saía
// como "05T03:00:00.000Z".
const brDate = iso => { if (!iso) return '—'; const [y,m,d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
// Data de hoje pelo relógio local do usuário. toISOString() converte para UTC
// e, no Brasil (UTC-3), devolveria o DIA SEGUINTE depois das 21h — fazendo os
// formulários abrirem com a data errada à noite. 'en-CA' formata YYYY-MM-DD.
const todayISO = () => new Date().toLocaleDateString('en-CA');

// Mantém os filtros de uma tela (busca, status, categoria, período) entre
// navegações, até que o usuário clique em "Limpar filtros".
function loadFilters(key) {
  try { return JSON.parse(sessionStorage.getItem(key)) || {}; } catch { return {}; }
}
function saveFilters(key, obj) {
  try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch { /* ignora se sessionStorage indisponível */ }
}
const num = v => { const n = Number(String(v).replace(/\./g,'').replace(',','.')); return isFinite(n) ? n : 0; };

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  // Guarda de UX: bloqueia escrita quando a página atual é somente-leitura.
  // (A trava real está no backend; isto só evita cliques inúteis e dá mensagem clara.)
  //
  // O autosserviço é a exceção: READONLY em Viáticos significa "não pode mexer
  // nas solicitações dos outros", e não "não pode pedir a própria viagem". O
  // colaborador de campo tem justamente esse perfil — lê a lista e envia a
  // solicitação dele. O backend valida do mesmo jeito e só aceita a solicitação
  // vinculada ao colaborador do próprio usuário logado.
  const ehAutosservico = path.includes('/autosservico');
  if (method !== 'GET' && USER && USER.role !== 'admin' && READONLY && !ehAutosservico
      && !path.includes('/auth/') && !path.startsWith('/api/users')) {
    toast('Você tem acesso somente leitura nesta seção.');
    throw new Error('Acesso somente leitura nesta seção.');
  }
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.includes('/auth/')) { showLogin(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error(data.error || 'Erro inesperado');
  return data;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }
function makeChart(canvas, cfg) { const c = new Chart(canvas, cfg); charts.push(c); return c; }

// ------------------ Modal ------------------
function openModal(title, bodyHTML, buttons, opts) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  document.querySelector('.modal').classList.toggle('modal-wide', !!(opts && opts.wide));
  document.querySelector('.modal').classList.toggle('modal-xwide', !!(opts && opts.xwide));
  const foot = $('#modal-footer'); foot.innerHTML = '';
  (buttons || []).forEach(b => {
    const btn = el('button', 'btn ' + (b.cls || ''), b.label);
    btn.onclick = b.onClick;
    foot.appendChild(btn);
  });
  $('#modal-back').classList.add('open');
}
function closeModal() {
  if (FORCE_MODAL) return;
  $('#modal-back').classList.remove('open');
  $('#modal-close').style.display = '';
}
$('#modal-close').onclick = closeModal;
$('#modal-back').addEventListener('click', e => { if (e.target.id === 'modal-back') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function modalError(msg) {
  let m = $('#modal-body .form-msg');
  if (!m) { m = el('div', 'form-msg'); $('#modal-body').prepend(m); }
  m.className = 'form-msg err'; m.textContent = msg;
}

const fld = (id, label, type = 'text', value = '', attrs = '') =>
  `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></div>`;
const fldSel = (id, label, options, selected) =>
  `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(o =>
    `<option value="${esc(o.v)}" ${String(o.v) === String(selected) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select></div>`;

// ------------------ Autenticação ------------------
function showLogin() {
  $('#view-app').classList.remove('visible');
  $('#view-login').style.display = 'flex';
  // Autocadastro desativado: esconde qualquer resquício de "criar conta".
  if ($('#auth-toggle')) $('#auth-toggle').style.display = 'none';
  if ($('#f-name')) $('#f-name').style.display = 'none';
  $('#auth-title').textContent = 'Acessar o sistema';
  $('#auth-sub').textContent = 'Use suas credenciais corporativas.';
  $('#auth-submit').textContent = 'Entrar';
}
function showApp() {
  $('#view-login').style.display = 'none';
  $('#view-app').classList.add('visible');
  $('#u-name').textContent = USER.name;
  $('#u-mail').textContent = USER.email;
  $('#u-avatar').textContent = USER.name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  $('#today-label').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  buildNav();
  route();
}
// Entra no app e, se necessário, força a troca da senha do primeiro acesso.
async function enterApp() {
  await loadSettings();
  showApp();
  if (USER && USER.must_change_password) openForcedPasswordChange();
}

$('#auth-submit').onclick = async () => {
  const msg = $('#auth-msg'); msg.className = 'form-msg';
  const email = $('#auth-email').value.trim();
  const password = $('#auth-pass').value;
  try {
    const payload = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    USER = payload.user; enterApp();
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = err.message;
  }
};
$('#auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#auth-submit').click(); });

const doLogout = async () => { await api('/api/auth/logout', { method: 'POST' }); USER = null; location.hash = ''; showLogin(); };
$('#btn-logout').onclick = doLogout;
$('#btn-logout-top').onclick = doLogout;

// Troca obrigatória de senha no primeiro acesso (senha gerada pelo admin).
function openForcedPasswordChange() {
  FORCE_MODAL = true;
  openModal('Definir nova senha', `
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Por segurança, defina uma senha pessoal para continuar. A senha temporária fornecida pelo administrador deixará de valer.</p>
    <div class="field"><label for="np1">Nova senha</label>
      <div style="display:flex;gap:8px">
        <input id="np1" type="text" autocomplete="new-password" style="font-family:monospace">
        <button class="btn sm" id="np-gen" type="button">Gerar</button>
      </div>
      <small style="color:var(--muted)">Mín. 10 caracteres, com maiúscula, minúscula, número e símbolo.</small>
    </div>
    <div class="field"><label for="np2">Confirmar nova senha</label><input id="np2" type="password"></div>`,
    [{ label: 'Salvar e continuar', cls: 'primary', onClick: async () => {
        const a = $('#np1').value, b = $('#np2').value;
        if (a !== b) return modalError('As senhas não coincidem.');
        try {
          await api('/api/auth/change-password', { method: 'POST', body: { new_password: a } });
          USER.must_change_password = false;
          FORCE_MODAL = false; $('#modal-close').style.display = ''; closeModal();
          toast('Senha definida com sucesso.');
        } catch (e) { modalError(e.message); }
    }}]);
  $('#modal-close').style.display = 'none';
  $('#np-gen').onclick = () => { $('#np1').value = gerarSenhaForte(16); };
}

// ------------------ Navegação ------------------
const ICONS = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7 7 7-7"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7-7-7 7"/></svg>',
  flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-6 4 4 6-8 3 4"/></svg>',
  sup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10l9-6 9 6M4 10v9m16-9v9M2 21h20M8 13v4m4-4v4m4-4v4"/></svg>',
  bud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4m8-4v4"/></svg>',
  vs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 20V10m6 10V4m6 16v-7"/></svg>',
  rep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6"/></svg>',
  usr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  cfg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 01-4 0v-.09A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.56-1.03H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 008 4.6a1.7 1.7 0 001.03-1.56V3a2 2 0 014 0v.09A1.7 1.7 0 0016 4.6a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 8a1.7 1.7 0 001.56 1.03H21a2 2 0 010 4h-.09A1.7 1.7 0 0019.4 15z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 12.6L12.7 4.7A2 2 0 0011.3 4H5a1 1 0 00-1 1v6.3c0 .5.2 1 .6 1.4l7.9 7.9c.8.8 2 .8 2.8 0l5.3-5.3c.8-.8.8-2 0-2.8z"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>',
  via: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  contract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2h6l5 5v13a2 2 0 01-2 2H9a2 2 0 01-2-2V4a2 2 0 012-2z"/><path d="M9 12l2 2 4-4M8 17h5"/></svg>'
};

// Agrupamento enxuto: os títulos de seção consumiam 196px dos 787px do menu
// (25%), e duas seções tinham um único item ("Visão geral" com o Dashboard e
// "Suprimentos" sozinho). Dashboard passou a abrir a lista sem rótulo, Viáticos
// e Suprimentos foram reunidos em "Operações" (ambos operacionais, não de
// planejamento) e o subtítulo "Cadastros" saiu — nada foi escondido nem virou
// clique extra, só deixou de haver rolagem.
const PAGES = [
  { hash: 'dashboard', title: 'Dashboard', icon: 'dash' },
  { hash: 'pagar', title: 'Contas a Pagar', icon: 'out', section: 'Financeiro' },
  { hash: 'receber', title: 'Contas a Receber', icon: 'in' },
  { hash: 'fluxo', title: 'Fluxo de Caixa', icon: 'flow' },
  { hash: 'conciliacao', title: 'Conciliação Bancária', icon: 'bank' },
  { hash: 'orcamento', title: 'Orçamento Anual', icon: 'bud', section: 'Planejamento' },
  { hash: 'orcadoreal', title: 'Orçado x Realizado', icon: 'vs' },
  { hash: 'relatorios', title: 'Relatórios Gerenciais', icon: 'rep' },
  { hash: 'viaticos', title: 'Viáticos', icon: 'via', section: 'Operações' },
  { hash: 'suprimentos', title: 'Suprimentos', icon: 'box' },
  { hash: 'fornecedores', title: 'Fornecedores', icon: 'sup', section: 'Administração' },
  { hash: 'contratos', title: 'Contratos', icon: 'contract' },
  { hash: 'usuarios', title: 'Usuários', icon: 'usr', super: true },
  { hash: 'categorias', title: 'Categorias', icon: 'tag', super: true },
  { hash: 'config', title: 'Configurações', icon: 'cfg', super: true }
];

// Recolher/expandir o menu lateral — preferência lembrada por navegador.
const SIDEBAR_KEY = 'proagro_sidebar_collapsed';
(function initSidebarToggle() {
  const btn = $('#btn-side-toggle');
  const setTitle = on => { btn.title = btn.ariaLabel = on ? 'Expandir menu' : 'Recolher menu'; };
  const saved = localStorage.getItem(SIDEBAR_KEY) === '1';
  if (saved) $('#view-app').classList.add('side-collapsed');
  setTitle(saved);
  btn.onclick = () => {
    const on = $('#view-app').classList.toggle('side-collapsed');
    localStorage.setItem(SIDEBAR_KEY, on ? '1' : '0');
    setTitle(on);
  };
})();

function buildNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  let curSection = null, emittedSection = null, emittedSub = null;
  PAGES.forEach(p => {
    if (p.section) curSection = p.section;
    const visible = p.super ? !!USER.is_super : canViewPage(p.hash);
    if (!visible) return;
    if (curSection && curSection !== emittedSection) {
      nav.appendChild(el('div', 'nav-section', curSection));
      emittedSection = curSection; emittedSub = null;
    }
    if (p.sub && p.sub !== emittedSub) {
      nav.appendChild(el('div', 'nav-subsection', p.sub));
      emittedSub = p.sub;
    }
    const a = el('a', p.sub ? 'nav-sub-item' : '', ICONS[p.icon] + '<span>' + p.title + '</span>');
    a.href = '#' + p.hash; a.dataset.hash = p.hash;
    a.title = p.title; // tooltip — essencial com o menu recolhido (só ícones)
    nav.appendChild(a);
  });
}

function firstAllowedHash() {
  for (const p of PAGES) {
    const ok = p.super ? !!USER.is_super : canViewPage(p.hash);
    if (ok) return p.hash;
  }
  return null;
}

window.addEventListener('hashchange', () => { if (USER) route(); });

function route() {
  destroyCharts();
  let hash = (location.hash || '').slice(1);
  if (!hash) hash = firstAllowedHash() || 'dashboard';

  // #via-solicitar existiu como rota solta enquanto a seção estava em
  // construção (2026-07-28 a 30). Lançada e embutida dentro de Viáticos —
  // um bookmark antigo só precisa cair na tela certa e abrir o assistente.
  if (hash === 'via-solicitar') {
    VIA_ABRIR_WIZARD_AO_ENTRAR = true;
    location.hash = 'viaticos';
    return;
  }

  const page = PAGES.find(p => p.hash === hash);
  const allowed = page && (page.super ? !!USER.is_super : canViewPage(page.hash));

  if (!page || !allowed) {
    const fb = firstAllowedHash();
    document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
    $('#page-title').textContent = 'Sem acesso';
    $('#content').innerHTML = `<div class="card"><h3>Acesso não autorizado</h3>
      <p style="color:var(--ink-2);font-size:13.5px">Você não tem permissão para acessar esta página.
      ${fb ? 'Use o menu à esquerda para navegar pelas seções liberadas para o seu usuário.'
           : 'Nenhuma seção foi liberada para o seu usuário — contate o administrador.'}</p></div>`;
    return;
  }

  CURRENT_PAGE = page.hash;
  READONLY = page.super ? false : !canEditPage(page.hash);
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.hash === page.hash));
  $('#page-title').textContent = page.title;
  const renderers = {
    dashboard: renderDashboard, pagar: renderPagar, receber: renderReceber, fluxo: renderFluxo,
    fornecedores: renderFornecedores, conciliacao: renderConciliacao, orcamento: renderOrcamento,
    orcadoreal: renderOrcadoReal, relatorios: renderRelatorios, viaticos: renderViaticos,
    suprimentos: renderSuprimentos, contratos: renderContratos,
    usuarios: renderUsuarios, categorias: renderCategorias, config: renderConfig
  };
  $('#content').innerHTML = '<div class="empty">Carregando…</div>';
  renderers[page.hash]()
    .then(() => { if (READONLY) injectReadonlyBanner(); })
    .catch(err => { $('#content').innerHTML = `<div class="empty">${esc(err.message)}</div>`; });
}

function injectReadonlyBanner() {
  const c = $('#content');
  if (!c || c.querySelector('.ro-banner')) return;
  const b = el('div', 'ro-banner', '🔒 Acesso somente leitura — você pode consultar os dados desta seção, mas não editá-los.');
  c.prepend(b);
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const anoAtual = new Date().getFullYear();
  const [d, cf] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/cashflow/' + anoAtual)]);
  const c = $('#content');
  const fmtPct = v => v == null ? '—' : v.toFixed(1).replace('.', ',') + '%';
  const cur = d.last12[11], prev = d.last12[10];
  const deltaRec = prev.receitas ? ((cur.receitas - prev.receitas) / prev.receitas) * 100 : null;
  const deltaDesp = prev.despesas ? ((cur.despesas - prev.despesas) / prev.despesas) * 100 : null;
  const CAT_COLORS = ['#00783F','#3DAE43','#1F4E78','#6FBF87','#4A78A8','#A9CDB8','#C9922A','#8898A0','#0B3B24','#D3DFD8','#7A9E8B','#B23A2F'];

  // ---- Saldo acumulado do mês atual (mesmo cálculo exibido em Fluxo de Caixa) ----
  const arr12 = () => Array(12).fill(0);
  const entR = arr12(), entP = arr12(), saiR = arr12(), saiP = arr12();
  cf.entradas.realizado.forEach(r => entR[r.month - 1] = r.total);
  cf.entradas.projetado.forEach(r => entP[r.month - 1] = r.total);
  cf.saidas.realizado.forEach(r => saiR[r.month - 1] = r.total);
  cf.saidas.projetado.forEach(r => saiP[r.month - 1] = r.total);
  const mesIdxAtual = new Date().getMonth();
  let acumMes = 0;
  for (let i = 0; i <= mesIdxAtual; i++) acumMes += (entR[i] + entP[i]) - (saiR[i] + saiP[i]);

  // ---- Alertas (insights de gestão) ----
  const alerts = [];
  if (d.pagarVencido.n > 0) alerts.push({ sev: 'red', text: `${d.pagarVencido.n} conta(s) a pagar vencida(s), totalizando ${brl(d.pagarVencido.v)}.` });
  if (d.receberVencido.n > 0) alerts.push({ sev: 'red', text: `${d.receberVencido.n} conta(s) a receber vencida(s) (inadimplência), totalizando ${brl(d.receberVencido.v)}.` });
  if (d.saldoNegativoEm) alerts.push({ sev: 'red', text: `Projeção indica saldo de caixa negativo a partir de ${brDate(d.saldoNegativoEm)} caso não haja novas entradas.` });
  if (d.naoConciliados > 0) alerts.push({ sev: 'warn', text: `${d.naoConciliados} lançamento(s) bancário(s) aguardando conciliação, totalizando ${brl(d.naoConciliadosValor)}.` });
  if (d.orcadoDespesaMes > 0) {
    const varOrc = d.pagoMes - d.orcadoDespesaMes, pctOrc = (varOrc / d.orcadoDespesaMes) * 100;
    if (Math.abs(pctOrc) >= 5) alerts.push({ sev: pctOrc > 0 ? 'warn' : 'info',
      text: `Despesas do mês estão ${pctOrc > 0 ? 'acima' : 'abaixo'} do orçado em ${fmtPct(Math.abs(pctOrc))} (orçado ${brl(d.orcadoDespesaMes)}, realizado ${brl(d.pagoMes)}).` });
  }
  const totalCatMes = d.categoriaMes.reduce((s, x) => s + x.realizado, 0);
  if (totalCatMes > 0) {
    const topCat = d.categoriaMes[0];
    const share = (topCat.realizado / totalCatMes) * 100;
    if (share >= 35) alerts.push({ sev: 'info', text: `A categoria "${esc(topCat.category)}" concentra ${fmtPct(share)} das despesas do mês (${brl(topCat.realizado)}).` });
  }
  if (d.maiorClienteInadimplente) alerts.push({ sev: 'warn',
    text: `Maior inadimplência individual: ${esc(d.maiorClienteInadimplente.cliente)}, ${brl(d.maiorClienteInadimplente.total)} vencido(s) desde ${brDate(d.maiorClienteInadimplente.desde)}.` });
  if (d.maiorFornecedorAberto) alerts.push({ sev: 'info',
    text: `Maior concentração de contas a pagar em aberto: ${esc(d.maiorFornecedorAberto.fornecedor)}, totalizando ${brl(d.maiorFornecedorAberto.total)}.` });

  c.innerHTML = `
    <div class="dash-section-title">Indicadores principais</div>
    <div class="grid kpis">
      <div class="card kpi ${acumMes >= 0 ? '' : 'warn'}"><div class="label">Saldo acumulado do mês (Fluxo de Caixa)</div>
        <div class="value ${acumMes >= 0 ? 'pos' : 'neg'}">${brl(acumMes)}</div>
        <div class="detail">Realizado + projetado, acumulado de janeiro até ${MESES[mesIdxAtual]}/${anoAtual}</div></div>
      <div class="card kpi red"><div class="label">Despesas do mês</div>
        <div class="value">${brl(d.pagoMes)}</div>
        <div class="detail">${d.orcadoDespesaMes > 0 ? 'Orçado: ' + brl(d.orcadoDespesaMes) : 'Regime de caixa — mês corrente'}</div></div>
      <div class="card kpi ${d.pagarVencido.n > 0 ? 'red' : ''}"><div class="label">Pagamentos vencidos (total)</div>
        <div class="value ${d.pagarVencido.n > 0 ? 'neg' : ''}">${brl(d.pagarVencido.v)}</div>
        <div class="detail">${d.pagarVencido.n} título(s) em atraso</div></div>
      <div class="card kpi"><div class="label">Pagamentos pendentes a vencer</div>
        <div class="value">${brl(d.pagarAVencer.v)}</div>
        <div class="detail">${d.pagarAVencer.n} título(s) dentro do prazo</div></div>
      <div class="card kpi blue"><div class="label">Contas a receber no mês atual</div>
        <div class="value">${brl(d.receberMesAtual.v)}</div>
        <div class="detail">${d.receberMesAtual.n} título(s) · já recebido ${brl(d.receberMesRecebido.v)}</div></div>
    </div>

    <div class="dash-section-title">Alertas</div>
    <div class="card" style="margin-bottom:16px">
      ${alerts.length ? `<div class="alert-list">${alerts.map(a => `<div class="alert-item ${a.sev}">${a.sev === 'red' ? '⚠️' : a.sev === 'warn' ? '🔔' : 'ℹ️'} ${a.text}</div>`).join('')}</div>`
        : '<div class="alert-item ok">✅ Nenhum alerta no momento — contas em dia e conciliação bancária em ordem.</div>'}
    </div>

    <div class="dash-section-title">Fluxo de caixa</div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card">
        <h3>Previsão por horizonte</h3>
        <table><thead><tr><th>Horizonte</th><th class="num">Saídas previstas</th><th class="num">Entradas previstas</th><th class="num">Saldo projetado</th></tr></thead>
          <tbody>
            <tr><td>Próximos 7 dias</td><td class="num neg">${brl(d.pagar7.v)}</td><td class="num pos">${brl(d.receber7.v)}</td>
              <td class="num ${d.saldoAtual + d.receber7.v - d.pagar7.v >= 0 ? '' : 'neg'}">${brl(d.saldoAtual + d.receber7.v - d.pagar7.v)}</td></tr>
            <tr><td>Próximos 15 dias</td><td class="num neg">${brl(d.pagar15.v)}</td><td class="num pos">${brl(d.receber15.v)}</td>
              <td class="num ${d.saldoAtual + d.receber15.v - d.pagar15.v >= 0 ? '' : 'neg'}">${brl(d.saldoAtual + d.receber15.v - d.pagar15.v)}</td></tr>
            <tr><td>Próximos 30 dias</td><td class="num neg">${brl(d.pagar30.v)}</td><td class="num pos">${brl(d.receber30.v)}</td>
              <td class="num ${d.saldoAtual + d.receber30.v - d.pagar30.v >= 0 ? '' : 'neg'}">${brl(d.saldoAtual + d.receber30.v - d.pagar30.v)}</td></tr>
          </tbody></table>
        <p class="hint">Considera apenas títulos já lançados com status pendente, a partir do saldo atual de caixa.</p>
      </div>
      <div class="card"><h3>Evolução projetada do caixa (30 dias)</h3>
        <div class="chart-box"><canvas id="ch-proj"></canvas></div></div>
    </div>

    <div class="dash-section-title">Receitas × Despesas</div>
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi blue"><div class="label">Receitas — mês vs. anterior</div>
        <div class="value">${brl(cur.receitas)}</div>
        <div class="detail ${deltaRec == null ? '' : deltaRec >= 0 ? 'pos' : 'neg'}">${deltaRec == null ? 'Sem base de comparação' : (deltaRec >= 0 ? '▲ ' : '▼ ') + fmtPct(Math.abs(deltaRec)) + ' vs. mês anterior'}</div></div>
      <div class="card kpi red"><div class="label">Despesas — mês vs. anterior</div>
        <div class="value">${brl(cur.despesas)}</div>
        <div class="detail ${deltaDesp == null ? '' : deltaDesp <= 0 ? 'pos' : 'neg'}">${deltaDesp == null ? 'Sem base de comparação' : (deltaDesp >= 0 ? '▲ ' : '▼ ') + fmtPct(Math.abs(deltaDesp)) + ' vs. mês anterior'}</div></div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Evolução do faturamento — últimos 12 meses</h3>
        <div class="chart-box"><canvas id="ch-fat"></canvas></div></div>
      <div class="card"><h3>Receitas × Despesas por mês — últimos 12 meses</h3>
        <div class="chart-box"><canvas id="ch-recxdesp"></canvas></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Despesas por categoria — últimos 12 meses</h3>
      <div class="chart-box tall"><canvas id="ch-catdesp"></canvas></div></div>

    <div class="dash-section-title">Contas a pagar — detalhado</div>
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Vencendo hoje</div>
        <div class="value">${brl(d.pagarHoje.v)}</div><div class="detail">${d.pagarHoje.n} título(s)</div></div>
      <div class="card kpi"><div class="label">Próximos 7 dias</div>
        <div class="value">${brl(d.pagar7.v)}</div><div class="detail">${d.pagar7.n} título(s)</div></div>
      <div class="card kpi"><div class="label">Próximos 15 dias</div>
        <div class="value">${brl(d.pagar15.v)}</div><div class="detail">${d.pagar15.n} título(s)</div></div>
      <div class="card kpi blue"><div class="label">Próximos 30 dias</div>
        <div class="value">${brl(d.pagar30.v)}</div><div class="detail">${d.pagar30.n} título(s)</div></div>
      <div class="card kpi red"><div class="label">Em atraso</div>
        <div class="value neg">${brl(d.pagarVencido.v)}</div><div class="detail">${d.pagarVencido.n} título(s)</div></div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Valor total por status</h3>
        <table><thead><tr><th>Status</th><th class="num">Valor</th><th class="num">Títulos</th></tr></thead>
          <tbody>
            <tr><td>Em aberto (total)</td><td class="num">${brl(d.pagarPend.v)}</td><td class="num">${d.pagarPend.n}</td></tr>
            <tr><td>Vencendo em até 7 dias</td><td class="num">${brl(d.pagar7.v)}</td><td class="num">${d.pagar7.n}</td></tr>
            <tr><td>Vencendo em até 15 dias</td><td class="num">${brl(d.pagar15.v)}</td><td class="num">${d.pagar15.n}</td></tr>
            <tr><td>Vencendo em até 30 dias</td><td class="num">${brl(d.pagar30.v)}</td><td class="num">${d.pagar30.n}</td></tr>
            <tr><td>Em atraso</td><td class="num neg">${brl(d.pagarVencido.v)}</td><td class="num neg">${d.pagarVencido.n}</td></tr>
            <tr><td>Pago no mês</td><td class="num">${brl(d.pagoMes)}</td><td class="num">—</td></tr>
          </tbody></table>
      </div>
      <div class="card"><h3>Contas a pagar por faixa de atraso (aging)</h3>
        <div class="chart-box"><canvas id="ch-agingpagar"></canvas></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Próximos vencimentos (30 dias)</h3>
      ${d.vencendoPagar.length ? `<div style="overflow-x:auto"><table>
        <thead><tr><th>Venc.</th><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
        <tbody>${d.vencendoPagar.map(v => `<tr>
          <td>${brDate(v.due_date)}</td><td>${esc(v.party || '—')}</td><td>${esc(v.description)}</td><td>${esc(v.category)}</td>
          <td class="num">${brl(v.amount)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Nenhum vencimento nos próximos 30 dias.</div>'}
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Maiores contas a pagar em aberto</h3>
      ${d.maioresPagarAbertos.length ? `<div style="overflow-x:auto"><table>
        <thead><tr><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th>Venc.</th><th class="num">Valor</th></tr></thead>
        <tbody>${d.maioresPagarAbertos.map(v => `<tr>
          <td>${esc(v.fornecedor || '—')}</td><td>${esc(v.description)}</td><td>${esc(v.category)}</td>
          <td>${brDate(v.due_date)}</td><td class="num">${brl(v.amount)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Nenhum título em aberto.</div>'}
    </div>

    <div class="dash-section-title">Análise por centro de custo</div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Ranking — últimos 12 meses</h3>
        ${d.centrosCusto.length ? `<table><thead><tr><th>Centro de custo</th><th class="num">Total pago</th><th class="num">% do total</th></tr></thead>
          <tbody>${d.centrosCusto.map(x => `<tr><td>${esc(x.centro)}</td><td class="num">${brl(x.total)}</td>
            <td class="num">${fmtPct(d.centrosCustoTotal > 0 ? (x.total / d.centrosCustoTotal) * 100 : 0)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Sem centros de custo lançados no período.</div>'}</div>
      <div class="card"><h3>Distribuição por centro de custo</h3>
        <div class="chart-box"><canvas id="ch-centros"></canvas></div></div>
    </div>

    <div class="dash-section-title">Análise por categoria</div>
    <div class="two-col">
      <div class="card"><h3>Orçado × Realizado — mês atual</h3>
        ${d.categoriaMes.length ? `<table><thead><tr><th>Categoria</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Variação</th></tr></thead>
          <tbody>${d.categoriaMes.map(x => `<tr><td>${esc(x.category)}</td><td class="num">${brl(x.orcado)}</td><td class="num">${brl(x.realizado)}</td>
            <td class="num ${x.variacao > 0 ? 'neg' : x.variacao < 0 ? 'pos' : ''}">${x.variacaoPct == null ? brl(x.variacao) : (x.variacao >= 0 ? '+' : '') + fmtPct(x.variacaoPct)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Sem categorias orçadas ou realizadas no mês.</div>'}</div>
      <div class="card"><h3>Orçado × Realizado por categoria</h3>
        <div class="chart-box tall"><canvas id="ch-catmes"></canvas></div></div>
    </div>`;

  // ---- Gráfico: fluxo de caixa projetado (área, 30 dias) ----
  makeChart($('#ch-proj'), {
    type: 'line',
    data: { labels: d.projecaoDiaria.map(p => brDate(p.date).slice(0, 5)), datasets: [
      { label: 'Saldo projetado', data: d.projecaoDiaria.map(p => p.saldo), borderColor: CORES.verde,
        backgroundColor: 'rgba(0,120,63,0.12)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2 }
    ]},
    options: chartOpts({ scales: { x: { ticks: { maxTicksLimit: 8, font: { family: 'DM Sans' } }, grid: { display: false } },
      y: { ticks: { font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } } } })
  });

  // ---- Gráfico: evolução do faturamento (linha) ----
  makeChart($('#ch-fat'), {
    type: 'line',
    data: { labels: d.last12.map(m => m.label), datasets: [
      { label: 'Receitas', data: d.last12.map(m => m.receitas), borderColor: CORES.azul, backgroundColor: CORES.azul, tension: .3, pointRadius: 3 }
    ]},
    options: chartOpts()
  });

  // ---- Gráfico: receitas x despesas por mês (barras) ----
  makeChart($('#ch-recxdesp'), {
    type: 'bar',
    data: { labels: d.last12.map(m => m.label), datasets: [
      { label: 'Receitas', data: d.last12.map(m => m.receitas), backgroundColor: CORES.verdeMed, borderRadius: 4 },
      { label: 'Despesas', data: d.last12.map(m => m.despesas), backgroundColor: CORES.vermelho, borderRadius: 4 }
    ]},
    options: chartOpts()
  });

  // ---- Gráfico: despesas por categoria (barras horizontais) ----
  const catTop = d.despesasPorCategoria.slice(0, 10);
  makeChart($('#ch-catdesp'), {
    type: 'bar',
    data: { labels: catTop.map(x => x.category), datasets: [
      { label: 'Total pago', data: catTop.map(x => x.total), backgroundColor: CAT_COLORS, borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.x) } } },
      scales: {
        x: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
    }
  });

  // ---- Gráfico: aging de contas a pagar vencidas (barras) ----
  makeChart($('#ch-agingpagar'), {
    type: 'bar',
    data: { labels: ['1–30 dias', '31–60 dias', '61–90 dias', 'Mais de 90 dias'],
      datasets: [{ label: 'Valor vencido', data: ['1-30', '31-60', '61-90', '90+'].map(k => d.agingPagar[k]),
        backgroundColor: ['#C9922A', '#B23A2F', '#8A2A20', '#5C1B14'], borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.y) } } },
      scales: { y: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
                x: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
    }
  });

  // ---- Gráfico: distribuição por centro de custo (barras horizontais) ----
  const ccTop = d.centrosCusto.slice(0, 10);
  makeChart($('#ch-centros'), {
    type: 'bar',
    data: { labels: ccTop.map(x => x.centro), datasets: [
      { label: 'Total pago', data: ccTop.map(x => x.total), backgroundColor: CAT_COLORS, borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.x) } } },
      scales: {
        x: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
    }
  });

  // ---- Gráfico: orçado x realizado por categoria (mês atual) ----
  makeChart($('#ch-catmes'), {
    type: 'bar',
    data: { labels: d.categoriaMes.map(x => x.category), datasets: [
      { label: 'Orçado', data: d.categoriaMes.map(x => x.orcado), backgroundColor: CORES.azul, borderRadius: 4 },
      { label: 'Realizado', data: d.categoriaMes.map(x => x.realizado), backgroundColor: CORES.verdeMed, borderRadius: 4 }
    ]},
    options: chartOpts({ indexAxis: 'y', scales: {
      x: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
      y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } } })
  });
}

function chartOpts(extra) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { font: { family: 'DM Sans' }, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + brl(ctx.parsed.y ?? ctx.parsed) } } },
    scales: { y: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
              x: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
  }, extra || {});
}

// ============================================================
// CONTAS A PAGAR
// ============================================================
async function renderPagar() {
  const [rows, sups] = await Promise.all([api('/api/payables'), api('/api/suppliers')]);
  const c = $('#content');
  const FKEY = 'filters-pagar';
  const saved = loadFilters(FKEY);
  c.innerHTML = `
    <div class="toolbar toolbar-spaced" id="pagar-toolbar">
      <input type="search" id="q" placeholder="Buscar descrição, fornecedor…" value="${esc(saved.q || '')}">
      <select id="f-status"><option value="">Todos os status</option>
        <option value="pendente" ${saved.status === 'pendente' ? 'selected' : ''}>Pendentes</option>
        <option value="vencido" ${saved.status === 'vencido' ? 'selected' : ''}>Vencidos</option>
        <option value="pago" ${saved.status === 'pago' ? 'selected' : ''}>Pagos</option></select>
      <select id="f-cat"><option value="">Todas as categorias</option>${CAT_DESPESA.map(x => `<option ${saved.cat === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <div class="date-range">
        <label>De <input type="date" id="f-de" value="${saved.de || ''}"></label>
        <label>Até <input type="date" id="f-ate" value="${saved.ate || ''}"></label>
      </div>
      <button class="btn" id="btn-clear">Limpar filtros</button>
      <div class="spacer"></div>
      <button class="btn" id="btn-export">Exportar</button>
      <button class="btn primary" id="btn-new">+ Novo título</button>
    </div>
    <div class="table-wrap"><table id="tbl" class="tbl-pagar"></table></div>`;

  // Mantém o painel de filtros fixo logo abaixo da barra superior ao rolar.
  const topbarEl = document.querySelector('.topbar');
  if (topbarEl) $('#pagar-toolbar').style.top = topbarEl.offsetHeight + 'px';

  let lastFiltered = rows;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#f-status').value, fc = $('#f-cat').value, today = todayISO();
    const de = $('#f-de').value, ate = $('#f-ate').value;
    saveFilters(FKEY, { q: $('#q').value, status: fs, cat: fc, de, ate });
    const filtered = rows.filter(r => {
      const late = r.status === 'pendente' && r.due_date < today;
      if (fs === 'pendente' && r.status !== 'pendente') return false;
      if (fs === 'pago' && r.status !== 'pago') return false;
      if (fs === 'vencido' && !late) return false;
      if (fc && r.category !== fc) return false;
      if (de && r.due_date < de) return false;
      if (ate && r.due_date > ate) return false;
      return !q || (r.description + ' ' + (r.supplier_name || '') + ' ' + (r.document || '')).toLowerCase().includes(q);
    });
    lastFiltered = filtered;
    const total = filtered.reduce((s, r) => s + r.amount, 0);
    const PM_LABELS = { boleto: 'Boleto', pix: 'PIX', transferencia: 'Transferência' };
    $('#tbl').innerHTML = `
      <colgroup>
        <col class="c-id"><col class="c-venc"><col class="c-desc"><col class="c-forn"><col class="c-cat"><col class="c-cc">
        <col class="c-val"><col class="c-status"><col class="c-conc"><col class="c-acoes">
      </colgroup>
      <thead><tr><th>ID</th><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Centro de Custo</th>
        <th class="num">Valor</th><th>Status</th><th class="c-conc-cell" title="Conciliado com o extrato bancário?">Conc.</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => {
        const late = r.status === 'pendente' && r.due_date < today;
        return `<tr>
          <td class="id-cell">${r.id}</td>
          <td class="venc-cell">${brDate(r.due_date)}</td>
          <td>${esc(r.description)}</td>
          <td>${esc(r.supplier_name || '—')}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.cost_center || '—')}</td>
          <td class="num">${brl(r.amount)}</td>
          <td>${r.status === 'pago'
            ? `<span class="badge ok">Pago ${brDate(r.payment_date)}</span>`
            : late ? '<span class="badge late">Vencido</span>' : '<span class="badge pend">Pendente</span>'}</td>
          <td class="c-conc-cell">${r.status !== 'pago'
            ? '<span class="conc-na" title="Título ainda não baixado — não há o que conciliar">—</span>'
            : r.reconciled
              ? '<span class="conc-sim" title="Há uma movimentação bancária conciliada com este título">✔</span>'
              : '<span class="conc-nao" title="Baixado, mas sem movimentação bancária conciliada">✘</span>'}</td>
          <td class="actions">
            ${r.status === 'pendente' ? `<button class="btn sm primary" data-pay="${r.id}">Baixar</button>` : `<button class="btn sm" data-unpay="${r.id}">Estornar</button>`}
            <button class="btn sm att-btn" data-att="payable:${r.id}">📎${r.attachment_count ? ' ' + r.attachment_count : ''}</button>
            <button class="btn sm" data-edit="${r.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
          </td></tr>`;
      }).join('') || '<tr><td colspan="10"><div class="empty">Nenhum título encontrado.</div></td></tr>'}</tbody>
      <tfoot><tr><td colspan="6">Total filtrado (${filtered.length})</td><td class="num">${brl(total)}</td><td colspan="3"></td></tr></tfoot>`;



    $('#tbl').querySelectorAll('[data-pay]').forEach(b => b.onclick = () => baixaPagar(rows.find(r => r.id == b.dataset.pay)));
    $('#tbl').querySelectorAll('[data-unpay]').forEach(b => b.onclick = async () => { await api(`/api/payables/${b.dataset.unpay}/unpay`, { method: 'POST' }); toast('Baixa estornada.'); renderPagar(); });
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formPagar(rows.find(r => r.id == b.dataset.edit), sups));
    $('#tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.att.split(':')[1]); openAttachments('payable', r.id, r.description); });
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('título', `/api/payables/${b.dataset.del}`, renderPagar));
  };
  ['q', 'f-status', 'f-cat', 'f-de', 'f-ate'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-clear').onclick = () => {
    $('#q').value = ''; $('#f-status').value = ''; $('#f-cat').value = ''; $('#f-de').value = ''; $('#f-ate').value = '';
    saveFilters(FKEY, {});
    draw();
  };
  $('#btn-new').onclick = () => formPagar(null, sups);

  const exportarPagarCSV = () => exportCSV('contas_a_pagar',
    ['ID','Vencimento','Descricao','Fornecedor','Categoria','CentroCusto','Documento','FormaPagamento','ChavePix','Valor','Status','Pagamento'],
    lastFiltered.map(r => [r.id, r.due_date, r.description, r.supplier_name || '', r.category, r.cost_center || '', r.document || '',
      r.payment_method || '', r.payment_method === 'pix' ? (r.pix_key || '') : '', String(r.amount).replace('.', ','), r.status, r.payment_date || '']));

  const exportarPagarExcel = () => {
    if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
    const PM_LABELS_XL = { boleto: 'Boleto', pix: 'PIX', transferencia: 'Transferência' };
    const wsData = [
      ['ID', 'Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Centro de Custo', 'Documento', 'Forma de Pagamento', 'Chave PIX', 'Valor', 'Status', 'Pagamento'],
      ...lastFiltered.map(r => [r.id, r.due_date, r.description, r.supplier_name || '', r.category, r.cost_center || '', r.document || '',
        r.payment_method ? (PM_LABELS_XL[r.payment_method] || r.payment_method) : '', r.payment_method === 'pix' ? (r.pix_key || '') : '',
        Number(r.amount), r.status === 'pago' ? 'Pago' : (r.due_date < todayISO() ? 'Vencido' : 'Pendente'), r.payment_date || ''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    for (let i = 1; i <= lastFiltered.length; i++) { const cell = ws['J' + (i + 1)]; if (cell) cell.z = '"R$" #,##0.00'; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    XLSX.writeFile(wb, `contas_a_pagar_${todayISO()}.xlsx`);
    toast('Excel exportado.');
  };

  const exportarPagarPDF = () => {
    const parts = [];
    if ($('#q').value) parts.push(`Busca: "${$('#q').value}"`);
    if ($('#f-status').value) parts.push('Status: ' + ({ pendente: 'Pendentes', vencido: 'Vencidos', pago: 'Pagos' }[$('#f-status').value]));
    if ($('#f-cat').value) parts.push('Categoria: ' + $('#f-cat').value);
    if ($('#f-de').value || $('#f-ate').value) parts.push(`Período: ${$('#f-de').value ? brDate($('#f-de').value) : '—'} a ${$('#f-ate').value ? brDate($('#f-ate').value) : '—'}`);
    exportPagarPDF(lastFiltered, parts.join('   ·   '));
  };

  $('#btn-export').onclick = () => openModal('Exportar Contas a Pagar',
    `<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato você quer exportar (respeitando os filtros aplicados na tela)?</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'CSV', onClick: () => { closeModal(); exportarPagarCSV(); } },
      { label: 'Excel', onClick: () => { closeModal(); exportarPagarExcel(); } },
      { label: 'PDF', cls: 'primary', onClick: () => { closeModal(); exportarPagarPDF(); } }
    ]);

  draw();
}

function baixaPagar(r) {
  openModal('Baixa de pagamento', `
    <p style="margin-bottom:14px">${esc(r.description)} — <strong>${brl(r.amount)}</strong></p>
    ${fld('pay-date', 'Data do pagamento', 'date', todayISO())}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar baixa', cls: 'primary', onClick: async () => {
        try { await api(`/api/payables/${r.id}/pay`, { method: 'POST', body: { payment_date: $('#pay-date').value } });
          closeModal(); toast('Pagamento registrado.'); renderPagar(); } catch (e) { modalError(e.message); }
     }}]);
}

function formPagar(r, sups) {
  const isEdit = !!r; r = r || {};
  const PM_LABELS = { boleto: 'Boleto', pix: 'PIX', transferencia: 'Transferência' };
  openModal(isEdit ? 'Editar título' : 'Novo título a pagar', `
    ${fld('p-desc', 'Descrição *', 'text', r.description || '')}
    <div class="form-row">
      ${fldSel('p-sup', 'Fornecedor', [{ v: '', t: '— Sem fornecedor —' }, ...sups.filter(s => s.status === 'ativo' || s.id === r.supplier_id).map(s => ({ v: s.id, t: s.name }))], r.supplier_id || '')}
      ${fldSel('p-cat', 'Categoria *', CAT_DESPESA.map(x => ({ v: x, t: x })), r.category || CAT_DESPESA[0])}
    </div>
    <div class="form-row">
      ${fldSel('p-cc', 'Centro de custo', [{ v: '', t: '—' }, ...CENTROS.map(x => ({ v: x, t: x }))], r.cost_center || '')}
      ${fld('p-doc', 'Documento (NF/Fatura)', 'text', r.document || '')}
    </div>
    <div class="form-row">
      ${fld('p-val', 'Valor (R$) *', 'number', r.amount || '', 'step="0.01" min="0.01"')}
      ${fld('p-due', 'Vencimento *', 'date', r.due_date || todayISO())}
    </div>
    <div class="form-row">
      ${fldSel('p-pm', 'Forma de pagamento', [{ v: '', t: '—' }, ...Object.entries(PM_LABELS).map(([v, t]) => ({ v, t }))], r.payment_method || '')}
      <div id="p-pix-wrap" style="display:${r.payment_method === 'pix' ? 'block' : 'none'}">
        ${fld('p-pix', 'Chave PIX *', 'text', r.pix_key || '', 'placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"')}
        <small style="color:var(--muted); display:block; margin-top:-8px">Preenchida automaticamente com a chave cadastrada no fornecedor — pode editar se for diferente.</small>
      </div>
    </div>
    ${fld('p-notes', 'Observações', 'text', r.notes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Criar título', cls: 'primary', onClick: async () => {
        const body = {
          description: $('#p-desc').value, supplier_id: $('#p-sup').value || null, category: $('#p-cat').value,
          cost_center: $('#p-cc').value, document: $('#p-doc').value, amount: $('#p-val').value,
          due_date: $('#p-due').value, payment_method: $('#p-pm').value, pix_key: $('#p-pix').value, notes: $('#p-notes').value
        };
        try {
          if (isEdit) await api('/api/payables/' + r.id, { method: 'PUT', body });
          else await api('/api/payables', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Título atualizado.' : 'Título criado.'); renderPagar();
        } catch (e) { modalError(e.message); }
     }}]);
  $('#p-pm').onchange = () => {
    $('#p-pix-wrap').style.display = $('#p-pm').value === 'pix' ? 'block' : 'none';
    if ($('#p-pm').value === 'pix') {
      const sup = sups.find(s => String(s.id) === $('#p-sup').value);
      if (sup && sup.pix_key) $('#p-pix').value = sup.pix_key;
    }
  };
  $('#p-sup').onchange = () => {
    if ($('#p-pm').value === 'pix') {
      const sup = sups.find(s => String(s.id) === $('#p-sup').value);
      $('#p-pix').value = (sup && sup.pix_key) || '';
    }
  };
}

// ============================================================
// CONTAS A RECEBER
// ============================================================
async function renderReceber() {
  const rows = await api('/api/receivables');
  const c = $('#content');
  const FKEY = 'filters-receber';
  const saved = loadFilters(FKEY);
  c.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Buscar cliente, descrição…" value="${esc(saved.q || '')}">
      <select id="f-status"><option value="">Todos os status</option>
        <option value="pendente" ${saved.status === 'pendente' ? 'selected' : ''}>Pendentes</option>
        <option value="vencido" ${saved.status === 'vencido' ? 'selected' : ''}>Vencidos</option>
        <option value="recebido" ${saved.status === 'recebido' ? 'selected' : ''}>Recebidos</option></select>
      <div class="date-range">
        <label>De <input type="date" id="f-de" value="${saved.de || ''}"></label>
        <label>Até <input type="date" id="f-ate" value="${saved.ate || ''}"></label>
      </div>
      <button class="btn" id="btn-clear">Limpar filtros</button>
      <div class="spacer"></div>
      <button class="btn" id="btn-csv">Exportar CSV</button>
      <button class="btn primary" id="btn-new">+ Novo recebível</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  let lastFiltered = rows;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#f-status').value, today = todayISO();
    const de = $('#f-de').value, ate = $('#f-ate').value;
    saveFilters(FKEY, { q: $('#q').value, status: fs, de, ate });
    const filtered = rows.filter(r => {
      const late = r.status === 'pendente' && r.due_date < today;
      if (fs === 'pendente' && r.status !== 'pendente') return false;
      if (fs === 'recebido' && r.status !== 'recebido') return false;
      if (fs === 'vencido' && !late) return false;
      if (de && r.due_date < de) return false;
      if (ate && r.due_date > ate) return false;
      return !q || (r.description + ' ' + r.client_name + ' ' + (r.document || '')).toLowerCase().includes(q);
    });
    lastFiltered = filtered;
    const total = filtered.reduce((s, r) => s + r.amount, 0);
    $('#tbl').innerHTML = `
      <thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th>Categoria</th><th>Doc.</th>
        <th class="num">Valor</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => {
        const late = r.status === 'pendente' && r.due_date < today;
        return `<tr>
          <td class="nowrap">${brDate(r.due_date)}</td><td>${esc(r.client_name)}</td><td>${esc(r.description)}</td>
          <td>${esc(r.category)}</td><td>${esc(r.document || '—')}</td>
          <td class="num">${brl(r.amount)}</td>
          <td>${r.status === 'recebido'
            ? `<span class="badge ok">Recebido ${brDate(r.receipt_date)}</span>`
            : late ? '<span class="badge late">Vencido</span>' : '<span class="badge pend">Pendente</span>'}</td>
          <td class="actions">
            ${r.status === 'pendente' ? `<button class="btn sm primary" data-rec="${r.id}">Receber</button>` : `<button class="btn sm" data-unrec="${r.id}">Estornar</button>`}
            <button class="btn sm att-btn" data-att="receivable:${r.id}">📎${r.attachment_count ? ' ' + r.attachment_count : ''}</button>
            <button class="btn sm" data-edit="${r.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
          </td></tr>`;
      }).join('') || '<tr><td colspan="7"><div class="empty">Nenhum recebível encontrado.</div></td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">Total filtrado (${filtered.length})</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot>`;

    $('#tbl').querySelectorAll('[data-rec]').forEach(b => b.onclick = () => baixaReceber(rows.find(r => r.id == b.dataset.rec)));
    $('#tbl').querySelectorAll('[data-unrec]').forEach(b => b.onclick = async () => { await api(`/api/receivables/${b.dataset.unrec}/unreceive`, { method: 'POST' }); toast('Recebimento estornado.'); renderReceber(); });
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formReceber(rows.find(r => r.id == b.dataset.edit)));
    $('#tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.att.split(':')[1]); openAttachments('receivable', r.id, r.description); });
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('recebível', `/api/receivables/${b.dataset.del}`, renderReceber));
  };
  ['q', 'f-status', 'f-de', 'f-ate'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-clear').onclick = () => {
    $('#q').value = ''; $('#f-status').value = ''; $('#f-de').value = ''; $('#f-ate').value = '';
    saveFilters(FKEY, {});
    draw();
  };
  $('#btn-new').onclick = () => formReceber(null);
  $('#btn-csv').onclick = () => exportCSV('contas_a_receber',
    ['Vencimento','Cliente','Descricao','Categoria','Documento','Valor','Status','Recebimento'],
    lastFiltered.map(r => [r.due_date, r.client_name, r.description, r.category, r.document || '', String(r.amount).replace('.', ','), r.status, r.receipt_date || '']));
  draw();
}

function baixaReceber(r) {
  openModal('Registrar recebimento', `
    <p style="margin-bottom:14px">${esc(r.client_name)} — ${esc(r.description)} — <strong>${brl(r.amount)}</strong></p>
    ${fld('rec-date', 'Data do recebimento', 'date', todayISO())}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar recebimento', cls: 'primary', onClick: async () => {
        try { await api(`/api/receivables/${r.id}/receive`, { method: 'POST', body: { receipt_date: $('#rec-date').value } });
          closeModal(); toast('Recebimento registrado.'); renderReceber(); } catch (e) { modalError(e.message); }
     }}]);
}

function formReceber(r) {
  const isEdit = !!r; r = r || {};
  openModal(isEdit ? 'Editar recebível' : 'Novo título a receber', `
    ${fld('r-client', 'Cliente *', 'text', r.client_name || '')}
    ${fld('r-desc', 'Descrição *', 'text', r.description || '')}
    <div class="form-row">
      ${fldSel('r-cat', 'Categoria *', CAT_RECEITA.map(x => ({ v: x, t: x })), r.category || CAT_RECEITA[0])}
      ${fld('r-doc', 'Documento (Fatura/NF)', 'text', r.document || '')}
    </div>
    <div class="form-row">
      ${fld('r-val', 'Valor (R$) *', 'number', r.amount || '', 'step="0.01" min="0.01"')}
      ${fld('r-due', 'Vencimento *', 'date', r.due_date || todayISO())}
    </div>
    ${fld('r-notes', 'Observações', 'text', r.notes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Criar recebível', cls: 'primary', onClick: async () => {
        const body = {
          client_name: $('#r-client').value, description: $('#r-desc').value, category: $('#r-cat').value,
          document: $('#r-doc').value, amount: $('#r-val').value, due_date: $('#r-due').value, notes: $('#r-notes').value
        };
        try {
          if (isEdit) await api('/api/receivables/' + r.id, { method: 'PUT', body });
          else await api('/api/receivables', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Recebível atualizado.' : 'Recebível criado.'); renderReceber();
        } catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// FLUXO DE CAIXA
// ============================================================
async function renderFluxo() {
  const FKEY = 'filters-fluxo';
  const saved = loadFilters(FKEY);
  const todayISOv = todayISO();
  const monthStart = todayISOv.slice(0, 8) + '01';
  // Último dia do mês corrente — formatado no fuso local (ver todayISO).
  const [anoV, mesV] = todayISOv.split('-').map(Number);
  const monthEnd = new Date(anoV, mesV, 0).toLocaleDateString('en-CA');

  const de = saved.de || monthStart, ate = saved.ate || monthEnd;
  const granularidade = saved.gran || 'dia';
  const centroCusto = saved.cc || '';
  const situacao = saved.sit || '';

  const params = new URLSearchParams({ de, ate, granularidade });
  if (centroCusto) params.set('centro_custo', centroCusto);
  if (situacao) params.set('situacao', situacao);
  const d = await api('/api/reports/fluxo-caixa?' + params.toString());
  const c = $('#content');

  c.innerHTML = `
    <div class="toolbar toolbar-spaced" id="fluxo-toolbar">
      <input type="date" id="fx-de" value="${de}">
      <span style="color:var(--muted); font-size:13px">até</span>
      <input type="date" id="fx-ate" value="${ate}">
      <select id="fx-gran">
        <option value="dia" ${granularidade === 'dia' ? 'selected' : ''}>Por dia</option>
        <option value="semana" ${granularidade === 'semana' ? 'selected' : ''}>Por semana</option>
        <option value="mes" ${granularidade === 'mes' ? 'selected' : ''}>Por mês</option>
        <option value="ano" ${granularidade === 'ano' ? 'selected' : ''}>Por ano</option>
      </select>
      <select id="fx-cc"><option value="">Todos os centros de custo</option>${CENTROS.map(x => `<option ${centroCusto === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select id="fx-sit">
        <option value="">Todas as situações</option>
        <option value="pago" ${situacao === 'pago' ? 'selected' : ''}>Pago</option>
        <option value="recebido" ${situacao === 'recebido' ? 'selected' : ''}>Recebido</option>
        <option value="pendente" ${situacao === 'pendente' ? 'selected' : ''}>Pendente</option>
        <option value="vencido" ${situacao === 'vencido' ? 'selected' : ''}>Vencido</option>
      </select>
      <button class="btn" id="fx-clear">Limpar filtros</button>
      <div class="spacer"></div>
      <button class="btn primary" id="fx-aporte">💰 Solicitar aporte</button>
      <button class="btn" id="fx-csv">CSV</button>
      <button class="btn" id="fx-xlsx">Excel</button>
      <button class="btn" id="fx-pdf">PDF</button>
    </div>

    ${d.alerta.diaCritico ? `
    <div class="card" style="margin-bottom:16px"><div class="alert-item red">⚠️ <strong>Alerta de saldo negativo:</strong>
      considerando o saldo real e os títulos já lançados, o caixa fica negativo a partir de <strong>${brDate(d.alerta.diaCritico)}</strong>,
      chegando ao pior momento em <strong>${brDate(d.alerta.diaPior)}</strong>, quando faltariam <strong>${brl(d.alerta.necessidade)}</strong> —
      esse é o valor mínimo de aporte necessário para o caixa não faltar nos próximos 90 dias (até ${brDate(d.alerta.horizonte)}).</div></div>`
      : `<div class="card" style="margin-bottom:16px"><div class="alert-item ok">✅ <strong>Sem risco de saldo negativo</strong> até ${brDate(d.alerta.horizonte)}, considerando o saldo real e os títulos já lançados.</div></div>`}

    <div class="dash-section-title">Resumo financeiro</div>
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Saldo inicial do período</div>
        <div class="value ${d.resumo.saldoInicial >= 0 ? '' : 'neg'}">${brl(d.resumo.saldoInicial)}</div>
        <div class="detail">Em ${brDate(d.de)}</div></div>
      <div class="card kpi blue"><div class="label">Total de entradas</div>
        <div class="value">${brl(d.resumo.totalEntradas)}</div>
        <div class="detail">No período filtrado</div></div>
      <div class="card kpi red"><div class="label">Total de saídas</div>
        <div class="value">${brl(d.resumo.totalSaidas)}</div>
        <div class="detail">No período filtrado</div></div>
      <div class="card kpi"><div class="label">Saldo atual</div>
        <div class="value ${d.resumo.saldoAtual >= 0 ? '' : 'neg'}">${brl(d.resumo.saldoAtual)}</div>
        <div class="detail">Saldo bancário real, hoje</div></div>
      <div class="card kpi ${d.resumo.saldoPrevisto >= 0 ? '' : 'warn'}"><div class="label">Saldo previsto</div>
        <div class="value ${d.resumo.saldoPrevisto >= 0 ? 'pos' : 'neg'}">${brl(d.resumo.saldoPrevisto)}</div>
        <div class="detail">Considerando todo o pendente a pagar e a receber</div></div>
    </div>

    <div class="dash-section-title">Fluxo por período</div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Evolução do saldo</h3>
        <div class="chart-box"><canvas id="ch-saldo"></canvas></div></div>
      <div class="card"><h3>Entradas × Saídas</h3>
        <div class="chart-box"><canvas id="ch-entsai"></canvas></div></div>
    </div>
    <div class="table-wrap" style="margin-bottom:16px">
      <table><thead><tr><th>Data</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead>
        <tbody>${d.buckets.length ? d.buckets.map(b => `<tr>
          <td>${esc(b.label)}</td>
          <td class="num pos">${brl(b.entradas)}</td>
          <td class="num neg">${brl(b.saidas)}</td>
          <td class="num ${b.saldo >= 0 ? '' : 'neg'}"><strong>${brl(b.saldo)}</strong></td>
        </tr>`).join('') : '<tr><td colspan="4"><div class="empty">Nenhum dado para o período e filtros selecionados.</div></td></tr>'}</tbody>
      </table>
    </div>

    <div class="dash-section-title">Distribuição por categoria (no período)</div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Despesas por categoria</h3>
        <div class="chart-box">${d.categorias.despesas.length ? '<canvas id="ch-desp"></canvas>' : '<div class="empty">Sem despesas no período.</div>'}</div></div>
      <div class="card"><h3>Receitas por categoria</h3>
        <div class="chart-box">${d.categorias.receitas.length ? '<canvas id="ch-rec"></canvas>' : '<div class="empty">Sem receitas no período.</div>'}</div></div>
    </div>

    <div class="dash-section-title">Fluxo projetado</div>
    <div class="two-col">
      <div class="card"><h3>Contas a receber futuras</h3>
        ${d.futuras.receber.length ? `<table><thead><tr><th>Venc.</th><th>Cliente</th><th class="num">Valor</th></tr></thead>
          <tbody>${d.futuras.receber.map(r => `<tr><td>${brDate(r.due_date)}</td><td>${esc(r.client_name)} — ${esc(r.description)}</td><td class="num">${brl(r.amount)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Nenhuma conta a receber pendente.</div>'}</div>
      <div class="card"><h3>Contas a pagar futuras</h3>
        ${d.futuras.pagar.length ? `<table><thead><tr><th>Venc.</th><th>Fornecedor</th><th class="num">Valor</th></tr></thead>
          <tbody>${d.futuras.pagar.map(r => `<tr><td>${brDate(r.due_date)}</td><td>${esc(r.party || '—')} — ${esc(r.description)}</td><td class="num">${brl(r.amount)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Nenhuma conta a pagar pendente.</div>'}</div>
    </div>`;

  const topbarEl = document.querySelector('.topbar');
  if (topbarEl) $('#fluxo-toolbar').style.top = topbarEl.offsetHeight + 'px';

  const saveAndReload = () => {
    saveFilters(FKEY, { de: $('#fx-de').value, ate: $('#fx-ate').value, gran: $('#fx-gran').value, cc: $('#fx-cc').value, sit: $('#fx-sit').value });
    renderFluxo();
  };
  ['fx-de', 'fx-ate', 'fx-gran', 'fx-cc', 'fx-sit'].forEach(id => $('#' + id).onchange = saveAndReload);
  $('#fx-clear').onclick = () => { saveFilters(FKEY, {}); renderFluxo(); };

  // Busca os mesmos dados do período/filtros atuais, mas agrupados por MÊS —
  // usado pelos relatórios "Resumido", independente da granularidade escolhida na tela.
  const fetchResumoMensal = async () => {
    const p = new URLSearchParams({ de, ate, granularidade: 'mes' });
    if (centroCusto) p.set('centro_custo', centroCusto);
    if (situacao) p.set('situacao', situacao);
    return api('/api/reports/fluxo-caixa?' + p.toString());
  };

  const exportCSVCompleto = () => exportCSV('fluxo_de_caixa_completo',
    ['Data', 'Entradas', 'Saidas', 'Saldo'],
    d.buckets.map(b => [b.label, String(b.entradas).replace('.', ','), String(b.saidas).replace('.', ','), String(b.saldo).replace('.', ',')]));

  const exportCSVResumo = async () => {
    try {
      const dm = await fetchResumoMensal();
      const alertaTxt = dm.alerta.diaCritico
        ? `Alerta: saldo fica negativo a partir de ${brDate(dm.alerta.diaCritico)} - aporte necessario de ${brl(dm.alerta.necessidade)} ate ${brDate(dm.alerta.horizonte)}.`
        : `Sem risco de saldo negativo ate ${brDate(dm.alerta.horizonte)}.`;
      const rows = [
        [`Periodo: ${brDate(dm.de)} a ${brDate(dm.ate)}`],
        [alertaTxt],
        [],
        ['Saldo inicial', String(dm.resumo.saldoInicial).replace('.', ',')],
        ['Total de entradas', String(dm.resumo.totalEntradas).replace('.', ',')],
        ['Total de saidas', String(dm.resumo.totalSaidas).replace('.', ',')],
        ['Saldo atual', String(dm.resumo.saldoAtual).replace('.', ',')],
        ['Saldo previsto', String(dm.resumo.saldoPrevisto).replace('.', ',')],
        [],
        ['Mes', 'Entradas', 'Saidas', 'Saldo'],
        ...dm.buckets.map(b => [b.label, String(b.entradas).replace('.', ','), String(b.saidas).replace('.', ','), String(b.saldo).replace('.', ',')])
      ];
      exportCSV('fluxo_de_caixa_resumido', ['Relatorio de Fluxo de Caixa - Resumo Mensal'], rows);
    } catch (e) { toast(e.message || 'Não foi possível gerar o CSV resumido.'); }
  };

  // Formato numérico nativo do Excel: positivo em preto, negativo em vermelho
  // (usa o próprio motor de formatação do Excel — funciona mesmo na versão
  // gratuita da biblioteca, que não tem suporte a cor de célula customizada).
  const XLSX_MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

  const exportXLSXCompleto = () => {
    if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
    const wsData = [['Data', 'Entradas', 'Saídas', 'Saldo'], ...d.buckets.map(b => [b.label, b.entradas, b.saidas, b.saldo])];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    for (let i = 1; i <= d.buckets.length; i++) {
      ['B', 'C', 'D'].forEach(col => { const cell = ws[col + (i + 1)]; if (cell) cell.z = XLSX_MONEY_FMT; });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa');
    XLSX.writeFile(wb, `fluxo_de_caixa_completo_${todayISO()}.xlsx`);
    toast('Excel exportado.');
  };

  const exportXLSXResumo = async () => {
    if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
    try {
      const dm = await fetchResumoMensal();
      const alertaTxt = dm.alerta.diaCritico
        ? `Alerta: saldo fica negativo a partir de ${brDate(dm.alerta.diaCritico)}, chegando ao pior momento em ${brDate(dm.alerta.diaPior)} — aporte mínimo necessário de ${brl(dm.alerta.necessidade)} para não faltar caixa até ${brDate(dm.alerta.horizonte)}.`
        : `Sem risco de saldo negativo até ${brDate(dm.alerta.horizonte)}.`;
      const wsData = [
        ['Relatório de Fluxo de Caixa — Resumo Mensal'],
        [`Período: ${brDate(dm.de)} a ${brDate(dm.ate)}`],
        [alertaTxt],
        [],
        ['Saldo inicial', dm.resumo.saldoInicial], ['Total de entradas', dm.resumo.totalEntradas],
        ['Total de saídas', dm.resumo.totalSaidas], ['Saldo atual', dm.resumo.saldoAtual], ['Saldo previsto', dm.resumo.saldoPrevisto],
        [],
        ['Mês', 'Entradas', 'Saídas', 'Saldo'],
        ...dm.buckets.map(b => [b.label, b.entradas, b.saidas, b.saldo])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      [5, 6, 7, 8, 9].forEach(r => { const cell = ws['B' + r]; if (cell) cell.z = XLSX_MONEY_FMT; });
      for (let i = 0; i < dm.buckets.length; i++) {
        const r = 11 + i;
        ['B', 'C', 'D'].forEach(col => { const cell = ws[col + r]; if (cell) cell.z = XLSX_MONEY_FMT; });
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Resumo Mensal');
      XLSX.writeFile(wb, `fluxo_de_caixa_resumido_${todayISO()}.xlsx`);
      toast('Excel resumido exportado.');
    } catch (e) { toast(e.message || 'Não foi possível gerar o Excel resumido.'); }
  };

  const exportPDFCompletoFn = () => exportFluxoPDF(d);
  const exportPDFResumoFn = async () => {
    try { exportFluxoPDFResumo(await fetchResumoMensal()); }
    catch (e) { toast(e.message || 'Não foi possível gerar o PDF resumido.'); }
  };

  // Um único botão por formato — pergunta Completo/Resumido num modal antes de exportar.
  const askCompletoOuResumido = (formato, onCompleto, onResumido) => {
    openModal(`Exportar ${formato}`,
      `<p style="font-size:13.5px; color:var(--ink-2)">Deseja o relatório <strong>completo</strong> (detalhado conforme a granularidade escolhida) ou o <strong>resumido</strong> (visão mensal com os alertas em destaque)?</p>`,
      [
        { label: 'Cancelar', onClick: closeModal },
        { label: 'Resumido', onClick: () => { closeModal(); onResumido(); } },
        { label: 'Completo', cls: 'primary', onClick: () => { closeModal(); onCompleto(); } }
      ]);
  };

  $('#fx-csv').onclick = () => askCompletoOuResumido('CSV', exportCSVCompleto, exportCSVResumo);
  $('#fx-xlsx').onclick = () => askCompletoOuResumido('Excel', exportXLSXCompleto, exportXLSXResumo);
  $('#fx-pdf').onclick = () => askCompletoOuResumido('PDF', exportPDFCompletoFn, exportPDFResumoFn);
  $('#fx-aporte').onclick = () => abrirSolicitacaoAporte(d);

  makeChart($('#ch-saldo'), {
    type: 'line',
    data: { labels: d.buckets.map(b => b.label), datasets: [
      { label: 'Saldo', data: d.buckets.map(b => b.saldo), borderColor: CORES.verde, backgroundColor: 'rgba(0,120,63,0.12)', fill: true, tension: .25, pointRadius: d.buckets.length > 40 ? 0 : 3 }
    ]},
    options: chartOpts({ scales: { x: { ticks: { maxTicksLimit: 10, font: { family: 'DM Sans' } }, grid: { display: false } },
      y: { ticks: { font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } } } })
  });

  makeChart($('#ch-entsai'), {
    type: 'bar',
    data: { labels: d.buckets.map(b => b.label), datasets: [
      { label: 'Entradas', data: d.buckets.map(b => b.entradas), backgroundColor: CORES.verdeMed, borderRadius: 4 },
      { label: 'Saídas', data: d.buckets.map(b => b.saidas), backgroundColor: CORES.vermelho, borderRadius: 4 }
    ]},
    options: chartOpts({ scales: { x: { ticks: { maxTicksLimit: 10, font: { family: 'DM Sans' } }, grid: { display: false } },
      y: { ticks: { font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } } } })
  });

  const CAT_COLORS = ['#00783F', '#3DAE43', '#1F4E78', '#6FBF87', '#4A78A8', '#A9CDB8', '#C9922A', '#8898A0', '#0B3B24', '#D3DFD8'];
  if (d.categorias.despesas.length) {
    makeChart($('#ch-desp'), {
      type: 'bar',
      data: { labels: d.categorias.despesas.map(x => x.category), datasets: [{ label: 'Despesas', data: d.categorias.despesas.map(x => x.total), backgroundColor: CAT_COLORS, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.x) } } },
        scales: { x: { ticks: { font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } }, y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } } }
    });
  }
  if (d.categorias.receitas.length) {
    makeChart($('#ch-rec'), {
      type: 'bar',
      data: { labels: d.categorias.receitas.map(x => x.category), datasets: [{ label: 'Receitas', data: d.categorias.receitas.map(x => x.total), backgroundColor: CAT_COLORS, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.x) } } },
        scales: { x: { ticks: { font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } }, y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } } }
    });
  }
}

// ============================================================
// SOLICITAÇÃO DE APORTE (Fluxo de Caixa)
// Documento para pedir recurso à matriz. O valor é o "aporte necessário"
// calculado no servidor para o PERÍODO FILTRADO (quanto zera o pior momento
// de caixa até a data final escolhida) — diferente do alerta da tela, que
// olha 90 dias fixos à frente. Os dois números aparecem no documento: o
// solicitado e, como contexto, o do horizonte de 90 dias, para a matriz ver
// se o pedido cobre só o período ou o risco inteiro.
// ============================================================
const APORTE_MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function abrirSolicitacaoAporte(d) {
  const necessario = d.aporte ? d.aporte.necessario : 0;
  const horizonte90 = d.alerta ? d.alerta.necessidade : 0;
  const cobreMenosQueRisco = horizonte90 > necessario + 0.005;

  openModal('Solicitação de aporte à matriz', `
    <p class="hint" style="margin-top:0">Baseada nos filtros aplicados na tela: período de <strong>${brDate(d.de)}</strong> a <strong>${brDate(d.ate)}</strong>${d.centroCusto ? ` · centro de custo <strong>${esc(d.centroCusto)}</strong>` : ''}.</p>
    <table class="via-resumo-tbl">
      <tr><td>Pior momento de caixa no período</td><td>${d.aporte && d.aporte.diaPior ? brDate(d.aporte.diaPior) : '—'}</td></tr>
      <tr><td>Saldo no pior momento</td><td class="${(d.aporte && d.aporte.piorSaldo) < 0 ? 'neg' : ''}">${brl(d.aporte ? d.aporte.piorSaldo : 0)}</td></tr>
      <tr style="font-weight:700; background:var(--verde-050)"><td>Aporte necessário no período</td><td style="font-size:16px">${brl(necessario)}</td></tr>
    </table>
    ${necessario <= 0
      ? `<div class="alert-item ok" style="margin:12px 0">✅ Neste período o caixa não fica negativo — não há aporte a solicitar. Você ainda pode gerar o documento (valor zero) se precisar registrar a análise.</div>`
      : cobreMenosQueRisco
        ? `<div class="alert-item warn" style="margin:12px 0">⚠️ Atenção: este pedido cobre <strong>até ${brDate(d.ate)}</strong>. Olhando 90 dias à frente (até ${brDate(d.alerta.horizonte)}), a necessidade sobe para <strong>${brl(horizonte90)}</strong>. Considere ampliar o período do filtro se quiser pedir de uma vez.</div>`
        : ''}
    ${fld('ap-valor', 'Valor a solicitar (R$) — ajuste se quiser arredondar', 'number', necessario ? necessario.toFixed(2) : '', 'step="0.01" min="0"')}
    ${fld('ap-solicitante', 'Solicitante', 'text', USER ? USER.name : '')}
    <div class="field"><label for="ap-just">Justificativa / observações (aparece no documento)</label>
      <textarea id="ap-just" rows="3" placeholder="Ex.: cobertura da operação de campo e folha do período; sem previsão de entradas relevantes."></textarea></div>
    <p class="hint">Escolha o formato e o nível de detalhe. O <strong>Resumido</strong> traz a necessidade e o resumo financeiro; o <strong>Completo</strong> inclui a evolução do saldo, as despesas por categoria e os títulos pendentes que formam o déficit.</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Excel', onClick: () => aporteEscolherModo(d, 'excel') },
      { label: 'PDF', cls: 'primary', onClick: () => aporteEscolherModo(d, 'pdf') }
    ], { wide: true });
}

// Guarda o que foi digitado antes de trocar de modal (o openModal seguinte
// substitui o corpo e perderia os campos).
function aporteColetarDados(d) {
  const valorInput = $('#ap-valor');
  const valor = valorInput ? Number(valorInput.value) : 0;
  return {
    valor: isFinite(valor) && valor >= 0 ? valor : (d.aporte ? d.aporte.necessario : 0),
    solicitante: $('#ap-solicitante') ? $('#ap-solicitante').value.trim() : (USER ? USER.name : ''),
    justificativa: $('#ap-just') ? $('#ap-just').value.trim() : ''
  };
}

function aporteEscolherModo(d, formato) {
  const dados = aporteColetarDados(d);
  openModal(`Solicitação de aporte — ${formato === 'pdf' ? 'PDF' : 'Excel'}`,
    `<p style="font-size:13.5px; color:var(--ink-2)">Deseja o documento <strong>completo</strong> (com evolução do saldo, despesas por categoria e títulos pendentes) ou <strong>resumido</strong> (necessidade e resumo financeiro)?</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Resumido', onClick: async () => { closeModal(); formato === 'pdf' ? await aportePDF(d, dados, false) : await aporteExcel(d, dados, false); } },
      { label: 'Completo', cls: 'primary', onClick: async () => { closeModal(); formato === 'pdf' ? await aportePDF(d, dados, true) : await aporteExcel(d, dados, true); } }
    ]);
}

// Todo valor negativo do relatório sai em vermelho e negrito: num pedido de
// aporte, o dia em que o caixa vira é justamente o que a matriz precisa achar
// na hora. Vale para qualquer célula, em qualquer tabela do documento.
// Só casa valor monetário negativo ("-R$ 244.344,54", "-1.234,56"). Não basta
// começar com "-": a descrição de um título pode começar com hífen e ficaria
// vermelha sem motivo.
const APORTE_NEGATIVO_RE = /^-\s*(R\$\s*)?\d[\d.]*(,\d+)?$/;
function aportePintarNegativos(hook) {
  if (hook.section !== 'body') return;
  if (APORTE_NEGATIVO_RE.test(String(hook.cell.raw == null ? '' : hook.cell.raw).trim())) {
    hook.cell.styles.textColor = [178, 58, 47];
    hook.cell.styles.fontStyle = 'bold';
  }
}

async function aportePDF(d, dados, completo) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114];
    const MARGIN = 14;
    const now = new Date();

    doc.setFillColor(...VERDE); doc.rect(0, 0, pageW, 3, 'F');

    // Cabeçalho: o logo fica centralizado verticalmente em relação ao bloco de
    // texto (título + as duas linhas de identificação). Antes era fixo em y=10,
    // preso ao topo, enquanto o texto descia até y=28 — o logo parecia solto,
    // desalinhado das letras. As medidas são calculadas a partir dos próprios
    // tamanhos de fonte, então continuam certas se o cabeçalho mudar.
    const TIT_BASE = 18, LIN1_BASE = 23.5, LIN2_BASE = 28;
    const mm = pt => pt / 72 * 25.4;
    const topoTexto = TIT_BASE - mm(16) * 0.717;   // altura de caixa alta do título
    const baseTexto = LIN2_BASE + mm(8.5) * 0.21;  // descida da última linha
    const logoW = 30, logoH = logoW * (139 / 600);
    const logoY = (topoTexto + baseTexto) / 2 - logoH / 2;
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', pageW - MARGIN - logoW, logoY, logoW, logoH);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 38, 32);
    doc.text('Solicitação de Aporte', MARGIN, TIT_BASE);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
    doc.text(`${COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME}`, MARGIN, LIN1_BASE);
    doc.text(`Emitida em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${dados.solicitante || (USER ? USER.name : '')}`, MARGIN, LIN2_BASE);
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(MARGIN, 31, pageW - MARGIN, 31);

    let y = 38;
    // Valor solicitado em destaque — é a informação que a matriz precisa ver primeiro.
    doc.setFillColor(...VERDE_CLARO); doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...VERDE);
    doc.text('VALOR SOLICITADO', MARGIN + 6, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text(brl(dados.valor), MARGIN + 6, y + 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
    doc.text(`Período considerado: ${brDate(d.de)} a ${brDate(d.ate)}`, pageW - MARGIN - 6, y + 12, { align: 'right' });
    y += 30;

    doc.autoTable({
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'grid',
      body: [
        ['Período analisado', `${brDate(d.de)} a ${brDate(d.ate)}`],
        ['Centro de custo', d.centroCusto || 'Todos'],
        ['Pior momento de caixa no período', d.aporte && d.aporte.diaPior ? brDate(d.aporte.diaPior) : '—'],
        ['Saldo no pior momento', brl(d.aporte ? d.aporte.piorSaldo : 0)],
        ['Aporte necessário (calculado)', brl(d.aporte ? d.aporte.necessario : 0)],
        ['Necessidade em 90 dias (contexto)', `${brl(d.alerta.necessidade)} — até ${brDate(d.alerta.horizonte)}`]
      ],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: [40, 46, 42] },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: VERDE_CLARO, cellWidth: 72 }, 1: { halign: 'right' } },
      didParseCell: aportePintarNegativos
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
    doc.text('Resumo financeiro do período', MARGIN, y); y += 5;
    doc.autoTable({
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Indicador', 'Valor']],
      body: [
        ['Saldo inicial do período', brl(d.resumo.saldoInicial)],
        ['Total de entradas', brl(d.resumo.totalEntradas)],
        ['Total de saídas', brl(d.resumo.totalSaidas)],
        ['Saldo bancário atual (hoje)', brl(d.resumo.saldoAtual)],
        ['Saldo ao fim do período', brl(d.aporte ? d.aporte.saldoFinalPeriodo : 0)],
        ['Saldo previsto (todo o pendente)', brl(d.resumo.saldoPrevisto)]
      ],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: VERDE, textColor: 255 },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: aportePintarNegativos
    });
    y = doc.lastAutoTable.finalY + 8;

    if (dados.justificativa) {
      if (y > pageH - 45) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
      doc.text('Justificativa', MARGIN, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 46, 42);
      const linhas = doc.splitTextToSize(dados.justificativa, pageW - MARGIN * 2 - 6);
      const alturaBox = Math.max(12, linhas.length * 4.5 + 6);
      doc.setDrawColor(210, 218, 213); doc.rect(MARGIN, y, pageW - MARGIN * 2, alturaBox);
      doc.text(linhas, MARGIN + 3, y + 6);
      y += alturaBox + 8;
    }

    if (completo) {
      const secao = (titulo, head, body, colStyles, foot) => {
        if (!body.length) return;
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
        doc.text(titulo, MARGIN, y); y += 5;
        doc.autoTable({
          startY: y, margin: { left: MARGIN, right: MARGIN }, head: [head], body,
          foot: foot ? [foot] : undefined,
          styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: VERDE, textColor: 255, fontSize: 8 },
          footStyles: { fillColor: VERDE_CLARO, textColor: [30, 38, 32], fontStyle: 'bold', fontSize: 8 },
          columnStyles: colStyles || {},
          didParseCell: aportePintarNegativos
        });
        y = doc.lastAutoTable.finalY + 8;
      };

      secao('Evolução do saldo no período', ['Período', 'Entradas', 'Saídas', 'Saldo acumulado'],
        d.buckets.map(b => [b.label, brl(b.entradas), brl(b.saidas), brl(b.saldo)]),
        { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } });

      secao('Despesas por categoria no período', ['Categoria', 'Total'],
        d.categorias.despesas.map(x => [x.category, brl(x.total)]),
        { 1: { halign: 'right', cellWidth: 34 } });

      if (d.categorias.receitas.length) {
        secao('Receitas por categoria no período', ['Categoria', 'Total'],
          d.categorias.receitas.map(x => [x.category, brl(x.total)]),
          { 1: { halign: 'right', cellWidth: 34 } });
      }

      // Relação COMPLETA do que vence no período filtrado (só pendentes — pago e
      // baixado ficam de fora). Antes vinha de `d.futuras`, que traz os 20
      // próximos pendentes de qualquer data: mostrava 20 de 97 títulos e não
      // respeitava o período do relatório.
      const pend = d.pendentesPeriodo || { pagar: [], receber: [], totalPagar: 0, totalReceber: 0 };
      secao(`Contas a pagar no período (${pend.pagar.length} título${pend.pagar.length === 1 ? '' : 's'} em aberto)`,
        ['Vencimento', 'Fornecedor / descrição', 'Centro de custo', 'Valor'],
        pend.pagar.map(r => [brDate(r.due_date), `${r.party ? r.party + ' — ' : ''}${r.description}`, r.cost_center || '—', brl(r.amount)]),
        { 0: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 26 } },
        ['', 'Total a pagar no período', '', brl(pend.totalPagar)]);

      if (pend.receber.length) {
        secao(`Contas a receber no período (${pend.receber.length} título${pend.receber.length === 1 ? '' : 's'} em aberto)`,
          ['Vencimento', 'Cliente / descrição', 'Valor'],
          pend.receber.map(r => [brDate(r.due_date), `${r.client_name ? r.client_name + ' — ' : ''}${r.description}`, brl(r.amount)]),
          { 0: { cellWidth: 22 }, 2: { halign: 'right', cellWidth: 26 } },
          ['', 'Total a receber no período', brl(pend.totalReceber)]);
      }
    }

    if (y > pageH - 32) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CINZA);
    const nota = doc.splitTextToSize('Valor calculado a partir dos títulos de Contas a Pagar e Contas a Receber lançados no ERP na data de emissão, considerando a data de pagamento/recebimento quando já realizado e a de vencimento quando pendente. Alterações posteriores nos lançamentos mudam a necessidade apurada.', pageW - MARGIN * 2);
    doc.text(nota, MARGIN, y); y += nota.length * 4 + 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 46, 42);
    doc.text(`Solicitado por ${dados.solicitante || (USER ? USER.name : '')} em ${now.toLocaleDateString('pt-BR')}`, MARGIN, y);

    doc.save(`solicitacao_aporte_${completo ? 'completo' : 'resumido'}_${d.de}_a_${d.ate}.pdf`);
    toast('Solicitação de aporte gerada em PDF.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}

// Paleta e medidas da identidade ProAgro nas planilhas — os mesmos valores do
// CSS e dos PDFs, em ARGB (formato que o Excel usa).
const APORTE_XL = {
  verde: 'FF00783F', verdeEscuro: 'FF005C30', verdeClaro: 'FFEAF4EE',
  ink: 'FF1A2B22', ink2: 'FF43554B', muted: 'FF74847B',
  linha: 'FFD2DAD5', branco: 'FFFFFFFF', zebra: 'FFF7FAF8', vermelho: 'FFB23A2F'
};
const XL_FONTE = 'Calibri';
const xlBordaFina = { style: 'thin', color: { argb: APORTE_XL.linha } };
const xlTodasBordas = { top: xlBordaFina, left: xlBordaFina, bottom: xlBordaFina, right: xlBordaFina };

// Largura de coluna do Excel -> pixels. A unidade do Excel é "quantos caracteres
// da fonte padrão cabem"; a conversão usada pelo próprio formato é 7px por
// caractere + 5px de padding da célula.
const xlLarguraPx = w => Math.round(w * 7 + 5);
// Converte uma posição horizontal em pixels para índice de coluna fracionário,
// que é o que o ExcelJS aceita como âncora de imagem. É isso que permite
// alinhar o logo à direita sem depender de QUANTAS colunas a aba tem.
function aporteXlColunaEmX(larguras, x) {
  let acc = 0;
  for (let i = 0; i < larguras.length; i++) {
    const w = xlLarguraPx(larguras[i]);
    if (acc + w > x) return i + (x - acc) / w;
    acc += w;
  }
  return larguras.length;
}

// Cabeçalho de marca, igual em todas as abas: faixa verde, logo alinhado à
// direita numa FAIXA PRÓPRIA (linhas 2-3, sem nenhum texto) e, abaixo, o bloco
// de identificação. O logo ficava ancorado por contagem de colunas
// (`ultimaCol - 2`), então em abas estreitas — "Por categoria" tem 2 colunas —
// caía em cima do título. Agora a âncora vem da largura real em pixels, e o
// texto nunca divide linha com a imagem. Devolve a linha onde o conteúdo começa.
// `titulo` é o nome que aparece em destaque na aba. Ele era fixo em
// "Solicitação de Aporte", que é de onde este cabeçalho saiu — e por isso as
// seis abas do fechamento de Viáticos nasceram todas com o nome errado. Agora
// cada aba diz o que ela é; o padrão mantém o Aporte como estava.
function aporteXlCabecalho(wb, ws, subtitulo, idLogo, colunasLargura, titulo = 'Solicitação de Aporte') {
  ws.columns = colunasLargura.map(w => ({ width: w }));
  const letraFim = ws.getColumn(colunasLargura.length).letter;
  const larguraTotal = colunasLargura.reduce((s, w) => s + xlLarguraPx(w), 0);

  // faixa verde fina no topo, como a barra dos PDFs
  ws.mergeCells(`A1:${letraFim}1`);
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verde } };
  ws.getRow(1).height = 6;

  // O título e o logo dividem a mesma faixa. Antes havia duas linhas de 18pt
  // reservadas só para a imagem: na planilha aberta elas apareciam vazias e
  // empurravam o logo para cima do bloco de texto, desalinhado. O logo passou a
  // ser ancorado sobre as próprias linhas do título, à direita — o texto fica na
  // coluna A e a imagem na outra ponta, então não se encavalam.
  const MARGEM = 8;
  let logoW = 150, logoH = 35;
  if (larguraTotal < logoW + MARGEM * 2) {           // aba muito estreita: reduz
    logoW = Math.max(70, larguraTotal - MARGEM * 2);
    logoH = Math.round(logoW * (139 / 600));
  }

  ws.getCell('A2').value = titulo;
  ws.getCell('A2').font = { name: XL_FONTE, size: 18, bold: true, color: { argb: APORTE_XL.ink } };
  ws.getRow(2).height = 26;
  ws.getCell('A3').value = COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME;
  ws.getCell('A3').font = { name: XL_FONTE, size: 9, color: { argb: APORTE_XL.muted } };
  ws.getCell('A4').value = subtitulo;
  ws.getCell('A4').font = { name: XL_FONTE, size: 9, color: { argb: APORTE_XL.muted } };

  if (idLogo != null) {
    ws.addImage(idLogo, {
      tl: { col: aporteXlColunaEmX(colunasLargura, Math.max(0, larguraTotal - MARGEM - logoW)), row: 1.15 },
      ext: { width: logoW, height: logoH }
    });
  }

  // linha divisória
  ws.mergeCells(`A5:${letraFim}5`);
  ws.getCell('A5').border = { bottom: { style: 'medium', color: { argb: APORTE_XL.verde } } };
  ws.getRow(5).height = 4;
  return 7;
}

// Faixa de título de tabela (verde, texto branco).
function aporteXlTituloTabela(ws, linha, texto, nCols) {
  ws.mergeCells(linha, 1, linha, nCols);
  const c = ws.getCell(linha, 1);
  c.value = texto;
  c.font = { name: XL_FONTE, size: 11, bold: true, color: { argb: APORTE_XL.branco } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verde } };
  c.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(linha).height = 20;
}

// Linha de cabeçalho de colunas (verde escuro, texto branco).
function aporteXlCabecalhoColunas(ws, linha, rotulos, alinhamentos) {
  rotulos.forEach((r, i) => {
    const c = ws.getCell(linha, i + 1);
    c.value = r;
    c.font = { name: XL_FONTE, size: 9.5, bold: true, color: { argb: APORTE_XL.branco } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verdeEscuro } };
    c.alignment = { vertical: 'middle', horizontal: (alinhamentos && alinhamentos[i]) || 'left', wrapText: true };
    c.border = xlTodasBordas;
  });
  ws.getRow(linha).height = 18;
}

// Corpo de tabela com zebra, bordas, moeda e negativos em vermelho.
function aporteXlCorpo(ws, linhaInicial, linhas, colsMoeda, alinhamentos) {
  linhas.forEach((valores, idx) => {
    const linha = linhaInicial + idx;
    valores.forEach((v, i) => {
      const c = ws.getCell(linha, i + 1);
      c.value = v;
      c.font = { name: XL_FONTE, size: 9.5, color: { argb: APORTE_XL.ink2 } };
      c.border = xlTodasBordas;
      c.alignment = { vertical: 'middle', horizontal: (alinhamentos && alinhamentos[i]) || 'left' };
      if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.zebra } };
      if (colsMoeda && colsMoeda.includes(i) && typeof v === 'number') {
        c.numFmt = APORTE_MONEY_FMT;
        if (v < 0) c.font = { name: XL_FONTE, size: 9.5, bold: true, color: { argb: APORTE_XL.vermelho } };
      }
    });
  });
  return linhaInicial + linhas.length;
}

// Linha de total: fundo verde-claro, negrito.
function aporteXlTotal(ws, linha, valores, colsMoeda, alinhamentos) {
  valores.forEach((v, i) => {
    const c = ws.getCell(linha, i + 1);
    c.value = v;
    c.font = { name: XL_FONTE, size: 10, bold: true, color: { argb: APORTE_XL.ink } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verdeClaro } };
    c.border = { ...xlTodasBordas, top: { style: 'medium', color: { argb: APORTE_XL.verde } } };
    c.alignment = { vertical: 'middle', horizontal: (alinhamentos && alinhamentos[i]) || 'left' };
    if (colsMoeda && colsMoeda.includes(i) && typeof v === 'number') {
      c.numFmt = APORTE_MONEY_FMT;
      if (v < 0) c.font = { name: XL_FONTE, size: 10, bold: true, color: { argb: APORTE_XL.vermelho } };
    }
  });
}

// Isolado numa função para o teste poder interceptar o download sem gravar nada
// em disco (o writeFile do SheetJS baixa direto, e foi de onde vieram arquivos
// de teste na pasta do usuário antes).
function aporteBaixarPlanilha(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Excel da Solicitação de Aporte com a identidade da ProAgro. Se o ExcelJS não
// tiver carregado, cai na versão sem estilo (SheetJS) em vez de falhar: melhor
// entregar a planilha simples do que não entregar.
async function aporteExcel(d, dados, completo) {
  if (!window.ExcelJS) return aporteExcelSimples(d, dados, completo);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME;
    wb.created = new Date();
    const now = new Date();
    const subtitulo = `Emitida em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${dados.solicitante || (USER ? USER.name : '')}`;
    const idLogo = wb.addImage({ base64: LOGO_PROAGRO_PNG, extension: 'png' });
    const pend = d.pendentesPeriodo || { pagar: [], receber: [], totalPagar: 0, totalReceber: 0 };

    // ---------- Aba 1: Solicitação ----------
    const ws = wb.addWorksheet('Solicitação', { views: [{ showGridLines: false }] });
    let L = aporteXlCabecalho(wb, ws, subtitulo, idLogo, [46, 26]);

    // Valor solicitado em destaque
    ws.mergeCells(L, 1, L, 2);
    const cLabel = ws.getCell(L, 1);
    cLabel.value = 'VALOR SOLICITADO';
    cLabel.font = { name: XL_FONTE, size: 9, bold: true, color: { argb: APORTE_XL.verde } };
    cLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verdeClaro } };
    cLabel.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(L).height = 16;
    L++;
    ws.mergeCells(L, 1, L, 2);
    const cValor = ws.getCell(L, 1);
    cValor.value = dados.valor;
    cValor.numFmt = APORTE_MONEY_FMT;
    cValor.font = { name: XL_FONTE, size: 22, bold: true, color: { argb: APORTE_XL.verde } };
    cValor.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APORTE_XL.verdeClaro } };
    cValor.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(L).height = 32;
    L += 2;

    aporteXlTituloTabela(ws, L, 'Dados da solicitação', 2); L++;
    aporteXlCabecalhoColunas(ws, L, ['Indicador', 'Valor'], ['left', 'right']); L++;
    L = aporteXlCorpo(ws, L, [
      ['Período analisado', `${brDate(d.de)} a ${brDate(d.ate)}`],
      ['Centro de custo', d.centroCusto || 'Todos'],
      ['Pior momento de caixa no período', d.aporte && d.aporte.diaPior ? brDate(d.aporte.diaPior) : '—'],
      ['Saldo no pior momento', d.aporte ? d.aporte.piorSaldo : 0],
      ['Aporte necessário (calculado)', d.aporte ? d.aporte.necessario : 0],
      ['Necessidade em 90 dias (contexto)', d.alerta.necessidade],
      ['Horizonte dos 90 dias', brDate(d.alerta.horizonte)]
    ], [1], ['left', 'right']);
    L += 1;

    aporteXlTituloTabela(ws, L, 'Resumo financeiro do período', 2); L++;
    aporteXlCabecalhoColunas(ws, L, ['Indicador', 'Valor'], ['left', 'right']); L++;
    L = aporteXlCorpo(ws, L, [
      ['Saldo inicial do período', d.resumo.saldoInicial],
      ['Total de entradas', d.resumo.totalEntradas],
      ['Total de saídas', d.resumo.totalSaidas],
      ['Saldo bancário atual (hoje)', d.resumo.saldoAtual],
      ['Saldo ao fim do período', d.aporte ? d.aporte.saldoFinalPeriodo : 0],
      ['Saldo previsto (todo o pendente)', d.resumo.saldoPrevisto]
    ], [1], ['left', 'right']);
    L += 1;

    if (dados.justificativa) {
      aporteXlTituloTabela(ws, L, 'Justificativa', 2); L++;
      ws.mergeCells(L, 1, L + 2, 2);
      const cj = ws.getCell(L, 1);
      cj.value = dados.justificativa;
      cj.font = { name: XL_FONTE, size: 9.5, color: { argb: APORTE_XL.ink2 } };
      cj.alignment = { vertical: 'top', wrapText: true, indent: 1 };
      cj.border = xlTodasBordas;
      L += 4;
    }

    ws.mergeCells(L, 1, L + 1, 2);
    const cNota = ws.getCell(L, 1);
    cNota.value = 'Valor calculado a partir dos títulos de Contas a Pagar e Contas a Receber lançados no ERP na data de emissão, considerando a data de pagamento/recebimento quando já realizado e a de vencimento quando pendente. Alterações posteriores nos lançamentos mudam a necessidade apurada.';
    cNota.font = { name: XL_FONTE, size: 8, italic: true, color: { argb: APORTE_XL.muted } };
    cNota.alignment = { vertical: 'top', wrapText: true };

    if (completo) {
      // ---------- Aba 2: Evolução do saldo ----------
      const wsF = wb.addWorksheet('Evolução do saldo', { views: [{ showGridLines: false }] });
      let F = aporteXlCabecalho(wb, wsF, subtitulo, idLogo, [18, 18, 18, 20]);
      aporteXlTituloTabela(wsF, F, `Evolução do saldo — ${brDate(d.de)} a ${brDate(d.ate)}`, 4); F++;
      const cabF = F;
      aporteXlCabecalhoColunas(wsF, F, ['Período', 'Entradas', 'Saídas', 'Saldo acumulado'], ['left', 'right', 'right', 'right']); F++;
      aporteXlCorpo(wsF, F, d.buckets.map(b => [b.label, b.entradas, b.saidas, b.saldo]), [1, 2, 3], ['left', 'right', 'right', 'right']);
      wsF.views = [{ state: 'frozen', ySplit: cabF, showGridLines: false }];

      // ---------- Aba 3: Por categoria ----------
      const wsC = wb.addWorksheet('Por categoria', { views: [{ showGridLines: false }] });
      let C = aporteXlCabecalho(wb, wsC, subtitulo, idLogo, [40, 20]);
      aporteXlTituloTabela(wsC, C, 'Despesas por categoria no período', 2); C++;
      aporteXlCabecalhoColunas(wsC, C, ['Categoria', 'Total'], ['left', 'right']); C++;
      C = aporteXlCorpo(wsC, C, d.categorias.despesas.map(x => [x.category, x.total]), [1], ['left', 'right']);
      aporteXlTotal(wsC, C, ['Total de despesas', d.categorias.despesas.reduce((s, x) => s + x.total, 0)], [1], ['left', 'right']);
      C += 2;
      if (d.categorias.receitas.length) {
        aporteXlTituloTabela(wsC, C, 'Receitas por categoria no período', 2); C++;
        aporteXlCabecalhoColunas(wsC, C, ['Categoria', 'Total'], ['left', 'right']); C++;
        C = aporteXlCorpo(wsC, C, d.categorias.receitas.map(x => [x.category, x.total]), [1], ['left', 'right']);
        aporteXlTotal(wsC, C, ['Total de receitas', d.categorias.receitas.reduce((s, x) => s + x.total, 0)], [1], ['left', 'right']);
      }

      // ---------- Aba 4: Contas a pagar do período ----------
      const wsP = wb.addWorksheet('Contas a pagar do período', { views: [{ showGridLines: false }] });
      let P = aporteXlCabecalho(wb, wsP, subtitulo, idLogo, [13, 36, 44, 22, 22, 16]);
      aporteXlTituloTabela(wsP, P, `Contas a pagar no período (${brDate(d.de)} a ${brDate(d.ate)}) — somente títulos em aberto`, 6); P++;
      const cabP = P;
      aporteXlCabecalhoColunas(wsP, P, ['Vencimento', 'Fornecedor', 'Descrição', 'Categoria', 'Centro de custo', 'Valor'],
        ['center', 'left', 'left', 'left', 'left', 'right']); P++;
      const primeiraP = P;
      P = aporteXlCorpo(wsP, P, pend.pagar.map(r => [brDate(r.due_date), r.party || '—', r.description, r.category || '—', r.cost_center || '—', r.amount]),
        [5], ['center', 'left', 'left', 'left', 'left', 'right']);
      aporteXlTotal(wsP, P, ['', '', '', '', `Total (${pend.pagar.length} título${pend.pagar.length === 1 ? '' : 's'})`, pend.totalPagar], [5],
        ['left', 'left', 'left', 'left', 'right', 'right']);
      wsP.views = [{ state: 'frozen', ySplit: cabP, showGridLines: false }];
      if (pend.pagar.length) wsP.autoFilter = { from: { row: cabP, column: 1 }, to: { row: P - 1, column: 6 } };

      // ---------- Aba 5: Contas a receber (só se houver) ----------
      if (pend.receber.length) {
        const wsR = wb.addWorksheet('Contas a receber do período', { views: [{ showGridLines: false }] });
        let R = aporteXlCabecalho(wb, wsR, subtitulo, idLogo, [13, 30, 50, 16]);
        aporteXlTituloTabela(wsR, R, `Contas a receber no período (${brDate(d.de)} a ${brDate(d.ate)}) — somente títulos em aberto`, 4); R++;
        const cabR = R;
        aporteXlCabecalhoColunas(wsR, R, ['Vencimento', 'Cliente', 'Descrição', 'Valor'], ['center', 'left', 'left', 'right']); R++;
        R = aporteXlCorpo(wsR, R, pend.receber.map(r => [brDate(r.due_date), r.client_name || '—', r.description, r.amount]), [3],
          ['center', 'left', 'left', 'right']);
        aporteXlTotal(wsR, R, ['', '', `Total (${pend.receber.length} título${pend.receber.length === 1 ? '' : 's'})`, pend.totalReceber], [3],
          ['left', 'left', 'right', 'right']);
        wsR.views = [{ state: 'frozen', ySplit: cabR, showGridLines: false }];
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    aporteBaixarPlanilha(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `solicitacao_aporte_${completo ? 'completo' : 'resumido'}_${d.de}_a_${d.ate}.xlsx`);
    toast('Solicitação de aporte gerada em Excel.');
  } catch (e) {
    console.error(e);
    toast('Não foi possível gerar o Excel formatado: ' + e.message + ' — gerando a versão simples.');
    aporteExcelSimples(d, dados, completo);
  }
}

// Versão sem estilo (SheetJS), mantida como reserva caso o ExcelJS não carregue.
function aporteExcelSimples(d, dados, completo) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  try {
    const wb = XLSX.utils.book_new();
    const now = new Date();

    const linhas = [
      ['SOLICITAÇÃO DE APORTE'],
      [COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME],
      [`Emitida em ${now.toLocaleDateString('pt-BR')} por ${dados.solicitante || (USER ? USER.name : '')}`],
      [],
      ['Valor solicitado', dados.valor],
      ['Período analisado', `${brDate(d.de)} a ${brDate(d.ate)}`],
      ['Centro de custo', d.centroCusto || 'Todos'],
      ['Pior momento de caixa no período', d.aporte && d.aporte.diaPior ? brDate(d.aporte.diaPior) : '—'],
      ['Saldo no pior momento', d.aporte ? d.aporte.piorSaldo : 0],
      ['Aporte necessário (calculado)', d.aporte ? d.aporte.necessario : 0],
      ['Necessidade em 90 dias (contexto)', d.alerta.necessidade],
      ['Horizonte dos 90 dias', brDate(d.alerta.horizonte)],
      [],
      ['RESUMO FINANCEIRO DO PERÍODO'],
      ['Saldo inicial do período', d.resumo.saldoInicial],
      ['Total de entradas', d.resumo.totalEntradas],
      ['Total de saídas', d.resumo.totalSaidas],
      ['Saldo bancário atual (hoje)', d.resumo.saldoAtual],
      ['Saldo ao fim do período', d.aporte ? d.aporte.saldoFinalPeriodo : 0],
      ['Saldo previsto (todo o pendente)', d.resumo.saldoPrevisto]
    ];
    if (dados.justificativa) linhas.push([], ['JUSTIFICATIVA'], [dados.justificativa]);

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    // Formata como moeda as células de valor (coluna B) das linhas monetárias.
    [5, 9, 10, 11, 15, 16, 17, 18, 19, 20].forEach(r => { const cel = ws['B' + r]; if (cel && typeof cel.v === 'number') cel.z = APORTE_MONEY_FMT; });
    ws['!cols'] = [{ wch: 38 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitação');

    if (completo) {
      const wsFluxo = XLSX.utils.aoa_to_sheet([
        ['Período', 'Entradas', 'Saídas', 'Saldo acumulado'],
        ...d.buckets.map(b => [b.label, b.entradas, b.saidas, b.saldo])
      ]);
      for (let i = 0; i < d.buckets.length; i++) {
        ['B', 'C', 'D'].forEach(cl => { const cel = wsFluxo[cl + (i + 2)]; if (cel) cel.z = APORTE_MONEY_FMT; });
      }
      wsFluxo['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsFluxo, 'Evolução do saldo');

      const wsCat = XLSX.utils.aoa_to_sheet([
        ['DESPESAS POR CATEGORIA'], ['Categoria', 'Total'],
        ...d.categorias.despesas.map(x => [x.category, x.total]),
        [], ['RECEITAS POR CATEGORIA'], ['Categoria', 'Total'],
        ...d.categorias.receitas.map(x => [x.category, x.total])
      ]);
      Object.keys(wsCat).filter(k => /^B\d+$/.test(k)).forEach(k => { if (typeof wsCat[k].v === 'number') wsCat[k].z = APORTE_MONEY_FMT; });
      wsCat['!cols'] = [{ wch: 34 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsCat, 'Por categoria');

      // Relação completa do que vence no período (só pendentes), não os "20
       // próximos de qualquer data" que vinham de `d.futuras`.
      const pend = d.pendentesPeriodo || { pagar: [], receber: [], totalPagar: 0, totalReceber: 0 };
      const linhasTit = [
        [`CONTAS A PAGAR NO PERÍODO (${brDate(d.de)} a ${brDate(d.ate)}) — SOMENTE EM ABERTO`],
        ['Vencimento', 'Fornecedor', 'Descrição', 'Categoria', 'Centro de custo', 'Valor'],
        ...pend.pagar.map(r => [brDate(r.due_date), r.party || '', r.description, r.category || '', r.cost_center || '', r.amount]),
        ['', '', '', '', `Total (${pend.pagar.length} título${pend.pagar.length === 1 ? '' : 's'})`, pend.totalPagar]
      ];
      if (pend.receber.length) {
        linhasTit.push(
          [], [`CONTAS A RECEBER NO PERÍODO (${brDate(d.de)} a ${brDate(d.ate)}) — SOMENTE EM ABERTO`],
          ['Vencimento', 'Cliente', 'Descrição', 'Valor'],
          ...pend.receber.map(r => [brDate(r.due_date), r.client_name || '', r.description, r.amount]),
          ['', '', `Total (${pend.receber.length} título${pend.receber.length === 1 ? '' : 's'})`, pend.totalReceber]
        );
      }
      const wsTit = XLSX.utils.aoa_to_sheet(linhasTit);
      // Formata qualquer célula numérica — mais robusto que fixar letras de
      // coluna, já que os dois blocos têm larguras diferentes.
      Object.keys(wsTit).forEach(k => { if (k[0] !== '!' && typeof wsTit[k].v === 'number') wsTit[k].z = APORTE_MONEY_FMT; });
      wsTit['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 44 }, { wch: 22 }, { wch: 22 }, { wch: 16 }];
      wsTit['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: 1 + pend.pagar.length, c: 5 } }) };
      XLSX.utils.book_append_sheet(wb, wsTit, 'Contas a pagar do período');
    }

    XLSX.writeFile(wb, `solicitacao_aporte_${completo ? 'completo' : 'resumido'}_${d.de}_a_${d.ate}.xlsx`);
    toast('Solicitação de aporte gerada em Excel.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o Excel: ' + e.message);
  }
}

// Exporta o Fluxo de Caixa (resumo + tabela do período) em PDF, com o mesmo
// padrão corporativo usado no relatório de Contas a Pagar.
async function exportFluxoPDF(d) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114];
    const MARGIN = 12;

    doc.setFillColor(...VERDE); doc.rect(0, 0, pageW, 3, 'F');
    const logoW = 34, logoH = logoW * (139 / 600);
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', MARGIN, 11, logoW, logoH);
    doc.setTextColor(30, 38, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text('PROAGRO BRASIL', MARGIN + logoW + 6, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
    doc.text('ERP Financeiro · Módulo Fluxo de Caixa', MARGIN + logoW + 6, 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...VERDE);
    doc.text('Relatório de Fluxo de Caixa', pageW - MARGIN, 15, { align: 'right' });
    const now = new Date();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
    doc.text(`Período: ${brDate(d.de)} a ${brDate(d.ate)} · Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`, pageW - MARGIN, 20.5, { align: 'right' });
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(MARGIN, 25, pageW - MARGIN, 25);

    doc.setFillColor(...VERDE_CLARO);
    doc.roundedRect(MARGIN, 29, pageW - MARGIN * 2, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...VERDE);
    doc.text(`Saldo inicial: ${brl(d.resumo.saldoInicial)}   ·   Entradas: ${brl(d.resumo.totalEntradas)}   ·   Saídas: ${brl(d.resumo.totalSaidas)}   ·   Saldo atual: ${brl(d.resumo.saldoAtual)}   ·   Saldo previsto: ${brl(d.resumo.saldoPrevisto)}`, MARGIN + 5, 38);

    doc.autoTable({
      startY: 50,
      head: [['Data', 'Entradas', 'Saídas', 'Saldo']],
      body: d.buckets.map(b => [b.label, brl(b.entradas), brl(b.saidas), brl(b.saldo)]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
      alternateRowStyles: { fillColor: VERDE_CLARO },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 3 && d.buckets[hook.row.index] && d.buckets[hook.row.index].saldo < 0) {
          hook.cell.styles.textColor = [178, 58, 47];
          hook.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => {
        const pageH = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...VERDE); doc.setLineWidth(0.4);
        doc.line(MARGIN, pageH - 14, pageW - MARGIN, pageH - 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
        doc.text(COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME, MARGIN, pageH - 9);
        doc.text('Documento de uso interno — gerado automaticamente pelo ERP Financeiro.', MARGIN, pageH - 5.5);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - MARGIN, pageH - 7, { align: 'right' });
      }
    });

    doc.save(`fluxo_de_caixa_completo_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}

// Versão simplificada: resumo mensal (independente da granularidade escolhida
// na tela) com os alertas em destaque — pensada para uma leitura rápida por
// quem não precisa do detalhe dia a dia.
async function exportFluxoPDFResumo(dm) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114], VERMELHO = [178, 58, 47];
    const MARGIN = 14;

    doc.setFillColor(...VERDE); doc.rect(0, 0, pageW, 3, 'F');
    const logoW = 32, logoH = logoW * (139 / 600);
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', MARGIN, 11, logoW, logoH);
    doc.setTextColor(30, 38, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('PROAGRO BRASIL', MARGIN + logoW + 6, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text('ERP Financeiro · Fluxo de Caixa', MARGIN + logoW + 6, 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...VERDE);
    doc.text('Relatório de Fluxo de Caixa Resumido', pageW - MARGIN, 15, { align: 'right' });
    const now = new Date();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(`Período: ${brDate(dm.de)} a ${brDate(dm.ate)}  ·  Gerado em ${now.toLocaleDateString('pt-BR')} por ${USER.name}`, pageW - MARGIN, 20.5, { align: 'right' });
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(MARGIN, 25, pageW - MARGIN, 25);

    // Alerta em destaque — o ponto central do relatório resumido.
    // (Sem emojis: a fonte padrão do jsPDF não tem esses glifos e imprime lixo no lugar.)
    let y = 32;
    const alertRed = !!dm.alerta.diaCritico;
    const alertText = alertRed
      ? `Alerta: o saldo de caixa fica negativo a partir de ${brDate(dm.alerta.diaCritico)}, chegando ao pior momento em ${brDate(dm.alerta.diaPior)}, quando faltariam ${brl(dm.alerta.necessidade)}. Esse é o aporte mínimo necessário para o caixa não faltar até ${brDate(dm.alerta.horizonte)}.`
      : `Sem risco de saldo negativo previsto até ${brDate(dm.alerta.horizonte)}, considerando os títulos já lançados.`;
    const boxW = pageW - MARGIN * 2, boxPad = 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const alertLines = doc.splitTextToSize(alertText, boxW - boxPad * 2);
    const lineH = 5;
    const boxH = boxPad * 2 + alertLines.length * lineH;
    doc.setFillColor(...(alertRed ? [251, 234, 231] : VERDE_CLARO));
    doc.roundedRect(MARGIN, y, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(...(alertRed ? VERMELHO : VERDE));
    alertLines.forEach((line, i) => doc.text(line, MARGIN + boxPad, y + boxPad + 3 + i * lineH));
    y += boxH + 8;

    // Resumo financeiro
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 38, 32);
    doc.text('Resumo financeiro', MARGIN, y); y += 6;
    const kpis = [
      ['Saldo inicial do período', dm.resumo.saldoInicial],
      ['Total de entradas', dm.resumo.totalEntradas],
      ['Total de saídas', dm.resumo.totalSaidas],
      ['Saldo atual (real, hoje)', dm.resumo.saldoAtual],
      ['Saldo previsto (c/ pendentes)', dm.resumo.saldoPrevisto]
    ];
    doc.autoTable({
      startY: y, margin: { left: MARGIN, right: MARGIN }, tableWidth: pageW - MARGIN * 2,
      body: kpis.map(([label, val]) => [label, brl(val)]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: hook => {
        if (hook.column.index === 1 && kpis[hook.row.index][1] < 0) hook.cell.styles.textColor = VERMELHO;
      }
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 38, 32);
    doc.text('Evolução mensal', MARGIN, y); y += 4;

    doc.autoTable({
      startY: y,
      head: [['Mês', 'Entradas', 'Saídas', 'Saldo']],
      body: dm.buckets.map(b => [b.label, brl(b.entradas), brl(b.saidas), brl(b.saldo)]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: VERDE_CLARO },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 3 && dm.buckets[hook.row.index] && dm.buckets[hook.row.index].saldo < 0) {
          hook.cell.styles.textColor = VERMELHO;
          hook.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => {
        const pageH = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...VERDE); doc.setLineWidth(0.4);
        doc.line(MARGIN, pageH - 14, pageW - MARGIN, pageH - 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...CINZA);
        doc.text(COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME, MARGIN, pageH - 9);
        doc.text('Documento de uso interno — gerado automaticamente pelo ERP Financeiro.', MARGIN, pageH - 5.5);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - MARGIN, pageH - 7, { align: 'right' });
      }
    });

    doc.save(`fluxo_de_caixa_resumido_${todayISO()}.pdf`);
    toast('PDF resumido gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF resumido: ' + e.message);
  }
}

// ============================================================
// Exportação — Conciliação Bancária (PDF/Excel × Completo/Resumido)
// ============================================================
function askConciliacaoModo(formato, rows) {
  openModal('Exportar Conciliação Bancária',
    `<p style="font-size:13.5px; color:var(--ink-2)">Deseja o relatório <strong>completo</strong> (lista de todos os lançamentos filtrados) ou o <strong>resumido</strong> (só os totais)?</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Resumido', onClick: () => { closeModal(); formato === 'pdf' ? exportConciliacaoPDF(rows, 'resumido') : exportConciliacaoExcel(rows, 'resumido'); } },
      { label: 'Completo', cls: 'primary', onClick: () => { closeModal(); formato === 'pdf' ? exportConciliacaoPDF(rows, 'completo') : exportConciliacaoExcel(rows, 'completo'); } }
    ]);
}

function conciliacaoResumo(rows) {
  const conc = rows.filter(r => r.reconciled);
  const pend = rows.filter(r => !r.reconciled);
  const sum = arr => arr.reduce((s, r) => s + r.amount, 0);
  return {
    total: rows.length, saldo: sum(rows),
    concQtd: conc.length, concValor: sum(conc),
    pendQtd: pend.length, pendValor: sum(pend)
  };
}

async function exportConciliacaoPDF(rows, modo) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: modo === 'completo' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114], VERMELHO = [178, 58, 47];
    const MARGIN = modo === 'completo' ? 12 : 14;

    doc.setFillColor(...VERDE); doc.rect(0, 0, pageW, 3, 'F');
    const logoW = modo === 'completo' ? 34 : 32, logoH = logoW * (139 / 600);
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', MARGIN, 11, logoW, logoH);
    doc.setTextColor(30, 38, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(modo === 'completo' ? 10.5 : 10);
    doc.text('PROAGRO BRASIL', MARGIN + logoW + 6, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text('ERP Financeiro · Conciliação Bancária', MARGIN + logoW + 6, 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(modo === 'completo' ? 15 : 12.5); doc.setTextColor(...VERDE);
    doc.text(`Relatório de Conciliação Bancária ${modo === 'resumido' ? 'Resumido' : ''}`.trim(), pageW - MARGIN, 15, { align: 'right' });
    const now = new Date();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
    doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`, pageW - MARGIN, 20.5, { align: 'right' });
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(MARGIN, 25, pageW - MARGIN, 25);

    const r = conciliacaoResumo(rows);
    let y = 31;
    doc.setFillColor(...VERDE_CLARO);
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...VERDE);
    doc.text(`Total: ${r.total} lançamento(s) · ${brl(r.saldo)}   ·   Conciliados: ${r.concQtd} (${brl(r.concValor)})   ·   Pendentes: ${r.pendQtd} (${brl(r.pendValor)})`, MARGIN + 5, y + 9.5);
    y += 24;

    if (modo === 'resumido') {
      doc.save(`conciliacao_bancaria_resumido_${todayISO()}.pdf`);
      toast('PDF resumido gerado com sucesso.');
      return;
    }

    doc.autoTable({
      startY: y,
      head: [['Data', 'Descrição', 'Valor', 'Situação']],
      body: rows.map(r2 => [brDate(r2.txn_date), r2.description, brl(r2.amount), r2.reconciled ? 'Conciliado' : 'Pendente']),
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
      alternateRowStyles: { fillColor: VERDE_CLARO },
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 26 } },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 2 && rows[hook.row.index] && rows[hook.row.index].amount < 0) {
          hook.cell.styles.textColor = VERMELHO;
        }
        if (hook.section === 'body' && hook.column.index === 3) {
          hook.cell.styles.textColor = hook.cell.raw === 'Conciliado' ? VERDE : [138, 100, 20];
        }
      },
      didDrawPage: () => {
        const pageH = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...VERDE); doc.setLineWidth(0.4);
        doc.line(MARGIN, pageH - 14, pageW - MARGIN, pageH - 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
        doc.text(COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME, MARGIN, pageH - 9);
        doc.text('Documento de uso interno — gerado automaticamente pelo ERP Financeiro.', MARGIN, pageH - 5.5);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - MARGIN, pageH - 7, { align: 'right' });
      }
    });

    doc.save(`conciliacao_bancaria_completo_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}

function exportConciliacaoExcel(rows, modo) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const r = conciliacaoResumo(rows);
  const wb = XLSX.utils.book_new();

  if (modo === 'resumido') {
    const wsData = [
      ['Relatório de Conciliação Bancária — Resumido'],
      [`Gerado em ${todayISO().split('-').reverse().join('/')}`],
      [],
      ['Total de lançamentos', r.total], ['Saldo total', r.saldo],
      ['Conciliados (qtd.)', r.concQtd], ['Conciliados (valor)', r.concValor],
      ['Pendentes (qtd.)', r.pendQtd], ['Pendentes (valor)', r.pendValor]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    [5, 7, 9].forEach(row => { const cell = ws['B' + row]; if (cell) cell.z = MONEY_FMT; });
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    XLSX.writeFile(wb, `conciliacao_bancaria_resumido_${todayISO()}.xlsx`);
  } else {
    const wsData = [['Data', 'Descrição', 'Valor', 'Situação'], ...rows.map(r2 => [r2.txn_date, r2.description, r2.amount, r2.reconciled ? 'Conciliado' : 'Pendente'])];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    for (let i = 1; i <= rows.length; i++) { const cell = ws['C' + (i + 1)]; if (cell) cell.z = MONEY_FMT; }
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação Bancária');
    XLSX.writeFile(wb, `conciliacao_bancaria_completo_${todayISO()}.xlsx`);
  }
  toast('Excel exportado.');
}

// ============================================================
// Exportação — Viáticos (PDF/Excel × Completo/Resumido)
// ============================================================
const viaticosDestinoTxt = s => {
  const partes = [];
  if (s.ordem_trabalho) partes.push(`OT ${s.ordem_trabalho}`);
  if (Array.isArray(s.destinos) && s.destinos.length) partes.push(s.destinos.map(d => `${d.municipio}/${d.uf}`).join(', '));
  return partes.join(' — ');
};

// Busca as despesas de cada solicitação filtrada e devolve uma lista "achatada"
// (uma linha por despesa), ordenada por colaborador/OT e depois por data —
// é o detalhamento completo, ordem de trabalho por ordem de trabalho.
async function buildViaticosItens(sols) {
  const comDespesas = await Promise.all(sols.map(async s => ({ s, despesas: await api(`/api/viaticos/solicitacoes/${s.id}/despesas`) })));
  const itens = [];
  comDespesas.forEach(({ s, despesas }) => {
    despesas.forEach(d => itens.push({
      colaborador: s.colaborador_name, ot: s.ordem_trabalho || '—', periodo: `${brDate(s.data_inicio)} a ${brDate(s.data_fim)}`,
      status: VIA_STATUS_LABEL[s.status], data: d.data, categoria: DESP_CAT_LABEL[d.categoria] || d.categoria,
      descricao: d.descricao || '', valor: d.valor
    }));
  });
  return itens;
}

// ============================================================
// PADRAO DE RELATORIO — Viaticos
// O cabecalho e o rodape abaixo estavam copiados palavra por palavra dentro de
// cada funcao de exportacao. Com tres relatorios (resumo, extrato e fechamento)
// isso viraria tres copias divergindo com o tempo, entao virou uma funcao so.
// Quem escrever um relatorio novo chama relatorioPDF() e ja nasce no padrao:
// faixa verde no topo, logo, titulo a direita, quem gerou e quando, e o rodape
// com a razao social e o numero da pagina.
// ============================================================
const REL_VERDE = [0, 120, 63], REL_VERDE_CLARO = [234, 245, 236],
      REL_CINZA = [110, 120, 114], REL_VERMELHO = [178, 58, 47], REL_MARGIN = 12;

function relatorioPDF(titulo, opts = {}) {
  // O modulo e o que aparece sob "PROAGRO BRASIL". Era fixo em Viaticos,
  // porque foi de la que este padrao saiu.
  const modulo = opts.modulo || 'Viáticos';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: opts.orientation || 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(...REL_VERDE); doc.rect(0, 0, pageW, 3, 'F');
  const logoW = 34, logoH = logoW * (139 / 600);
  doc.addImage(LOGO_PROAGRO_PNG, 'PNG', REL_MARGIN, 11, logoW, logoH);
  doc.setTextColor(30, 38, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text('PROAGRO BRASIL', REL_MARGIN + logoW + 6, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...REL_CINZA);
  doc.text('ERP Financeiro · ' + modulo, REL_MARGIN + logoW + 6, 19);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...REL_VERDE);
  doc.text(titulo, pageW - REL_MARGIN, 15, { align: 'right' });
  const now = new Date();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...REL_CINZA);
  doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`, pageW - REL_MARGIN, 20.5, { align: 'right' });
  // Subtitulo opcional: e onde o fechamento diz qual periodo esta fechando.
  if (opts.subtitulo) {
    doc.setFontSize(8.5); doc.setTextColor(60, 70, 64);
    doc.text(opts.subtitulo, REL_MARGIN, 25 - 1.5);
  }
  doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(REL_MARGIN, 25, pageW - REL_MARGIN, 25);

  const rodape = () => {
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...REL_VERDE); doc.setLineWidth(0.4);
    doc.line(REL_MARGIN, pageH - 14, pageW - REL_MARGIN, pageH - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...REL_CINZA);
    doc.text(COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME, REL_MARGIN, pageH - 9);
    doc.text('Documento de uso interno — gerado automaticamente pelo ERP Financeiro.', REL_MARGIN, pageH - 5.5);
    doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - REL_MARGIN, pageH - 7, { align: 'right' });
  };
  return { doc, pageW, MARGIN: REL_MARGIN, rodape };
}

// Faixa verde-clara com os numeros de cabecalho do relatorio.
function relatorioFaixa(doc, pageW, y, texto) {
  doc.setFillColor(...REL_VERDE_CLARO);
  doc.roundedRect(REL_MARGIN, y, pageW - REL_MARGIN * 2, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...REL_VERDE);
  doc.text(texto, REL_MARGIN + 5, y + 9);
  return y + 16;
}

// Estilo unico das tabelas, para as tres saidas ficarem iguais.
function relatorioTabelaEstilo(rodape, extra = {}) {
  return Object.assign({
    margin: { left: REL_MARGIN, right: REL_MARGIN },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
    headStyles: { fillColor: REL_VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: REL_VERDE_CLARO },
    didDrawPage: rodape
  }, extra);
}

// Titulo de secao dentro do relatorio de fechamento.
function relatorioSecao(doc, y, texto) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...REL_VERDE);
  doc.text(texto, REL_MARGIN, y);
  doc.setDrawColor(...REL_VERDE); doc.setLineWidth(0.3);
  doc.line(REL_MARGIN, y + 1.6, REL_MARGIN + doc.getTextWidth(texto), y + 1.6);
  return y + 5;
}

async function exportViaticosResumoPDF(rows, ctx = {}) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { doc, pageW, MARGIN, rodape } = relatorioPDF('Relatório de Viáticos Resumido', { subtitulo: ctx.subtitulo });
    const totalLib = rows.reduce((s2, r) => s2 + r.valor_liberado, 0), totalComp = rows.reduce((s2, r) => s2 + r.valor_comprovado, 0);
    relatorioFaixa(doc, pageW, 29, `${rows.length} solicitação(ões)  ·  Total liberado: ${brl(totalLib)}  ·  Total comprovado: ${brl(totalComp)}`);

    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: 50,
      head: [['Colaborador', 'Tier', 'Local / OT', 'Período', 'Liberado', 'Comprovado', 'Status']],
      body: rows.map(s => [s.colaborador_name, s.tier, `${LOCAL_LABEL[s.categoria_local]}${viaticosDestinoTxt(s) ? ' — ' + viaticosDestinoTxt(s) : ''}`,
        `${brDate(s.data_inicio)} a ${brDate(s.data_fim)}`, brl(s.valor_liberado), brl(s.valor_comprovado), VIA_STATUS_LABEL[s.status]]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: REL_VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 6) {
          const st = rows[hook.row.index]?.status;
          hook.cell.styles.textColor = (st === 'divergente') ? REL_VERMELHO : (st === 'comprovado' || st === 'devolvido') ? REL_VERDE : [138, 100, 20];
        }
      }
    }));

    doc.save(`viaticos_resumido_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}
function exportViaticosResumoExcel(rows) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const wsData = [
    ['Colaborador', 'Tier', 'Local', 'OT', 'Destinos', 'Início', 'Fim', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência', 'Status'],
    ...rows.map(s => [s.colaborador_name, s.tier, LOCAL_LABEL[s.categoria_local], s.ordem_trabalho || '',
      Array.isArray(s.destinos) ? s.destinos.map(d => `${d.municipio}/${d.uf}`).join(', ') : '',
      s.data_inicio, s.data_fim, s.valor_liberado, s.valor_comprovado, s.valor_devolvido, s.pendencia_resolvida ? 0 : s.valor_pendencia, VIA_STATUS_LABEL[s.status]])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  for (let i = 1; i <= rows.length; i++) { ['H', 'I', 'J', 'K'].forEach(col => { const cell = ws[col + (i + 1)]; if (cell) cell.z = MONEY_FMT; }); }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Viáticos');
  XLSX.writeFile(wb, `viaticos_resumido_${todayISO()}.xlsx`);
  toast('Excel exportado.');
}

async function exportViaticosDetalhadoPDF(itens, ctx = {}) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  if (!itens.length) { toast('Nenhuma despesa lançada nas solicitações filtradas.'); return; }
  try {
    const { doc, pageW, MARGIN, rodape } = relatorioPDF('Extrato de Viáticos', { subtitulo: ctx.subtitulo });
    const total = itens.reduce((s, i) => s + i.valor, 0);
    relatorioFaixa(doc, pageW, 29, `${itens.length} lançamento(s) de despesa  ·  Total comprovado: ${brl(total)}`);

    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: 50,
      head: [['Colaborador', 'OT', 'Período', 'Status', 'Data', 'Categoria', 'Descrição', 'Valor']],
      body: itens.map(i => [i.colaborador, i.ot, i.periodo, i.status, brDate(i.data), i.categoria, i.descricao, brl(i.valor)]),
      columnStyles: { 7: { halign: 'right' } }
    }));

    doc.save(`viaticos_extrato_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}
function exportViaticosDetalhadoExcel(itens) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  if (!itens.length) { toast('Nenhuma despesa lançada nas solicitações filtradas.'); return; }
  const MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const wsData = [
    ['Colaborador', 'OT', 'Período', 'Status', 'Data', 'Categoria', 'Descrição', 'Valor'],
    ...itens.map(i => [i.colaborador, i.ot, i.periodo, i.status, i.data, i.categoria, i.descricao, i.valor])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  for (let r = 1; r <= itens.length; r++) { const cell = ws['H' + (r + 1)]; if (cell) cell.z = MONEY_FMT; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Viáticos - Detalhado');
  XLSX.writeFile(wb, `viaticos_completo_${todayISO()}.xlsx`);
  toast('Excel exportado.');
}

// ============================================================
// FECHAMENTO DE VIATICOS — agregacoes
// Uma unica passada sobre as solicitacoes filtradas e suas despesas monta tudo
// o que o relatorio de fechamento mostra. Fica separado das funcoes de
// exportacao porque PDF e Excel consomem exatamente os mesmos numeros: se a
// conta estiver em dois lugares, um dia os dois documentos divergem.
// ============================================================
const vlr = x => Number(x) || 0;
const pendenciaDe = s => (s.pendencia_resolvida ? 0 : vlr(s.valor_pendencia));

async function buildViaticosFechamento(sols, periodo = {}) {
  const itens = await buildViaticosItens(sols);

  const kpis = {
    solicitacoes: sols.length,
    colaboradores: new Set(sols.map(s => s.colaborador_name)).size,
    lancamentos: itens.length,
    solicitado: sols.reduce((a, s) => a + vlr(s.valor_solicitado), 0),
    liberado: sols.reduce((a, s) => a + vlr(s.valor_liberado), 0),
    comprovado: sols.reduce((a, s) => a + vlr(s.valor_comprovado), 0),
    devolvido: sols.reduce((a, s) => a + vlr(s.valor_devolvido), 0),
    pendencia: sols.reduce((a, s) => a + pendenciaDe(s), 0)
  };

  // Prestacao de contas: onde cada viagem esta na esteira. A ordem segue a do
  // VIA_STATUS_LABEL, que e a ordem do fluxo, e nao a alfabetica.
  const porStatus = Object.keys(VIA_STATUS_LABEL).map(st => {
    const doStatus = sols.filter(s => s.status === st);
    return {
      status: st, rotulo: VIA_STATUS_LABEL[st], qtd: doStatus.length,
      liberado: doStatus.reduce((a, s) => a + vlr(s.valor_liberado), 0),
      comprovado: doStatus.reduce((a, s) => a + vlr(s.valor_comprovado), 0),
      devolvido: doStatus.reduce((a, s) => a + vlr(s.valor_devolvido), 0),
      pendencia: doStatus.reduce((a, s) => a + pendenciaDe(s), 0)
    };
  }).filter(l => l.qtd > 0);

  const porColaborador = [...new Set(sols.map(s => s.colaborador_name))].map(nome => {
    const dele = sols.filter(s => s.colaborador_name === nome);
    return {
      nome, viagens: dele.length,
      liberado: dele.reduce((a, s) => a + vlr(s.valor_liberado), 0),
      comprovado: dele.reduce((a, s) => a + vlr(s.valor_comprovado), 0),
      devolvido: dele.reduce((a, s) => a + vlr(s.valor_devolvido), 0),
      pendencia: dele.reduce((a, s) => a + pendenciaDe(s), 0)
    };
  }).sort((a, b) => b.comprovado - a.comprovado);

  const totalComp = itens.reduce((a, i) => a + vlr(i.valor), 0);
  const porCategoria = [...new Set(itens.map(i => i.categoria))].map(categoria => {
    const daCat = itens.filter(i => i.categoria === categoria);
    const total = daCat.reduce((a, i) => a + vlr(i.valor), 0);
    return { categoria, lancamentos: daCat.length, total, pct: totalComp ? total / totalComp : 0 };
  }).sort((a, b) => b.total - a.total);

  // Quadro pessoa x categoria. As colunas seguem a ordem de porCategoria (maior
  // gasto primeiro), para o que importa ficar a esquerda quando a folha aperta.
  const categorias = porCategoria.map(c => c.categoria);
  const linhasMatriz = [...new Set(itens.map(i => i.colaborador))].map(nome => {
    const valores = categorias.map(cat =>
      itens.filter(i => i.colaborador === nome && i.categoria === cat).reduce((a, i) => a + vlr(i.valor), 0));
    return { nome, valores, total: valores.reduce((a, v) => a + v, 0) };
  }).sort((a, b) => b.total - a.total);
  const matriz = {
    categorias, linhas: linhasMatriz,
    totaisPorCategoria: categorias.map((_, ci) => linhasMatriz.reduce((a, l) => a + l.valores[ci], 0)),
    total: linhasMatriz.reduce((a, l) => a + l.total, 0)
  };

  return { sols, itens, kpis, porStatus, porColaborador, porCategoria, matriz, periodo };
}

// Rotulo do periodo que vai no subtitulo dos tres relatorios. Sem filtro de
// data, diz o intervalo que os dados realmente cobrem — mais util que "todos".
function viaticosPeriodoRotulo(sols, de, ate) {
  if (de && ate) return `Período filtrado: ${brDate(de)} a ${brDate(ate)}`;
  if (de) return `A partir de ${brDate(de)}`;
  if (ate) return `Até ${brDate(ate)}`;
  if (!sols.length) return 'Sem solicitações no filtro atual';
  const datas = sols.map(s => s.data_inicio).filter(Boolean).sort();
  const fins = sols.map(s => s.data_fim).filter(Boolean).sort();
  return `Sem filtro de data — dados de ${brDate(datas[0])} a ${brDate(fins[fins.length - 1])}`;
}

// Fechamento em PDF: seis secoes no mesmo documento, todas no padrao.
async function exportViaticosFechamentoPDF(f) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  if (!f.sols.length) { toast('Nenhuma solicitação no filtro atual.'); return; }
  try {
    const { doc, pageW, rodape } = relatorioPDF('Fechamento de Viáticos', { subtitulo: f.periodo.rotulo });
    const pageH = doc.internal.pageSize.getHeight();
    const k = f.kpis;

    relatorioFaixa(doc, pageW, 29,
      `${k.solicitacoes} viagem(ns) · ${k.colaboradores} colaborador(es) · ${k.lancamentos} lançamento(s)`);
    relatorioFaixa(doc, pageW, 47,
      `Liberado: ${brl(k.liberado)}  ·  Comprovado: ${brl(k.comprovado)}  ·  Devolvido: ${brl(k.devolvido)}  ·  Pendência: ${brl(k.pendencia)}`);

    // Cada secao comeca onde a anterior acabou; se nao couber o titulo mais
    // duas linhas de tabela, vai para a folha seguinte.
    const secao = (titulo, minimo = 34) => {
      let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 63) + 9;
      if (y + minimo > pageH - 18) { doc.addPage(); y = 22; }
      return relatorioSecao(doc, y, titulo);
    };
    const M = { halign: 'right' };

    // ---- 1. Prestacao de contas por status ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Prestação de contas — situação das viagens'),
      head: [['Situação', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência']],
      body: f.porStatus.map(l => [l.rotulo, l.qtd, brl(l.liberado), brl(l.comprovado), brl(l.devolvido), brl(l.pendencia)]),
      foot: [['Total', k.solicitacoes, brl(k.liberado), brl(k.comprovado), brl(k.devolvido), brl(k.pendencia)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: { halign: 'center' }, 2: M, 3: M, 4: M, 5: M }
    }));

    // ---- 2. Gastos por colaborador ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Gastos por colaborador'),
      head: [['Colaborador', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência']],
      body: f.porColaborador.map(l => [l.nome, l.viagens, brl(l.liberado), brl(l.comprovado), brl(l.devolvido), brl(l.pendencia)]),
      foot: [['Total', k.solicitacoes, brl(k.liberado), brl(k.comprovado), brl(k.devolvido), brl(k.pendencia)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: { halign: 'center' }, 2: M, 3: M, 4: M, 5: M }
    }));

    // ---- 3. Gastos por categoria ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Gastos por categoria'),
      head: [['Categoria', 'Lançamentos', 'Total', '% do comprovado']],
      body: f.porCategoria.map(l => [l.categoria, l.lancamentos, brl(l.total), (l.pct * 100).toFixed(1) + '%']),
      foot: [['Total', k.lancamentos, brl(f.matriz.total), '100,0%']],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: { halign: 'center' }, 2: M, 3: M }
    }));

    // ---- 4. Quadro colaborador x categoria ----
    // Zero vira vazio de proposito: com onze categorias, uma malha de "R$ 0,00"
    // esconde justamente as celulas que tem numero.
    if (f.matriz.categorias.length) {
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: secao('Gastos por colaborador × categoria'),
        head: [['Colaborador', ...f.matriz.categorias, 'Total']],
        body: f.matriz.linhas.map(l => [l.nome, ...l.valores.map(v => v ? brl(v) : '—'), brl(l.total)]),
        foot: [['Total', ...f.matriz.totaisPorCategoria.map(v => v ? brl(v) : '—'), brl(f.matriz.total)]],
        footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 6.5 },
        styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.4, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
        headStyles: { fillColor: REL_VERDE, textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
        columnStyles: Object.fromEntries(f.matriz.categorias.map((_, i) => [i + 1, M]).concat([[f.matriz.categorias.length + 1, M]]))
      }));
    }

    // ---- 5. Solicitacoes do periodo ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Solicitações do período'),
      head: [['Colaborador', 'OT', 'Local', 'Período', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência', 'Situação']],
      body: f.sols.map(s => [s.colaborador_name, s.ordem_trabalho || '—', LOCAL_LABEL[s.categoria_local],
        `${brDate(s.data_inicio)} a ${brDate(s.data_fim)}`, brl(vlr(s.valor_liberado)), brl(vlr(s.valor_comprovado)),
        brl(vlr(s.valor_devolvido)), brl(pendenciaDe(s)), VIA_STATUS_LABEL[s.status]]),
      columnStyles: { 4: M, 5: M, 6: M, 7: M }
    }));

    // ---- 6. Extrato completo, gasto por gasto ----
    if (f.itens.length) {
      doc.addPage();
      let y = relatorioSecao(doc, 22, 'Extrato completo de gastos');
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: y,
        head: [['Colaborador', 'OT', 'Data', 'Categoria', 'Descrição', 'Valor']],
        body: f.itens.map(i => [i.colaborador, i.ot, brDate(i.data), i.categoria, i.descricao, brl(vlr(i.valor))]),
        foot: [['', '', '', '', 'Total comprovado', brl(f.matriz.total)]],
        footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 5: M }
      }));
    }

    doc.save(`viaticos_fechamento_${todayISO()}.pdf`);
    toast('PDF de fechamento gerado.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}

// Fechamento em Excel: seis abas, reusando o mesmo toolkit de estilo do Excel
// da Solicitacao de Aporte (aporteXl*) — e por isso que as planilhas do sistema
// saem todas com a mesma cara. Sem ExcelJS carregado, cai na versao sem estilo
// em vez de nao entregar nada.
async function exportViaticosFechamentoExcel(f) {
  if (!window.ExcelJS) return exportViaticosFechamentoExcelSimples(f);
  if (!f.sols.length) { toast('Nenhuma solicitação no filtro atual.'); return; }
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME;
    wb.created = new Date();
    const now = new Date();
    const sub = `${f.periodo.rotulo} · gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`;
    const idLogo = wb.addImage({ base64: LOGO_PROAGRO_PNG, extension: 'png' });
    const k = f.kpis;
    const R = 'right', C = 'center';

    // ---------- Aba 1: Resumo ----------
    const ws1 = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    let L = aporteXlCabecalho(wb, ws1, sub, idLogo, [34, 16, 18, 18, 18, 18], 'Fechamento de Viáticos — Resumo');
    aporteXlTituloTabela(ws1, L, 'Números do período', 6); L++;
    aporteXlCabecalhoColunas(ws1, L, ['Indicador', 'Qtde.', 'Solicitado', 'Liberado', 'Comprovado', 'Devolvido'], ['left', C, R, R, R, R]); L++;
    L = aporteXlCorpo(ws1, L, [
      ['Viagens no período', k.solicitacoes, k.solicitado, k.liberado, k.comprovado, k.devolvido],
      ['Colaboradores', k.colaboradores, null, null, null, null],
      ['Lançamentos de despesa', k.lancamentos, null, null, null, null],
      ['Pendência em aberto', null, null, null, k.pendencia, null]
    ], [2, 3, 4, 5], ['left', C, R, R, R, R]);
    L += 2;

    aporteXlTituloTabela(ws1, L, 'Prestação de contas — situação das viagens', 6); L++;
    aporteXlCabecalhoColunas(ws1, L, ['Situação', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência'], ['left', C, R, R, R, R]); L++;
    L = aporteXlCorpo(ws1, L, f.porStatus.map(l => [l.rotulo, l.qtd, l.liberado, l.comprovado, l.devolvido, l.pendencia]),
      [2, 3, 4, 5], ['left', C, R, R, R, R]);
    aporteXlTotal(ws1, L, ['Total', k.solicitacoes, k.liberado, k.comprovado, k.devolvido, k.pendencia], [2, 3, 4, 5], ['left', C, R, R, R, R]);

    // ---------- Aba 2: Por colaborador ----------
    const ws2 = wb.addWorksheet('Por colaborador', { views: [{ showGridLines: false }] });
    L = aporteXlCabecalho(wb, ws2, sub, idLogo, [34, 12, 18, 18, 18, 18], 'Gastos por colaborador');
    aporteXlCabecalhoColunas(ws2, L, ['Colaborador', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência'], ['left', C, R, R, R, R]); L++;
    L = aporteXlCorpo(ws2, L, f.porColaborador.map(l => [l.nome, l.viagens, l.liberado, l.comprovado, l.devolvido, l.pendencia]),
      [2, 3, 4, 5], ['left', C, R, R, R, R]);
    aporteXlTotal(ws2, L, ['Total', k.solicitacoes, k.liberado, k.comprovado, k.devolvido, k.pendencia], [2, 3, 4, 5], ['left', C, R, R, R, R]);

    // ---------- Aba 3: Por categoria ----------
    const ws3 = wb.addWorksheet('Por categoria', { views: [{ showGridLines: false }] });
    L = aporteXlCabecalho(wb, ws3, sub, idLogo, [30, 14, 18, 16], 'Gastos por categoria');
    aporteXlCabecalhoColunas(ws3, L, ['Categoria', 'Lançamentos', 'Total', '% do comprovado'], ['left', C, R, R]); L++;
    const linha1Cat = L;
    L = aporteXlCorpo(ws3, L, f.porCategoria.map(l => [l.categoria, l.lancamentos, l.total, l.pct]), [2], ['left', C, R, R]);
    // A porcentagem vai como numero com formato de porcentagem, nao como texto:
    // assim da para reordenar e somar na planilha sem reconverter nada.
    f.porCategoria.forEach((_, i) => { ws3.getCell(linha1Cat + i, 4).numFmt = '0.0%'; });
    aporteXlTotal(ws3, L, ['Total', k.lancamentos, f.matriz.total, 1], [2], ['left', C, R, R]);
    ws3.getCell(L, 4).numFmt = '0.0%';

    // ---------- Aba 4: Pessoa x Categoria ----------
    const ws4 = wb.addWorksheet('Pessoa x Categoria', { views: [{ showGridLines: false }] });
    const largurasM = [30, ...f.matriz.categorias.map(() => 15), 16];
    L = aporteXlCabecalho(wb, ws4, sub, idLogo, largurasM, 'Gastos por colaborador × categoria');
    const nColsM = largurasM.length;
    const alinhaM = ['left', ...f.matriz.categorias.map(() => R), R];
    const moedaM = f.matriz.categorias.map((_, i) => i + 1).concat([nColsM - 1]);
    aporteXlCabecalhoColunas(ws4, L, ['Colaborador', ...f.matriz.categorias, 'Total'], alinhaM);
    const cabMatriz = L; L++;
    L = aporteXlCorpo(ws4, L, f.matriz.linhas.map(l => [l.nome, ...l.valores, l.total]), moedaM, alinhaM);
    aporteXlTotal(ws4, L, ['Total', ...f.matriz.totaisPorCategoria, f.matriz.total], moedaM, alinhaM);
    // Congela o nome e o cabecalho: com onze categorias, rolar para a direita
    // sem o nome a vista deixa o quadro ilegivel.
    ws4.views = [{ state: 'frozen', xSplit: 1, ySplit: cabMatriz, showGridLines: false }];

    // ---------- Aba 5: Solicitacoes ----------
    const ws5 = wb.addWorksheet('Solicitações', { views: [{ showGridLines: false }] });
    const alinha5 = ['left', 'left', C, 'left', C, C, R, R, R, R, 'left'];
    L = aporteXlCabecalho(wb, ws5, sub, idLogo, [28, 10, 8, 22, 12, 12, 16, 16, 16, 16, 22], 'Solicitações do período');
    aporteXlCabecalhoColunas(ws5, L, ['Colaborador', 'OT', 'Tier', 'Local / destinos', 'Início', 'Fim', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência', 'Situação'], alinha5); L++;
    L = aporteXlCorpo(ws5, L, f.sols.map(s => [s.colaborador_name, s.ordem_trabalho || '—', s.tier,
      `${LOCAL_LABEL[s.categoria_local]}${viaticosDestinoTxt(s) ? ' — ' + viaticosDestinoTxt(s) : ''}`,
      s.data_inicio, s.data_fim, vlr(s.valor_liberado), vlr(s.valor_comprovado), vlr(s.valor_devolvido), pendenciaDe(s),
      VIA_STATUS_LABEL[s.status]]), [6, 7, 8, 9], alinha5);
    aporteXlTotal(ws5, L, ['Total', '', '', '', '', '', k.liberado, k.comprovado, k.devolvido, k.pendencia, ''], [6, 7, 8, 9], alinha5);

    // ---------- Aba 6: Extrato ----------
    const ws6 = wb.addWorksheet('Extrato', { views: [{ showGridLines: false }] });
    const alinha6 = ['left', 'left', 'left', C, 'left', 'left', R];
    L = aporteXlCabecalho(wb, ws6, sub, idLogo, [28, 10, 22, 12, 20, 46, 16], 'Extrato completo de gastos');
    aporteXlCabecalhoColunas(ws6, L, ['Colaborador', 'OT', 'Período', 'Data', 'Categoria', 'Descrição', 'Valor'], alinha6);
    const cabExtrato = L; L++;
    L = aporteXlCorpo(ws6, L, f.itens.map(i => [i.colaborador, i.ot, i.periodo, i.data, i.categoria, i.descricao, vlr(i.valor)]), [6], alinha6);
    aporteXlTotal(ws6, L, ['Total', '', '', '', '', '', f.matriz.total], [6], alinha6);
    // Cabecalho congelado e autofiltro: o extrato e a aba que a pessoa garimpa.
    ws6.views = [{ state: 'frozen', ySplit: cabExtrato, showGridLines: false }];
    if (f.itens.length) ws6.autoFilter = { from: { row: cabExtrato, column: 1 }, to: { row: L - 1, column: 7 } };

    const buf = await wb.xlsx.writeBuffer();
    aporteBaixarPlanilha(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `viaticos_fechamento_${todayISO()}.xlsx`);
    toast('Excel de fechamento gerado.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o Excel: ' + e.message);
  }
}

// Reserva sem estilo, para o caso de o ExcelJS nao ter carregado.
function exportViaticosFechamentoExcelSimples(f) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const wb = XLSX.utils.book_new();
  const add = (nome, aoa, colsMoeda) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let r = 1; r < aoa.length; r++) {
      (colsMoeda || []).forEach(ci => {
        const ref = XLSX.utils.encode_cell({ r, c: ci });
        if (ws[ref]) ws[ref].z = MONEY;
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  const k = f.kpis;
  add('Resumo', [['Indicador', 'Valor'],
    ['Viagens', k.solicitacoes], ['Colaboradores', k.colaboradores], ['Lançamentos', k.lancamentos],
    ['Solicitado', k.solicitado], ['Liberado', k.liberado], ['Comprovado', k.comprovado],
    ['Devolvido', k.devolvido], ['Pendência', k.pendencia]], [1]);
  add('Prestação de contas', [['Situação', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência'],
    ...f.porStatus.map(l => [l.rotulo, l.qtd, l.liberado, l.comprovado, l.devolvido, l.pendencia])], [2, 3, 4, 5]);
  add('Por colaborador', [['Colaborador', 'Viagens', 'Liberado', 'Comprovado', 'Devolvido', 'Pendência'],
    ...f.porColaborador.map(l => [l.nome, l.viagens, l.liberado, l.comprovado, l.devolvido, l.pendencia])], [2, 3, 4, 5]);
  add('Por categoria', [['Categoria', 'Lançamentos', 'Total', '% do comprovado'],
    ...f.porCategoria.map(l => [l.categoria, l.lancamentos, l.total, l.pct])], [2]);
  add('Pessoa x Categoria', [['Colaborador', ...f.matriz.categorias, 'Total'],
    ...f.matriz.linhas.map(l => [l.nome, ...l.valores, l.total])],
    f.matriz.categorias.map((_, i) => i + 1).concat([f.matriz.categorias.length + 1]));
  add('Extrato', [['Colaborador', 'OT', 'Período', 'Data', 'Categoria', 'Descrição', 'Valor'],
    ...f.itens.map(i => [i.colaborador, i.ot, i.periodo, i.data, i.categoria, i.descricao, vlr(i.valor)])], [6]);
  XLSX.writeFile(wb, `viaticos_fechamento_${todayISO()}.xlsx`);
  toast('Excel de fechamento gerado (sem formatação).');
}


// ============================================================
// FORNECEDORES
// ============================================================
async function renderFornecedores() {
  const rows = await api('/api/suppliers');
  const c = $('#content');
  c.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Buscar fornecedor, CNPJ…">
      <select id="f-status"><option value="">Todos</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select>
      <div class="spacer"></div>
      <button class="btn primary" id="btn-new">+ Novo fornecedor</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#f-status').value;
    const filtered = rows.filter(r =>
      (!fs || r.status === fs) &&
      (!q || (r.name + ' ' + (r.cnpj || '') + ' ' + (r.category || '')).toLowerCase().includes(q)));
    $('#tbl').innerHTML = `
      <thead><tr><th>Razão social</th><th>CNPJ</th><th>Categoria</th><th>Contato</th><th>Condição pgto.</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => `<tr>
        <td><strong>${esc(r.name)}</strong>${r.email ? '<br><small style="color:var(--muted)">' + esc(r.email) + '</small>' : ''}</td>
        <td class="mono">${esc(r.cnpj || '—')}</td><td>${esc(r.category || '—')}</td>
        <td>${esc(r.contact_name || '—')}${r.phone ? '<br><small style="color:var(--muted)">' + esc(r.phone) + '</small>' : ''}</td>
        <td>${esc(r.payment_terms || '—')}</td>
        <td><span class="badge ${r.status === 'ativo' ? 'ok' : 'off'}">${r.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
        <td class="actions">
          <button class="btn sm" data-edit="${r.id}">Editar</button>
          <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
        </td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Nenhum fornecedor cadastrado.</div></td></tr>'}</tbody>`;
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formFornecedor(rows.find(r => r.id == b.dataset.edit)));
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('fornecedor', `/api/suppliers/${b.dataset.del}`, renderFornecedores));
  };
  ['q', 'f-status'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-new').onclick = () => formFornecedor(null);
  draw();
}

function formFornecedor(r) {
  const isEdit = !!r; r = r || {};
  openModal(isEdit ? 'Editar fornecedor' : 'Novo fornecedor', `
    ${fld('s-name', 'Razão social *', 'text', r.name || '')}
    <div class="form-row">
      ${fld('s-cnpj', 'CNPJ', 'text', r.cnpj || '', 'placeholder="00.000.000/0000-00"')}
      ${fldSel('s-cat', 'Categoria', [{ v: '', t: '—' }, ...CAT_FORNECEDOR.map(x => ({ v: x, t: x }))], r.category || '')}
    </div>
    <div class="form-row">
      ${fld('s-contact', 'Contato', 'text', r.contact_name || '')}
      ${fld('s-phone', 'Telefone', 'text', r.phone || '')}
    </div>
    <div class="form-row">
      ${fld('s-email', 'E-mail', 'email', r.email || '')}
      ${fld('s-terms', 'Condição de pagamento', 'text', r.payment_terms || '', 'placeholder="30 dias"')}
    </div>
    ${fld('s-pix', 'Chave PIX', 'text', r.pix_key || '', 'placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"')}
    ${fldSel('s-status', 'Status', [{ v: 'ativo', t: 'Ativo' }, { v: 'inativo', t: 'Inativo' }], r.status || 'ativo')}
    ${fld('s-notes', 'Observações', 'text', r.notes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Cadastrar', cls: 'primary', onClick: async () => {
        const body = {
          name: $('#s-name').value, cnpj: $('#s-cnpj').value, category: $('#s-cat').value,
          contact_name: $('#s-contact').value, phone: $('#s-phone').value, email: $('#s-email').value,
          payment_terms: $('#s-terms').value, pix_key: $('#s-pix').value, status: $('#s-status').value, notes: $('#s-notes').value
        };
        try {
          if (isEdit) await api('/api/suppliers/' + r.id, { method: 'PUT', body });
          else await api('/api/suppliers', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.'); renderFornecedores();
        } catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// CONTRATOS (aluguel, contabilidade, meteorologia etc.)
// Fornecedores com vínculo recorrente — cada contrato pode gerar sozinho as
// parcelas em Contas a Pagar, no ciclo definido. A duplicidade é evitada
// deixando o usuário decidir "a partir de quando" o sistema pode gerar
// sozinho (proxima_geracao), e travada de verdade por um índice único no
// banco — ver api/index.js.
// ============================================================
const CONTR_PERIODO_LABEL = { mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const CONTR_STATUS_BADGE = { ativo: 'ok', suspenso: 'warn', encerrado: 'off' };
const CONTR_STATUS_LABEL = { ativo: 'Ativo', suspenso: 'Suspenso', encerrado: 'Encerrado' };

async function renderContratos() {
  const [rows, sups] = await Promise.all([api('/api/contratos'), api('/api/suppliers')]);
  const c = $('#content');
  const hoje = todayISO(), limite60 = isoMaisDiasLocal(60);
  const venceEm60Dias = dataISO => !!dataISO && dataISO >= hoje && dataISO <= limite60;

  const ativos = rows.filter(r => r.status === 'ativo');
  const vencendo = ativos.filter(r => venceEm60Dias(r.data_fim));
  const valorMensal = ativos.reduce((s, r) => s + Number(r.valor) / (CONTR_MESES[r.periodicidade] || 1), 0);

  c.innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Contratos ativos</div><div class="value">${ativos.length}</div></div>
      <div class="card kpi blue"><div class="label">Valor recorrente (equiv. mensal)</div><div class="value">${brl(valorMensal)}</div></div>
      <div class="card kpi ${vencendo.length ? 'warn' : ''}"><div class="label">Vencendo em 60 dias</div><div class="value">${vencendo.length}</div></div>
    </div>
    ${vencendo.length ? `<div class="card" style="margin-bottom:16px"><div class="alert-list">${vencendo.map(r =>
      `<div class="alert-item warn">⏰ <strong>${esc(r.titulo)}</strong> (${esc(r.supplier_name)}) vence em ${brDate(r.data_fim)}${r.renovacao_automatica ? ' — renovação automática configurada, mas confira as condições' : ' — decidir renovação'}.</div>`
    ).join('')}</div></div>` : ''}
    <div class="toolbar">
      <input type="search" id="ct-q" placeholder="Buscar contrato, fornecedor…">
      <select id="ct-fstatus"><option value="">Todos os status</option><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="encerrado">Encerrados</option></select>
      <div class="spacer"></div>
      <button class="btn primary" id="ct-new">+ Novo contrato</button>
    </div>
    <div class="table-wrap"><table id="ct-tbl" class="tbl-contratos"></table></div>`;

  const draw = () => {
    const q = $('#ct-q').value.toLowerCase(), fs = $('#ct-fstatus').value;
    const filtered = rows.filter(r => (!fs || r.status === fs) &&
      (!q || (r.titulo + ' ' + r.supplier_name + ' ' + (r.documento || '')).toLowerCase().includes(q)));
    $('#ct-tbl').innerHTML = `
      <colgroup>
        <col class="c-ct-contrato"><col class="c-ct-forn"><col class="c-ct-cat"><col class="c-ct-valor">
        <col class="c-ct-vig"><col class="c-ct-status"><col class="c-ct-acoes">
      </colgroup>
      <thead><tr><th>Contrato</th><th>Fornecedor</th><th>Categoria</th><th class="num">Valor</th><th>Vigência</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => `<tr${r.status === 'encerrado' ? ' class="ct-row-off"' : ''}>
        <td class="ct-titulo"><strong>${esc(r.titulo)}</strong>${r.documento ? '<span class="ct-sub">Nº ' + esc(r.documento) + '</span>' : ''}</td>
        <td>${esc(r.supplier_name)}</td>
        <td class="ct-cat">${esc(r.categoria)}</td>
        <td class="num ct-valor">${brl(r.valor)}<span class="ct-sub">${CONTR_PERIODO_LABEL[r.periodicidade].toLowerCase()}</span></td>
        <td class="ct-vig">${brDate(r.data_inicio)}<span class="ct-sub">até ${r.data_fim ? brDate(r.data_fim) : 'indeterminado'}</span></td>
        <td><span class="badge ${CONTR_STATUS_BADGE[r.status]}">${CONTR_STATUS_LABEL[r.status]}</span></td>
        <td class="actions"><div class="ct-acoes">
          ${r.gerar_parcelas && r.proxima_geracao && r.status === 'ativo' ? `<button class="btn sm" data-gerar="${r.id}" title="Gerar agora a parcela de ${brDate(r.proxima_geracao)} em Contas a Pagar">Gerar</button>` : ''}
          <button class="btn sm att-btn" data-att="contrato:${r.id}" title="Contrato assinado e demais documentos">📎${r.attachment_count ? ' ' + r.attachment_count : ''}</button>
          <button class="btn sm" data-edit="${r.id}">Editar</button>
          ${r.status !== 'encerrado' ? `<button class="btn sm" data-status="${r.id}:${r.status === 'ativo' ? 'suspenso' : 'ativo'}">${r.status === 'ativo' ? 'Suspender' : 'Reativar'}</button>
             <button class="btn sm danger-ghost" data-status="${r.id}:encerrado">Encerrar</button>` : ''}
          ${!r.parcelas_geradas ? `<button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>` : ''}
        </div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Nenhum contrato cadastrado ainda.</div></td></tr>'}</tbody>`;
    $('#ct-tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => {
      const [, id] = b.dataset.att.split(':');
      const c = rows.find(r => r.id == id);
      openAttachments('contrato', Number(id), c ? c.titulo : 'Contrato');
    });
    $('#ct-tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formContrato(rows.find(r => r.id == b.dataset.edit), sups));
    $('#ct-tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('contrato', `/api/contratos/${b.dataset.del}`, renderContratos));
    $('#ct-tbl').querySelectorAll('[data-status]').forEach(b => b.onclick = async () => {
      const [id, status] = b.dataset.status.split(':');
      try { await api(`/api/contratos/${id}/status`, { method: 'POST', body: { status } }); toast('Status do contrato atualizado.'); renderContratos(); }
      catch (e) { toast(e.message); }
    });
    $('#ct-tbl').querySelectorAll('[data-gerar]').forEach(b => b.onclick = async () => {
      try {
        const r = await api(`/api/contratos/${b.dataset.gerar}/gerar-agora`, { method: 'POST' });
        toast(r.gerou ? `Parcela de ${brDate(r.venc)} gerada em Contas a Pagar.` : `A parcela de ${brDate(r.venc)} já havia sido gerada — nada duplicado.`);
        renderContratos();
      } catch (e) { toast(e.message); }
    });
  };
  ['ct-q', 'ct-fstatus'].forEach(id => $('#' + id).oninput = draw);
  $('#ct-new').onclick = () => formContrato(null, sups);
  draw();
}

const CONTR_MESES = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
// Mesmo princípio do isoMaisDias do backend, só que no fuso local do navegador.
function isoMaisDiasLocal(dias) { const d = new Date(); d.setDate(d.getDate() + dias); return d.toLocaleDateString('en-CA'); }

// Sugere a data da 1ª parcela: 1 ciclo após o início, no mesmo dia do mês.
function contrSugerirProximaGeracao(dataInicio, periodicidade) {
  if (!dataInicio) return '';
  const [y, m, d] = dataInicio.split('-').map(Number);
  const meses = CONTR_MESES[periodicidade] || 1;
  const dt = new Date(Date.UTC(y, m - 1 + meses, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0); // rola pro último dia do mês, se o mês for mais curto
  return dt.toISOString().slice(0, 10);
}

function formContrato(r, sups) {
  const isEdit = !!r; r = r || {};
  const ativos = sups.filter(s => s.status === 'ativo' || s.id === r.supplier_id);
  openModal(isEdit ? 'Editar contrato' : 'Novo contrato', `
    ${fld('ct-titulo', 'Título do contrato *', 'text', r.titulo || '', 'placeholder="Ex.: Aluguel — Sala 302, Contabilidade mensal"')}
    <div class="form-row">
      ${fldSel('ct-supplier', 'Fornecedor *', ativos.length ? ativos.map(s => ({ v: s.id, t: s.name })) : [{ v: '', t: '— cadastre um fornecedor primeiro —' }], r.supplier_id || '')}
      ${fldSel('ct-cat', 'Categoria *', CAT_DESPESA.map(x => ({ v: x, t: x })), r.categoria || CAT_DESPESA[0])}
    </div>
    <div class="form-row">
      ${fldSel('ct-cc', 'Centro de custo', [{ v: '', t: '—' }, ...CENTROS.map(x => ({ v: x, t: x }))], r.cost_center || '')}
      ${fld('ct-doc', 'Nº do contrato / documento', 'text', r.documento || '')}
    </div>
    <div class="form-row">
      ${fld('ct-valor', 'Valor da parcela (R$) *', 'number', r.valor || '', 'step="0.01" min="0.01"')}
      ${fldSel('ct-periodicidade', 'Periodicidade *', Object.entries(CONTR_PERIODO_LABEL).map(([v, t]) => ({ v, t })), r.periodicidade || 'mensal')}
    </div>
    <div class="form-row">
      ${fld('ct-inicio', 'Início de vigência *', 'date', r.data_inicio || todayISO())}
      ${fld('ct-fim', 'Fim de vigência (opcional)', 'date', r.data_fim || '')}
    </div>
    <label class="check-chip" style="margin:6px 0"><input type="checkbox" id="ct-renovacao" ${r.renovacao_automatica ? 'checked' : ''}> Tem renovação automática (só informativo — o alerta de vencimento continua sendo emitido)</label>
    <label class="check-chip" style="margin:6px 0"><input type="checkbox" id="ct-gerar" ${isEdit ? (r.gerar_parcelas ? 'checked' : '') : 'checked'}> Gerar as parcelas em Contas a Pagar automaticamente</label>
    <div id="ct-gerar-fields">
      ${fld('ct-proxima', 'Gerar parcelas a partir de (1ª competência automática)', 'date', r.proxima_geracao || '')}
      <p class="hint" style="margin-top:-6px">${isEdit ? 'Já lançou parcelas manualmente até um certo mês? Deixe esta data para o mês seguinte — nada antes dela será gerado.' : 'Sugerida automaticamente a partir do início de vigência. Se você já lançou parcelas manuais deste contrato até algum mês, mude esta data para o mês seguinte.'}</p>
    </div>
    ${fld('ct-obs', 'Observações', 'text', r.observacoes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Cadastrar', cls: 'primary', onClick: async () => {
        const body = {
          supplier_id: $('#ct-supplier').value || null, titulo: $('#ct-titulo').value, categoria: $('#ct-cat').value,
          cost_center: $('#ct-cc').value, documento: $('#ct-doc').value, valor: $('#ct-valor').value,
          periodicidade: $('#ct-periodicidade').value, data_inicio: $('#ct-inicio').value, data_fim: $('#ct-fim').value,
          renovacao_automatica: $('#ct-renovacao').checked, gerar_parcelas: $('#ct-gerar').checked,
          proxima_geracao: $('#ct-proxima').value, observacoes: $('#ct-obs').value
        };
        try {
          if (isEdit) await api('/api/contratos/' + r.id, { method: 'PUT', body });
          else await api('/api/contratos', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Contrato atualizado.' : 'Contrato cadastrado.'); renderContratos();
        } catch (e) { modalError(e.message); }
     }}]);
  const toggleGerar = () => { $('#ct-gerar-fields').style.display = $('#ct-gerar').checked ? '' : 'none'; };
  $('#ct-gerar').onchange = toggleGerar; toggleGerar();
  if (!isEdit) {
    // Acompanha Início/Periodicidade até o usuário editar a sugestão à mão —
    // checar "campo vazio" não bastava: a 1ª sugestão já preenche o campo, e
    // trocar a periodicidade depois não atualizava mais nada (bug pego no teste).
    let proximaTocada = false;
    const sugerir = () => { if (!proximaTocada) $('#ct-proxima').value = contrSugerirProximaGeracao($('#ct-inicio').value, $('#ct-periodicidade').value); };
    $('#ct-proxima').oninput = () => { proximaTocada = true; };
    $('#ct-inicio').onchange = sugerir; $('#ct-periodicidade').onchange = sugerir; sugerir();
  }
}

// ============================================================
// SUPRIMENTOS (Estoque · Compras · Envios a funcionários)
// Uma única seção com três abas que compartilham o mesmo estoque.
// ============================================================
let SUP_TAB = 'estoque';
const SUP_UNIDADES = ['un', 'cx', 'par', 'pct', 'm', 'kg', 'L', 'rolo'];
const supNum = v => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString('pt-BR');

async function renderSuprimentos() {
  const c = $('#content');
  c.innerHTML = `
    <div class="sup-tabs">
      <button class="sup-tab" data-tab="estoque">Estoque</button>
      <button class="sup-tab" data-tab="compras">Compras</button>
      <button class="sup-tab" data-tab="envios">Envios a funcionários</button>
    </div>
    <div id="sup-panel"></div>`;
  const draw = () => {
    c.querySelectorAll('.sup-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === SUP_TAB));
    const panel = $('#sup-panel'); panel.innerHTML = '<div class="empty">Carregando…</div>';
    ({ estoque: supRenderEstoque, compras: supRenderCompras, envios: supRenderEnvios }[SUP_TAB])(panel)
      .catch(e => { panel.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  };
  c.querySelectorAll('.sup-tab').forEach(b => b.onclick = () => { SUP_TAB = b.dataset.tab; draw(); });
  draw();
}

// ---- Aba Estoque ----
async function supRenderEstoque(panel) {
  const [resumo, itens] = await Promise.all([api('/api/suprimentos/resumo'), api('/api/suprimentos/itens')]);
  const edit = !READONLY;
  panel.innerHTML = `
    <div class="grid kpis" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Itens ativos</div><div class="value">${resumo.totalItens}</div></div>
      <div class="card kpi blue"><div class="label">Valor em estoque</div><div class="value">${brl(resumo.valorEstoque)}</div></div>
      <div class="card kpi ${resumo.abaixoMinimo ? 'red' : ''}"><div class="label">Abaixo do mínimo</div><div class="value">${resumo.abaixoMinimo}</div></div>
      <div class="card kpi"><div class="label">Equip. em custódia</div><div class="value">${resumo.emCustodia}</div></div>
    </div>
    <div class="toolbar">
      <input type="search" id="sup-q" placeholder="Buscar item, código, categoria…">
      <select id="sup-ftipo"><option value="">Todos os tipos</option><option value="material">Material</option><option value="equipamento">Equipamento</option></select>
      <div class="spacer"></div>
      ${edit ? '<button class="btn primary" id="sup-new-item">+ Novo item</button>' : ''}
    </div>
    <div class="table-wrap"><table id="sup-tbl"></table></div>`;
  const draw = () => {
    const q = $('#sup-q').value.toLowerCase(), ft = $('#sup-ftipo').value;
    const rows = itens.filter(i => (!ft || i.tipo === ft) && (!q || (i.nome + ' ' + (i.sku || '') + ' ' + (i.categoria || '')).toLowerCase().includes(q)));
    $('#sup-tbl').innerHTML = `
      <thead><tr><th>Item</th><th>Tipo</th><th>Categoria</th><th class="num">Estoque</th><th class="num">Mínimo</th><th class="num">Custo médio</th><th class="num">Valor total</th><th>Situação</th><th class="actions">Ações</th></tr></thead>
      <tbody>${rows.map(i => {
        const atual = Number(i.estoque_atual), min = Number(i.estoque_minimo), baixo = atual < min, zero = atual <= 0;
        const sit = !i.ativo ? '<span class="badge off">Inativo</span>' : zero ? '<span class="badge late">Sem estoque</span>' : baixo ? '<span class="badge warn">Baixo</span>' : '<span class="badge ok">OK</span>';
        return `<tr${!i.ativo ? ' style="opacity:.55"' : ''}>
          <td><strong>${esc(i.nome)}</strong>${i.sku ? '<br><small class="mono" style="color:var(--muted)">' + esc(i.sku) + '</small>' : ''}</td>
          <td>${i.tipo === 'equipamento' ? 'Equipamento' : 'Material'}</td>
          <td>${esc(i.categoria || '—')}</td>
          <td class="num"><strong>${supNum(atual)}</strong> <small style="color:var(--muted)">${esc(i.unidade)}</small></td>
          <td class="num">${supNum(min)}</td>
          <td class="num">${brl(i.custo_medio)}</td>
          <td class="num">${brl(atual * Number(i.custo_medio))}</td>
          <td>${sit}</td>
          <td class="actions">
            <button class="btn sm" data-ficha="${i.id}">Ficha</button>
            ${edit ? `<button class="btn sm" data-mov="${i.id}">Ajustar</button>
            <button class="btn sm" data-hist="${i.id}">Histórico</button>
            <button class="btn sm" data-edit="${i.id}">Editar</button>` : ''}
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="9"><div class="empty">Nenhum item cadastrado ainda.</div></td></tr>`}</tbody>`;
    $('#sup-tbl').querySelectorAll('[data-ficha]').forEach(b => b.onclick = () => supFichaItem(itens.find(i => i.id == b.dataset.ficha)));
    if (edit) {
      $('#sup-tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => supFormItem(itens.find(i => i.id == b.dataset.edit)));
      $('#sup-tbl').querySelectorAll('[data-mov]').forEach(b => b.onclick = () => supFormAjuste(itens.find(i => i.id == b.dataset.mov)));
      $('#sup-tbl').querySelectorAll('[data-hist]').forEach(b => b.onclick = () => supHistorico(itens.find(i => i.id == b.dataset.hist)));
    }
  };
  ['sup-q', 'sup-ftipo'].forEach(id => $('#' + id).oninput = draw);
  if (edit) $('#sup-new-item').onclick = () => supFormItem(null);
  draw();
}

// Origem da mercadoria (tabela B do SPED) — exigida na nota fiscal.
const ORIGEM_MERCADORIA = [
  { v: '', t: '—' },
  { v: '0', t: '0 - Nacional' },
  { v: '1', t: '1 - Estrangeira (importação direta)' },
  { v: '2', t: '2 - Estrangeira (mercado interno)' },
  { v: '3', t: '3 - Nacional (conteúdo import. 40%–70%)' },
  { v: '4', t: '4 - Nacional (processo produtivo básico)' },
  { v: '5', t: '5 - Nacional (conteúdo import. ≤ 40%)' },
  { v: '6', t: '6 - Estrangeira (import. direta, sem similar)' },
  { v: '7', t: '7 - Estrangeira (merc. interno, sem similar)' },
  { v: '8', t: '8 - Nacional (conteúdo import. > 70%)' }
];
const ORIGEM_LABEL = Object.fromEntries(ORIGEM_MERCADORIA.map(o => [o.v, o.t]));
const supSecTitle = t => `<div class="sup-sec-title">${t}</div>`;
const fldArea = (id, label, value = '', attrs = '') =>
  `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="2" ${attrs}>${esc(value)}</textarea></div>`;

function supFormItem(i) {
  const isEdit = !!i; i = i || {};
  const num = v => (v == null ? '' : v);
  openModal(isEdit ? 'Editar item' : 'Novo item de estoque', `
    ${supSecTitle('1 · Identificação básica')}
    ${isEdit ? `<p class="hint" style="margin-top:0">Código interno (ID): <strong>#${i.id}</strong></p>` : ''}
    ${fld('it-nome', 'Nome / descrição curta *', 'text', i.nome || '', 'placeholder="Nome comercial que aparece nas telas e notas"')}
    <div class="form-row">
      ${fld('it-sku', 'SKU (código estruturado)', 'text', i.sku || '', 'placeholder="Ex.: EPI-LUV-P-001"')}
      ${fldSel('it-tipo', 'Tipo', [{ v: 'material', t: 'Material (consumo)' }, { v: 'equipamento', t: 'Equipamento (durável)' }], i.tipo || 'material')}
    </div>
    ${fldArea('it-descricao', 'Descrição longa / técnica', i.descricao || '', 'placeholder="Especificações, ficha técnica, observações"')}

    ${supSecTitle('2 · Classificação e organização')}
    <div class="form-row">
      ${fld('it-cat', 'Categoria', 'text', i.categoria || '', 'placeholder="Ex.: EPI, Papelaria, TI"')}
      ${fld('it-subcat', 'Subcategoria', 'text', i.subcategoria || '')}
    </div>
    <div class="form-row">
      ${fld('it-marca', 'Marca / fabricante', 'text', i.marca || '')}
      ${fldSel('it-un', 'Unidade de medida', SUP_UNIDADES.map(u => ({ v: u, t: u })), i.unidade || 'un')}
    </div>

    ${supSecTitle('3 · Logística e estoque')}
    ${isEdit ? `<p class="hint" style="margin-top:0">Quantidade em estoque: <strong>${supNum(i.estoque_atual)} ${esc(i.unidade || 'un')}</strong> — controlada por movimentações, não editável aqui.</p>` : ''}
    <div class="form-row">
      ${fld('it-min', 'Estoque mínimo (ressuprimento)', 'number', num(i.estoque_minimo != null ? i.estoque_minimo : 0), 'step="0.001" min="0"')}
      ${fld('it-max', 'Estoque máximo', 'number', num(i.estoque_maximo), 'step="0.001" min="0"')}
    </div>
    <div class="form-row">
      ${fld('it-pliq', 'Peso líquido (kg)', 'number', num(i.peso_liquido), 'step="0.001" min="0"')}
      ${fld('it-pbru', 'Peso bruto (kg)', 'number', num(i.peso_bruto), 'step="0.001" min="0"')}
    </div>
    <div class="form-row">
      ${fld('it-dalt', 'Altura (cm)', 'number', num(i.dim_altura), 'step="0.01" min="0"')}
      ${fld('it-dlar', 'Largura (cm)', 'number', num(i.dim_largura), 'step="0.01" min="0"')}
      ${fld('it-dpro', 'Profundidade (cm)', 'number', num(i.dim_profundidade), 'step="0.01" min="0"')}
    </div>

    ${supSecTitle('4 · Financeiro')}
    <div class="form-row">
      ${fld('it-preco', 'Preço de custo / última compra (R$)', 'number', num(i.preco_ultima_compra), 'step="0.01" min="0"')}
      <div class="field"><label>Custo médio ponderado (CMP)</label><input value="${isEdit ? brl(i.custo_medio) : 'Calculado nas compras'}" disabled></div>
    </div>
    <p class="hint" style="margin-top:-4px">O CMP e o preço da última compra são atualizados automaticamente a cada entrada por compra.</p>

    ${supSecTitle('5 · Fiscal e tributário')}
    <div class="form-row">
      ${fld('it-ncm', 'NCM (8 dígitos)', 'text', i.ncm || '', 'placeholder="00000000" inputmode="numeric"')}
      ${fld('it-cest', 'CEST (se aplicável)', 'text', i.cest || '', 'placeholder="0000000" inputmode="numeric"')}
    </div>
    ${fldSel('it-origem', 'Origem da mercadoria', ORIGEM_MERCADORIA, i.origem_mercadoria || '')}

    ${supSecTitle('6 · Rastreabilidade')}
    ${fld('it-serie', 'Número de série', 'text', i.numero_serie || '', 'placeholder="Para eletrônicos / controle de garantia"')}

    ${supSecTitle('Outros')}
    ${fld('it-notes', 'Observações gerais', 'text', i.notes || '')}
    ${isEdit ? fldSel('it-ativo', 'Status', [{ v: 'true', t: 'Ativo' }, { v: 'false', t: 'Inativo' }], String(i.ativo !== false)) : ''}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar' : 'Cadastrar', cls: 'primary', onClick: async () => {
        const body = {
          nome: $('#it-nome').value, sku: $('#it-sku').value, tipo: $('#it-tipo').value, descricao: $('#it-descricao').value,
          categoria: $('#it-cat').value, subcategoria: $('#it-subcat').value, marca: $('#it-marca').value, unidade: $('#it-un').value,
          estoque_minimo: $('#it-min').value, estoque_maximo: $('#it-max').value,
          peso_liquido: $('#it-pliq').value, peso_bruto: $('#it-pbru').value,
          dim_altura: $('#it-dalt').value, dim_largura: $('#it-dlar').value, dim_profundidade: $('#it-dpro').value,
          preco_ultima_compra: $('#it-preco').value, ncm: $('#it-ncm').value, cest: $('#it-cest').value,
          origem_mercadoria: $('#it-origem').value, numero_serie: $('#it-serie').value, notes: $('#it-notes').value
        };
        if (isEdit) body.ativo = $('#it-ativo').value === 'true';
        try {
          if (isEdit) await api('/api/suprimentos/itens/' + i.id, { method: 'PUT', body });
          else await api('/api/suprimentos/itens', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Item atualizado.' : 'Item cadastrado.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}], { wide: true });
}

// Ficha completa do item (somente leitura) — mostra todos os dados do cadastro.
function supFichaItem(i) {
  const dim = [i.dim_altura, i.dim_largura, i.dim_profundidade].some(v => v != null)
    ? `${supNum(i.dim_altura || 0)} × ${supNum(i.dim_largura || 0)} × ${supNum(i.dim_profundidade || 0)} cm` : '—';
  const linha = (rot, val) => `<tr><td style="color:var(--muted);width:42%">${rot}</td><td><strong>${val}</strong></td></tr>`;
  const txt = v => (v == null || v === '') ? '—' : esc(v);
  openModal(`Ficha do item — ${esc(i.nome)}`, `
    ${supSecTitle('Identificação')}
    <table class="via-resumo-tbl">
      ${linha('Código interno (ID)', '#' + i.id)}
      ${linha('SKU', txt(i.sku))}
      ${linha('Tipo', i.tipo === 'equipamento' ? 'Equipamento (durável)' : 'Material (consumo)')}
      ${linha('Descrição técnica', txt(i.descricao))}
    </table>
    ${supSecTitle('Classificação')}
    <table class="via-resumo-tbl">
      ${linha('Categoria', txt(i.categoria))}
      ${linha('Subcategoria', txt(i.subcategoria))}
      ${linha('Marca / fabricante', txt(i.marca))}
      ${linha('Unidade', txt(i.unidade))}
    </table>
    ${supSecTitle('Logística e estoque')}
    <table class="via-resumo-tbl">
      ${linha('Estoque atual', supNum(i.estoque_atual) + ' ' + esc(i.unidade || 'un'))}
      ${linha('Estoque mínimo', supNum(i.estoque_minimo))}
      ${linha('Estoque máximo', i.estoque_maximo != null ? supNum(i.estoque_maximo) : '—')}
      ${linha('Peso líquido / bruto', `${i.peso_liquido != null ? supNum(i.peso_liquido) + ' kg' : '—'} / ${i.peso_bruto != null ? supNum(i.peso_bruto) + ' kg' : '—'}`)}
      ${linha('Dimensões (A×L×P)', dim)}
    </table>
    ${supSecTitle('Financeiro')}
    <table class="via-resumo-tbl">
      ${linha('Preço da última compra', i.preco_ultima_compra != null ? brl(i.preco_ultima_compra) : '—')}
      ${linha('Custo médio ponderado', brl(i.custo_medio))}
      ${linha('Valor total em estoque', brl(Number(i.estoque_atual) * Number(i.custo_medio)))}
    </table>
    ${supSecTitle('Fiscal')}
    <table class="via-resumo-tbl">
      ${linha('NCM', txt(i.ncm))}
      ${linha('CEST', txt(i.cest))}
      ${linha('Origem', i.origem_mercadoria ? esc(ORIGEM_LABEL[i.origem_mercadoria] || i.origem_mercadoria) : '—')}
    </table>
    ${supSecTitle('Rastreabilidade')}
    <table class="via-resumo-tbl">
      ${linha('Número de série', txt(i.numero_serie))}
    </table>`,
    [{ label: 'Fechar', onClick: closeModal }], { wide: true });
}

function supFormAjuste(i) {
  const custoBase = Number(i.custo_medio) > 0 ? Number(i.custo_medio) : (Number(i.preco_ultima_compra) || '');
  openModal(`Ajustar estoque — ${esc(i.nome)}`, `
    <p class="hint">Estoque atual: <strong>${supNum(i.estoque_atual)} ${esc(i.unidade)}</strong> · Custo médio: <strong>${brl(i.custo_medio)}</strong></p>
    <div class="form-row">
      ${fldSel('aj-tipo', 'Tipo de ajuste', [{ v: 'entrada', t: 'Entrada (+)' }, { v: 'saida', t: 'Saída (−)' }], 'entrada')}
      ${fld('aj-qtd', 'Quantidade', 'number', '', 'step="0.001" min="0.001"')}
    </div>
    <div class="form-row" id="aj-custo-wrap">
      ${fld('aj-custo', 'Custo unitário (R$)', 'number', custoBase, 'step="0.01" min="0"')}
      ${fld('aj-data', 'Data', 'date', todayISO())}
    </div>
    <p class="hint" id="aj-custo-hint" style="margin-top:-4px">Informe o custo para o estoque ser valorizado (entra na média ponderada). Em branco, usa o custo médio atual ou o preço de custo do cadastro.</p>
    ${fld('aj-notes', 'Motivo do ajuste *', 'text', '', 'placeholder="Ex.: contagem física, perda, correção"')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Registrar ajuste', cls: 'primary', onClick: async () => {
        try {
          await api('/api/suprimentos/ajustes', { method: 'POST', body: { item_id: i.id, tipo: $('#aj-tipo').value, quantidade: $('#aj-qtd').value, custo_unitario: $('#aj-custo').value, data: $('#aj-data').value, notes: $('#aj-notes').value } });
          closeModal(); toast('Ajuste registrado.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}]);
  // Custo só faz sentido em entradas (saída consome pelo custo médio vigente).
  const toggleCusto = () => {
    const entrada = $('#aj-tipo').value === 'entrada';
    $('#aj-custo-wrap').querySelector('.field').style.display = entrada ? '' : 'none';
    $('#aj-custo-hint').style.display = entrada ? '' : 'none';
  };
  $('#aj-tipo').onchange = toggleCusto;
  toggleCusto();
}

async function supHistorico(i) {
  const movs = await api('/api/suprimentos/movimentos?item_id=' + i.id);
  const ORIG = { compra: 'Compra', envio: 'Envio', ajuste: 'Ajuste', devolucao: 'Devolução' };
  openModal(`Histórico — ${esc(i.nome)}`, `
    <div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Movimento</th><th class="num">Qtd</th><th>Detalhe</th><th>Por</th></tr></thead>
      <tbody>${movs.map(m => {
        const entrada = m.tipo === 'entrada';
        const det = m.origem === 'compra' ? [m.supplier_name ? 'Forn.: ' + esc(m.supplier_name) : '', m.documento ? 'NF ' + esc(m.documento) : ''].filter(Boolean).join(' · ')
          : (m.origem === 'envio' || m.origem === 'devolucao') ? (m.colaborador_name ? 'Colab.: ' + esc(m.colaborador_name) : '')
          : esc(m.notes || '');
        return `<tr>
          <td>${brDate(m.data)}</td>
          <td><span class="badge ${entrada ? 'ok' : 'late'}">${entrada ? '+ ' : '− '}${ORIG[m.origem] || m.origem}</span></td>
          <td class="num">${supNum(m.quantidade)} ${esc(i.unidade)}</td>
          <td>${det || '—'}${m.status ? ` <small style="color:var(--muted)">(${m.status})</small>` : ''}</td>
          <td><small>${esc(m.created_by_name || '—')}</small></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5"><div class="empty">Sem movimentações.</div></td></tr>'}</tbody>
    </table></div>`,
    [{ label: 'Fechar', onClick: closeModal }], { wide: true });
}

// ---- Aba Compras ----
async function supRenderCompras(panel) {
  const [itens, fornecedores, movs] = await Promise.all([
    api('/api/suprimentos/itens'),
    api('/api/suppliers').catch(() => []),
    api('/api/suprimentos/movimentos?origem=compra')
  ]);
  const edit = !READONLY;
  panel.innerHTML = `
    <div class="toolbar"><div class="spacer"></div>${edit ? '<button class="btn primary" id="sup-new-compra">+ Registrar compra</button>' : ''}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Item</th><th class="num">Qtd</th><th class="num">Custo un.</th><th class="num">Total</th><th>Fornecedor</th><th>Documento</th><th>Financeiro</th></tr></thead>
      <tbody>${movs.map(m => `<tr>
        <td>${brDate(m.data)}</td><td>${esc(m.item_nome)}</td>
        <td class="num">${supNum(m.quantidade)} ${esc(m.unidade)}</td>
        <td class="num">${brl(m.custo_unitario)}</td><td class="num">${brl(m.valor_total)}</td>
        <td>${esc(m.supplier_name || '—')}</td><td>${esc(m.documento || '—')}</td>
        <td>${m.payable_id ? '<span class="badge ok">Em Contas a Pagar</span>' : '<span class="badge off">—</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="7"><div class="empty">Nenhuma compra registrada ainda.</div></td></tr>'}</tbody>
    </table></div>`;
  if (edit) $('#sup-new-compra').onclick = () => supFormCompra(itens, fornecedores);
}

function supFormCompra(itens, fornecedores) {
  const ativos = itens.filter(i => i.ativo);
  if (!ativos.length) { toast('Cadastre um item no Estoque antes de registrar compras.'); return; }
  openModal('Registrar compra', `
    ${fldSel('co-item', 'Item *', ativos.map(i => ({ v: i.id, t: `${i.nome}${i.sku ? ' (' + i.sku + ')' : ''}` })), ativos[0].id)}
    <div class="form-row">
      ${fld('co-qtd', 'Quantidade *', 'number', '', 'step="0.001" min="0.001"')}
      ${fld('co-custo', 'Custo unitário (R$) *', 'number', '', 'step="0.01" min="0"')}
    </div>
    <div class="form-row">
      ${fldSel('co-forn', 'Fornecedor', [{ v: '', t: '—' }, ...fornecedores.filter(s => s.status === 'ativo').map(s => ({ v: s.id, t: s.name }))], '')}
      ${fld('co-doc', 'Documento / NF', 'text', '')}
    </div>
    ${fld('co-data', 'Data da compra', 'date', todayISO())}
    <label class="check-chip" style="margin:6px 0"><input type="checkbox" id="co-pagar"> Lançar também em Contas a Pagar</label>
    <div id="co-pagar-fields" style="display:none">
      <div class="form-row">
        ${fld('co-venc', 'Vencimento', 'date', todayISO())}
        ${fld('co-catpag', 'Categoria (financeiro)', 'text', 'Materiais/Suprimentos')}
      </div>
    </div>
    ${fld('co-notes', 'Observações', 'text', '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Registrar compra', cls: 'primary', onClick: async () => {
        try {
          const r = await api('/api/suprimentos/compras', { method: 'POST', body: {
            item_id: $('#co-item').value, quantidade: $('#co-qtd').value, custo_unitario: $('#co-custo').value,
            supplier_id: $('#co-forn').value || null, documento: $('#co-doc').value, data: $('#co-data').value,
            lancar_pagar: $('#co-pagar').checked, due_date: $('#co-venc').value, categoria_pagar: $('#co-catpag').value, notes: $('#co-notes').value } });
          closeModal(); toast(r.payable_id ? 'Compra registrada e lançada em Contas a Pagar.' : 'Compra registrada.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}]);
  $('#co-pagar').onchange = e => { $('#co-pagar-fields').style.display = e.target.checked ? '' : 'none'; };
}

// ---- Aba Envios a funcionários ----
async function supRenderEnvios(panel) {
  const [itens, colaboradores, movs] = await Promise.all([
    api('/api/suprimentos/itens'),
    api('/api/suprimentos/colaboradores'),
    api('/api/suprimentos/movimentos?origem=envio')
  ]);
  const edit = !READONLY;
  const ST = { enviado: ['warn', 'Enviado'], entregue: ['pend', 'Entregue'], devolvido: ['ok', 'Devolvido'] };
  panel.innerHTML = `
    <div class="toolbar">
      <select id="en-fstatus"><option value="">Todas as situações</option><option value="enviado">Enviado</option><option value="entregue">Entregue</option><option value="devolvido">Devolvido</option></select>
      <div class="spacer"></div>${edit ? '<button class="btn primary" id="sup-new-envio">+ Registrar envio</button>' : ''}
    </div>
    <div class="table-wrap"><table id="en-tbl"></table></div>`;
  const draw = () => {
    const fs = $('#en-fstatus').value;
    const rows = movs.filter(m => !fs || m.status === fs);
    $('#en-tbl').innerHTML = `
      <thead><tr><th>Data</th><th>Item</th><th class="num">Qtd</th><th>Colaborador</th><th>Tipo</th><th>Situação</th>${edit ? '<th class="actions">Ações</th>' : ''}</tr></thead>
      <tbody>${rows.map(m => {
        const equip = m.item_tipo === 'equipamento', st = ST[m.status] || ['off', m.status];
        return `<tr>
          <td>${brDate(m.data)}</td><td>${esc(m.item_nome)}</td>
          <td class="num">${supNum(m.quantidade)} ${esc(m.unidade)}</td>
          <td>${esc(m.colaborador_name || '—')}</td>
          <td>${equip ? 'Equipamento' : 'Material'}</td>
          <td><span class="badge ${st[0]}">${st[1]}</span>${m.data_devolucao ? ` <small style="color:var(--muted)">${brDate(m.data_devolucao)}</small>` : ''}</td>
          ${edit ? `<td class="actions">${m.status === 'devolvido' ? '<small style="color:var(--muted)">—</small>' :
            `${m.status === 'enviado' ? `<button class="btn sm" data-entregue="${m.id}">Marcar entregue</button>` : ''}
             ${equip ? `<button class="btn sm" data-devolver="${m.id}">Registrar devolução</button>` : ''}`}</td>` : ''}
        </tr>`;
      }).join('') || `<tr><td colspan="${edit ? 7 : 6}"><div class="empty">Nenhum envio registrado ainda.</div></td></tr>`}</tbody>`;
    if (edit) {
      $('#en-tbl').querySelectorAll('[data-entregue]').forEach(b => b.onclick = async () => {
        try { await api(`/api/suprimentos/envios/${b.dataset.entregue}/status`, { method: 'POST', body: { status: 'entregue' } }); toast('Marcado como entregue.'); renderSuprimentos(); }
        catch (e) { toast(e.message); }
      });
      $('#en-tbl').querySelectorAll('[data-devolver]').forEach(b => b.onclick = () => supFormDevolucao(b.dataset.devolver));
    }
  };
  $('#en-fstatus').oninput = draw;
  if (edit) $('#sup-new-envio').onclick = () => supFormEnvio(itens, colaboradores);
  draw();
}

function supFormEnvio(itens, colaboradores) {
  const disp = itens.filter(i => i.ativo && Number(i.estoque_atual) > 0);
  if (!disp.length) { toast('Não há itens com estoque disponível para envio.'); return; }
  if (!colaboradores.length) { toast('Nenhum colaborador cadastrado. Cadastre em Viáticos.'); return; }
  openModal('Registrar envio a funcionário', `
    ${fldSel('en-item', 'Item *', disp.map(i => ({ v: i.id, t: `${i.nome} — ${supNum(i.estoque_atual)} ${i.unidade} disp.` })), disp[0].id)}
    <div class="form-row">
      ${fld('en-qtd', 'Quantidade *', 'number', '1', 'step="0.001" min="0.001"')}
      ${fld('en-data', 'Data do envio', 'date', todayISO())}
    </div>
    ${fldSel('en-colab', 'Colaborador destinatário *', colaboradores.map(c => ({ v: c.id, t: `${c.name}${c.cargo ? ' — ' + c.cargo : ''}` })), colaboradores[0].id)}
    ${fld('en-notes', 'Observações', 'text', '', 'placeholder="Ex.: nº de série, finalidade"')}
    <p class="hint">Equipamentos ficam em custódia (você registra a devolução depois). Materiais de consumo apenas dão baixa.</p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Registrar envio', cls: 'primary', onClick: async () => {
        try {
          await api('/api/suprimentos/envios', { method: 'POST', body: { item_id: $('#en-item').value, quantidade: $('#en-qtd').value, colaborador_id: $('#en-colab').value, data: $('#en-data').value, notes: $('#en-notes').value } });
          closeModal(); toast('Envio registrado.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}]);
}

function supFormDevolucao(id) {
  openModal('Registrar devolução', `
    <p class="hint">O item volta ao estoque nesta data.</p>
    ${fld('dv-data', 'Data da devolução', 'date', todayISO())}
    ${fld('dv-notes', 'Observações', 'text', '', 'placeholder="Ex.: estado do equipamento"')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar devolução', cls: 'primary', onClick: async () => {
        try {
          await api(`/api/suprimentos/envios/${id}/status`, { method: 'POST', body: { status: 'devolvido', data: $('#dv-data').value, notes: $('#dv-notes').value } });
          closeModal(); toast('Devolução registrada. Item retornou ao estoque.'); renderSuprimentos();
        } catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// CONCILIAÇÃO BANCÁRIA
// ============================================================
async function renderConciliacao() {
  const [rows, payRows] = await Promise.all([api('/api/bank'), api('/api/payables')]);
  const c = $('#content');
  const FKEY = 'filters-conciliacao';
  const saved = loadFilters(FKEY);

  c.innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px" id="conc-kpis"></div>
    <div class="toolbar">
      <select id="f-status">
        <option value="">Todos</option>
        <option value="false">Não conciliados</option>
        <option value="true">Conciliados</option>
      </select>
      <div class="date-range">
        <label>De <input type="date" id="f-de" value="${saved.de || ''}"></label>
        <label>Até <input type="date" id="f-ate" value="${saved.ate || ''}"></label>
      </div>
      <button class="btn" id="btn-clear">Limpar filtros</button>
      <div class="spacer"></div>
      <button class="btn" id="btn-export">Exportar</button>
      <button class="btn" id="btn-manual">+ Lançamento manual</button>
      <button class="btn blue" id="btn-import">Importar extrato (CSV/Excel)</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>
    <p class="hint">Importação: arquivo CSV com colunas <strong>data;descrição;valor</strong> (datas DD/MM/AAAA ou AAAA-MM-DD; valores negativos = débitos).</p>`;

  $('#f-status').value = saved.fs ?? 'false';

  let lastFiltered = rows;
  const draw = () => {
    const fs = $('#f-status').value, de = $('#f-de').value, ate = $('#f-ate').value;
    saveFilters(FKEY, { fs, de, ate });

    // KPIs: respeitam o período (De/Até), mas sempre mostram os dois lados
    // (conciliado/pendente) juntos — o filtro de Situação abaixo só recorta
    // a tabela, não o resumo.
    const noPeriodo = rows.filter(r => (!de || r.txn_date >= de) && (!ate || r.txn_date <= ate));
    const pend = noPeriodo.filter(r => !r.reconciled);
    const saldo = noPeriodo.reduce((s, r) => s + r.amount, 0);

    // Baixado em Contas a Pagar (status "Pago") dentro do mesmo período, que
    // ainda não tem um lançamento bancário CONCILIADO vinculado a ele —
    // ou seja, já foi dado como pago no ERP mas ainda não foi confirmado
    // no extrato bancário importado.
    const pagosNoPeriodo = payRows.filter(p => p.status === 'pago' && (!de || p.payment_date >= de) && (!ate || p.payment_date <= ate));
    const semConciliar = pagosNoPeriodo.filter(p => !rows.some(r => r.reconciled && r.matched_type === 'payable' && String(r.matched_id) === String(p.id)));
    const valorSemConciliar = semConciliar.reduce((s, p) => s + Number(p.amount), 0);

    $('#conc-kpis').innerHTML = `
      <div class="card kpi"><div class="label">Saldo do extrato</div><div class="value ${saldo < 0 ? 'neg' : ''}">${brl(saldo)}</div>
        <div class="detail">Soma de todos os lançamentos desta tela no período${de || ate ? ' filtrado' : ''}</div></div>
      <div class="card kpi warn"><div class="label">Não conciliados</div><div class="value">${pend.length}</div>
        <div class="detail">${brl(pend.reduce((s, r) => s + r.amount, 0))}</div></div>
      <div class="card kpi blue"><div class="label">Conciliados</div><div class="value">${noPeriodo.length - pend.length}</div></div>
      <div class="card kpi ${semConciliar.length ? 'red' : ''}" id="kpi-semconciliar" style="${semConciliar.length ? 'cursor:pointer' : ''}"><div class="label">Baixado sem conciliar (Contas a Pagar)</div>
        <div class="value ${semConciliar.length ? 'neg' : ''}">${brl(valorSemConciliar)}</div>
        <div class="detail">${semConciliar.length} título(s) pago(s) ainda sem confirmação no extrato${semConciliar.length ? ' — clique para ver quais' : ''}</div></div>`;
    if (semConciliar.length) {
      $('#kpi-semconciliar').onclick = () => openModal('Contas a Pagar baixadas sem conciliação confirmada', `
        <p style="font-size:13.5px; color:var(--ink-2)">Estes títulos estão marcados como "Pago" no período filtrado, mas não têm um lançamento
        bancário <strong>vinculado e conciliado</strong> a eles especificamente (mesmo que exista algum lançamento de valor parecido no extrato,
        ele só conta aqui se estiver de fato linkado a este título).</p>
        <div class="table-wrap"><table><thead><tr><th>Pago em</th><th>Descrição</th><th>Fornecedor</th><th class="num">Valor</th></tr></thead>
          <tbody>${semConciliar.map(p => `<tr><td>${brDate(p.payment_date)}</td><td>${esc(p.description)}</td><td>${esc(p.supplier_name || '—')}</td><td class="num">${brl(p.amount)}</td></tr>`).join('')}</tbody>
        </table></div>`,
        [{ label: 'Fechar', cls: 'primary', onClick: closeModal }], { wide: true });
    }

    const filtered = rows.filter(r => {
      if (fs !== '' && String(r.reconciled) !== fs) return false;
      if (de && r.txn_date < de) return false;
      if (ate && r.txn_date > ate) return false;
      return true;
    });
    lastFiltered = filtered;
    $('#tbl').innerHTML = `
      <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => `<tr>
        <td>${brDate(r.txn_date)}</td>
        <td>${esc(r.description)}<br><small style="color:var(--muted)">${r.auto_generated && !r.reconciled ? 'Gerado automaticamente — aguardando confirmação no extrato' : esc(r.imported_batch || '')}</small></td>
        <td class="num ${r.amount >= 0 ? 'pos' : 'neg'}">${brl(r.amount)}</td>
        <td>${r.reconciled ? '<span class="badge ok">Conciliado</span>' : '<span class="badge warn">Pendente</span>'}</td>
        <td class="actions">
          ${r.reconciled
            ? `<button class="btn sm" data-unrec="${r.id}">Desfazer</button>`
            : (r.matched_type && r.matched_id)
              ? `<button class="btn sm primary" data-confirm="${r.id}">Confirmar</button>`
              : `<button class="btn sm primary" data-rec="${r.id}">Conciliar</button>`}
          <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
        </td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Nenhum lançamento.</div></td></tr>'}</tbody>`;
    $('#tbl').querySelectorAll('[data-rec]').forEach(b => b.onclick = () => conciliar(rows.find(r => r.id == b.dataset.rec)));
    $('#tbl').querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
      const t = rows.find(r => r.id == b.dataset.confirm);
      try {
        await api(`/api/bank/${t.id}/reconcile`, { method: 'POST', body: { matched_type: t.matched_type, matched_id: t.matched_id } });
        toast('Conciliação confirmada.'); renderConciliacao();
      } catch (e) { toast(e.message); }
    });
    $('#tbl').querySelectorAll('[data-unrec]').forEach(b => b.onclick = async () => { await api(`/api/bank/${b.dataset.unrec}/unreconcile`, { method: 'POST' }); toast('Conciliação desfeita.'); renderConciliacao(); });
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('lançamento', `/api/bank/${b.dataset.del}`, renderConciliacao));
  };
  ['f-status', 'f-de', 'f-ate'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-clear').onclick = () => {
    $('#f-status').value = 'false'; $('#f-de').value = ''; $('#f-ate').value = '';
    saveFilters(FKEY, {}); draw();
  };

  $('#btn-export').onclick = () => {
    openModal('Exportar Conciliação Bancária',
      `<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato você quer exportar?</p>`,
      [
        { label: 'Cancelar', onClick: closeModal },
        { label: 'Excel', onClick: () => { closeModal(); askConciliacaoModo('excel', lastFiltered); } },
        { label: 'PDF', cls: 'primary', onClick: () => { closeModal(); askConciliacaoModo('pdf', lastFiltered); } }
      ]);
  };

  $('#btn-manual').onclick = () => openModal('Lançamento manual', `
    ${fld('b-date', 'Data', 'date', todayISO())}
    ${fld('b-desc', 'Descrição', 'text', '')}
    ${fld('b-val', 'Valor (negativo = débito)', 'number', '', 'step="0.01"')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Adicionar', cls: 'primary', onClick: async () => {
        try { await api('/api/bank', { method: 'POST', body: { txn_date: $('#b-date').value, description: $('#b-desc').value, amount: Number($('#b-val').value) } });
          closeModal(); toast('Lançamento adicionado.'); renderConciliacao(); } catch (e) { modalError(e.message); }
     }}]);

  $('#btn-import').onclick = () => openModal('Importar extrato bancário', `
    <div class="field"><label>Arquivo (CSV ou Excel)</label><input type="file" id="b-file" accept=".csv,.txt,.xlsx,.xls"></div>
    <p class="hint">CSV: <code>data;descrição;valor</code> — uma linha por lançamento (ex.: <code>05/07/2026;PAG BOLETO REGUS;-12500,00</code>).<br>
    Excel: aceita a planilha de extrato como enviada pelo banco (colunas Data, Histórico e Valor, em qualquer posição — o sistema localiza o cabeçalho sozinho).</p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Importar', cls: 'primary', onClick: async () => {
        const f = $('#b-file').files[0];
        if (!f) return modalError('Selecione um arquivo.');
        try {
          const isExcel = /\.xlsx?$/i.test(f.name);
          const text = isExcel ? await excelToCSV(f) : await f.text();
          const r = await api('/api/bank/import', { method: 'POST', body: { csv: text } });
          closeModal(); toast(`${r.imported} lançamento(s) importado(s)${r.duplicated ? ` · ${r.duplicated} já existente(s) (ignorado)` : ''}${r.skipped ? ` · ${r.skipped} inválido(s)` : ''}.`);
          renderConciliacao();
        } catch (e) { modalError(e.message); }
     }}]);

  draw();
}

// Converte uma planilha de extrato bancário (.xlsx/.xls) para o mesmo formato
// texto "data;descrição;valor" que a importação por CSV já aceita — assim
// reaproveitamos exatamente a mesma rota/validação do servidor, sem duplicar lógica.
// Localiza o cabeçalho procurando colunas com "data" e "valor" no nome (em
// qualquer posição da planilha), então funciona com extratos de bancos
// diferentes, não só o formato de um banco específico.
async function excelToCSV(file) {
  if (!window.XLSX) throw new Error('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

  const norm = s => String(s ?? '').toLowerCase().trim();
  let headerIdx = -1, colData = -1, colDesc = -1, colValor = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(norm);
    const dCol = row.findIndex(c => c.includes('data'));
    const vCol = row.findIndex(c => c.includes('valor'));
    if (dCol > -1 && vCol > -1) {
      headerIdx = i; colData = dCol; colValor = vCol;
      colDesc = row.findIndex(c => c.includes('histor') || c.includes('descri'));
      if (colDesc === -1) colDesc = dCol + 1; // melhor esforço se não achar o nome exato
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Não foi possível identificar as colunas de Data e Valor nesta planilha.');

  const excelSerialToISO = n => {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };
  const toBRDate = v => {
    if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
    if (typeof v === 'number') return excelSerialToISO(v);
    const s = String(v || '').trim();
    return /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s : null;
  };
  const toValor = v => {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : null;
  };

  const lines = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const date = toBRDate(row[colData]);
    const valor = toValor(row[colValor]);
    if (!date || valor === null) continue; // pula linhas de rodapé/resumo sem data+valor válidos
    const desc = String(row[colDesc] ?? '').replace(/\s+/g, ' ').trim() || 'Lançamento importado';
    lines.push(`${date};${desc.replace(/;/g, ',')};${String(valor).replace('.', ',')}`);
  }
  if (!lines.length) throw new Error('Nenhum lançamento válido encontrado na planilha.');
  return lines.join('\n');
}

async function conciliar(t) {
  const sug = await api(`/api/bank/${t.id}/suggestions`);
  const kind = t.amount < 0 ? 'payable' : 'receivable';
  openModal('Conciliar lançamento', `
    <p style="margin-bottom:6px"><strong>${brDate(t.txn_date)}</strong> — ${esc(t.description)}</p>
    <p style="margin-bottom:16px" class="${t.amount >= 0 ? 'pos' : 'neg'}">${brl(t.amount)}</p>
    ${sug.length ? `
      <div class="field"><label>Vincular a um título (${t.amount < 0 ? 'contas a pagar' : 'contas a receber'})</label>
      <select id="c-match">
        <option value="">— Não vincular (marcar apenas como conciliado) —</option>
        ${sug.map(s => `<option value="${s.id}">${brDate(s.ref_date)} · ${esc(s.party || '')} · ${esc(s.description)} · ${brl(s.amount)} ${s.status !== 'pendente' ? '(já baixado)' : ''}</option>`).join('')}
      </select></div>
      <p class="hint">Ao vincular um título pendente, a baixa é registrada automaticamente com a data do extrato.</p>`
      : '<p class="hint">Nenhum título com valor correspondente (±7 dias). O lançamento será marcado como conciliado sem vínculo.</p>'}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar conciliação', cls: 'primary', onClick: async () => {
        const id = sug.length ? $('#c-match').value : '';
        try {
          await api(`/api/bank/${t.id}/reconcile`, { method: 'POST', body: id ? { matched_type: kind, matched_id: Number(id) } : { matched_type: 'manual' } });
          closeModal(); toast('Lançamento conciliado.'); renderConciliacao();
        } catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// ORÇAMENTO ANUAL
// ============================================================
// ============================================================
// ORCAMENTO ANUAL — analises para os relatorios
// Uma funcao so monta tudo o que o resumo e o completo mostram, em PDF e em
// Excel. Mesmo motivo do fechamento de Viaticos: conta repetida em dois lugares
// um dia diverge, e aqui sao quatro saidas lendo os mesmos numeros.
// ============================================================

function orcamentoAnalise(ano, linhas) {
  const meses = MESES;
  const porTipo = tipo => {
    const cats = {};
    linhas.filter(l => l.type === tipo).forEach(l => {
      cats[l.category] = cats[l.category] || Array(12).fill(0);
      cats[l.category][l.month - 1] += Number(l.amount) || 0;
    });
    const lista = Object.entries(cats).map(([cat, m]) => {
      const total = m.reduce((a, b) => a + b, 0);
      const comValor = m.filter(v => v > 0);
      const maior = Math.max(...m), menor = comValor.length ? Math.min(...comValor) : 0;
      return {
        cat, meses: m, total,
        mesesComValor: comValor.length,
        // A media e sobre os meses que TEM valor, nao sobre 12: uma verba que so
        // existe em marco tem media de marco, nao um doze avos dela.
        media: comValor.length ? total / comValor.length : 0,
        mediaAnual: total / 12,
        maiorMes: maior > 0 ? meses[m.indexOf(maior)] : '—', maiorValor: maior,
        menorMes: menor > 0 ? meses[m.indexOf(menor)] : '—', menorValor: menor
      };
    }).sort((a, b) => b.total - a.total);
    const totalMes = Array.from({ length: 12 }, (_, i) => lista.reduce((a, c) => a + c.meses[i], 0));
    const total = lista.reduce((a, c) => a + c.total, 0);
    lista.forEach(c => c.pct = total ? c.total / total : 0);
    return { lista, totalMes, total };
  };

  const receitas = porTipo('receita');
  const despesas = porTipo('despesa');

  // Resultado mes a mes, com acumulado: e onde se ve em que ponto do ano o
  // orcamento vira o sinal.
  let acum = 0;
  const resultado = meses.map((nome, i) => {
    const r = receitas.totalMes[i], d = despesas.totalMes[i], res = r - d;
    acum += res;
    return { mes: nome, receita: r, despesa: d, resultado: res, acumulado: acum, margem: r ? res / r : null };
  });

  // Curva ABC das despesas: onde o dinheiro esta concentrado. A = ate 80% do
  // total acumulado, B ate 95%, C o resto.
  let ac = 0;
  const abc = despesas.lista.map(c => {
    ac += c.pct;
    return { ...c, pctAcum: ac, classe: ac <= 0.8 ? 'A' : ac <= 0.95 ? 'B' : 'C' };
  });

  // Sazonalidade das despesas: quanto cada mes pesa e quanto foge da media.
  const mediaMes = despesas.total / 12;
  const sazonalidade = meses.map((nome, i) => ({
    mes: nome, valor: despesas.totalMes[i],
    pct: despesas.total ? despesas.totalMes[i] / despesas.total : 0,
    desvio: mediaMes ? (despesas.totalMes[i] - mediaMes) / mediaMes : 0
  }));

  // Observacoes que o leitor teria de garimpar olhando as tabelas.
  const alertas = [];
  const mesesNegativos = resultado.filter(r => r.resultado < 0);
  if (mesesNegativos.length) alertas.push(`${mesesNegativos.length} mês(es) com despesa orçada acima da receita: ${mesesNegativos.map(m => m.mes).join(', ')}.`);
  if (!receitas.total && despesas.total) alertas.push('Não há receita orçada para o ano — o resultado é integralmente negativo.');
  const classeA = abc.filter(c => c.classe === 'A');
  if (classeA.length && despesas.lista.length > 2) {
    alertas.push(`${classeA.length} de ${despesas.lista.length} categorias concentram 80% da despesa orçada (${classeA.map(c => c.cat).join(', ')}).`);
  }
  const parciais = despesas.lista.filter(c => c.mesesComValor > 0 && c.mesesComValor < 12);
  if (parciais.length) alertas.push(`${parciais.length} categoria(s) de despesa não têm valor nos 12 meses — confira se é sazonal ou se ficou faltando lançar.`);
  const kpis = {
    receita: receitas.total, despesa: despesas.total,
    resultado: receitas.total - despesas.total,
    margem: receitas.total ? (receitas.total - despesas.total) / receitas.total : null,
    catReceitas: receitas.lista.length, catDespesas: despesas.lista.length,
    mediaMensalDespesa: despesas.total / 12, mediaMensalReceita: receitas.total / 12,
    mesesNegativos: mesesNegativos.length
  };

  return { ano, receitas, despesas, resultado, abc, sazonalidade, alertas, kpis };
}

// Percentual com uma casa, e travessao quando nao ha base de comparacao.
const orcPct = v => (v === null || v === undefined || !isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';

function exportOrcamentoResumoPDF(a) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { doc, pageW, rodape } = relatorioPDF('Orçamento Anual — Resumo',
      { modulo: 'Orçamento Anual', subtitulo: `Exercício de ${a.ano}` });
    const k = a.kpis, M = { halign: 'right' };

    relatorioFaixa(doc, pageW, 29,
      `Receita orçada: ${brl(k.receita)}  ·  Despesa orçada: ${brl(k.despesa)}  ·  Resultado: ${brl(k.resultado)}  ·  Margem: ${orcPct(k.margem)}`);

    const secao = (titulo, minimo = 34) => {
      let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 45) + 9;
      if (y + minimo > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 22; }
      return relatorioSecao(doc, y, titulo);
    };
    const bloco = (titulo, g) => {
      if (!g.lista.length) return;
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: secao(titulo),
        head: [['Categoria', 'Total no ano', '% do total', 'Média mensal', 'Meses com valor', 'Maior mês']],
        body: g.lista.map(c => [c.cat, brl(c.total), orcPct(c.pct), brl(c.mediaAnual), `${c.mesesComValor}/12`, `${c.maiorMes} (${brl(c.maiorValor)})`]),
        foot: [['Total', brl(g.total), '100,0%', brl(g.total / 12), '', '']],
        footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: M, 2: M, 3: M, 4: { halign: 'center' } }
      }));
    };
    bloco('Receitas orçadas', a.receitas);
    bloco('Despesas orçadas', a.despesas);

    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Resultado mês a mês'),
      head: [['Mês', 'Receita', 'Despesa', 'Resultado', 'Acumulado', 'Margem']],
      body: a.resultado.map(r => [r.mes, brl(r.receita), brl(r.despesa), brl(r.resultado), brl(r.acumulado), orcPct(r.margem)]),
      foot: [['Ano', brl(k.receita), brl(k.despesa), brl(k.resultado), brl(k.resultado), orcPct(k.margem)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: M, 2: M, 3: M, 4: M, 5: M },
      // Resultado negativo em vermelho: e o que o leitor procura na tabela.
      didParseCell: h => {
        if (h.section === 'body' && (h.column.index === 3 || h.column.index === 4)) {
          const r = a.resultado[h.row.index];
          const v = h.column.index === 3 ? r.resultado : r.acumulado;
          if (v < 0) h.cell.styles.textColor = REL_VERMELHO;
        }
      }
    }));

    doc.save(`orcamento_${a.ano}_resumo_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o PDF: ' + e.message); }
}

function exportOrcamentoCompletoPDF(a) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { doc, pageW, rodape } = relatorioPDF('Orçamento Anual — Análise completa',
      { modulo: 'Orçamento Anual', subtitulo: `Exercício de ${a.ano}` });
    const k = a.kpis, M = { halign: 'right' };

    relatorioFaixa(doc, pageW, 29,
      `Receita orçada: ${brl(k.receita)}  ·  Despesa orçada: ${brl(k.despesa)}  ·  Resultado: ${brl(k.resultado)}  ·  Margem: ${orcPct(k.margem)}`);
    relatorioFaixa(doc, pageW, 47,
      `${k.catReceitas} categoria(s) de receita · ${k.catDespesas} de despesa · média mensal de despesa ${brl(k.mediaMensalDespesa)} · ${k.mesesNegativos} mês(es) no vermelho`);

    const secao = (titulo, minimo = 34) => {
      let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 63) + 9;
      if (y + minimo > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 22; }
      return relatorioSecao(doc, y, titulo);
    };
    // Grade de 12 meses: fonte menor, senao nao cabe na folha.
    const estiloGrade = {
      styles: { font: 'helvetica', fontSize: 6.3, cellPadding: 1.3, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: REL_VERDE, textColor: 255, fontStyle: 'bold', fontSize: 6.3 },
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 6.3 }
    };
    const colunasNum = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, M]));

    // ---- 1 e 2. Grades mensais ----
    const grade = (titulo, g) => {
      if (!g.lista.length) return;
      doc.autoTable(relatorioTabelaEstilo(rodape, Object.assign({
        startY: secao(titulo),
        head: [['Categoria', ...MESES, 'Total', '%']],
        body: g.lista.map(c => [c.cat, ...c.meses.map(v => v ? brl(v) : '—'), brl(c.total), orcPct(c.pct)]),
        foot: [['Total', ...g.totalMes.map(v => v ? brl(v) : '—'), brl(g.total), '100,0%']],
        columnStyles: colunasNum(14)
      }, estiloGrade)));
    };
    grade('Receitas orçadas — grade mensal', a.receitas);
    grade('Despesas orçadas — grade mensal', a.despesas);

    // ---- 3. Resultado mensal ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Resultado orçado mês a mês'),
      head: [['Mês', 'Receita', 'Despesa', 'Resultado', 'Acumulado', 'Margem']],
      body: a.resultado.map(r => [r.mes, brl(r.receita), brl(r.despesa), brl(r.resultado), brl(r.acumulado), orcPct(r.margem)]),
      foot: [['Ano', brl(k.receita), brl(k.despesa), brl(k.resultado), brl(k.resultado), orcPct(k.margem)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: M, 2: M, 3: M, 4: M, 5: M },
      didParseCell: h => {
        if (h.section === 'body' && (h.column.index === 3 || h.column.index === 4)) {
          const r = a.resultado[h.row.index];
          if ((h.column.index === 3 ? r.resultado : r.acumulado) < 0) h.cell.styles.textColor = REL_VERMELHO;
        }
      }
    }));

    // ---- 4. Curva ABC ----
    if (a.abc.length) {
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: secao('Concentração da despesa — curva ABC'),
        head: [['Classe', 'Categoria', 'Total no ano', '% do total', '% acumulado', 'Média mensal', 'Meses com valor']],
        body: a.abc.map(c => [c.classe, c.cat, brl(c.total), orcPct(c.pct), orcPct(c.pctAcum), brl(c.mediaAnual), `${c.mesesComValor}/12`]),
        columnStyles: { 0: { halign: 'center' }, 2: M, 3: M, 4: M, 5: M, 6: { halign: 'center' } },
        didParseCell: h => {
          if (h.section === 'body' && h.column.index === 0) {
            const cl = a.abc[h.row.index].classe;
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.textColor = cl === 'A' ? REL_VERMELHO : cl === 'B' ? [138, 100, 20] : REL_CINZA;
          }
        }
      }));
    }

    // ---- 5. Sazonalidade ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Sazonalidade da despesa orçada'),
      head: [['Mês', 'Despesa orçada', '% do ano', 'Desvio da média mensal']],
      body: a.sazonalidade.map(s => [s.mes, brl(s.valor), orcPct(s.pct), (s.desvio >= 0 ? '+' : '') + orcPct(s.desvio)]),
      foot: [['Ano', brl(a.despesas.total), '100,0%', `média ${brl(k.mediaMensalDespesa)}`]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: M, 2: M, 3: M },
      didParseCell: h => {
        if (h.section === 'body' && h.column.index === 3 && a.sazonalidade[h.row.index].desvio > 0.25) h.cell.styles.textColor = REL_VERMELHO;
      }
    }));

    // ---- 6. Observacoes ----
    if (a.alertas.length) {
      let y = secao('Observações', 20);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 70, 64);
      a.alertas.forEach(t => {
        const linhas = doc.splitTextToSize('•  ' + t, pageW - REL_MARGIN * 2 - 4);
        if (y + linhas.length * 4.2 > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); rodape(); y = 22; }
        doc.text(linhas, REL_MARGIN + 2, y);
        y += linhas.length * 4.2 + 1.6;
      });
    }
    doc.save(`orcamento_${a.ano}_completo_${todayISO()}.pdf`);
    toast('PDF de análise completa gerado.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o PDF: ' + e.message); }
}

// Excel do orcamento, no mesmo padrao do fechamento de Viaticos: cabecalho com
// a identidade da ProAgro por aba, tabelas com zebra e linha de total.
async function exportOrcamentoExcel(a, completo) {
  if (!window.ExcelJS) return exportOrcamentoExcelSimples(a, completo);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME;
    wb.created = new Date();
    const now = new Date();
    const sub = `Exercício de ${a.ano} · gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`;
    const idLogo = wb.addImage({ base64: LOGO_PROAGRO_PNG, extension: 'png' });
    const k = a.kpis, R = 'right', C = 'center';
    const PCT = '0.0%';

    // ---------- Aba 1: Resumo ----------
    const ws1 = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    let L = aporteXlCabecalho(wb, ws1, sub, idLogo, [38, 20, 20, 20], `Orçamento ${a.ano} — Resumo`);
    aporteXlCabecalhoColunas(ws1, L, ['Indicador', 'Valor', 'Média mensal', 'Categorias'], ['left', R, R, C]); L++;
    L = aporteXlCorpo(ws1, L, [
      ['Receita orçada', k.receita, k.mediaMensalReceita, k.catReceitas],
      ['Despesa orçada', k.despesa, k.mediaMensalDespesa, k.catDespesas],
      ['Resultado orçado', k.resultado, k.resultado / 12, null],
      ['Meses com resultado negativo', k.mesesNegativos, null, null]
    ], [1, 2], ['left', R, R, C]);
    // A margem e percentual de verdade, nao texto: da para usar em formula.
    ws1.getCell(L, 1).value = 'Margem orçada';
    ws1.getCell(L, 2).value = k.margem;
    ws1.getCell(L, 2).numFmt = PCT;
    ws1.getCell(L, 1).font = { name: XL_FONTE, size: 9.5, color: { argb: APORTE_XL.ink2 } };
    ws1.getCell(L, 2).font = { name: XL_FONTE, size: 9.5, color: { argb: APORTE_XL.ink2 } };
    ws1.getCell(L, 1).border = xlTodasBordas; ws1.getCell(L, 2).border = xlTodasBordas;
    ws1.getCell(L, 2).alignment = { horizontal: R, vertical: 'middle' };
    L += 3;

    aporteXlTituloTabela(ws1, L, 'Resultado mês a mês', 6); L++;
    aporteXlCabecalhoColunas(ws1, L, ['Mês', 'Receita', 'Despesa', 'Resultado', 'Acumulado', 'Margem'], ['left', R, R, R, R, R]); L++;
    const l1 = L;
    L = aporteXlCorpo(ws1, L, a.resultado.map(r => [r.mes, r.receita, r.despesa, r.resultado, r.acumulado, r.margem]), [1, 2, 3, 4], ['left', R, R, R, R, R]);
    a.resultado.forEach((_, i) => { ws1.getCell(l1 + i, 6).numFmt = PCT; });
    aporteXlTotal(ws1, L, ['Ano', k.receita, k.despesa, k.resultado, k.resultado, k.margem], [1, 2, 3, 4], ['left', R, R, R, R, R]);
    ws1.getCell(L, 6).numFmt = PCT;

    // ---------- Grades mensais (uma aba por tipo) ----------
    const abaGrade = (nome, titulo, g) => {
      const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false }] });
      const larg = [30, ...MESES.map(() => 13), 15, 9];
      let l = aporteXlCabecalho(wb, ws, sub, idLogo, larg, titulo);
      const alinha = ['left', ...MESES.map(() => R), R, R];
      const moeda = MESES.map((_, i) => i + 1).concat([13]);
      aporteXlCabecalhoColunas(ws, l, ['Categoria', ...MESES, 'Total', '%'], alinha);
      const cab = l; l++;
      const ini = l;
      l = aporteXlCorpo(ws, l, g.lista.map(c => [c.cat, ...c.meses, c.total, c.pct]), moeda, alinha);
      g.lista.forEach((_, i) => { ws.getCell(ini + i, 15).numFmt = PCT; });
      aporteXlTotal(ws, l, ['Total', ...g.totalMes, g.total, 1], moeda, alinha);
      ws.getCell(l, 15).numFmt = PCT;
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: cab, showGridLines: false }];
      return ws;
    };
    abaGrade('Receitas', 'Receitas orçadas — grade mensal', a.receitas);
    abaGrade('Despesas', 'Despesas orçadas — grade mensal', a.despesas);

    if (completo) {
      // ---------- Curva ABC ----------
      const ws4 = wb.addWorksheet('Curva ABC', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws4, sub, idLogo, [10, 32, 18, 12, 14, 18, 14], 'Concentração da despesa — curva ABC');
      aporteXlCabecalhoColunas(ws4, L, ['Classe', 'Categoria', 'Total no ano', '% do total', '% acumulado', 'Média mensal', 'Meses com valor'],
        [C, 'left', R, R, R, R, C]); L++;
      const i4 = L;
      L = aporteXlCorpo(ws4, L, a.abc.map(c => [c.classe, c.cat, c.total, c.pct, c.pctAcum, c.mediaAnual, `${c.mesesComValor}/12`]),
        [2, 5], [C, 'left', R, R, R, R, C]);
      a.abc.forEach((_, i) => { ws4.getCell(i4 + i, 4).numFmt = PCT; ws4.getCell(i4 + i, 5).numFmt = PCT; });
      aporteXlTotal(ws4, L, ['', 'Total', a.despesas.total, 1, 1, a.despesas.total / 12, ''], [2, 5], [C, 'left', R, R, R, R, C]);
      ws4.getCell(L, 4).numFmt = PCT; ws4.getCell(L, 5).numFmt = PCT;

      // ---------- Sazonalidade ----------
      const ws5 = wb.addWorksheet('Sazonalidade', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws5, sub, idLogo, [14, 20, 14, 22], 'Sazonalidade da despesa orçada');
      aporteXlCabecalhoColunas(ws5, L, ['Mês', 'Despesa orçada', '% do ano', 'Desvio da média mensal'], ['left', R, R, R]); L++;
      const i5 = L;
      L = aporteXlCorpo(ws5, L, a.sazonalidade.map(s => [s.mes, s.valor, s.pct, s.desvio]), [1], ['left', R, R, R]);
      a.sazonalidade.forEach((_, i) => { ws5.getCell(i5 + i, 3).numFmt = PCT; ws5.getCell(i5 + i, 4).numFmt = '+0.0%;-0.0%;0.0%'; });
      aporteXlTotal(ws5, L, ['Ano', a.despesas.total, 1, k.mediaMensalDespesa], [1, 3], ['left', R, R, R]);
      ws5.getCell(L, 3).numFmt = PCT;

      // ---------- Observações ----------
      const ws9 = wb.addWorksheet('Observações', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws9, sub, idLogo, [110], 'Observações da análise');
      aporteXlCabecalhoColunas(ws9, L, ['Ponto de atenção'], ['left']); L++;
      const obs = a.alertas.length ? a.alertas : ['Nenhum ponto de atenção identificado no orçamento deste exercício.'];
      L = aporteXlCorpo(ws9, L, obs.map(t => [t]), [], ['left']);
      ws9.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };
    }

    const buf = await wb.xlsx.writeBuffer();
    aporteBaixarPlanilha(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `orcamento_${a.ano}_${completo ? 'completo' : 'resumo'}_${todayISO()}.xlsx`);
    toast('Excel gerado.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o Excel: ' + e.message); }
}

// Reserva sem estilo, se o ExcelJS nao tiver carregado.
function exportOrcamentoExcelSimples(a, completo) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const wb = XLSX.utils.book_new();
  const add = (nome, aoa, colsMoeda) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let r = 1; r < aoa.length; r++) (colsMoeda || []).forEach(ci => {
      const ref = XLSX.utils.encode_cell({ r, c: ci }); if (ws[ref]) ws[ref].z = MONEY;
    });
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  const k = a.kpis;
  add('Resumo', [['Indicador', 'Valor'], ['Receita orçada', k.receita], ['Despesa orçada', k.despesa],
    ['Resultado', k.resultado], ['Margem', k.margem], ['Meses negativos', k.mesesNegativos]], [1]);
  add('Resultado mensal', [['Mês', 'Receita', 'Despesa', 'Resultado', 'Acumulado'],
    ...a.resultado.map(r => [r.mes, r.receita, r.despesa, r.resultado, r.acumulado])], [1, 2, 3, 4]);
  const grade = g => [['Categoria', ...MESES, 'Total'], ...g.lista.map(c => [c.cat, ...c.meses, c.total])];
  add('Receitas', grade(a.receitas), MESES.map((_, i) => i + 1).concat([13]));
  add('Despesas', grade(a.despesas), MESES.map((_, i) => i + 1).concat([13]));
  if (completo) {
    add('Curva ABC', [['Classe', 'Categoria', 'Total', '% do total', '% acumulado'],
      ...a.abc.map(c => [c.classe, c.cat, c.total, c.pct, c.pctAcum])], [2]);
    add('Sazonalidade', [['Mês', 'Despesa orçada', '% do ano', 'Desvio'],
      ...a.sazonalidade.map(s => [s.mes, s.valor, s.pct, s.desvio])], [1]);
    add('Observações', [['Ponto de atenção'], ...(a.alertas.length ? a.alertas : ['Nenhum ponto de atenção.']).map(t => [t])]);
  }
  XLSX.writeFile(wb, `orcamento_${a.ano}_${completo ? 'completo' : 'resumo'}_${todayISO()}.xlsx`);
  toast('Excel gerado (sem formatação).');
}

async function renderOrcamento() {
  const year = Number(sessionStorage.getItem('orc-year')) || new Date().getFullYear();
  const rows = await api('/api/budgets/' + year);
  const c = $('#content');

  // organiza {type: {category: [12]}}
  const grid = { despesa: {}, receita: {} };
  rows.forEach(r => {
    grid[r.type][r.category] = grid[r.type][r.category] || Array(12).fill(0);
    grid[r.type][r.category][r.month - 1] = r.amount;
  });

  const tableFor = (type, cats) => {
    const existing = Object.keys(grid[type]);
    const allCats = [...new Set([...existing, ...[]])];
    return `
      <div class="card" style="margin-bottom:16px">
        <h3>${type === 'receita' ? 'Receitas orçadas' : 'Despesas orçadas'}
          <button class="btn sm" data-addcat="${type}">+ Adicionar categoria</button></h3>
        <div style="overflow-x:auto"><table class="budget-grid" data-type="${type}">
          <thead><tr><th>Categoria</th>${MESES.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th><th></th></tr></thead>
          <tbody>${allCats.map(cat => {
            const vals = grid[type][cat];
            return `<tr data-cat="${esc(cat)}">
              <td><strong>${esc(cat)}</strong></td>
              ${vals.map((v, i) => `<td class="num"><input data-month="${i + 1}" value="${v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : ''}" placeholder="0"></td>`).join('')}
              <td class="num row-total">${brl(vals.reduce((a, b) => a + b, 0))}</td>
              <td class="actions"><button class="btn sm" data-fill title="Replicar valor de Jan para todos os meses">→12</button>
                <button class="btn sm danger-ghost" data-delcat>×</button></td>
            </tr>`;
          }).join('') || `<tr><td colspan="15"><div class="empty">Nenhuma categoria orçada. Clique em "+ Adicionar categoria".</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  };

  c.innerHTML = `
    <div class="toolbar">
      <label style="font-weight:600; font-size:13px">Ano do orçamento:</label>
      <input type="number" id="o-year" value="${year}" min="2020" max="2100" style="width:100px">
      <div class="spacer"></div>
      <button class="btn" id="btn-orc-export">Exportar</button>
      <button class="btn primary" id="btn-save">Salvar orçamento</button>
    </div>
    ${tableFor('receita', CAT_RECEITA)}
    ${tableFor('despesa', CAT_DESPESA)}
    <p class="hint">Digite os valores mensais orçados. O botão <strong>→12</strong> replica o valor de janeiro para os 12 meses. Clique em <strong>Salvar orçamento</strong> para gravar.</p>`;

  $('#o-year').onchange = e => { sessionStorage.setItem('orc-year', e.target.value); renderOrcamento(); };

  // Exportar: mesma lógica do de Viáticos — primeiro qual relatório, depois o
  // formato. Usa o que está gravado no ano, não o que está digitado na tela e
  // ainda não foi salvo; o aviso no modal deixa isso explícito.
  $('#btn-orc-export').onclick = () => {
    openModal(`Exportar orçamento de ${year}`, `
      <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:4px">Qual relatório você quer?</p>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px">Exporta o orçamento <strong>gravado</strong> do exercício de ${year}. Se houver alteração na tela ainda não salva, clique antes em "Salvar orçamento".</p>
      <div class="rel-opcoes">
        <button class="rel-opcao" data-orc="resumo" type="button">
          <strong>Resumo</strong>
          <span>Uma linha por categoria com total do ano, participação e média mensal, mais o resultado mês a mês.</span>
        </button>
        <button class="rel-opcao" data-orc="completo" type="button">
          <strong>Análise completa</strong>
          <span>Grade dos 12 meses por categoria, resultado mês a mês com acumulado, curva ABC de concentração, sazonalidade e os pontos de atenção. O confronto com o realizado fica em "Orçado x Realizado".</span>
        </button>
      </div>`,
      [{ label: 'Cancelar', onClick: closeModal }]);
    document.querySelectorAll('.rel-opcao').forEach(b => b.onclick = () => {
      closeModal();
      askOrcamentoFormato(b.dataset.orc);
    });
  };

  const askOrcamentoFormato = tipo => openModal(
    `Exportar — ${tipo === 'completo' ? 'Análise completa' : 'Resumo'}`,
    `<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato?</p>
     <p style="font-size:12px; color:var(--muted); margin-top:6px">${tipo === 'completo'
        ? 'O Excel sai com uma aba por bloco de análise; o PDF traz tudo num documento só.'
        : 'Os dois seguem o padrão de relatório da plataforma.'}</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Excel', onClick: () => { closeModal(); gerarOrcamentoRelatorio(tipo, 'excel'); } },
      { label: 'PDF', cls: 'primary', onClick: () => { closeModal(); gerarOrcamentoRelatorio(tipo, 'pdf'); } }
    ]);

  async function gerarOrcamentoRelatorio(tipo, formato) {
    try {
      if (!rows.length) return toast('Não há orçamento gravado para ' + year + '.');
      toast('Montando o relatório…');
      const a = orcamentoAnalise(year, rows);
      if (formato === 'excel') return exportOrcamentoExcel(a, tipo === 'completo');
      return tipo === 'completo' ? exportOrcamentoCompletoPDF(a) : exportOrcamentoResumoPDF(a);
    } catch (e) {
      toast(e.message || 'Não foi possível montar o relatório.');
    }
  }

  const recalcRow = tr => {
    let t = 0;
    tr.querySelectorAll('input').forEach(i => t += num(i.value));
    tr.querySelector('.row-total').textContent = brl(t);
  };
  c.querySelectorAll('.budget-grid tbody tr[data-cat]').forEach(tr => {
    tr.querySelectorAll('input').forEach(i => i.oninput = () => recalcRow(tr));
    const fill = tr.querySelector('[data-fill]');
    if (fill) fill.onclick = () => {
      const first = tr.querySelector('input[data-month="1"]').value;
      tr.querySelectorAll('input').forEach(i => i.value = first);
      recalcRow(tr);
    };
    const del = tr.querySelector('[data-delcat]');
    if (del) del.onclick = async () => {
      const type = tr.closest('table').dataset.type, cat = tr.dataset.cat;
      if (!confirm(`Remover a categoria "${cat}" do orçamento de ${year}?`)) return;
      await api(`/api/budgets/${year}/category`, { method: 'DELETE', body: { type, category: cat } });
      toast('Categoria removida.'); renderOrcamento();
    };
  });

  c.querySelectorAll('[data-addcat]').forEach(b => b.onclick = () => {
    const type = b.dataset.addcat;
    const list = type === 'receita' ? CAT_RECEITA : CAT_DESPESA;
    const available = list.filter(x => !grid[type][x]);
    openModal('Adicionar categoria ao orçamento', `
      ${fldSel('nc-cat', 'Categoria', [...available.map(x => ({ v: x, t: x })), { v: '__custom', t: 'Outra (digitar)…' }], available[0] || '__custom')}
      <div class="field" id="nc-custom-wrap" style="display:none"><label>Nome da categoria</label><input id="nc-custom"></div>
      ${fld('nc-val', 'Valor mensal inicial (aplicado aos 12 meses)', 'number', '0', 'step="0.01" min="0"')}`,
      [{ label: 'Cancelar', onClick: closeModal },
       { label: 'Adicionar', cls: 'primary', onClick: async () => {
          const sel = $('#nc-cat').value;
          const cat = sel === '__custom' ? $('#nc-custom').value.trim() : sel;
          if (!cat) return modalError('Informe a categoria.');
          const v = Number($('#nc-val').value) || 0;
          const items = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, type, category: cat, amount: v }));
          await api('/api/budgets/' + year, { method: 'POST', body: { items } });
          closeModal(); toast('Categoria adicionada.'); renderOrcamento();
       }}]);
    setTimeout(() => { $('#nc-cat').onchange = e => $('#nc-custom-wrap').style.display = e.target.value === '__custom' ? 'block' : 'none';
      if ($('#nc-cat').value === '__custom') $('#nc-custom-wrap').style.display = 'block'; }, 0);
  });

  $('#btn-save').onclick = async () => {
    const items = [];
    c.querySelectorAll('.budget-grid').forEach(tbl => {
      const type = tbl.dataset.type;
      tbl.querySelectorAll('tbody tr[data-cat]').forEach(tr => {
        const cat = tr.dataset.cat;
        tr.querySelectorAll('input').forEach(i => items.push({ month: Number(i.dataset.month), type, category: cat, amount: num(i.value) }));
      });
    });
    await api('/api/budgets/' + year, { method: 'POST', body: { items } });
    toast(`Orçamento ${year} salvo com sucesso.`);
  };
}

// ============================================================
// ORÇADO x REALIZADO
// ============================================================
// ============================================================
// ORCADO x REALIZADO — analises para os relatorios
// As regras de corte (situacao, faixa de atencao, o que e "bom") sao as MESMAS
// da tela: se o relatorio classificasse diferente, o documento impresso diria
// uma coisa e o sistema outra sobre a mesma categoria.
// ============================================================

// Receita acima do orcado e bom; despesa acima do orcado e ruim.
const ovrFavoravel = (linha, tipo) => tipo === 'receita' ? linha.dif >= 0 : linha.dif <= 0;

function ovrSituacao(linha, tipo) {
  if (linha.pct === null) return 'Sem orçamento';
  if (ovrFavoravel(linha, tipo)) return 'Dentro do orçado';
  if (Math.abs(linha.dif) / (linha.orc || 1) <= 0.1) return 'Atenção (±10%)';
  return tipo === 'receita' ? 'Abaixo do orçado' : 'Acima do orçado';
}

function orcadoRealAnalise(ano, escopo, maxM, budgets, actuals) {
  const cruzar = (tipo, reais) => {
    const mapa = {};
    budgets.filter(b => b.type === tipo && b.month <= maxM).forEach(b => {
      mapa[b.category] = mapa[b.category] || { orc: 0, real: 0 };
      mapa[b.category].orc += Number(b.amount) || 0;
    });
    (reais || []).filter(a => a.month <= maxM).forEach(a => {
      mapa[a.category] = mapa[a.category] || { orc: 0, real: 0 };
      mapa[a.category].real += Number(a.total) || 0;
    });
    return Object.entries(mapa).map(([cat, v]) => {
      const l = { cat, ...v, dif: v.real - v.orc, pct: v.orc ? (v.real / v.orc) * 100 : null };
      return { ...l, situacao: ovrSituacao(l, tipo), favoravel: ovrFavoravel(l, tipo) };
    }).sort((a, b) => b.orc - a.orc);
  };

  const receitas = cruzar('receita', actuals.receitas);
  const despesas = cruzar('despesa', actuals.despesas);

  const soma = (lista, campo) => lista.reduce((s, l) => s + l[campo], 0);
  const bloco = (lista, tipo) => {
    const orc = soma(lista, 'orc'), real = soma(lista, 'real');
    const comOrc = lista.filter(l => l.orc > 0);
    const desfavoraveis = comOrc.filter(l => !l.favoravel);
    return {
      tipo, lista, orc, real, dif: real - orc,
      pct: orc ? (real / orc) * 100 : null,
      comOrcamento: comOrc.length,
      desfavoraveis: desfavoraveis.length,
      semOrcamento: lista.filter(l => l.orc === 0 && l.real > 0),
      semRealizado: lista.filter(l => l.orc > 0 && l.real === 0),
      // Maior desvio em dinheiro e maior desvio proporcional respondem perguntas
      // diferentes: um aponta o impacto, o outro o descontrole.
      maiorDesvioValor: [...comOrc].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))[0] || null,
      maiorDesvioPct: [...comOrc].sort((a, b) => (b.pct || 0) - (a.pct || 0))[0] || null
    };
  };
  const bDesp = bloco(despesas, 'despesa');
  const bRec = bloco(receitas, 'receita');

  // Mes a mes, dentro do escopo escolhido.
  const porMes = MESES.slice(0, maxM).map((nome, i) => {
    const m = i + 1;
    const so = (linhas, filtro) => linhas.filter(filtro).reduce((s, x) => s + (Number(x.amount ?? x.total) || 0), 0);
    const dOrc = so(budgets, b => b.type === 'despesa' && b.month === m);
    const dReal = so(actuals.despesas || [], a => a.month === m);
    const rOrc = so(budgets, b => b.type === 'receita' && b.month === m);
    const rReal = so(actuals.receitas || [], a => a.month === m);
    return {
      mes: nome,
      despesaOrc: dOrc, despesaReal: dReal, difDespesa: dReal - dOrc, pctDespesa: dOrc ? (dReal / dOrc) * 100 : null,
      receitaOrc: rOrc, receitaReal: rReal, difReceita: rReal - rOrc, pctReceita: rOrc ? (rReal / rOrc) * 100 : null,
      resultadoOrc: rOrc - dOrc, resultadoReal: rReal - dReal
    };
  });
  let accO = 0, accR = 0;
  porMes.forEach(m => { accO += m.resultadoOrc; accR += m.resultadoReal; m.acumuladoOrc = accO; m.acumuladoReal = accR; });

  // Ranking de desvios da despesa: estouros primeiro, economias depois.
  const comOrcDesp = despesas.filter(l => l.orc > 0);
  const estouros = comOrcDesp.filter(l => l.dif > 0).sort((a, b) => b.dif - a.dif);
  const economias = comOrcDesp.filter(l => l.dif < 0).sort((a, b) => a.dif - b.dif);

  // Aderencia: quantas categorias caem em cada faixa. E a leitura de "o
  // orcamento esta sendo cumprido?" que nenhuma linha isolada responde.
  const faixas = [
    { faixa: 'Dentro do orçado', teste: l => l.favoravel },
    { faixa: 'Até 10% acima', teste: l => !l.favoravel && Math.abs(l.dif) / (l.orc || 1) <= 0.1 },
    { faixa: 'Mais de 10% acima', teste: l => !l.favoravel && Math.abs(l.dif) / (l.orc || 1) > 0.1 }
  ].map(f => {
    const linhas = comOrcDesp.filter(f.teste);
    return {
      faixa: f.faixa, categorias: linhas.length,
      pctCategorias: comOrcDesp.length ? linhas.length / comOrcDesp.length : 0,
      orcado: soma(linhas, 'orc'), realizado: soma(linhas, 'real')
    };
  });

  const alertas = [];
  if (bDesp.dif > 0) alertas.push(`A despesa realizada está ${brl(bDesp.dif)} acima do orçado no período (${(bDesp.pct || 0).toFixed(1)}% do previsto).`);
  else if (bDesp.orc) alertas.push(`A despesa realizada está ${brl(Math.abs(bDesp.dif))} abaixo do orçado no período.`);
  if (estouros.length) alertas.push(`${estouros.length} categoria(s) de despesa passaram do orçado; a maior é ${estouros[0].cat}, com ${brl(estouros[0].dif)} a mais.`);
  if (bDesp.semOrcamento.length) alertas.push(`${bDesp.semOrcamento.length} categoria(s) tiveram despesa sem estar no orçamento: ${bDesp.semOrcamento.map(l => l.cat).join(', ')}.`);
  if (bDesp.semRealizado.length) alertas.push(`${bDesp.semRealizado.length} categoria(s) orçadas ainda não tiveram nenhum gasto no período.`);
  if (bRec.orc && bRec.dif < 0) alertas.push(`A receita realizada está ${brl(Math.abs(bRec.dif))} abaixo do orçado (${(bRec.pct || 0).toFixed(1)}% do previsto).`);
  const mesesRuins = porMes.filter(m => m.resultadoReal < 0);
  if (mesesRuins.length) alertas.push(`${mesesRuins.length} mês(es) fecharam com resultado realizado negativo: ${mesesRuins.map(m => m.mes).join(', ')}.`);

  return {
    ano, escopo, maxM,
    periodo: escopo === 'ytd' ? `Acumulado de Jan a ${MESES[maxM - 1]} de ${ano}` : `Ano completo de ${ano}`,
    despesas: bDesp, receitas: bRec, porMes, estouros, economias, faixas, alertas
  };
}

// Percentual "% realizado" ja vem na escala 0-100 da tela, entao nao multiplica.
const ovrPct = v => (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(1).replace('.', ',') + '%';
const ovrSinal = v => (v >= 0 ? '+' : '') + brl(v);

function ovrTabelaCategorias(doc, rodape, startY, lista, tipo) {
  const M = { halign: 'right' };
  const soma = c => lista.reduce((s, l) => s + l[c], 0);
  const orc = soma('orc'), real = soma('real');
  doc.autoTable(relatorioTabelaEstilo(rodape, {
    startY,
    head: [['Categoria', 'Orçado', 'Realizado', 'Variação', '% realizado', 'Situação']],
    body: lista.map(l => [l.cat, brl(l.orc), brl(l.real), ovrSinal(l.dif), ovrPct(l.pct), l.situacao]),
    foot: [['Total', brl(orc), brl(real), ovrSinal(real - orc), ovrPct(orc ? (real / orc) * 100 : null), '']],
    footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 1: M, 2: M, 3: M, 4: M },
    didParseCell: h => {
      if (h.section !== 'body') return;
      const l = lista[h.row.index];
      if ((h.column.index === 3 || h.column.index === 5) && !l.favoravel && l.pct !== null) h.cell.styles.textColor = REL_VERMELHO;
      if (h.column.index === 5 && l.pct === null) h.cell.styles.textColor = REL_CINZA;
    }
  }));
}

function exportOvrResumoPDF(a) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { doc, pageW, rodape } = relatorioPDF('Orçado × Realizado — Resumo',
      { modulo: 'Orçado x Realizado', subtitulo: a.periodo });
    const d = a.despesas, r = a.receitas;

    relatorioFaixa(doc, pageW, 29,
      `Despesa — orçado: ${brl(d.orc)}  ·  realizado: ${brl(d.real)}  ·  variação: ${ovrSinal(d.dif)}  (${ovrPct(d.pct)} do previsto)`);
    relatorioFaixa(doc, pageW, 47,
      `Receita — orçado: ${brl(r.orc)}  ·  realizado: ${brl(r.real)}  ·  variação: ${ovrSinal(r.dif)}  ·  ${d.desfavoraveis} de ${d.comOrcamento} categoria(s) de despesa acima do orçado`);

    const secao = (titulo, minimo = 34) => {
      let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 63) + 9;
      if (y + minimo > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 22; }
      return relatorioSecao(doc, y, titulo);
    };
    if (d.lista.length) ovrTabelaCategorias(doc, rodape, secao('Despesas por categoria'), d.lista, 'despesa');
    if (r.lista.length) ovrTabelaCategorias(doc, rodape, secao('Receitas por categoria'), r.lista, 'receita');

    doc.save(`orcado_x_realizado_${a.ano}_resumo_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o PDF: ' + e.message); }
}

function exportOvrCompletoPDF(a) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const { doc, pageW, rodape } = relatorioPDF('Orçado × Realizado — Análise completa',
      { modulo: 'Orçado x Realizado', subtitulo: a.periodo });
    const d = a.despesas, r = a.receitas, M = { halign: 'right' };

    relatorioFaixa(doc, pageW, 29,
      `Despesa — orçado: ${brl(d.orc)}  ·  realizado: ${brl(d.real)}  ·  variação: ${ovrSinal(d.dif)}  (${ovrPct(d.pct)} do previsto)`);
    relatorioFaixa(doc, pageW, 47,
      `Receita — orçado: ${brl(r.orc)}  ·  realizado: ${brl(r.real)}  ·  variação: ${ovrSinal(r.dif)}  ·  ${d.desfavoraveis} de ${d.comOrcamento} categoria(s) de despesa acima do orçado`);

    const secao = (titulo, minimo = 34) => {
      let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 63) + 9;
      if (y + minimo > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 22; }
      return relatorioSecao(doc, y, titulo);
    };

    if (d.lista.length) ovrTabelaCategorias(doc, rodape, secao('Despesas por categoria'), d.lista, 'despesa');
    if (r.lista.length) ovrTabelaCategorias(doc, rodape, secao('Receitas por categoria'), r.lista, 'receita');

    // ---- Mes a mes ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Mês a mês — orçado × realizado'),
      head: [['Mês', 'Desp. orçada', 'Desp. realizada', 'Variação', '%', 'Rec. orçada', 'Rec. realizada', 'Variação', 'Resultado realizado', 'Acumulado']],
      body: a.porMes.map(m => [m.mes, brl(m.despesaOrc), brl(m.despesaReal), ovrSinal(m.difDespesa), ovrPct(m.pctDespesa),
        brl(m.receitaOrc), brl(m.receitaReal), ovrSinal(m.difReceita), brl(m.resultadoReal), brl(m.acumuladoReal)]),
      foot: [['Período', brl(d.orc), brl(d.real), ovrSinal(d.dif), ovrPct(d.pct), brl(r.orc), brl(r.real), ovrSinal(r.dif),
        brl(r.real - d.real), brl(r.real - d.real)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 7 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.6, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: REL_VERDE, textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 1: M, 2: M, 3: M, 4: M, 5: M, 6: M, 7: M, 8: M, 9: M },
      didParseCell: h => {
        if (h.section !== 'body') return;
        const m = a.porMes[h.row.index];
        if (h.column.index === 3 && m.difDespesa > 0) h.cell.styles.textColor = REL_VERMELHO;
        if ((h.column.index === 8 && m.resultadoReal < 0) || (h.column.index === 9 && m.acumuladoReal < 0)) h.cell.styles.textColor = REL_VERMELHO;
      }
    }));

    // ---- Ranking de desvios ----
    const ranking = (titulo, linhas, cor) => {
      if (!linhas.length) return;
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: secao(titulo),
        head: [['Categoria', 'Orçado', 'Realizado', 'Variação', '% realizado']],
        body: linhas.map(l => [l.cat, brl(l.orc), brl(l.real), ovrSinal(l.dif), ovrPct(l.pct)]),
        columnStyles: { 1: M, 2: M, 3: M, 4: M },
        didParseCell: h => { if (h.section === 'body' && h.column.index === 3) h.cell.styles.textColor = cor; }
      }));
    };
    ranking('Maiores estouros de despesa', a.estouros, REL_VERMELHO);
    ranking('Maiores economias de despesa', a.economias, REL_VERDE);

    // ---- Aderencia ----
    doc.autoTable(relatorioTabelaEstilo(rodape, {
      startY: secao('Aderência ao orçamento — despesas'),
      head: [['Faixa', 'Categorias', '% das categorias', 'Orçado', 'Realizado']],
      body: a.faixas.map(f => [f.faixa, f.categorias, ovrPct(f.pctCategorias * 100), brl(f.orcado), brl(f.realizado)]),
      foot: [['Total', d.comOrcamento, '100,0%', brl(d.orc), brl(d.real)]],
      footStyles: { fillColor: REL_VERDE_CLARO, textColor: REL_VERDE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: { halign: 'center' }, 2: M, 3: M, 4: M },
      didParseCell: h => {
        if (h.section === 'body' && h.row.index === 2 && a.faixas[2].categorias) h.cell.styles.textColor = REL_VERMELHO;
      }
    }));

    // ---- Categorias fora do padrao ----
    const fora = [
      ...d.semOrcamento.map(l => ['Despesa', l.cat, 'Gastou sem orçamento', brl(l.real)]),
      ...d.semRealizado.map(l => ['Despesa', l.cat, 'Orçada, sem gasto no período', brl(l.orc)]),
      ...r.semOrcamento.map(l => ['Receita', l.cat, 'Recebeu sem orçamento', brl(l.real)]),
      ...r.semRealizado.map(l => ['Receita', l.cat, 'Orçada, sem receita no período', brl(l.orc)])
    ];
    if (fora.length) {
      doc.autoTable(relatorioTabelaEstilo(rodape, {
        startY: secao('Categorias fora do previsto'),
        head: [['Tipo', 'Categoria', 'Situação', 'Valor']],
        body: fora,
        columnStyles: { 3: M }
      }));
    }

    // ---- Observacoes ----
    if (a.alertas.length) {
      let y = secao('Observações', 20);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 70, 64);
      a.alertas.forEach(t => {
        const linhas = doc.splitTextToSize('•  ' + t, pageW - REL_MARGIN * 2 - 4);
        if (y + linhas.length * 4.2 > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); rodape(); y = 22; }
        doc.text(linhas, REL_MARGIN + 2, y);
        y += linhas.length * 4.2 + 1.6;
      });
    }

    doc.save(`orcado_x_realizado_${a.ano}_completo_${todayISO()}.pdf`);
    toast('PDF de análise completa gerado.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o PDF: ' + e.message); }
}

async function exportOvrExcel(a, completo) {
  if (!window.ExcelJS) return exportOvrExcelSimples(a, completo);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME;
    wb.created = new Date();
    const now = new Date();
    const sub = `${a.periodo} · gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`;
    const idLogo = wb.addImage({ base64: LOGO_PROAGRO_PNG, extension: 'png' });
    const d = a.despesas, r = a.receitas, R = 'right', C = 'center';
    // O "% realizado" vem na escala 0-100; no Excel vai como fracao com formato
    // de porcentagem, para dar para somar e ordenar sem reconverter.
    const PCT = '0.0%';
    const fr = v => (v === null || v === undefined || !isFinite(v)) ? null : v / 100;

    // ---------- Aba 1: Resumo ----------
    const ws1 = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    let L = aporteXlCabecalho(wb, ws1, sub, idLogo, [30, 20, 20, 20, 14], `Orçado × Realizado ${a.ano}`);
    aporteXlCabecalhoColunas(ws1, L, ['Indicador', 'Orçado', 'Realizado', 'Variação', '% realizado'], ['left', R, R, R, R]); L++;
    const i1 = L;
    L = aporteXlCorpo(ws1, L, [
      ['Despesas', d.orc, d.real, d.dif, fr(d.pct)],
      ['Receitas', r.orc, r.real, r.dif, fr(r.pct)],
      ['Resultado', r.orc - d.orc, r.real - d.real, (r.real - d.real) - (r.orc - d.orc), null]
    ], [1, 2, 3], ['left', R, R, R, R]);
    [0, 1, 2].forEach(i => { ws1.getCell(i1 + i, 5).numFmt = PCT; });
    L += 2;

    aporteXlTituloTabela(ws1, L, 'Aderência ao orçamento — despesas', 5); L++;
    aporteXlCabecalhoColunas(ws1, L, ['Faixa', 'Categorias', '% das categorias', 'Orçado', 'Realizado'], ['left', C, R, R, R]); L++;
    const i2 = L;
    L = aporteXlCorpo(ws1, L, a.faixas.map(f => [f.faixa, f.categorias, f.pctCategorias, f.orcado, f.realizado]), [3, 4], ['left', C, R, R, R]);
    a.faixas.forEach((_, i) => { ws1.getCell(i2 + i, 3).numFmt = PCT; });
    aporteXlTotal(ws1, L, ['Total', d.comOrcamento, 1, d.orc, d.real], [3, 4], ['left', C, R, R, R]);
    ws1.getCell(L, 3).numFmt = PCT;

    // ---------- Abas por tipo ----------
    const abaCategorias = (nome, titulo, bloco) => {
      const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false }] });
      let l = aporteXlCabecalho(wb, ws, sub, idLogo, [34, 18, 18, 18, 14, 22], titulo);
      aporteXlCabecalhoColunas(ws, l, ['Categoria', 'Orçado', 'Realizado', 'Variação', '% realizado', 'Situação'], ['left', R, R, R, R, 'left']);
      const cab = l; l++;
      const ini = l;
      l = aporteXlCorpo(ws, l, bloco.lista.map(x => [x.cat, x.orc, x.real, x.dif, fr(x.pct), x.situacao]), [1, 2, 3], ['left', R, R, R, R, 'left']);
      bloco.lista.forEach((_, i) => { ws.getCell(ini + i, 5).numFmt = PCT; });
      aporteXlTotal(ws, l, ['Total', bloco.orc, bloco.real, bloco.dif, fr(bloco.pct), ''], [1, 2, 3], ['left', R, R, R, R, 'left']);
      ws.getCell(l, 5).numFmt = PCT;
      ws.views = [{ state: 'frozen', ySplit: cab, showGridLines: false }];
      if (bloco.lista.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: l - 1, column: 6 } };
    };
    abaCategorias('Despesas', 'Despesas — orçado × realizado', d);
    abaCategorias('Receitas', 'Receitas — orçado × realizado', r);

    // ---------- Mês a mês ----------
    const ws4 = wb.addWorksheet('Mês a mês', { views: [{ showGridLines: false }] });
    L = aporteXlCabecalho(wb, ws4, sub, idLogo, [12, 16, 16, 16, 12, 16, 16, 16, 18, 18], 'Mês a mês — orçado × realizado');
    const al4 = ['left', R, R, R, R, R, R, R, R, R];
    aporteXlCabecalhoColunas(ws4, L, ['Mês', 'Desp. orçada', 'Desp. realizada', 'Variação', '% desp.', 'Rec. orçada', 'Rec. realizada', 'Variação', 'Resultado realizado', 'Acumulado'], al4); L++;
    const i4 = L;
    L = aporteXlCorpo(ws4, L, a.porMes.map(m => [m.mes, m.despesaOrc, m.despesaReal, m.difDespesa, fr(m.pctDespesa),
      m.receitaOrc, m.receitaReal, m.difReceita, m.resultadoReal, m.acumuladoReal]), [1, 2, 3, 5, 6, 7, 8, 9], al4);
    a.porMes.forEach((_, i) => { ws4.getCell(i4 + i, 5).numFmt = PCT; });
    aporteXlTotal(ws4, L, ['Período', d.orc, d.real, d.dif, fr(d.pct), r.orc, r.real, r.dif, r.real - d.real, r.real - d.real],
      [1, 2, 3, 5, 6, 7, 8, 9], al4);
    ws4.getCell(L, 5).numFmt = PCT;

    if (completo) {
      // ---------- Ranking de desvios ----------
      const ws5 = wb.addWorksheet('Desvios', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws5, sub, idLogo, [16, 32, 18, 18, 18, 14], 'Maiores desvios de despesa');
      const al5 = ['left', 'left', R, R, R, R];
      aporteXlCabecalhoColunas(ws5, L, ['Tipo', 'Categoria', 'Orçado', 'Realizado', 'Variação', '% realizado'], al5); L++;
      const linhasDesvio = [
        ...a.estouros.map(l => ['Estouro', l.cat, l.orc, l.real, l.dif, fr(l.pct)]),
        ...a.economias.map(l => ['Economia', l.cat, l.orc, l.real, l.dif, fr(l.pct)])
      ];
      const i5 = L;
      L = aporteXlCorpo(ws5, L, linhasDesvio, [2, 3, 4], al5);
      linhasDesvio.forEach((_, i) => { ws5.getCell(i5 + i, 6).numFmt = PCT; });

      // ---------- Fora do previsto ----------
      const fora = [
        ...d.semOrcamento.map(l => ['Despesa', l.cat, 'Gastou sem orçamento', l.real]),
        ...d.semRealizado.map(l => ['Despesa', l.cat, 'Orçada, sem gasto no período', l.orc]),
        ...r.semOrcamento.map(l => ['Receita', l.cat, 'Recebeu sem orçamento', l.real]),
        ...r.semRealizado.map(l => ['Receita', l.cat, 'Orçada, sem receita no período', l.orc])
      ];
      const ws6 = wb.addWorksheet('Fora do previsto', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws6, sub, idLogo, [14, 32, 34, 18], 'Categorias fora do previsto');
      aporteXlCabecalhoColunas(ws6, L, ['Tipo', 'Categoria', 'Situação', 'Valor'], ['left', 'left', 'left', R]); L++;
      aporteXlCorpo(ws6, L, fora.length ? fora : [['—', 'Nenhuma', 'Tudo o que foi realizado estava orçado', 0]], [3], ['left', 'left', 'left', R]);

      // ---------- Observações ----------
      const ws7 = wb.addWorksheet('Observações', { views: [{ showGridLines: false }] });
      L = aporteXlCabecalho(wb, ws7, sub, idLogo, [110], 'Observações da análise');
      aporteXlCabecalhoColunas(ws7, L, ['Ponto de atenção'], ['left']); L++;
      aporteXlCorpo(ws7, L, (a.alertas.length ? a.alertas : ['Nenhum ponto de atenção identificado no período.']).map(t => [t]), [], ['left']);
      ws7.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };
    }

    const buf = await wb.xlsx.writeBuffer();
    aporteBaixarPlanilha(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `orcado_x_realizado_${a.ano}_${completo ? 'completo' : 'resumo'}_${todayISO()}.xlsx`);
    toast('Excel gerado.');
  } catch (e) { console.error(e); toast('Não foi possível gerar o Excel: ' + e.message); }
}

function exportOvrExcelSimples(a, completo) {
  if (!window.XLSX) return toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const wb = XLSX.utils.book_new();
  const add = (nome, aoa, colsMoeda) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let r = 1; r < aoa.length; r++) (colsMoeda || []).forEach(ci => {
      const ref = XLSX.utils.encode_cell({ r, c: ci }); if (ws[ref]) ws[ref].z = MONEY;
    });
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  const cab = ['Categoria', 'Orçado', 'Realizado', 'Variação', '% realizado', 'Situação'];
  add('Despesas', [cab, ...a.despesas.lista.map(l => [l.cat, l.orc, l.real, l.dif, l.pct, l.situacao])], [1, 2, 3]);
  add('Receitas', [cab, ...a.receitas.lista.map(l => [l.cat, l.orc, l.real, l.dif, l.pct, l.situacao])], [1, 2, 3]);
  add('Mês a mês', [['Mês', 'Desp. orçada', 'Desp. realizada', 'Rec. orçada', 'Rec. realizada', 'Resultado realizado'],
    ...a.porMes.map(m => [m.mes, m.despesaOrc, m.despesaReal, m.receitaOrc, m.receitaReal, m.resultadoReal])], [1, 2, 3, 4, 5]);
  if (completo) {
    add('Desvios', [['Tipo', 'Categoria', 'Orçado', 'Realizado', 'Variação'],
      ...a.estouros.map(l => ['Estouro', l.cat, l.orc, l.real, l.dif]),
      ...a.economias.map(l => ['Economia', l.cat, l.orc, l.real, l.dif])], [2, 3, 4]);
    add('Observações', [['Ponto de atenção'], ...(a.alertas.length ? a.alertas : ['Nenhum ponto de atenção.']).map(t => [t])]);
  }
  XLSX.writeFile(wb, `orcado_x_realizado_${a.ano}_${completo ? 'completo' : 'resumo'}_${todayISO()}.xlsx`);
  toast('Excel gerado (sem formatação).');
}

async function renderOrcadoReal() {
  const year = Number(sessionStorage.getItem('ovr-year')) || new Date().getFullYear();
  const scope = sessionStorage.getItem('ovr-scope') || 'ytd';
  const [budgets, actuals] = await Promise.all([api('/api/budgets/' + year), api('/api/reports/actuals/' + year)]);
  const c = $('#content');

  const nowM = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;
  const maxM = scope === 'ytd' ? nowM : 12;

  const build = (type, actualRows) => {
    const map = {};
    budgets.filter(b => b.type === type && b.month <= maxM).forEach(b => {
      map[b.category] = map[b.category] || { orc: 0, real: 0 };
      map[b.category].orc += b.amount;
    });
    actualRows.filter(a => a.month <= maxM).forEach(a => {
      map[a.category] = map[a.category] || { orc: 0, real: 0 };
      map[a.category].real += a.total;
    });
    return Object.entries(map).map(([cat, v]) => ({ cat, ...v, dif: v.real - v.orc, pct: v.orc ? (v.real / v.orc) * 100 : null }))
      .sort((a, b) => b.orc - a.orc);
  };
  const rec = build('receita', actuals.receitas);
  const desp = build('despesa', actuals.despesas);

  // ---- KPIs corporativos (Despesas) ----
  const despComOrc = desp.filter(r => r.orc > 0);
  const tOrcDesp = desp.reduce((s, r) => s + r.orc, 0);
  const tRealDesp = desp.reduce((s, r) => s + r.real, 0);
  const varTotalDesp = tRealDesp - tOrcDesp;
  const pctTotalDesp = tOrcDesp ? (tRealDesp / tOrcDesp) * 100 : null;
  const acimaDoOrcado = despComOrc.filter(r => r.real > r.orc);
  const maiorDesvioAbs = [...despComOrc].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))[0];
  const maiorDesvioPct = [...despComOrc].sort((a, b) => b.pct - a.pct)[0];

  const fmtPct = v => v == null ? '—' : v.toFixed(1).replace('.', ',') + '%';

  const tableHTML = (rows, type) => {
    const tOrc = rows.reduce((s, r) => s + r.orc, 0), tReal = rows.reduce((s, r) => s + r.real, 0);
    const isReceita = type === 'receita';
    return `<div class="table-wrap" style="margin-bottom:16px"><table>
      <thead><tr><th>${isReceita ? 'Receita' : 'Despesa'} — categoria</th><th class="num">Orçado</th><th class="num">Realizado</th>
        <th class="num">Variação (R$)</th><th class="num">% realizado</th><th>Situação</th></tr></thead>
      <tbody>${rows.map(r => {
        // Receita acima do orçado é positivo; despesa acima do orçado é negativo
        const good = isReceita ? r.dif >= 0 : r.dif <= 0;
        return `<tr>
          <td><strong>${esc(r.cat)}</strong></td>
          <td class="num">${brl(r.orc)}</td><td class="num">${brl(r.real)}</td>
          <td class="num ${good ? 'pos' : 'neg'}">${r.dif >= 0 ? '+' : ''}${brl(r.dif)}</td>
          <td class="num">${r.pct == null ? '—' : r.pct.toFixed(1).replace('.', ',') + '%'}</td>
          <td>${r.pct == null ? '<span class="badge off">Sem orçamento</span>'
            : good ? '<span class="badge ok">Dentro do orçado</span>'
            : Math.abs(r.dif) / (r.orc || 1) <= 0.1 ? '<span class="badge warn">Atenção (±10%)</span>'
            : '<span class="badge late">' + (isReceita ? 'Abaixo do orçado' : 'Acima do orçado') + '</span>'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6"><div class="empty">Sem dados para o período.</div></td></tr>'}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${brl(tOrc)}</td><td class="num">${brl(tReal)}</td>
        <td class="num">${brl(tReal - tOrc)}</td><td class="num">${tOrc ? ((tReal / tOrc) * 100).toFixed(1).replace('.', ',') + '%' : '—'}</td><td></td></tr></tfoot>
    </table></div>`;
  };

  c.innerHTML = `
    <div class="toolbar">
      <label style="font-weight:600; font-size:13px">Ano:</label>
      <input type="number" id="v-year" value="${year}" min="2020" max="2100" style="width:100px">
      <select id="v-scope">
        <option value="ytd" ${scope === 'ytd' ? 'selected' : ''}>Acumulado até o mês atual (YTD)</option>
        <option value="full" ${scope === 'full' ? 'selected' : ''}>Ano completo</option>
      </select>
      <div class="spacer"></div>
      <button class="btn" id="btn-ovr-export">Exportar</button>
    </div>
    <div class="dash-section-title">Indicadores — Despesas (${scope === 'ytd' ? 'Jan–' + MESES[maxM - 1] : 'ano completo'})</div>
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Total orçado</div><div class="value">${brl(tOrcDesp)}</div></div>
      <div class="card kpi red"><div class="label">Total realizado</div><div class="value">${brl(tRealDesp)}</div></div>
      <div class="card kpi ${varTotalDesp > 0 ? 'red' : ''}"><div class="label">Variação total</div>
        <div class="value ${varTotalDesp > 0 ? 'neg' : 'pos'}">${varTotalDesp >= 0 ? '+' : ''}${brl(varTotalDesp)}</div>
        <div class="detail">${fmtPct(pctTotalDesp)} do orçado</div></div>
      <div class="card kpi ${acimaDoOrcado.length ? 'warn' : ''}"><div class="label">Categorias acima do orçado</div>
        <div class="value">${acimaDoOrcado.length} / ${despComOrc.length}</div></div>
      <div class="card kpi red"><div class="label">Maior desvio (R$)</div>
        <div class="value neg">${maiorDesvioAbs ? brl(maiorDesvioAbs.dif) : '—'}</div>
        <div class="detail">${maiorDesvioAbs ? esc(maiorDesvioAbs.cat) : 'Sem dados'}</div></div>
      <div class="card kpi ${maiorDesvioPct && maiorDesvioPct.pct > 100 ? 'red' : ''}"><div class="label">Maior desvio (%)</div>
        <div class="value ${maiorDesvioPct && maiorDesvioPct.pct > 100 ? 'neg' : ''}">${maiorDesvioPct ? fmtPct(maiorDesvioPct.pct) : '—'}</div>
        <div class="detail">${maiorDesvioPct ? esc(maiorDesvioPct.cat) : 'Sem dados'}</div></div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>% do orçamento utilizado por categoria</h3>
        <p class="hint" style="margin-top:-4px">Verde = dentro do orçado · Âmbar = até 10% acima · Vermelho = mais de 10% acima. Independe do valor em R$ de cada categoria.</p>
        <div class="chart-box tall"><canvas id="ch-pct"></canvas></div></div>
      <div class="card"><h3>Maiores variações em R$ (orçado vs. realizado)</h3>
        <p class="hint" style="margin-top:-4px">Categorias com maior impacto financeiro no desvio, para cima ou para baixo.</p>
        <div class="chart-box tall"><canvas id="ch-var"></canvas></div></div>
    </div>
    <h3 style="margin:6px 0 10px; font-size:15px">Receitas</h3>
    ${tableHTML(rec, 'receita')}
    <h3 style="margin:6px 0 10px; font-size:15px">Despesas</h3>
    ${tableHTML(desp, 'despesa')}`;

  $('#v-year').onchange = e => { sessionStorage.setItem('ovr-year', e.target.value); renderOrcadoReal(); };
  $('#v-scope').onchange = e => { sessionStorage.setItem('ovr-scope', e.target.value); renderOrcadoReal(); };
  // Exportar: mesmo fluxo das outras telas — qual relatório, depois o formato.
  // Respeita o ano e o escopo (YTD ou ano completo) escolhidos aqui em cima; é
  // o escopo que decide até que mês o confronto vai.
  $('#btn-ovr-export').onclick = () => {
    openModal(`Exportar Orçado × Realizado — ${year}`, `
      <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:4px">Qual relatório você quer?</p>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px">${esc(scope === 'ytd' ? 'Acumulado de Jan a ' + MESES[maxM - 1] : 'Ano completo')} de ${year}, como está na tela.</p>
      <div class="rel-opcoes">
        <button class="rel-opcao" data-ovr="resumo" type="button">
          <strong>Resumo</strong>
          <span>Despesas e receitas por categoria, com orçado, realizado, variação, % realizado e a situação de cada uma.</span>
        </button>
        <button class="rel-opcao" data-ovr="completo" type="button">
          <strong>Análise completa</strong>
          <span>Tudo do resumo mais o confronto mês a mês com resultado acumulado, ranking de estouros e economias, aderência ao orçamento, categorias fora do previsto e os pontos de atenção.</span>
        </button>
      </div>`,
      [{ label: 'Cancelar', onClick: closeModal }]);
    document.querySelectorAll('.rel-opcao').forEach(b => b.onclick = () => {
      closeModal();
      askOvrFormato(b.dataset.ovr);
    });
  };

  const askOvrFormato = tipo => openModal(
    `Exportar — ${tipo === 'completo' ? 'Análise completa' : 'Resumo'}`,
    `<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato?</p>
     <p style="font-size:12px; color:var(--muted); margin-top:6px">${tipo === 'completo'
        ? 'O Excel sai com uma aba por bloco de análise; o PDF traz tudo num documento só.'
        : 'Os dois seguem o padrão de relatório da plataforma.'}</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Excel', onClick: () => { closeModal(); gerarOvrRelatorio(tipo, 'excel'); } },
      { label: 'PDF', cls: 'primary', onClick: () => { closeModal(); gerarOvrRelatorio(tipo, 'pdf'); } }
    ]);

  function gerarOvrRelatorio(tipo, formato) {
    try {
      if (!budgets.length && !(actuals.despesas || []).length && !(actuals.receitas || []).length) {
        return toast('Não há orçamento nem realizado em ' + year + '.');
      }
      toast('Montando o relatório…');
      const a = orcadoRealAnalise(year, scope, maxM, budgets, actuals);
      if (formato === 'excel') return exportOvrExcel(a, tipo === 'completo');
      return tipo === 'completo' ? exportOvrCompletoPDF(a) : exportOvrResumoPDF(a);
    } catch (e) {
      toast(e.message || 'Não foi possível montar o relatório.');
    }
  }

  // % do orçamento utilizado — escala 0-100%+ (não depende do valor absoluto
  // de cada categoria, resolvendo o problema de categorias grandes esmagarem
  // as pequenas numa escala compartilhada de R$).
  const pctOrdenado = [...despComOrc].sort((a, b) => b.pct - a.pct);
  const corPct = p => p <= 100 ? CORES.verde : p <= 110 ? '#C9922A' : '#B23A2F';
  makeChart($('#ch-pct'), {
    type: 'bar',
    data: { labels: pctOrdenado.map(r => r.cat), datasets: [
      { label: '% do orçado', data: pctOrdenado.map(r => r.pct), backgroundColor: pctOrdenado.map(r => corPct(r.pct)), borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fmtPct(ctx.parsed.x) } } },
      scales: {
        x: { ticks: { callback: v => v + '%', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
    }
  });

  // Maiores variações em R$ — mostra o impacto financeiro real do desvio,
  // complementando a visão percentual acima (uma categoria pequena pode estar
  // 300% acima do orçado mas representar pouco dinheiro; aqui isso fica claro).
  const varOrdenado = [...despComOrc].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 10).reverse();
  makeChart($('#ch-var'), {
    type: 'bar',
    data: { labels: varOrdenado.map(r => r.cat), datasets: [
      { label: 'Variação (R$)', data: varOrdenado.map(r => r.dif), backgroundColor: varOrdenado.map(r => r.dif > 0 ? '#B23A2F' : CORES.verdeMed), borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.parsed.x) } } },
      scales: {
        x: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }
    }
  });
}

// ============================================================
// RELATÓRIOS GERENCIAIS
// ============================================================
async function renderRelatorios() {
  const year = Number(sessionStorage.getItem('rel-year')) || new Date().getFullYear();
  const actuals = await api('/api/reports/actuals/' + year);
  const c = $('#content');

  const arr = () => Array(12).fill(0);
  const recM = arr(), despM = arr();
  actuals.receitas.forEach(r => recM[r.month - 1] += r.total);
  actuals.despesas.forEach(r => despM[r.month - 1] += r.total);
  const resM = recM.map((v, i) => v - despM[i]);

  const catTotals = rows => {
    const m = {};
    rows.forEach(r => m[r.category] = (m[r.category] || 0) + r.total);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const despCat = catTotals(actuals.despesas);
  const recCat = catTotals(actuals.receitas);

  c.innerHTML = `
    <div class="toolbar">
      <label style="font-weight:600; font-size:13px">Ano:</label>
      <input type="number" id="r-year" value="${year}" min="2020" max="2100" style="width:100px">
      <div class="spacer"></div>
      <button class="btn" id="btn-csv">Exportar DRE (CSV)</button>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card"><h3>Despesas por categoria — ${year}</h3><div class="chart-box"><canvas id="ch-desp"></canvas></div></div>
      <div class="card"><h3>Resultado mensal (regime de caixa) — ${year}</h3><div class="chart-box"><canvas id="ch-res"></canvas></div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Demonstrativo (caixa)</th>${MESES.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>
        <tr><td><strong>(+) Receitas recebidas</strong></td>${recM.map(v => `<td class="num">${v ? brl(v) : '—'}</td>`).join('')}
          <td class="num"><strong>${brl(recM.reduce((a, b) => a + b))}</strong></td></tr>
        <tr><td><strong>(−) Despesas pagas</strong></td>${despM.map(v => `<td class="num">${v ? brl(v) : '—'}</td>`).join('')}
          <td class="num"><strong>${brl(despM.reduce((a, b) => a + b))}</strong></td></tr>
        <tr><td><strong>(=) Resultado</strong></td>${resM.map(v => `<td class="num ${v >= 0 ? 'pos' : 'neg'}">${v ? brl(v) : '—'}</td>`).join('')}
          <td class="num ${resM.reduce((a, b) => a + b) >= 0 ? 'pos' : 'neg'}"><strong>${brl(resM.reduce((a, b) => a + b))}</strong></td></tr>
      </tbody>
    </table></div>
    <div class="two-col" style="margin-top:16px">
      <div class="card"><h3>Ranking de despesas</h3>
        <table><thead><tr><th>Categoria</th><th class="num">Total pago</th><th class="num">%</th></tr></thead>
        <tbody>${despCat.map(([cat, v]) => `<tr><td>${esc(cat)}</td><td class="num">${brl(v)}</td>
          <td class="num">${((v / (despM.reduce((a, b) => a + b) || 1)) * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Sem dados.</div></td></tr>'}</tbody></table></div>
      <div class="card"><h3>Ranking de receitas</h3>
        <table><thead><tr><th>Categoria</th><th class="num">Total recebido</th><th class="num">%</th></tr></thead>
        <tbody>${recCat.map(([cat, v]) => `<tr><td>${esc(cat)}</td><td class="num">${brl(v)}</td>
          <td class="num">${((v / (recM.reduce((a, b) => a + b) || 1)) * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Sem dados.</div></td></tr>'}</tbody></table></div>
    </div>`;

  $('#r-year').onchange = e => { sessionStorage.setItem('rel-year', e.target.value); renderRelatorios(); };
  $('#btn-csv').onclick = () => exportCSV('dre_caixa_' + year,
    ['Linha', ...MESES, 'Total'],
    [['Receitas', ...recM, recM.reduce((a, b) => a + b)],
     ['Despesas', ...despM, despM.reduce((a, b) => a + b)],
     ['Resultado', ...resM, resM.reduce((a, b) => a + b)]].map(row => row.map(v => String(v).replace('.', ','))));

  makeChart($('#ch-desp'), {
    type: 'doughnut',
    data: { labels: despCat.map(x => x[0]), datasets: [{ data: despCat.map(x => x[1]),
      backgroundColor: ['#00783F','#3DAE43','#1F4E78','#6FBF87','#4A78A8','#A9CDB8','#C9922A','#8898A0','#0B3B24','#D3DFD8','#7A9E8B'] }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + brl(ctx.parsed) } } } }
  });
  makeChart($('#ch-res'), {
    type: 'bar',
    data: { labels: MESES, datasets: [{ label: 'Resultado', data: resM,
      backgroundColor: resM.map(v => v >= 0 ? CORES.verdeMed : CORES.vermelho), borderRadius: 4 }] },
    options: chartOpts()
  });
}

// ============================================================
// VIÁTICOS
// ============================================================
const TIER_LABEL = { A: 'A — Diretoria/Gerência', B: 'B — Coordenação/Técnicos' };
const MOTIVO_OPTIONS = ['Comercial', 'Monitoramento', 'Prévia', 'Reinspeção', 'Sinistro'];
const LOCAL_LABEL = { interior: 'Interior', capital: 'Capital', sp_df_rj_intl: 'SP/DF/RJ + Internacional' };

// Capital de cada UF — usada para calcular automaticamente a "Categoria de
// local" a partir dos destinos escolhidos na etapa "Viagem", em vez de
// depender de o usuário selecionar a categoria manualmente (fonte de erro).
const CAPITAIS_BR = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
  DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
  MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
  RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista',
  SC: 'Florianópolis', SE: 'Aracaju', SP: 'São Paulo', TO: 'Palmas'
};
// São Paulo, Rio de Janeiro e Brasília têm teto próprio (mais alto que as demais capitais).
const CATEGORIA_TOPO = new Set(['SP:São Paulo', 'RJ:Rio de Janeiro', 'DF:Brasília']);
const CATEGORIA_PRIORIDADE = { interior: 0, capital: 1, sp_df_rj_intl: 2 };

function viaCategoriaDestino(uf, municipio) {
  if (CATEGORIA_TOPO.has(`${uf}:${municipio}`)) return 'sp_df_rj_intl';
  if (CAPITAIS_BR[uf] === municipio) return 'capital';
  return 'interior';
}
// Categoria final = a mais alta entre todos os destinos da viagem (mais o
// próprio flag de "viagem internacional", já que não há seleção de cidades
// no exterior no passo de destinos).
function viaCalcularCategoriaLocal(destinos, internacional) {
  let cat = internacional ? 'sp_df_rj_intl' : 'interior';
  (destinos || []).forEach(d => {
    const c = viaCategoriaDestino(d.uf, d.municipio);
    if (CATEGORIA_PRIORIDADE[c] > CATEGORIA_PRIORIDADE[cat]) cat = c;
  });
  return cat;
}

const DESP_CAT_LABEL = {
  alimentacao: 'Alimentação',
  aluguel_carro: 'Aluguel de Carro',
  combustivel: 'Combustível',
  estacionamento: 'Estacionamento',
  hospedagem: 'Hospedagem',
  outro: 'Outro',
  passagem_aviao: 'Passagem de Avião',
  passagem_onibus: 'Passagem de Ônibus',
  pedagio: 'Pedágio',
  taxi_uber: 'Táxis / Uber',
  veiculo: 'Veículo Próprio'
};
// Valor pedido na solicitação. Prefere `valor_solicitado` (gravado pelo backend);
// se estiver vazio — caso das solicitações feitas antes de o campo passar a ser
// gravado — soma a memória de cálculo por categoria, que sempre existe.
function viaTotalSolicitado(s) {
  if (s && Number(s.valor_solicitado) > 0) return Number(s.valor_solicitado);
  const p = s && s.previsao_por_categoria;
  if (p && typeof p === 'object') return Object.values(p).reduce((t, v) => t + (Number(v) || 0), 0);
  return 0;
}

const VIA_STATUS_LABEL = {
  em_approvals: 'Em Approvals', transferencia_agendada: 'Transferência Agendada', liberado: 'Liberado', em_viagem: 'Em viagem', aguardando_comprovacao: 'Aguardando comprovação',
  comprovado: 'Comprovado', devolvido: 'Devolvido (sobrou)', divergente: 'Divergente (estourou)', arquivado: 'Arquivado'
};
const VIA_STATUS_BADGE = {
  em_approvals: 'warn', transferencia_agendada: 'pend', liberado: 'off', em_viagem: 'pend', aguardando_comprovacao: 'warn',
  comprovado: 'ok', devolvido: 'ok', divergente: 'late', arquivado: 'off'
};

async function renderViaticos() {
  // meu-colaborador decide se o botão "Solicitar viagem" aparece — é
  // autosserviço, então vale para qualquer usuário vinculado a um
  // colaborador, mesmo os com acesso só de leitura na página (READONLY
  // controla EDITAR dados de terceiros, não pedir a própria viagem).
  // 404 (sem vínculo) é esperado para a maior parte dos usuários; qualquer
  // outro erro é logado mas não trava a tela.
  const [dash, sols, meuColaborador, colaboradores] = await Promise.all([
    api('/api/viaticos/dashboard'), api('/api/viaticos/solicitacoes'),
    api('/api/viaticos/autosservico/meu-colaborador').catch(e => { if (!/404|vínculo|vinculad/i.test(e.message || '')) console.error('[viaticos] meu-colaborador:', e); return null; }),
    // Para os avisos de documentação. Vem com escopo: usuário restrito recebe
    // apenas o próprio cadastro. Falha aqui não pode derrubar a página.
    api('/api/colaboradores').catch(() => [])
  ]);
  const c = $('#content');
  const FKEY = 'filters-viaticos';
  const saved = loadFilters(FKEY);

  // Usuário restrito (só leitura em Viáticos) vê apenas as próprias
  // solicitações — o backend filtra a lista e omite os números da carteira.
  const escopoProprio = dash.saldoCarteira === null;

  // Avisos de documentação: os próprios (quem está vinculado a um colaborador) e,
  // para quem administra, o resumo de toda a equipe — é o administrador que
  // regulariza os cadastros, então ele precisa ver antes de a viagem ser barrada.
  const meuCadastro = meuColaborador
    || (Array.isArray(colaboradores) ? colaboradores.find(x => USER && x.usuario_id === USER.id) : null);
  const barraDoc = viaBarraDocumentacao(
    meuCadastro,
    (!escopoProprio && Array.isArray(colaboradores)) ? colaboradores.filter(x => x.ativo !== false) : null);

  c.innerHTML = `
    ${escopoProprio ? '<div class="ro-banner" style="margin-bottom:12px">👤 Você está vendo apenas as suas solicitações de viáticos.</div>' : ''}
    ${barraDoc}
    <div class="grid kpis" style="margin-bottom:16px">
      ${escopoProprio ? '' : `<div class="card kpi ${dash.saldoCarteira < 0 ? 'red' : ''}"><div class="label">Saldo da Carteira Flash</div>
        <div class="value ${dash.saldoCarteira < 0 ? 'neg' : ''}">${brl(dash.saldoCarteira)}</div>
        <div class="detail">Transferido (total): ${brl(dash.transferido)}</div></div>
      <div class="card kpi blue"><div class="label">Transferido no mês</div><div class="value">${brl(dash.transferidoMes)}</div>
        <div class="detail">Contas a Pagar, categoria "Viáticos"</div></div>`}
      <div class="card kpi warn"><div class="label">Aguardando comprovação</div><div class="value">${dash.aguardandoComprovacao.n}</div>
        <div class="detail">${brl(dash.aguardandoComprovacao.v)}</div></div>
      <div class="card kpi ${dash.vencidas.n ? 'red' : ''}"><div class="label">Vencidas (Flash expirado)</div>
        <div class="value ${dash.vencidas.n ? 'neg' : ''}">${dash.vencidas.n}</div><div class="detail">${brl(dash.vencidas.v)}</div></div>
      <div class="card kpi ${dash.divergentes.n ? 'red' : ''}"><div class="label">Divergentes (estouro)</div>
        <div class="value ${dash.divergentes.n ? 'neg' : ''}">${dash.divergentes.n}</div><div class="detail">${brl(dash.divergentes.v)}</div></div>
    </div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Buscar colaborador, destino..." value="${esc(saved.q || '')}">
      <select id="f-status"><option value="">Todos os status</option>${Object.entries(VIA_STATUS_LABEL).map(([v, t]) => `<option value="${v}" ${saved.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="date-range">
        <label>De <input type="date" id="f-de" value="${saved.de || ''}"></label>
        <label>Até <input type="date" id="f-ate" value="${saved.ate || ''}"></label>
      </div>
      <button class="btn" id="btn-clear">Limpar filtros</button>
      <div class="spacer"></div>
      <button class="btn" id="btn-export">Exportar</button>
      ${meuColaborador ? '<button class="btn primary" id="btn-solicitar-viagem">✈️ Solicitar viagem</button>' : ''}
      ${READONLY ? '' : `<button class="btn" id="btn-config">Configurações</button>
      <button class="btn primary" id="btn-new">+ Nova solicitação</button>`}
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  if ($('#btn-solicitar-viagem')) $('#btn-solicitar-viagem').onclick = () => renderSolicitacaoAutosservico();

  // Barra de documentação: começa fechada e lembra a escolha durante a sessão,
  // pra quem está trabalhando nas pendências não ter que reabrir a cada volta.
  const btnDoc = $('#via-doc-toggle');
  if (btnDoc) {
    const box = $('#via-doc-detalhe');
    const aplicar = aberto => {
      box.hidden = !aberto;
      btnDoc.setAttribute('aria-expanded', String(aberto));
      btnDoc.classList.toggle('aberto', aberto);
    };
    aplicar(sessionStorage.getItem('via-doc-aberto') === '1');
    btnDoc.onclick = () => {
      const aberto = box.hidden;
      aplicar(aberto);
      try { sessionStorage.setItem('via-doc-aberto', aberto ? '1' : '0'); } catch { /* sessionStorage indisponível */ }
    };
  }

  let lastFiltered = sols;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), st = $('#f-status').value, de = $('#f-de').value, ate = $('#f-ate').value;
    saveFilters(FKEY, { q, status: st, de, ate });
    const filtered = sols.filter(s => {
      const destinosTxt = Array.isArray(s.destinos) ? s.destinos.map(d => `${d.municipio} ${d.uf}`).join(' ') : '';
      if (q && !(`${s.colaborador_name} ${s.destino || ''} ${s.ordem_trabalho || ''} ${destinosTxt}`.toLowerCase().includes(q))) return false;
      if (st && s.status !== st) return false;
      if (de && s.data_inicio < de) return false;
      if (ate && s.data_inicio > ate) return false;
      return true;
    });
    lastFiltered = filtered;
    $('#tbl').innerHTML = `
      <thead><tr><th>Colaborador</th><th>Tier</th><th>Local</th><th>Período</th><th class="num">Solicitado</th><th class="num">Liberado</th>
        <th class="num">Comprovado</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(s => {
        const dif = s.valor_liberado - s.valor_comprovado;
        const vencida = ['liberado', 'em_viagem', 'aguardando_comprovacao'].includes(s.status) && s.data_expiracao_flash && s.data_expiracao_flash < todayISO();
        return `<tr>
          <td><strong>${esc(s.colaborador_name)}</strong>${s.colaborador_cargo ? `<br><small style="color:var(--muted)">${esc(s.colaborador_cargo)}</small>` : ''}</td>
          <td>${s.tier}</td>
          <td>${LOCAL_LABEL[s.categoria_local]}${s.ordem_trabalho ? `<br><small style="color:var(--muted)">OT ${esc(s.ordem_trabalho)}</small>` : ''}
            ${Array.isArray(s.destinos) && s.destinos.length ? `<br><small style="color:var(--muted)">${s.destinos.map(d => `${esc(d.municipio)}/${esc(d.uf)}`).join(', ')}</small>` : ''}</td>
          <td>${brDate(s.data_inicio)} – ${brDate(s.data_fim)}${vencida ? '<br><small style="color:#B23A2F">Flash expirado</small>' : ''}</td>
          <td class="num">${brl(viaTotalSolicitado(s))}</td>
          <td class="num">${brl(s.valor_liberado)}${!s.valor_liberado && viaTotalSolicitado(s) > 0 ? '<br><small style="color:var(--muted)">a transferir</small>' : ''}</td>
          <td class="num">${brl(s.valor_comprovado)}${s.anexos_count ? ` <small style="color:var(--muted)">(📎${s.anexos_count})</small>` : ''}</td>
          <td><span class="badge ${VIA_STATUS_BADGE[s.status]}">${VIA_STATUS_LABEL[s.status]}</span></td>
          <td class="actions">${READONLY
            ? `<button class="btn sm primary" data-view="${s.id}">Ver detalhes</button>`
            : `<button class="btn sm primary" data-view="${s.id}">${['comprovado', 'devolvido', 'divergente', 'arquivado'].includes(s.status) ? 'Ver' : 'Comprovar'}</button>
            <button class="btn sm" data-edit="${s.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${s.id}">Excluir</button>`}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="9"><div class="empty">Nenhuma solicitação encontrada.</div></td></tr>'}</tbody>`;
    $('#tbl').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewSolicitacao(Number(b.dataset.view)));
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formSolicitacao(sols.find(s => s.id == b.dataset.edit)));
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const s = filtered.find(x => x.id == b.dataset.del);
      if (s && s.status === 'divergente' && !s.pendencia_resolvida) {
        return openModal('⚠️ Atenção — pendência em aberto', `
          <p style="font-size:13.5px; color:var(--ink-2)">Esta solicitação (<strong>${esc(s.colaborador_name)}</strong>) ainda tem uma
          <strong>pendência de ${brl(s.valor_pendencia)}</strong> não descontada de nenhuma solicitação futura.</p>
          <p style="font-size:13.5px; color:var(--ink-2)">Excluir agora <strong>apaga esse registro de dívida permanentemente</strong> — não fica
          rastro em nenhum outro lugar do sistema. Tem certeza que quer excluir mesmo assim?</p>`,
          [{ label: 'Cancelar', onClick: closeModal },
           { label: 'Excluir mesmo assim', cls: 'danger-ghost', onClick: () => { closeModal(); confirmDelete('a solicitação', `/api/viaticos/solicitacoes/${s.id}`, renderViaticos); } }]);
      }
      confirmDelete('a solicitação', `/api/viaticos/solicitacoes/${b.dataset.del}`, renderViaticos);
    });
  };

  ['q', 'f-status', 'f-de', 'f-ate'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-clear').onclick = () => { saveFilters(FKEY, {}); renderViaticos(); };
  if (!READONLY) {
    $('#btn-new').onclick = () => formSolicitacao(null);
    $('#btn-config').onclick = () => renderViaticosConfig();
  }
  // Exportar: primeiro QUAL relatorio, depois em qual formato. A ordem importa —
  // perguntar o formato antes obrigava a pessoa a decidir "PDF ou Excel" sem
  // saber ainda o que ia sair. Os tres respeitam os filtros da tela.
  $('#btn-export').onclick = () => {
    const rotulo = viaticosPeriodoRotulo(lastFiltered, $('#f-de').value, $('#f-ate').value);
    openModal('Exportar Viáticos', `
      <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:4px">Qual relatório você quer?</p>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px">${esc(rotulo)} · ${lastFiltered.length} solicitação(ões) no filtro atual.</p>
      <div class="rel-opcoes">
        <button class="rel-opcao" data-rel="resumo" type="button">
          <strong>1. Resumo</strong>
          <span>Uma linha por viagem, exatamente o que está na tela: colaborador, local, período, liberado, comprovado e situação.</span>
        </button>
        <button class="rel-opcao" data-rel="extrato" type="button">
          <strong>2. Extrato completo</strong>
          <span>Gasto por gasto das viagens filtradas, com data, categoria, descrição e valor de cada lançamento.</span>
        </button>
        <button class="rel-opcao" data-rel="fechamento" type="button">
          <strong>3. Fechamento do período</strong>
          <span>Documento gerencial: prestação de contas por situação, gastos por colaborador, por categoria, o quadro colaborador × categoria e o extrato completo.</span>
        </button>
      </div>`,
      [{ label: 'Cancelar', onClick: closeModal }]);
    document.querySelectorAll('.rel-opcao').forEach(b => b.onclick = () => {
      closeModal();
      askViaticosFormato(b.dataset.rel, rotulo);
    });
  };

  const REL_TITULO = { resumo: 'Resumo', extrato: 'Extrato completo', fechamento: 'Fechamento do período' };
  const askViaticosFormato = (rel, rotulo) => openModal(`Exportar — ${REL_TITULO[rel]}`,
    `<p style="font-size:13.5px; color:var(--ink-2)">Em qual formato?</p>
     <p style="font-size:12px; color:var(--muted); margin-top:6px">${rel === 'fechamento'
        ? 'O Excel sai com uma aba por bloco (resumo, colaborador, categoria, quadro cruzado, solicitações e extrato). O PDF traz tudo num documento só.'
        : 'O PDF segue o padrão de relatório da plataforma; o Excel sai pronto para dar continuidade na planilha.'}</p>`,
    [
      { label: 'Cancelar', onClick: closeModal },
      { label: 'Excel', onClick: () => { closeModal(); gerarViaticosRelatorio(rel, 'excel', rotulo); } },
      { label: 'PDF', cls: 'primary', onClick: () => { closeModal(); gerarViaticosRelatorio(rel, 'pdf', rotulo); } }
    ]);

  async function gerarViaticosRelatorio(rel, formato, rotulo) {
    const ctx = { subtitulo: rotulo };
    try {
      if (rel === 'resumo') {
        return formato === 'pdf' ? exportViaticosResumoPDF(lastFiltered, ctx) : exportViaticosResumoExcel(lastFiltered);
      }
      toast(rel === 'fechamento' ? 'Montando o fechamento…' : 'Preparando o extrato…');
      if (rel === 'extrato') {
        const itens = await buildViaticosItens(lastFiltered);
        return formato === 'pdf' ? exportViaticosDetalhadoPDF(itens, ctx) : exportViaticosDetalhadoExcel(itens);
      }
      const f = await buildViaticosFechamento(lastFiltered, { rotulo });
      return formato === 'pdf' ? exportViaticosFechamentoPDF(f) : exportViaticosFechamentoExcel(f);
    } catch (e) {
      toast(e.message || 'Não foi possível montar o relatório.');
    }
  }

  draw();

  // Veio de um bookmark antigo de #via-solicitar: abre o assistente direto,
  // sem exigir um segundo clique. Só quando o vínculo existe — sem ele, a
  // tela de Viáticos já fica visível e o usuário entende o motivo.
  if (VIA_ABRIR_WIZARD_AO_ENTRAR) {
    VIA_ABRIR_WIZARD_AO_ENTRAR = false;
    if (meuColaborador) renderSolicitacaoAutosservico();
  }
}

async function formSolicitacao(existing) {
  const colaboradores = await api('/api/colaboradores');
  const ativos = colaboradores.filter(c => c.ativo);
  if (!ativos.length) {
    return openModal('Nenhum colaborador cadastrado', '<p>Cadastre ao menos um colaborador em Viáticos → Configurações antes de criar uma solicitação.</p>',
      [{ label: 'Fechar', cls: 'primary', onClick: closeModal }]);
  }
  const isEdit = !!existing;
  const colabAtual = existing ? colaboradores.find(c => c.id === existing.colaborador_id) : ativos[0];
  let destinosList = (isEdit && Array.isArray(existing.destinos)) ? [...existing.destinos] : [];

  const body = () => `
    ${fldSel('vs-colab', 'Colaborador', ativos.map(c => ({ v: c.id, t: `${c.name}${c.cargo ? ' — ' + c.cargo : ''}` })), existing ? existing.colaborador_id : ativos[0].id)}
    <div id="vs-pendencia-alerta"></div>
    ${fldSel('vs-tier', 'Tier (TUD)', [{ v: 'A', t: TIER_LABEL.A }, { v: 'B', t: TIER_LABEL.B }], existing ? existing.tier : colabAtual.tier)}
    ${fldSel('vs-local', 'Categoria de local (a mais alta tocada na viagem)', Object.entries(LOCAL_LABEL).map(([v, t]) => ({ v, t })), existing ? existing.categoria_local : 'interior')}
    ${fld('vs-ordem', 'Nº da Ordem de Trabalho', 'text', existing ? existing.ordem_trabalho || '' : '')}
    <div class="field"><label>Destinos (cidades da Ordem de Trabalho)</label>
      <div class="field-row" style="align-items:flex-end; margin-bottom:8px">
        ${fldSel('vs-uf', 'Estado', BR_LOCALIDADES.estados.map(e => ({ v: e.uf, t: e.nome })), BR_LOCALIDADES.estados[0].uf)}
        ${fldSel('vs-mun', 'Município', [], null)}
        <button class="btn primary" id="vs-add-dest" type="button">+ Adicionar</button>
      </div>
      <div id="vs-destinos-list"></div>
    </div>
    ${/* Sem valor pré-selecionado: a lista é alfabética, e usar o 1º item faria
          a solicitação nascer com um motivo que ninguém escolheu. */''}
    ${fldSel('vs-motivo', 'Motivo', [{ v: '', t: '— selecione —' }, ...MOTIVO_OPTIONS.map(m => ({ v: m, t: m }))], existing ? (existing.motivo || '') : '')}
    <div class="field-row">
      ${fld('vs-inicio', 'Início da viagem', 'date', existing ? existing.data_inicio : todayISO())}
      ${fld('vs-fim', 'Fim da viagem', 'date', existing ? existing.data_fim : todayISO())}
    </div>
    ${fld('vs-expira', 'Dinheiro disponível no Flash até', 'date', existing ? (existing.data_expiracao_flash || '') : '')}
    <div class="field-row">
      ${fld('vs-solicitado', 'Valor solicitado (referência)', 'number', existing ? (viaTotalSolicitado(existing) || '') : '', 'step="0.01" min="0"')}
      ${fld('vs-liberado', 'Valor liberado no Flash', 'number', existing ? existing.valor_liberado : '', 'step="0.01" min="0"')}
    </div>
    ${fld('vs-notes', 'Observações', 'text', existing ? existing.notes || '' : '')}`;

  openModal(isEdit ? 'Editar solicitação de viático' : 'Nova solicitação de viático', body(),
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar' : 'Criar', cls: 'primary', onClick: async () => {
        const b = {
          colaborador_id: Number($('#vs-colab').value), tier: $('#vs-tier').value, categoria_local: $('#vs-local').value,
          ordem_trabalho: $('#vs-ordem').value, destinos: destinosList, motivo: $('#vs-motivo').value,
          data_inicio: $('#vs-inicio').value, data_fim: $('#vs-fim').value,
          data_expiracao_flash: $('#vs-expira').value || null, valor_solicitado: $('#vs-solicitado').value || null,
          valor_liberado: Number($('#vs-liberado').value) || 0,
          notes: $('#vs-notes').value
        };
        // Pendência de viagem(ns) anterior(es): aplica o desconto de verdade (e não
        // só na tela) e sempre informa a decisão tomada (descontar ou manter em
        // aberto), pra ficar registrado no log de auditoria de forma clara.
        const descIds = $('#vs-desc-ids');
        if (descIds) {
          const ids = JSON.parse(descIds.value || '[]');
          const valorPend = Number($('#vs-desc-valor').value || 0);
          const aplicar = $('#vs-desc-aplicar').value === 'true';
          b.pendencia_info = { valor: valorPend, decisao: aplicar ? 'descontar' : 'manter', ids };
          if (aplicar) { b.valor_liberado = Math.max(0, b.valor_liberado - valorPend); b.descontar_pendencia_ids = ids; }
        }
        try {
          if (isEdit) await api(`/api/viaticos/solicitacoes/${existing.id}`, { method: 'PUT', body: b });
          else await api('/api/viaticos/solicitacoes', { method: 'POST', body: b });
          closeModal(); toast(isEdit ? 'Solicitação atualizada.' : 'Solicitação criada.'); renderViaticos();
        } catch (e) { modalError(e.message); }
     }}]);

  // Estado -> Município em cascata, e lista acumulada de destinos já adicionados.
  const popularMunicipios = () => {
    const uf = $('#vs-uf').value;
    const lista = (BR_LOCALIDADES.municipios[uf] || []);
    $('#vs-mun').innerHTML = lista.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  };
  const renderDestinosList = () => {
    const box = $('#vs-destinos-list');
    box.innerHTML = destinosList.length
      ? `<div class="chip-row">${destinosList.map((d, i) => `<span class="chip">${esc(d.municipio)}/${esc(d.uf)} <button type="button" data-rmdest="${i}">×</button></span>`).join('')}</div>`
      : '<span style="color:var(--muted); font-size:13px">Nenhuma cidade adicionada ainda.</span>';
    box.querySelectorAll('[data-rmdest]').forEach(btn => btn.onclick = () => {
      destinosList.splice(Number(btn.dataset.rmdest), 1);
      renderDestinosList();
    });
  };
  $('#vs-uf').onchange = popularMunicipios;
  popularMunicipios();
  renderDestinosList();
  $('#vs-add-dest').onclick = () => {
    const uf = $('#vs-uf').value, municipio = $('#vs-mun').value;
    if (!municipio) return toast('Selecione um município.');
    if (destinosList.some(d => d.uf === uf && d.municipio === municipio)) return toast('Essa cidade já foi adicionada.');
    destinosList.push({ uf, municipio });
    renderDestinosList();
  };

  // Auto-preenche o tier ao trocar de colaborador, e checa pendência de estouro anterior.
  const checarPendencia = async () => {
    const colabId = Number($('#vs-colab').value);
    const colab = colaboradores.find(c => c.id === colabId);
    if (colab && !isEdit) $('#vs-tier').value = colab.tier;
    const alerta = $('#vs-pendencia-alerta');
    if (!alerta) return;
    alerta.innerHTML = '';
    if (isEdit) return; // pendência só se aplica ao criar nova
    try {
      const r = await api(`/api/viaticos/colaboradores/${colabId}/pendencia`);
      if (r.total > 0) {
        alerta.innerHTML = `<div class="alert-item warn" style="margin-bottom:12px">⚠️ Este colaborador tem <strong>${brl(r.total)}</strong> em pendência de viagem(ns) anterior(es) ainda não descontada.
          <div style="margin-top:8px; display:flex; align-items:center; gap:10px">
            <span style="font-size:13px">Descontar do valor liberado nesta solicitação?</span>
            <button type="button" class="btn sm" id="vs-desc-sim">Sim</button>
            <button type="button" class="btn sm" id="vs-desc-nao">Não</button>
          </div>
          <div id="vs-desc-preview" style="margin-top:8px; font-size:13px; font-weight:600"></div></div>
          <input type="hidden" id="vs-desc-ids" value='${JSON.stringify(r.solicitacoes.map(s => s.id))}'>
          <input type="hidden" id="vs-desc-aplicar" value="true">
          <input type="hidden" id="vs-desc-valor" value="${r.total}">`;
        // Não mexemos no valor digitado em "Valor liberado" — só mostramos uma prévia
        // de quanto ficaria líquido, e a dedução de verdade só é aplicada no momento
        // de enviar o formulário (evita o valor "sumir"/zerar por causa de uma
        // captura antiga do campo antes de você terminar de digitar).
        const liberadoEl = $('#vs-liberado');
        let descontarAtivo = true;
        const atualizarPreview = () => {
          $('#vs-desc-aplicar').value = descontarAtivo ? 'true' : 'false';
          $('#vs-desc-sim').classList.toggle('primary', descontarAtivo);
          $('#vs-desc-nao').classList.toggle('primary', !descontarAtivo);
          const digitado = Number(liberadoEl.value || 0);
          $('#vs-desc-preview').innerHTML = descontarAtivo
            ? `✅ Será descontado <strong>${brl(r.total)}</strong> no envio. Valor líquido a liberar: <strong>${brl(Math.max(0, digitado - r.total))}</strong> (digitado: ${brl(digitado)}).`
            : `➡️ A pendência de <strong>${brl(r.total)}</strong> NÃO será descontada — continua em aberto para uma próxima solicitação. Valor liberado: <strong>${brl(digitado)}</strong>.`;
        };
        $('#vs-desc-sim').onclick = () => { descontarAtivo = true; atualizarPreview(); };
        $('#vs-desc-nao').onclick = () => { descontarAtivo = false; atualizarPreview(); };
        liberadoEl.oninput = atualizarPreview;
        atualizarPreview();
      }
    } catch { /* silencioso */ }
  };
  $('#vs-colab').onchange = checarPendencia;
  checarPendencia();
}

async function viewSolicitacao(id) {
  const [s, despesas, tud] = await Promise.all([
    api('/api/viaticos/solicitacoes').then(all => all.find(x => x.id === id)),
    api(`/api/viaticos/solicitacoes/${id}/despesas`), api('/api/viaticos/tud')
  ]);
  const finalizada = ['comprovado', 'devolvido', 'divergente', 'arquivado'].includes(s.status);
  // Usuário só-leitura abre o mesmo modal em modo consulta: vê os dados
  // completos da OT e a comprovação, sem nenhum controle de edição.
  const somenteLeitura = READONLY;
  const comprovado = despesas.reduce((sum, d) => sum + d.valor, 0);
  const dif = s.valor_liberado - comprovado;

  // Validações: período autorizado + teto da TUD por categoria.
  // Alimentação é checada DIA A DIA (não acumula entre dias — cada dia tem
  // sua própria cota). Hospedagem continua acumulativa (soma das diárias
  // contra o teto do período todo), já que uma diária de hotel normalmente
  // cobre mais de uma noite numa linha só.
  const limite = s.data_expiracao_flash || s.data_fim;
  const foraDoPeriodo = despesas.filter(d => d.data < s.data_inicio || d.data > limite);
  const { dias, noites: noitesPeriodo } = viaDiasNoites(s.data_inicio, s.data_fim);
  // Mesma regra da previsão: viagem toda na cidade-sede não tem hospedagem.
  const hospDevida = viaHospedagemDevida(s.destinos, s.colaborador_cidade_base_uf, s.colaborador_cidade_base_municipio);
  const noites = hospDevida ? noitesPeriodo : 0;
  const tudHosp = tud.find(x => x.tier === s.tier && x.categoria_local === s.categoria_local && x.tipo_despesa === 'hospedagem');
  const tudAlim = tud.find(x => x.tier === s.tier && x.categoria_local === s.categoria_local && x.tipo_despesa === 'alimentacao');

  const excessos = []; // { chave, msg, valor }
  if (tudHosp) {
    const gastoHosp = despesas.filter(d => d.categoria === 'hospedagem').reduce((sum, d) => sum + d.valor, 0);
    // Teto por NOITES, a mesma base da previsão (antes era por dias, o que
    // liberava na conferência quase o dobro do que havia sido previsto).
    const tetoHosp = tudHosp.valor_diaria * noites;
    if (gastoHosp > tetoHosp) {
      excessos.push({ chave: 'hospedagem', valor: gastoHosp - tetoHosp,
        msg: !hospDevida
          ? `Hospedagem lançada em viagem na própria cidade-sede do colaborador (${esc(s.colaborador_cidade_base_municipio || '')}/${esc(s.colaborador_cidade_base_uf || '')}): ${brl(gastoHosp)}. A TUD não prevê hospedagem nesse caso.`
          : noites === 0
          ? `Hospedagem lançada em viagem de 1 dia (sem pernoite previsto): ${brl(gastoHosp)}. A TUD não prevê hospedagem quando ida e volta ocorrem no mesmo dia.`
          : `Hospedagem acima do teto da TUD: ${brl(gastoHosp)} gasto contra um limite de ${brl(tetoHosp)} (${brl(tudHosp.valor_diaria)}/noite × ${noites} noite(s)).` });
    }
  }
  if (tudAlim) {
    const porDia = {};
    despesas.filter(d => d.categoria === 'alimentacao').forEach(d => { porDia[d.data] = (porDia[d.data] || 0) + d.valor; });
    Object.keys(porDia).sort().forEach(data => {
      const gasto = porDia[data];
      if (gasto > tudAlim.valor_diaria) {
        excessos.push({ chave: `alimentacao_${data}`, valor: gasto - tudAlim.valor_diaria,
          msg: `Alimentação do dia ${brDate(data)} acima da TUD diária: ${brl(gasto)} gasto contra um limite de ${brl(tudAlim.valor_diaria)}/dia.` });
      }
    });
  }
  const excessoStatus = (s.excessos_status && typeof s.excessos_status === 'object') ? s.excessos_status : {};

  const alertBlocks = [];
  if (foraDoPeriodo.length) alertBlocks.push(`<div class="alert-item late">⚠️ ${foraDoPeriodo.length} despesa(s) com data fora do período autorizado (${brDate(s.data_inicio)} a ${brDate(limite)}).</div>`);
  excessos.forEach(ex => {
    const st = excessoStatus[ex.chave];
    if (st === 'aprovado') alertBlocks.push(`<div class="alert-item ok">✅ Aprovado (excesso de ${brl(ex.valor)}): ${ex.msg}</div>`);
    else if (st === 'reprovado') alertBlocks.push(`<div class="alert-item late">❌ Reprovado (excesso de ${brl(ex.valor)}): ${ex.msg}</div>`);
    else alertBlocks.push(`<div class="alert-item late">⚠️ ${ex.msg} Excesso de <strong>${brl(ex.valor)}</strong>${somenteLeitura ? ' (aguardando análise do administrador).' : ` — quer aprovar?
          <button class="btn sm primary" data-aprovar="${ex.chave}" type="button" style="margin-left:8px">Aprovar</button>
          <button class="btn sm danger-ghost" data-reprovar="${ex.chave}" type="button" style="margin-left:6px">Reprovar</button>`}</div>`);
  });

  const STATUS_ATIVO_LABEL = { em_approvals: 'Em Approvals', transferencia_agendada: 'Transferência Agendada', liberado: 'Liberado', em_viagem: 'Em viagem', aguardando_comprovacao: 'Aguardando comprovação' };
  const destinosTxt = Array.isArray(s.destinos) && s.destinos.length
    ? s.destinos.map(d => `${esc(d.municipio)}/${esc(d.uf)}`).join(', ')
    : esc(s.destino || '—');
  const infoOT = `
    <div class="card" style="margin-bottom:14px; padding:14px 16px; background:var(--verde-050,#EAF5EC); border-color:#CDE5D6">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 16px; font-size:13px">
        <div><small style="color:var(--muted)">Ordem de Trabalho</small><br><strong>${s.ordem_trabalho ? 'OT ' + esc(s.ordem_trabalho) : '—'}</strong></div>
        <div><small style="color:var(--muted)">Destinos</small><br><strong>${destinosTxt}</strong></div>
        <div><small style="color:var(--muted)">Local / Tier</small><br><strong>${LOCAL_LABEL[s.categoria_local] || '—'} · Tier ${esc(s.tier || '—')}</strong></div>
        <div><small style="color:var(--muted)">Período</small><br><strong>${brDate(s.data_inicio)} – ${brDate(s.data_fim)}</strong></div>
        <div><small style="color:var(--muted)">Flash expira em</small><br><strong>${s.data_expiracao_flash ? brDate(s.data_expiracao_flash) : '—'}</strong></div>
        <div><small style="color:var(--muted)">Status</small><br><span class="badge ${VIA_STATUS_BADGE[s.status]}">${VIA_STATUS_LABEL[s.status]}</span></div>
      </div>
      ${s.motivo || s.objetivo ? `<p style="margin:10px 0 0; font-size:13px; color:var(--ink-2)">${s.motivo ? `<strong>${esc(s.motivo)}</strong>` : ''}${s.motivo && s.objetivo ? ' — ' : ''}${s.objetivo ? esc(s.objetivo) : ''}</p>` : ''}
    </div>`;
  // Memória de cálculo da solicitação: mostra de onde vem o valor pedido. Ficava
  // gravada e nunca era exibida, então uma solicitação do autosserviço parecia
  // zerada até a Tesouraria digitar o valor liberado.
  const solicitado = viaTotalSolicitado(s);
  const prev = (s.previsao_por_categoria && typeof s.previsao_por_categoria === 'object') ? s.previsao_por_categoria : {};
  const prevLinhas = Object.entries(prev).filter(([, v]) => Number(v) > 0);
  const memoriaHtml = prevLinhas.length ? `
    <div class="card" style="margin-bottom:14px; padding:12px 16px">
      <div style="font-size:12.5px; color:var(--muted); margin-bottom:8px">Memória de cálculo da solicitação${s.origem === 'colaborador' ? ' (enviada pelo colaborador e recalculada pelo sistema)' : ''}</div>
      <table class="via-resumo-tbl" style="width:100%">
        <tbody>${prevLinhas.map(([k, v]) => `<tr><td>${DESP_CAT_LABEL[k] || esc(k)}</td><td class="num">${brl(Number(v))}</td></tr>`).join('')}
        <tr><td><strong>Total solicitado</strong></td><td class="num"><strong>${brl(solicitado)}</strong></td></tr></tbody>
      </table>
    </div>` : '';

  const body = `
    ${infoOT}
    <div class="grid kpis" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Solicitado</div><div class="value">${brl(solicitado)}</div></div>
      <div class="card kpi"><div class="label">Liberado</div><div class="value">${brl(s.valor_liberado)}</div>
        ${!s.valor_liberado && solicitado > 0 ? '<div style="font-size:11.5px; color:var(--muted)">aguardando transferência no Flash</div>' : ''}</div>
      <div class="card kpi blue"><div class="label">Comprovado</div><div class="value">${brl(comprovado)}</div></div>
      <div class="card kpi ${dif < 0 ? 'red' : ''}"><div class="label">${dif >= 0 ? 'A devolver ao Flash' : 'Estouro (pendência)'}</div>
        <div class="value ${dif < 0 ? 'neg' : 'pos'}">${brl(Math.abs(dif))}</div></div>
    </div>
    ${memoriaHtml}
    ${!finalizada && !somenteLeitura ? `
    <div class="field-row" style="align-items:flex-end; margin-bottom:14px">
      ${fldSel('vs-status-sel', 'Status da viagem', Object.entries(STATUS_ATIVO_LABEL).map(([v, t]) => ({ v, t })), s.status)}
      <button class="btn" id="vs-status-update" type="button">Atualizar status</button>
      <span style="font-size:12px; color:var(--muted); padding-bottom:10px">${s.status_manual ? 'Definido manualmente' : 'Calculado automaticamente pelas datas'}</span>
    </div>` : ''}
    ${alertBlocks.length ? `<div style="margin-bottom:14px; display:flex; flex-direction:column; gap:8px">${alertBlocks.join('')}</div>` : (despesas.length ? '<div class="alert-item ok" style="margin-bottom:14px">✅ Nenhuma divergência encontrada nas despesas lançadas.</div>' : '')}

    ${!finalizada && !somenteLeitura ? `
    <div style="margin-bottom:10px; display:flex; gap:8px; flex-wrap:wrap">
      <button class="btn" id="btn-import-flash" type="button">📥 Importar lançamentos do Flash (Excel)</button>
      ${despesas.length ? `<button class="btn danger-ghost" id="btn-limpar-desp" type="button" title="Apaga todos os lançamentos desta comprovação, para importar de novo do zero">🗑 Limpar os ${despesas.length} lançamento(s)</button>` : ''}
    </div>
    <div class="field-row" style="align-items:flex-end">
      ${fldSel('de-cat', 'Categoria', Object.entries(DESP_CAT_LABEL).map(([v, t]) => ({ v, t })), 'hospedagem')}
      ${fld('de-data', 'Data', 'date', s.data_inicio)}
      ${fld('de-valor', 'Valor', 'number', '', 'step="0.01" min="0.01"')}
      <button class="btn primary" id="de-add" type="button">+ Adicionar</button>
      <button class="btn" id="de-cancel" type="button" style="display:none">Cancelar edição</button>
    </div>
    <div class="field">${fld('de-desc', 'Descrição (opcional)', 'text', '')}</div>` : ''}

    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th class="actions">Ações</th></tr></thead>
      <tbody>${despesas.map(d => `<tr>
        <td>${brDate(d.data)}</td><td>${DESP_CAT_LABEL[d.categoria]}</td><td>${esc(d.descricao || '—')}</td>
        <td class="num">${brl(d.valor)}</td>
        <td class="actions">
          <button class="btn sm att-btn" data-att="${d.id}">📎</button>
          ${!finalizada && !somenteLeitura ? `<button class="btn sm" data-editdesp="${d.id}">Editar</button><button class="btn sm danger-ghost" data-deldesp="${d.id}">Excluir</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Nenhuma despesa lançada ainda.</div></td></tr>'}</tbody>
    </table></div>`;

  const botoes = [{ label: 'Fechar', onClick: closeModal }];
  // Baixar o PDF da solicitação — disponível para todos (inclusive só-leitura).
  botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });
  if (somenteLeitura) {
    // consulta pura — nenhuma ação além de fechar
  } else if (!finalizada) {
    botoes.push({ label: 'Fechar / conferir', cls: 'primary', onClick: async () => {
      const r = await api(`/api/viaticos/solicitacoes/${id}/fechar`, { method: 'POST' });
      closeModal();
      toast(r.status === 'divergente' ? `Encerrado com divergência: ${brl(r.valor_pendencia)} em pendência.` : r.status === 'devolvido' ? `Encerrado — ${brl(r.valor_devolvido)} devolvido à carteira.` : 'Encerrado — valores batem exatamente.');
      renderViaticos();
    }});
  } else if (s.status !== 'arquivado') {
    if (USER.role === 'admin') {
      botoes.push({ label: 'Reabrir', onClick: async () => {
        await api(`/api/viaticos/solicitacoes/${id}/reabrir`, { method: 'POST' });
        toast('Comprovação reaberta.'); viewSolicitacao(id);
      }});
    }
    botoes.push({ label: 'Arquivar', cls: 'primary', onClick: async () => { await api(`/api/viaticos/solicitacoes/${id}/arquivar`, { method: 'POST' }); closeModal(); toast('Arquivado.'); renderViaticos(); } });
  }

  openModal(`${somenteLeitura ? 'Detalhes da viagem' : finalizada ? 'Comprovação' : 'Comprovar viagem'} — ${esc(s.colaborador_name)} (${brDate(s.data_inicio)}–${brDate(s.data_fim)})`,
    body, botoes, { wide: true });

  if (!finalizada && !somenteLeitura) {
    $('#btn-import-flash').onclick = () => importarFlashModal(s);
    // Saida para importacao que saiu errada: em vez de apagar linha por linha,
    // zera a comprovacao e permite subir o arquivo de novo. A confirmacao diz
    // quantos lancamentos e quanto valor saem, porque isso mexe no comprovado.
    if ($('#btn-limpar-desp')) $('#btn-limpar-desp').onclick = () => {
      const soma = despesas.reduce((acc, x) => acc + Number(x.valor || 0), 0);
      openModal('Limpar os lançamentos desta comprovação', `
        <p>Serão apagados <strong>${despesas.length} lançamento(s)</strong>, somando <strong>${brl(soma)}</strong>, da comprovação de ${esc(s.colaborador_name)}.</p>
        <p style="color:var(--muted); font-size:13px; margin-top:8px">Serve para refazer a importação do Flash do zero. Não afeta o valor solicitado nem o liberado, e não pode ser desfeito.</p>`,
        [{ label: 'Cancelar', onClick: () => viewSolicitacao(id) },
         { label: 'Apagar tudo', cls: 'primary', onClick: async () => {
            try {
              const r = await api(`/api/viaticos/solicitacoes/${id}/despesas`, { method: 'DELETE' });
              toast(`${r.removidas} lançamento(s) apagado(s) (${brl(r.total)}). Pode importar de novo.`);
              viewSolicitacao(id);
            } catch (e) { modalError(e.message); }
         }}]);
    };
    const aplicarStatus = async (novo, valorLiberado) => {
      const payload = { status: novo };
      if (valorLiberado !== undefined) payload.valor_liberado = valorLiberado;
      try {
        await api(`/api/viaticos/solicitacoes/${id}/status`, { method: 'POST', body: payload });
        toast(valorLiberado !== undefined ? 'Transferência agendada e valor liberado registrado.' : 'Status atualizado.');
        viewSolicitacao(id);
      } catch (e) { toast(e.message); }
    };
    $('#vs-status-update').onclick = () => {
      const novo = $('#vs-status-sel').value;
      // A transferência é feita na plataforma do Flash, então é aqui que o valor
      // liberado passa a existir. Sem pedir, a solicitação continuava com
      // Liberado R$ 0,00 e não havia como fechar a comprovação depois.
      if (novo === 'transferencia_agendada' && !s.valor_liberado) {
        return openModal('Agendar transferência no Flash', `
          <p style="font-size:13.5px; color:var(--ink-2)">A solicitação pede <strong>${brl(solicitado)}</strong>.
          Informe quanto foi efetivamente transferido no Flash — é esse valor que será comparado com a comprovação.</p>
          <div class="field">${fld('vs-lib-novo', 'Valor liberado no Flash', 'number', solicitado || '', 'step="0.01" min="0"')}</div>
          <p style="font-size:12px; color:var(--muted)">Se ainda não sabe o valor, deixe zerado e preencha depois em "Editar".</p>`,
          [{ label: 'Cancelar', onClick: closeModal },
           { label: 'Agendar transferência', cls: 'primary', onClick: () => {
             const v = Number($('#vs-lib-novo').value);
             if (!isFinite(v) || v < 0) return toast('Informe um valor válido.');
             closeModal(); aplicarStatus(novo, v);
           } }]);
      }
      aplicarStatus(novo);
    };
    let editingDespId = null;
    const resetForm = () => {
      editingDespId = null;
      $('#de-cat').value = 'hospedagem'; $('#de-data').value = s.data_inicio; $('#de-valor').value = ''; $('#de-desc').value = '';
      $('#de-add').textContent = '+ Adicionar';
      $('#de-cancel').style.display = 'none';
    };
    $('#de-add').onclick = async () => {
      const b = { categoria: $('#de-cat').value, data: $('#de-data').value, valor: Number($('#de-valor').value), descricao: $('#de-desc').value };
      try {
        if (editingDespId) { await api(`/api/viaticos/despesas/${editingDespId}`, { method: 'PUT', body: b }); toast('Despesa atualizada.'); }
        else { await api(`/api/viaticos/solicitacoes/${id}/despesas`, { method: 'POST', body: b }); toast('Despesa adicionada.'); }
        viewSolicitacao(id);
      } catch (e) { toast(e.message); }
    };
    $('#de-cancel').onclick = resetForm;
    document.querySelectorAll('[data-editdesp]').forEach(b => b.onclick = () => {
      const d = despesas.find(x => x.id == b.dataset.editdesp);
      if (!d) return;
      editingDespId = d.id;
      $('#de-cat').value = d.categoria; $('#de-data').value = d.data; $('#de-valor').value = d.valor; $('#de-desc').value = d.descricao || '';
      $('#de-add').textContent = 'Salvar edição';
      $('#de-cancel').style.display = '';
      $('#de-cat').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  document.querySelectorAll('[data-deldesp]').forEach(b => b.onclick = () => confirmDelete('esta despesa', `/api/viaticos/despesas/${b.dataset.deldesp}`, () => viewSolicitacao(id)));
  document.querySelectorAll('[data-att]').forEach(b => b.onclick = () => openAttachments('viatico', b.dataset.att, DESP_CAT_LABEL[despesas.find(d => d.id == b.dataset.att)?.categoria] || 'Comprovante'));
  document.querySelectorAll('[data-aprovar]').forEach(b => b.onclick = async () => {
    try { await api(`/api/viaticos/solicitacoes/${id}/excesso-status`, { method: 'POST', body: { chave: b.dataset.aprovar, status: 'aprovado' } }); toast('Excesso aprovado.'); viewSolicitacao(id); }
    catch (e) { toast(e.message); }
  });
  document.querySelectorAll('[data-reprovar]').forEach(b => b.onclick = async () => {
    try { await api(`/api/viaticos/solicitacoes/${id}/excesso-status`, { method: 'POST', body: { chave: b.dataset.reprovar, status: 'reprovado' } }); toast('Excesso reprovado.'); viewSolicitacao(id); }
    catch (e) { toast(e.message); }
  });
}

// ============================================================
// Importação de comprovação do Flash (Excel) — Viáticos
// ============================================================
// Palavras-conceito que o próprio extrato do Flash já usa no fim da coluna
// "Movimentação" — mapeadas para as categorias que já temos. Conceitos fora
// desta lista (ex.: algo específico de um estabelecimento) viram pendência,
// para revisão manual — nunca tentamos adivinhar uma categoria incerta.
const FLASH_CONCEITO_MAP = {
  'combustivel': 'combustivel', 'pedagio': 'pedagio', 'hospedagem': 'hospedagem',
  'alimentacao': 'alimentacao', 'refeicao': 'alimentacao',
  'estacionamento': 'estacionamento', 'taxi': 'taxi_uber', 'uber': 'taxi_uber'
};
const normalizeTxt = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

// Extrai o nº da Ordem de Trabalho e o nome do colaborador a partir do nome
// do arquivo (ex.: "Comprobación_de_Viáticos_-_OT_148_-_Gustavo_Fonseca.xlsx").
function parseFlashFilename(filename) {
  const semExt = filename.replace(/\.[^.]+$/, '');
  const otMatch = semExt.match(/OT[\s_-]*([0-9]+)/i);
  const partes = semExt.split(/\s*-\s*|_-_/).map(p => p.trim()).filter(Boolean);
  const nome = partes.length ? partes[partes.length - 1].replace(/_/g, ' ').trim() : null;
  return { ot: otMatch ? otMatch[1] : null, nome };
}

// Converte um valor monetário de planilha para número, sem assumir o idioma.
// O Flash exporta em pt-BR ("1.250,50") e também em es-MX ("1,250.50") — a
// versão anterior só entendia o formato brasileiro e devolvia null no
// mexicano, descartando TODAS as linhas em silêncio. Regra: havendo vírgula e
// ponto, o separador que aparece por último é o decimal; havendo só um,
// 3 dígitos depois dele indicam milhar (1.250 = mil duzentos e cinquenta) e
// 1–2 dígitos indicam decimal (250.50).
function flashParseValor(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.abs(v) : null;
  let s = String(v ?? '').replace(/ /g, ' ').trim();
  if (!s) return null;
  s = s.replace(/R\$|\$|\s/gi, '').replace(/MXN|BRL|USD/gi, '').replace(/^[-+]/, '');
  const ultimaVirgula = s.lastIndexOf(','), ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    const decimal = ultimaVirgula > ultimoPonto ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    s = s.split(milhar).join('').replace(decimal, '.');
  } else if (ultimaVirgula > -1) {
    s = /,\d{3}$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
  } else if (ultimoPonto > -1 && /\.\d{3}$/.test(s)) {
    s = s.split('.').join('');
  }
  const num = Number(s);
  return isFinite(num) ? Math.abs(num) : null;
}

// Aceita Date, dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, dd/mm/aa e o número serial
// do Excel — o Flash em espanhol não exporta sempre no formato brasileiro.
function flashParseData(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Rótulos de coluna aceitos, em pt-BR e es-MX (a conta do Flash da matriz
// exporta "Comprobación de Viáticos", com o cabeçalho em espanhol).
const FLASH_COLUNAS = {
  data:   ['data', 'fecha'],
  mov:    ['movimenta', 'movimient', 'concepto', 'conceito', 'descri', 'establecimiento'],
  valor:  ['valor', 'importe', 'monto'],
  pessoa: ['pessoa', 'persona', 'colaborador', 'empleado', 'usuario', 'usuário'],
  status: ['presta', 'rendi', 'estado', 'status', 'situa']
};
// Só entram lançamentos cuja prestação de contas está concluída.
const FLASH_STATUS_OK = ['finaliz', 'aprovad', 'aprobad', 'conclu', 'complet', 'pago', 'pagad'];

// Explica na tela por que nada foi importado — antes a área ficava vazia, sem
// dizer se o arquivo estava errado ou se o sistema havia falhado.
function flashDiagnosticoHtml(diag) {
  if (!diag) return '';
  const d = diag.descartes || {};
  const motivos = [];
  if (d.status) motivos.push(`${d.status} com a prestação de contas ainda não concluída`);
  if (d.semData) motivos.push(`${d.semData} com data em formato não reconhecido`);
  if (d.semValor) motivos.push(`${d.semValor} com valor em formato não reconhecido`);
  if (d.semDescricao) motivos.push(`${d.semDescricao} sem descrição da movimentação`);
  const c = diag.colunasDetectadas;
  return `<div class="alert-item late" style="margin:12px 0">
    <strong>Nenhum lançamento foi importado deste arquivo.</strong>
    <div style="margin-top:8px; font-size:12.5px; line-height:1.7">
      Aba lida: <strong>${esc(diag.aba || '—')}</strong>${diag.abas && diag.abas.length > 1 ? ` · o arquivo tem ${diag.abas.length} abas (${esc(diag.abas.join(', '))})` : ''}<br>
      Linhas após o cabeçalho: <strong>${diag.lidas || 0}</strong><br>
      ${c ? `Colunas identificadas — data: <strong>${esc(c.data || '—')}</strong> · movimentação: <strong>${esc(c.movimentacao || '—')}</strong> · valor: <strong>${esc(c.valor || '—')}</strong>${c.status ? ` · situação: <strong>${esc(c.status)}</strong>` : ''}<br>` : ''}
      ${motivos.length ? `Descartes: ${esc(motivos.join('; '))}.<br>` : ''}
      ${(diag.exemplos || []).length ? `Exemplos: ${diag.exemplos.map(x => esc(x)).join('; ')}.<br>` : ''}
      ${(diag.primeirasLinhas || []).length ? `Primeiras linhas lidas:<br><span class="mono" style="font-size:11.5px">${diag.primeirasLinhas.map(l => esc(l)).join('<br>')}</span>` : ''}
    </div>
  </div>`;
}

async function parseFlashXLSX(file) {
  if (!window.XLSX) throw new Error('Biblioteca de Excel ainda carregando. Tente novamente em instantes.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

  // diag acompanha o parse e alimenta a explicação na tela quando nada entra.
  const diag = { abas: wb.SheetNames, aba: wb.SheetNames[0], cabecalho: null, colunasDetectadas: null,
    lidas: 0, descartes: { status: 0, semData: 0, semValor: 0, semDescricao: 0 }, exemplos: [] };

  const norm = s => String(s ?? '').toLowerCase().trim();
  const achaCol = (row, chaves) => row.findIndex(c => chaves.some(k => c.includes(k)));
  let headerIdx = -1, col = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = (rows[i] || []).map(norm);
    const dCol = achaCol(row, FLASH_COLUNAS.data);
    const mCol = achaCol(row, FLASH_COLUNAS.mov);
    const vCol = achaCol(row, FLASH_COLUNAS.valor);
    if (dCol > -1 && mCol > -1 && vCol > -1) {
      headerIdx = i;
      col = { data: dCol, mov: mCol, valor: vCol,
        pessoa: achaCol(row, FLASH_COLUNAS.pessoa), status: achaCol(row, FLASH_COLUNAS.status) };
      diag.cabecalho = (rows[i] || []).map(c => String(c ?? ''));
      diag.colunasDetectadas = { data: diag.cabecalho[dCol], movimentacao: diag.cabecalho[mCol], valor: diag.cabecalho[vCol],
        pessoa: col.pessoa > -1 ? diag.cabecalho[col.pessoa] : null,
        status: col.status > -1 ? diag.cabecalho[col.status] : null };
      break;
    }
  }
  if (headerIdx === -1) {
    const e = new Error('Não foi possível reconhecer as colunas desta planilha. Esperado algo como Data/Fecha, Movimentação/Movimiento e Valor/Importe.');
    e.diag = { ...diag, primeirasLinhas: rows.slice(0, 6).map(r => (r || []).map(c => String(c ?? '')).filter(Boolean).join(' | ')).filter(Boolean) };
    throw e;
  }

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    diag.lidas++;
    if (col.status > -1) {
      const st = normalizeTxt(row[col.status]);
      if (st && !FLASH_STATUS_OK.some(k => st.includes(k))) {
        diag.descartes.status++;
        if (diag.exemplos.length < 3) diag.exemplos.push(`situação "${String(row[col.status])}" não reconhecida como concluída`);
        continue;
      }
    }
    const data = flashParseData(row[col.data]);
    const valor = flashParseValor(row[col.valor]);
    const movRaw = String(row[col.mov] ?? '').trim();
    if (!data) {
      diag.descartes.semData++;
      if (diag.exemplos.length < 3) diag.exemplos.push(`data "${String(row[col.data] ?? '')}" em formato não reconhecido`);
      continue;
    }
    if (valor === null) {
      diag.descartes.semValor++;
      if (diag.exemplos.length < 3) diag.exemplos.push(`valor "${String(row[col.valor] ?? '')}" em formato não reconhecido`);
      continue;
    }
    if (!movRaw) { diag.descartes.semDescricao++; continue; }
    const tokens = movRaw.split(/\s+/);
    const conceitoOriginal = tokens[tokens.length - 1] || '';
    const categoria = FLASH_CONCEITO_MAP[normalizeTxt(conceitoOriginal)] || '';
    const pessoa = col.pessoa > -1 ? String(row[col.pessoa] ?? '').trim() : '';
    out.push({ data, valor, descricao: movRaw, pessoa, conceitoOriginal, categoria });
  }
  return { linhas: out, diag };
}

async function importarFlashModal(s) {
  openModal(`Importar lançamentos do Flash — ${esc(s.colaborador_name)}`, `
    <div class="field"><label>Arquivo de comprovação do Flash (.xlsx)</label><input type="file" id="fl-file" accept=".xlsx,.xls"></div>
    <div id="fl-preview"></div>`,
    [{ label: 'Voltar', onClick: () => viewSolicitacao(s.id) }], { xwide: true });

  let rows = [];
  let avisos = [];
  let diag = null; // preenchido pelo parse; explica na tela quando nada entra

  const draw = () => {
    const box = $('#fl-preview');
    const avisosHtml = avisos.length
      ? `<div class="alert-item late" style="margin:12px 0">🚫 ${avisos.join('<br>🚫 ')}<br><br>Confira se é o arquivo certo antes de importar.</div>` : '';
    if (!rows.length) { box.innerHTML = avisosHtml + flashDiagnosticoHtml(diag); return; }
    const prontos = rows.filter(r => r.categoria).length;
    const pendentes = rows.length - prontos;
    box.innerHTML = avisosHtml + `
      <div class="alert-item ${pendentes ? 'warn' : 'ok'}" style="margin:12px 0">
        ${pendentes ? '⚠️' : '✅'} ${prontos} lançamento(s) prontos para importar${pendentes ? ` · ${pendentes} pendência(s) — escolha a categoria ou desmarque para ignorar` : ''}.
      </div>
      <div class="table-wrap"><table class="tbl-flash">
        <colgroup><col class="c-fl-data"><col class="c-fl-desc"><col class="c-fl-valor"><col class="c-fl-cat"><col class="c-fl-inc"></colgroup>
        <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Categoria</th><th class="c-inc">Incluir</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td>${brDate(r.data)}</td>
          <td>${esc(r.descricao)}${!r.categoria ? `<small class="fl-aviso">Conceito "${esc(r.conceitoOriginal)}" não reconhecido</small>` : ''}</td>
          <td class="num">${brl(r.valor)}</td>
          <td><select class="fl-cat" data-idx="${i}"${r.categoria ? '' : ' data-pendente'}>
            <option value="">— Pendência —</option>
            ${Object.entries(DESP_CAT_LABEL).map(([v, t]) => `<option value="${v}" ${r.categoria === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></td>
          <td class="c-inc"><input type="checkbox" class="fl-inc" data-idx="${i}" ${r.categoria ? 'checked' : ''}></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <button class="btn primary" id="fl-confirm" type="button" style="margin-top:14px">Confirmar importação</button>`;

    box.querySelectorAll('.fl-cat').forEach(sel => sel.onchange = () => {
      const i = Number(sel.dataset.idx);
      rows[i].categoria = sel.value;
      if (sel.value) sel.removeAttribute('data-pendente'); else sel.setAttribute('data-pendente', '');
      box.querySelector(`.fl-inc[data-idx="${i}"]`).checked = !!sel.value;
    });
    box.querySelectorAll('.fl-inc').forEach(chk => chk.onchange = () => {
      const i = Number(chk.dataset.idx);
      if (chk.checked && !rows[i].categoria) { toast('Escolha uma categoria antes de incluir.'); chk.checked = false; }
    });
    $('#fl-confirm').onclick = async () => {
      // A trava e o rotulo de progresso nao sao enfeite. O laco leva alguns
      // segundos e o botao ficava habilitado e calado o tempo todo: um segundo
      // clique disparava a importacao inteira de novo. Foi assim que a
      // solicitacao 60 recebeu 94 linhas de um arquivo de 47 (02/09/2026).
      const btn = $('#fl-confirm');
      if (btn.disabled) return;
      const rotuloOriginal = btn.textContent;
      btn.disabled = true;
      // Toda saida antecipada tem de devolver o botao, senao a trava vira
      // travamento e a pessoa precisa fechar o modal para tentar de novo.
      const liberar = () => { btn.disabled = false; btn.textContent = rotuloOriginal; };
      const selecionados = rows.filter((r, i) => box.querySelector(`.fl-inc[data-idx="${i}"]`).checked && r.categoria);
      if (!selecionados.length) { liberar(); return toast('Nenhum lançamento selecionado.'); }
      let ok = 0;
      let feitas = 0;
      btn.textContent = `Importando 0 de ${selecionados.length}…`;
      for (const r of selecionados) {
        btn.textContent = `Importando ${++feitas} de ${selecionados.length}…`;
        try {
          await api(`/api/viaticos/solicitacoes/${s.id}/despesas`, { method: 'POST', body: { categoria: r.categoria, data: r.data, valor: r.valor, descricao: r.descricao } });
          ok++;
        } catch { /* segue tentando os demais */ }
      }
      toast(`${ok} de ${selecionados.length} lançamento(s) importado(s).`);
      viewSolicitacao(s.id);
    };
  };

  $('#fl-file').onchange = async () => {
    const file = $('#fl-file').files[0];
    if (!file) return;
    try {
      const { ot, nome } = parseFlashFilename(file.name);
      avisos = [];
      if (ot && s.ordem_trabalho && ot.replace(/\D/g, '') !== String(s.ordem_trabalho).replace(/\D/g, '')) {
        avisos.push(`O nº da Ordem de Trabalho no arquivo (${esc(ot)}) é diferente do desta solicitação (${esc(s.ordem_trabalho)}).`);
      }
      if (nome) {
        const nomeArq = normalizeTxt(nome), nomeColab = normalizeTxt(s.colaborador_name);
        const bate = nomeArq === nomeColab || nomeColab.includes(nomeArq) || nomeArq.includes(nomeColab.split(' ')[0]);
        if (!bate) avisos.push(`O nome no arquivo ("${esc(nome)}") não parece bater com o colaborador desta solicitação ("${esc(s.colaborador_name)}").`);
      }
      const parsed = await parseFlashXLSX(file);
      rows = parsed.linhas; diag = parsed.diag;
      const foraNome = s.colaborador_name ? rows.filter(r => r.pessoa && normalizeTxt(r.pessoa) !== normalizeTxt(s.colaborador_name)).length : 0;
      if (foraNome) avisos.push(`${foraNome} linha(s) do arquivo têm um nome diferente na coluna "Pessoa" — confira se é mesmo o arquivo certo.`);
      draw();
    } catch (e) {
      // O erro fica na tela (e não só num toast que desaparece), junto com o
      // que o sistema conseguiu ler do arquivo — sem isso o usuário não tem
      // como saber por que a importação não trouxe nada.
      rows = []; diag = e.diag || null;
      $('#fl-preview').innerHTML = `<div class="alert-item late" style="margin:12px 0">⚠️ ${esc(e.message)}</div>` + flashDiagnosticoHtml(diag);
      toast(e.message);
    }
  };
}

// ============================================================
// SOLICITAÇÃO DE VIÁTICOS — Autosserviço
// Embutido dentro da tela de Viáticos (botão "Solicitar viagem"), não é
// mais rota própria — quem acessa é só quem já tem permissão de ver a
// página Viáticos e está vinculado a um colaborador. Fluxo em 5 etapas,
// cada uma alimentando a próxima; a última é só leitura + geração de PDF
// (upload manual no Approvals, até a integração automática existir).
// ============================================================
let VIA_WIZ = null;
// Setado pelo redirecionamento de um #via-solicitar antigo (bookmark) — faz
// renderViaticos() abrir o assistente assim que a tela terminar de montar.
let VIA_ABRIR_WIZARD_AO_ENTRAR = false;

async function renderSolicitacaoAutosservico() {
  const c = $('#content');
  let colab;
  try {
    colab = await api('/api/viaticos/autosservico/meu-colaborador');
  } catch (e) {
    c.innerHTML = `<div class="card"><h3>Sem vínculo de colaborador</h3>
      <p style="color:var(--ink-2); font-size:13.5px; margin-top:8px">Seu usuário ainda não está vinculado a um cadastro de colaborador de viáticos.
      Peça ao administrador para vincular seu usuário em Viáticos → Configurações → Colaboradores.</p>
      <button class="btn" id="via-voltar-erro" style="margin-top:14px">Voltar</button></div>`;
    $('#via-voltar-erro').onclick = () => renderViaticos();
    return;
  }
  const [tud, viaConfig] = await Promise.all([api('/api/viaticos/tud'), api('/api/viaticos/config')]);
  VIA_WIZ = {
    colab, tud, preco_combustivel: viaConfig.preco_combustivel_litro,
    // Motivo começa vazio de propósito: com todos os campos obrigatórios, deixar
    // um valor pré-selecionado faria a solicitação sair com um motivo que a
    // pessoa nunca escolheu (antes vinha "Monitoramento" por ser o 1º da lista).
    ordem_trabalho: '', categoria_local: 'interior', internacional: false, destinos: [], data_inicio: todayISO(), data_fim: todayISO(),
    motivo: '', objetivo: '',
    transporte: {
      aviao: false, onibus: false, aluguel_carro: false, carro_proprio: false, taxi_uber: false,
      aviao_trechos: [], onibus_trechos: [], alugueis: [], taxi_uber_corridas: [],
      carro_proprio_rota: { distancia_km: '', combustivel_valor: '', pedagio_valor: '', estacionamento_qtd: 1, estacionamento_valor: '', trechos: [], manual_override: false }
    }
  };
  viaWizStep1();
}

function viaWizProgress(atual) {
  const nomes = ['Solicitante', 'Viagem', 'Transporte', 'Despesas', 'Resumo'];
  return `<div class="via-wiz-topbar">
      <button type="button" class="via-wiz-cancelar" data-via-cancelar>← Voltar para Viáticos</button>
    </div>
    <div class="via-wiz-steps">${nomes.map((n, i) => `<span class="via-wiz-step ${i + 1 === atual ? 'active' : i + 1 < atual ? 'done' : ''}">${i + 1}. ${n}</span>`).join('')}</div>`;
}
// Delegado uma única vez: qualquer etapa do assistente pode ter esse botão
// (viaWizProgress reaproveitado em todas), então liga aqui em vez de
// religar a cada re-render de cada uma das 5 etapas.
document.addEventListener('click', e => {
  if (!e.target.closest('[data-via-cancelar]')) return;
  if (confirm('Sair da solicitação? Os dados preenchidos nesta viagem serão perdidos.')) renderViaticos();
});
// FONTE ÚNICA da duração da viagem. Antes esta mesma conta existia em 3 lugares
// (previsão, conferência e regeração de PDF), com risco de divergirem — e foi
// exatamente o que aconteceu com a hospedagem (auditoria 2026-07-29, A1/B1).
//
// Alimentação conta por DIA de viagem; Hospedagem conta por NOITE (dias − 1),
// que é o que o hotel cobra: 03/08 a 05/08 = 3 dias de alimentação e 2 noites.
// A regra vale nas DUAS pontas — tanto no valor previsto quanto no teto da TUD
// usado para apontar excesso na comprovação.
function viaDiasNoites(dataInicio, dataFim) {
  const ini = new Date(dataInicio), fim = new Date(dataFim);
  if (isNaN(ini) || isNaN(fim)) return { dias: 0, noites: 0 };
  const dias = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
  return { dias, noites: Math.max(0, dias - 1) };
}
function viaWizDias(w) { return viaDiasNoites(w.data_inicio, w.data_fim).dias; }
function viaWizNoites(w) { return viaDiasNoites(w.data_inicio, w.data_fim).noites; }

// Compara município/UF tolerando acento, caixa e espaço extra — a cidade-base
// e os destinos vêm do mesmo dataset, mas registros antigos podem ter grafia
// diferente e um falso negativo aqui pagaria hospedagem indevida.
const viaMesmaCidade = (ufA, munA, ufB, munB) => {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return !!n(munA) && n(ufA) === n(ufB) && n(munA) === n(munB);
};

// Hospedagem só é devida quando o colaborador PERNOITA FORA da cidade-sede:
// visita na própria cidade ele dorme em casa, então entra apenas alimentação.
// Basta um destino fora da sede para a hospedagem voltar a ser devida (ele
// precisa se hospedar nesse trecho). Sem cidade-sede cadastrada ou sem
// destinos não há como afirmar que é local — mantém o comportamento normal,
// para não subestimar o viático por falta de cadastro.
function viaHospedagemDevida(destinos, cidadeBaseUf, cidadeBaseMunicipio) {
  const lista = Array.isArray(destinos) ? destinos : [];
  if (!cidadeBaseMunicipio || !cidadeBaseUf || !lista.length) return true;
  return lista.some(d => !viaMesmaCidade(d.uf, d.municipio, cidadeBaseUf, cidadeBaseMunicipio));
}
// Noites que de fato entram no cálculo (0 quando a viagem é toda na cidade-sede).
function viaNoitesFaturaveis(destinos, cidadeBaseUf, cidadeBaseMunicipio, noites) {
  return viaHospedagemDevida(destinos, cidadeBaseUf, cidadeBaseMunicipio) ? noites : 0;
}

// Calcula a distância real de carro (cidade-base -> destinos na ordem
// adicionada -> volta pra cidade-base) usando o OSRM (motor de rotas
// gratuito, sem chave de API). Devolve também o detalhamento perna a perna
// (o OSRM já calcula isso no mesmo pedido). Pedágio ainda não é automático.
// Formata um resultado do Photon (properties do GeoJSON) num texto de
// endereço legível — o Photon não devolve um "display_name" pronto como o
// Nominatim, então montamos a partir dos campos que vierem preenchidos.
function viaFormatarEnderecoPhoton(props) {
  const partes = [];
  if (props.name) partes.push(props.name);
  const rua = [props.street, props.housenumber].filter(Boolean).join(', ');
  if (rua && rua !== props.name) partes.push(rua);
  if (props.district && props.district !== props.city) partes.push(props.district);
  if (props.city) partes.push(props.city);
  if (props.state) partes.push(props.state);
  return partes.filter(Boolean).join(' - ') || 'Local sem nome';
}

// Busca lugares/endereços no Photon (komoot.io), normalizado pro formato
// { endereco, lat, lng }[]. O mantenedor do Photon relatou publicamente
// (abr/2026) estar bloqueando parte do tráfego de navegador comum como
// medida contra scraping — o que pode fazer o serviço público responder
// 400/404 mesmo com consultas válidas. Isso está fora do nosso controle.
async function viaBuscarPhoton(q, limit) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=pt`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`photon-http-${resp.status}`);
  const data = await resp.json();
  return (data.features || []).map(f => ({ endereco: viaFormatarEnderecoPhoton(f.properties), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
}
// Busca no Nominatim, normalizado pro mesmo formato — usado como reserva
// automática quando o Photon falha (rede bloqueada, HTTP de erro, etc.).
async function viaBuscarNominatim(q, limit) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=${limit}&q=${encodeURIComponent(q)}`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
  if (!resp.ok) throw new Error(`nominatim-http-${resp.status}`);
  const data = await resp.json();
  return (data || []).map(r => ({ endereco: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}
// Tenta o Photon primeiro (melhor busca por nome de lugar); se falhar por
// qualquer motivo (ou não achar nada), cai pro Nominatim automaticamente,
// sem o usuário precisar fazer nada. Só propaga erro se os dois falharem.
async function viaBuscarLugares(q, limit) {
  try {
    const r = await viaBuscarPhoton(q, limit);
    if (r.length) return r;
  } catch (e) { console.warn('Photon indisponível, tentando Nominatim como alternativa:', e.message); }
  return viaBuscarNominatim(q, limit);
}

// Geocodifica um endereço/nome de lugar em texto livre pra lat/lng,
// tentando Photon e depois Nominatim (ver viaBuscarLugares).
async function viaGeocodificarEndereco(endereco) {
  let resultados;
  try {
    resultados = await viaBuscarLugares(endereco, 1);
  } catch (e) {
    throw new Error('Não consegui acessar nenhum serviço de geocodificação (Photon ou Nominatim) — verifique a conexão ou se a rede/firewall bloqueia esses domínios.');
  }
  if (!resultados.length) throw new Error(`Não encontrei "${endereco}" — tente incluir rua, número, bairro e cidade, ou o nome completo do lugar.`);
  return { lat: resultados[0].lat, lng: resultados[0].lng };
}

// Resolve um ponto do roteiro pra { label, coord }, aceitando três formatos:
// { uf, municipio } (cidade do IBGE, já com coordenada conhecida), ou
// { endereco, lat?, lng? } (texto livre — se lat/lng já vieram de uma
// sugestão clicada no autocomplete, reaproveita; senão geocodifica na hora).
async function viaResolverPonto(p) {
  if (p.endereco) {
    if (p.lat != null && p.lng != null) return { label: p.endereco, coord: [p.lat, p.lng] };
    const g = await viaGeocodificarEndereco(p.endereco);
    return { label: p.endereco, coord: [g.lat, g.lng] };
  }
  const c = BR_LOCALIDADES.coords[p.uf] && BR_LOCALIDADES.coords[p.uf][p.municipio];
  if (!c) throw new Error(`Não encontrei coordenadas para ${p.municipio}/${p.uf}.`);
  return { label: `${p.municipio}/${p.uf}`, coord: c };
}

// Anexa um autocomplete de endereços/lugares a um <input>: digitar (com uma
// pequena pausa) busca sugestões (Photon, com reserva automática no
// Nominatim — ver viaBuscarLugares); clicar numa sugestão preenche o campo
// com o endereço formatado e já entrega lat/lng prontos (evita ter que
// geocodificar de novo na hora de calcular a rota). onDigitar(valorDigitado)
// roda a cada tecla; onSelecionar({endereco,lat,lng}) só quando clicada.
function viaAnexarAutocompleteEndereco(inputEl, onDigitar, onSelecionar) {
  if (!inputEl) return;
  let timer = null, vivo = true;
  const dropdown = document.createElement('div');
  dropdown.className = 'via-addr-suggest';
  inputEl.insertAdjacentElement('afterend', dropdown);
  const esconder = () => { dropdown.style.display = 'none'; dropdown.innerHTML = ''; };
  const mostrarErro = (msg) => { dropdown.innerHTML = `<div class="via-addr-suggest-empty">⚠️ ${esc(msg)}</div>`; dropdown.style.display = 'block'; };
  const buscar = async (q) => {
    if (!vivo) return;
    if (q.trim().length < 3) { esconder(); return; }
    let resultados;
    try {
      resultados = await viaBuscarLugares(q, 7);
    } catch (e) {
      console.error('Falha ao buscar sugestões de endereço (Photon e Nominatim):', e);
      if (vivo && inputEl.value.trim() === q.trim()) mostrarErro('Não consegui acessar nenhum serviço de busca de endereços agora. Você ainda pode digitar o endereço livremente.');
      return;
    }
    if (!vivo || inputEl.value.trim() !== q.trim()) return;
    if (!resultados.length) { dropdown.innerHTML = '<div class="via-addr-suggest-empty">Nenhum lugar encontrado — você ainda pode digitar o endereço livremente.</div>'; dropdown.style.display = 'block'; return; }
    dropdown.innerHTML = resultados.map((r, idx) => `<div class="via-addr-suggest-item" data-idx="${idx}">${esc(r.endereco)}</div>`).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.via-addr-suggest-item').forEach(el => {
      el.onmousedown = ev => ev.preventDefault(); // evita perder o clique pro blur do input
      el.onclick = () => {
        const r = resultados[Number(el.dataset.idx)];
        inputEl.value = r.endereco;
        onSelecionar(r);
        esconder();
      };
    });
  };
  inputEl.oninput = () => {
    onDigitar(inputEl.value);
    clearTimeout(timer);
    const q = inputEl.value;
    timer = setTimeout(() => buscar(q), 400);
  };
  inputEl.addEventListener('blur', () => setTimeout(esconder, 150));
  inputEl.addEventListener('focus', () => { if (inputEl.value.trim().length >= 3) buscar(inputEl.value); });
  return { destruir: () => { vivo = false; clearTimeout(timer); dropdown.remove(); } };
}

// pontoFixo = { uf, municipio } ou { endereco } — ponto de partida E chegada
// (fecha o circuito). intermediarios = array no mesmo formato — paradas na
// ordem visitada. Generalizado assim pra servir tanto o trajeto da viagem
// inteira (partida = cidade-base do colaborador, paradas = cidades da OT)
// quanto um trajeto local de um aluguel específico no destino, registrado
// por endereço (partida = onde o carro foi retirado, ex. o aeroporto onde a
// pessoa desembarcou; paradas = os endereços visitados de carro por lá).
async function viaCalcularRota(pontoFixo, intermediarios) {
  if (!pontoFixo || !(pontoFixo.endereco || (pontoFixo.uf && pontoFixo.municipio))) throw new Error('Defina a cidade/endereço de partida antes de calcular a rota.');
  if (!intermediarios || !intermediarios.length) throw new Error('Adicione ao menos um destino/parada antes de calcular a rota.');
  const base = await viaResolverPonto(pontoFixo);
  const resolvidos = [];
  for (const p of intermediarios) {
    resolvidos.push(await viaResolverPonto(p));
    // Pequena pausa entre chamadas de geocodificação, por educação com o serviço público.
    if (p.endereco && p.lat == null) await new Promise(r => setTimeout(r, 300));
  }
  const pontos = [base, ...resolvidos, base];
  const coordStr = pontos.map(p => `${p.coord[1]},${p.coord[0]}`).join(';');
  const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
  if (!resp.ok) throw new Error('Serviço de rotas indisponível no momento.');
  const data = await resp.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('Não foi possível calcular a rota entre esses pontos.');
  const route = data.routes[0];
  const legs = route.legs.map((leg, i) => ({ de: pontos[i].label, para: pontos[i + 1].label, km: leg.distance / 1000 }));
  const geometry = (route.geometry && route.geometry.coordinates) ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng]) : pontos.map(p => p.coord);
  return { total_km: route.distance / 1000, legs, pontos, geometry };
}

// Quando o usuário refaz o cálculo (reordenar/remover cidade), os trechos
// mudam de índice — casamos pelo rótulo "De → Para" pra manter o valor de
// repetição que ele já tinha ajustado, em vez de resetar tudo pra 1.
function viaMesclarAjustesTrechos(novosTrechos, trechosAntigos) {
  const mapa = {};
  (trechosAntigos || []).forEach(t => { mapa[`${t.de}→${t.para}`] = { repeticoes: t.repeticoes, pedagio: t.pedagio, km_extra: t.km_extra }; });
  return novosTrechos.map(t => {
    const ant = mapa[`${t.de}→${t.para}`] || {};
    return { ...t, repeticoes: ant.repeticoes || 1, pedagio: ant.pedagio != null ? ant.pedagio : '',
      km_extra: ant.km_extra != null ? ant.km_extra : '' };
  });
}
// Km de um trecho = distância da rota + `km_extra`, a quilometragem rodada por
// conta própria enquanto se está naquele destino (hotel ↔ local da visita, por
// exemplo), que o cálculo de rota — ida a cada parada e volta ao ponto de
// partida — não tem como conhecer. É digitada por quem viaja.
//
// `repeticoes` não é mais editável na tela (foi substituída pelo km_extra), mas
// continua sendo multiplicada aqui: solicitações gravadas antes desta mudança
// têm repetições > 1, e ignorá-las mudaria o valor de registros já aprovados.
function viaKmTrecho(t) { return t.km * (t.repeticoes || 1) + viaNum(t.km_extra); }
function viaKmPonderado(trechos) { return (trechos || []).reduce((s, t) => s + viaKmTrecho(t), 0); }
// Pedágio informado por trecho. O valor digitado é o total do trecho; o fator de
// repetição só sobrevive para não alterar registros antigos (auditoria
// 2026-07-29, achado B2 — antes o pedágio era um campo único fora do cálculo).
function viaPedagioPonderado(trechos) {
  return (trechos || []).reduce((s, t) => s + viaNum(t.pedagio) * (t.repeticoes || 1), 0);
}
// Total de pedágio de um bloco de transporte: prefere o detalhamento por
// trecho e cai no campo único antigo quando a rota não foi calculada ou o
// registro é anterior a esta mudança.
function viaPedagioTotal(bloco) {
  const porTrecho = viaPedagioPonderado(bloco && bloco.trechos);
  return porTrecho > 0 ? porTrecho : (Number(bloco && bloco.pedagio_valor) || 0);
}
// O campo "Pedágio total" do formulário passa a ser a soma da coluna de pedágio
// da tabela de trechos e fica TRAVADO, igual a distância e combustível: quem
// digita é a tabela, trecho por trecho. Enquanto nenhum pedágio for informado o
// campo segue liberado, para quem quiser lançar só o valor total.
function viaSincronizarPedagioTotal(input, bloco, trechos) {
  if (!input) return;
  const total = viaPedagioPonderado(trechos);
  bloco.pedagio_valor = total > 0 ? total.toFixed(2) : '';
  input.value = bloco.pedagio_valor;
  // Travado junto com distância e combustível: os três vêm da rota. Só libera
  // com "preencher manualmente", que é a chave dos outros dois.
  input.disabled = !bloco.manual_override;
}
// "Rodei apenas por lugares específicos no destino" só faz sentido quando a
// viagem tem voo: é o caso de chegar de avião e usar o carro apenas dentro do
// destino, em vez de rodar as cidades da OT saindo da base. Sem voo informado a
// opção some — e, se estava marcada, volta para o modo normal, senão o roteiro
// ficaria preso nas paradas manuais sem a pessoa ver por quê.
function viaTemVooPreenchido() {
  const t = VIA_WIZ && VIA_WIZ.transporte;
  if (!t || !t.aviao) return false;
  return (t.aviao_trechos || []).some(x =>
    String(x.origem || '').trim() && String(x.destino || '').trim() && x.data && viaNum(x.valor) > 0);
}
// Mostra/esconde a opção em todos os aluguéis sem redesenhar o bloco inteiro —
// isso é chamado enquanto a pessoa digita os dados do voo, e um re-render
// tiraria o foco do campo. Só redesenha se precisar desmarcar alguém.
function viaAtualizarVisibilidadeUsoLocal() {
  const w = VIA_WIZ;
  if (!w || !w.transporte.aluguel_carro) return;
  const liberado = viaTemVooPreenchido();
  let precisaRedesenhar = false;
  (w.transporte.alugueis || []).forEach((a, i) => {
    const wrap = document.getElementById(`al-usolocal-wrap-${i}`);
    if (wrap) wrap.style.display = liberado ? '' : 'none';
    if (!liberado && a.uso_local) { a.uso_local = false; precisaRedesenhar = true; }
  });
  if (precisaRedesenhar) viaRenderAluguelBlock();
}

// Sem API de pedágio confiável hoje, o colaborador consulta o valor no Rotas
// Brasil e transcreve por trecho. O botão é só um atalho para o site.
const ROTAS_BRASIL_URL = 'https://rotasbrasil.com.br/';
const viaBotaoRotasBrasil = () => `<a class="btn sm" href="${ROTAS_BRASIL_URL}" target="_blank" rel="noopener noreferrer"
  title="Abre o Rotas Brasil em outra aba para consultar o pedágio do trajeto">🛣️ Consultar pedágio no Rotas Brasil</a>`;
// Aceita "250.50" ou "250,50" — o campo de diária de aluguel virou texto
// livre (sem as setinhas do input numérico) pra facilitar a digitação.
function viaNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// Monta o HTML do detalhamento perna a perna + os controles pra reordenar
// os destinos (o roteiro é o mesmo array w.destinos usado na etapa 2).
let VIA_MAP = null; // instância única do Leaflet, reaproveitada entre cálculos

// Desenha o mapa com a rota real (segue as estradas, via geometria devolvida
// pelo OSRM) e um marcador por parada — mesmo estilo visual usado na
// ferramenta de viáticos que fizemos em maio, só que embutido na própria
// tela em vez de um arquivo à parte.
function viaAtualizarMapa(pontos, geometry) {
  const container = $('#via-map');
  if (!container) return;
  container.style.display = '';
  const placeholder = $('#via-map-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  if (!VIA_MAP) VIA_MAP = L.map('via-map');
  VIA_MAP.eachLayer(l => VIA_MAP.removeLayer(l));
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(VIA_MAP);

  const mkBase = L.divIcon({ html: '<div style="width:24px;height:24px;border-radius:50%;background:#0d2b1e;border:3px solid white;box-shadow:0 1px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">B</div>', iconSize: [24, 24], iconAnchor: [12, 12], className: '' });
  const mkStop = n => L.divIcon({ html: `<div style="width:22px;height:22px;border-radius:50%;background:#2a8055;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11], className: '' });

  pontos.forEach((p, i) => {
    const icon = (i === 0 || i === pontos.length - 1) ? mkBase : mkStop(i);
    L.marker(p.coord, { icon }).addTo(VIA_MAP).bindPopup(`<strong>${esc(p.label)}</strong>`);
  });
  const line = L.polyline(geometry, { color: '#2a8055', weight: 4, opacity: 0.85 }).addTo(VIA_MAP);
  VIA_MAP.fitBounds(line.getBounds(), { padding: [30, 30] });
}

function viaRenderRotaDetalhe(intermediarios, trechos, consumo, preco, idPrefix) {
  const legsHtml = trechos.map((t, i) => {
    const kmTotal = viaKmTrecho(t);
    const comb = consumo ? (kmTotal / consumo * preco) : 0;
    const rep = t.repeticoes || 1;
    return `<tr>
      <td>${esc(viaLabelCurto(t.de))} → ${esc(viaLabelCurto(t.para))}</td>
      <td class="num">${t.km.toFixed(1)} km${rep > 1 ? ` <small style="color:var(--muted)">×${rep}</small>` : ''}
        ${viaNum(t.km_extra) > 0 ? `<br><small style="color:var(--muted)" id="${idPrefix}-legkmtot-${i}">total ${kmTotal.toFixed(1)} km</small>` : `<span id="${idPrefix}-legkmtot-${i}"></span>`}</td>
      <td class="num" style="width:104px"><input type="number" min="0" step="0.1" placeholder="0" value="${esc(t.km_extra || '')}" data-legkm="${i}" style="width:74px; text-align:right" title="Km rodados por conta própria enquanto esteve neste destino — hotel, almoço, deslocamentos até o local da visita"></td>
      <td class="num" id="${idPrefix}-legcomb-${i}">${comb > 0 ? brl(comb) : '—'}</td>
      <td class="num" style="width:104px"><input type="number" min="0" step="0.01" placeholder="0,00" value="${esc(t.pedagio || '')}" data-legped="${i}" style="width:74px; text-align:right" title="Pedágio total pago neste trecho"></td>
    </tr>`;
  }).join('');
  const kmPonderado = viaKmPonderado(trechos);
  const combTotal = consumo ? (kmPonderado / consumo * preco) : 0;
  const pedagioTotal = viaPedagioPonderado(trechos);
  const reorderHtml = intermediarios.map((d, i) => {
    const nome = esc(d.endereco || `${d.municipio}/${d.uf}`);
    return `
    <div class="via-route-stop">
      <span class="via-route-num">${i + 1}</span>
      <span class="via-route-name" title="${nome}">${nome}</span>
      <span class="via-route-actions">
        <button type="button" data-mvup="${i}" ${i === 0 ? 'disabled' : ''} title="Mover para cima" aria-label="Mover para cima">↑</button>
        <button type="button" data-mvdown="${i}" ${i === intermediarios.length - 1 ? 'disabled' : ''} title="Mover para baixo" aria-label="Mover para baixo">↓</button>
        <button type="button" class="rm" data-mvdel="${i}" title="Remover da rota" aria-label="Remover da rota">×</button>
      </span>
    </div>`;
  }).join('');
  return `
    <div class="table-wrap" style="margin-top:10px"><table class="via-trechos-tbl">
    <thead><tr><th>Trecho</th><th class="num">Distância</th><th class="num">Km no destino</th><th class="num">Combustível</th><th class="num">Pedágio (R$)</th></tr></thead>
    <tbody>${legsHtml}</tbody>
    <tfoot><tr style="font-weight:700; background:var(--verde-050,#EAF5EC)">
      <td>Total</td>
      <td class="num" id="${idPrefix}-totalkm">${kmPonderado.toFixed(1)} km</td>
      <td></td>
      <td class="num" id="${idPrefix}-totalcomb">${brl(combTotal)}</td>
      <td class="num" id="${idPrefix}-totalped">${brl(pedagioTotal)}</td>
    </tr></tfoot></table></div>
    <p class="hint" style="margin-top:8px">A coluna <strong>"Km no destino"</strong> é para a quilometragem que você roda por conta própria enquanto está naquele destino — hotel, almoço, deslocamentos até o local da visita. A rota calculada só conhece a ida até cada parada e a volta ao ponto de partida, então esses km precisam ser informados aqui: eles entram na quilometragem total e no combustível. No pedágio, informe o <strong>total pago no trecho</strong>.</p>
    <p style="margin-top:12px; font-size:13px; margin-bottom:2px"><strong>Ordem do roteiro</strong></p>
    <p class="hint" style="margin-top:0">Use as setas para mudar a sequência ou o × para remover uma parada — a rota é recalculada na hora.</p>
    <div class="via-route-list">${reorderHtml}</div>`;
}

// Executa o cálculo (valida consumo/preço, chama o OSRM, desenha o mapa,
// renderiza resultado + reordenação + repetições) e devolve o km ponderado
// via callback pra quem chamou preencher seus próprios campos (Carro Próprio,
// ou um aluguel específico). "pontoFixo" é a cidade de partida/chegada (a
// cidade-base do colaborador, no trajeto da viagem inteira, ou a cidade de
// retirada do carro, num trajeto local no destino) e "intermediarios" é o
// array de paradas visitadas nesse trajeto (mutável — reordenar/remover aqui
// dispara um novo cálculo). Ajustar uma repetição só recalcula localmente
// (sem chamar o OSRM de novo); reordenar/remover uma parada recalcula a rota
// inteira, preservando as repetições dos trechos que continuarem existindo.
async function viaExecutarCalculoRota(pontoFixo, intermediarios, colab, preco, statusElId, idPrefix, trechosAntigos, onSucesso, onReorder) {
  const statusEl = document.getElementById(statusElId);
  if (!statusEl) return;
  if (!colab.veiculo_consumo_kml) { statusEl.innerHTML = '<div class="alert-item late">⚠️ Cadastre o consumo (km/L) do veículo antes de calcular.</div>'; return; }
  if (!preco) { statusEl.innerHTML = '<div class="alert-item late">⚠️ Preço do combustível ainda não configurado — peça ao administrador para definir em Viáticos → Configurações.</div>'; return; }
  statusEl.innerHTML = '<div class="alert-item warn">Calculando rota (pode levar alguns segundos se houver endereços pra geocodificar)…</div>';
  try {
    const { total_km, legs, pontos, geometry } = await viaCalcularRota(pontoFixo, intermediarios);
    const trechos = viaMesclarAjustesTrechos(legs, trechosAntigos);
    const kmPonderado = viaKmPonderado(trechos);
    // meta leva pontos/geometry para o chamador persistir e reaproveitar no
    // resumo (mapa da etapa 5) e no PDF. Ajuste de repetição não passa meta.
    onSucesso(kmPonderado, trechos, { pontos, geometry, total_km });
    viaAtualizarMapa(pontos, geometry);
    statusEl.innerHTML = `<div class="alert-item ok">✅ Rota calculada: ${total_km.toFixed(1)} km — ida até cada parada e volta ao ponto de partida. Informe abaixo os km rodados dentro de cada destino e o pedágio de cada trecho.</div>`
      + viaRenderRotaDetalhe(intermediarios, trechos, colab.veiculo_consumo_kml, preco, idPrefix);
    const recalcular = () => { onReorder(); viaExecutarCalculoRota(pontoFixo, intermediarios, colab, preco, statusElId, idPrefix, trechos, onSucesso, onReorder); };
    // Redesenha os subtotais da linha e do rodapé (km, combustível e pedágio)
    // sem chamar o OSRM de novo — vale tanto para repetições quanto pedágio.
    const atualizarLinha = i => {
      const consumo = colab.veiculo_consumo_kml;
      const kmLinha = viaKmTrecho(trechos[i]);
      const comb = consumo ? (kmLinha / consumo * preco) : 0;
      const cellComb = document.getElementById(`${idPrefix}-legcomb-${i}`); if (cellComb) cellComb.textContent = comb > 0 ? brl(comb) : '—';
      // O "total" abaixo da distância só aparece quando há km informado no destino.
      const cellKmTot = document.getElementById(`${idPrefix}-legkmtot-${i}`);
      if (cellKmTot) cellKmTot.innerHTML = viaNum(trechos[i].km_extra) > 0 ? `total ${kmLinha.toFixed(1)} km` : '';
      const novoKm = viaKmPonderado(trechos);
      const combTotal = consumo ? (novoKm / consumo * preco) : 0;
      const cellTotalKm = document.getElementById(`${idPrefix}-totalkm`); if (cellTotalKm) cellTotalKm.textContent = `${novoKm.toFixed(1)} km`;
      const cellTotalComb = document.getElementById(`${idPrefix}-totalcomb`); if (cellTotalComb) cellTotalComb.textContent = brl(combTotal);
      const cellTotalPed = document.getElementById(`${idPrefix}-totalped`); if (cellTotalPed) cellTotalPed.textContent = brl(viaPedagioPonderado(trechos));
      onSucesso(novoKm, trechos);
    };
    statusEl.querySelectorAll('[data-legkm]').forEach(inp => {
      inp.oninput = () => {
        const i = Number(inp.dataset.legkm);
        trechos[i].km_extra = inp.value;
        atualizarLinha(i);
      };
    });
    statusEl.querySelectorAll('[data-legped]').forEach(inp => {
      inp.oninput = () => {
        const i = Number(inp.dataset.legped);
        trechos[i].pedagio = inp.value;
        atualizarLinha(i);
      };
    });
    statusEl.querySelectorAll('[data-mvup]').forEach(b => b.onclick = () => { const i = Number(b.dataset.mvup); [intermediarios[i - 1], intermediarios[i]] = [intermediarios[i], intermediarios[i - 1]]; recalcular(); });
    statusEl.querySelectorAll('[data-mvdown]').forEach(b => b.onclick = () => { const i = Number(b.dataset.mvdown); [intermediarios[i], intermediarios[i + 1]] = [intermediarios[i + 1], intermediarios[i]]; recalcular(); });
    statusEl.querySelectorAll('[data-mvdel]').forEach(b => b.onclick = () => { intermediarios.splice(Number(b.dataset.mvdel), 1); recalcular(); });
  } catch (e) {
    statusEl.innerHTML = `<div class="alert-item late">⚠️ ${esc(e.message)} — marque "preencher manualmente" abaixo se preferir.</div>`;
  }
}

// ---- Obrigatoriedade das etapas do assistente ----
// Devolvem null quando está tudo preenchido, ou { msg, foco } apontando o campo
// que falta. Ficam fora das funções de render para poderem ser testadas e para
// a mesma regra valer na etapa e no envio final.
const viaNumOk = v => { const n = viaNum(v); return isFinite(n) && n > 0; };

function viaWizValidarEtapa2(v) {
  if (!String(v.ordem_trabalho || '').trim()) return { msg: 'Informe o nº da Ordem de Trabalho.', foco: 'w2-ot' };
  if (!v.destinos || !v.destinos.length) return { msg: 'Adicione ao menos um destino (cidade da Ordem de Trabalho).', foco: 'w2-mun' };
  if (!v.data_inicio || !v.data_fim) return { msg: 'Preencha as datas de saída e de retorno.', foco: !v.data_inicio ? 'w2-inicio' : 'w2-fim' };
  if (v.data_fim < v.data_inicio) return { msg: 'Data de retorno não pode ser antes da saída.', foco: 'w2-fim' };
  if (!v.motivo) return { msg: 'Selecione o motivo da viagem.', foco: 'w2-motivo' };
  if (!MOTIVO_OPTIONS.includes(v.motivo)) return { msg: 'Motivo inválido.', foco: 'w2-motivo' };
  if (!String(v.objetivo || '').trim()) return { msg: 'Descreva o objetivo da viagem.', foco: 'w2-objetivo' };
  return null;
}

// Etapa 3: além das travas de combinação, cada transporte marcado precisa ter os
// dados que formam o custo dele — antes era possível marcar "Avião" e avançar
// sem nenhum trecho, e a previsão saía zerada.
function viaWizValidarEtapa3(t, colab) {
  const marcados = ['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].filter(k => t[k]);
  if (!marcados.length) return { msg: 'Selecione ao menos um meio de transporte.' };

  // Última barreira antes de avançar: a trava visual pode ter sido contornada
  // (cadastro alterado com a tela aberta, ou o estado vindo de outra sessão).
  if (colab) {
    const av = viaAvaliarDocumentacao(colab);
    if (t.carro_proprio && !av.podeCarroProprio) return { msg: `Carro próprio não liberado: ${av.bloqueiosProprio.join('; ')}.` };
    if (t.aluguel_carro && !av.podeAlugar) return { msg: `Aluguel de carro não liberado: ${av.bloqueiosCNH.join('; ')}.` };
  }

  if (t.aviao) {
    if (!t.aviao_trechos.length) return { msg: 'Adicione ao menos um trecho de avião.' };
    const i = t.aviao_trechos.findIndex(x => !String(x.origem || '').trim() || !String(x.destino || '').trim() || !x.data || !viaNumOk(x.valor));
    if (i >= 0) return { msg: `Trecho de avião ${i + 1}: preencha origem, destino, data e valor.` };
  }
  if (t.onibus) {
    if (!t.onibus_trechos.length) return { msg: 'Adicione ao menos um trecho de ônibus.' };
    const i = t.onibus_trechos.findIndex(x => !String(x.origem || '').trim() || !String(x.destino || '').trim() || !x.data || !viaNumOk(x.valor));
    if (i >= 0) return { msg: `Trecho de ônibus ${i + 1}: preencha origem, destino, data e valor.` };
  }
  if (t.aluguel_carro) {
    if (!t.alugueis.length) return { msg: 'Adicione ao menos um aluguel de carro.' };
    for (let i = 0; i < t.alugueis.length; i++) {
      const a = t.alugueis[i], n = i + 1;
      if (!String(a.locadora || '').trim()) return { msg: `Aluguel ${n}: informe a locadora.` };
      if (!viaNumOk(a.valor_diaria)) return { msg: `Aluguel ${n}: informe o valor da diária.` };
      if (!viaNumOk(a.dias)) return { msg: `Aluguel ${n}: informe a quantidade de diárias.` };
      if (!String(a.retirada_local || '').trim()) return { msg: `Aluguel ${n}: escolha o estado e o município de retirada.` };
      if (!a.retirada_data) return { msg: `Aluguel ${n}: informe a data de retirada.` };
      if (!String(a.devolucao_local || '').trim()) return { msg: `Aluguel ${n}: escolha o estado e o município de devolução.` };
      if (!a.devolucao_data) return { msg: `Aluguel ${n}: informe a data de devolução.` };
      if (!viaNumOk(a.distancia_km)) return { msg: `Aluguel ${n}: calcule a rota (ou informe a distância) para apurar o combustível.` };
      if (!viaNumOk(a.combustivel_valor)) return { msg: `Aluguel ${n}: informe o valor de combustível.` };
    }
  }
  if (t.carro_proprio) {
    const r = t.carro_proprio_rota || {};
    if (!viaNumOk(r.distancia_km)) return { msg: 'Carro próprio: calcule a rota (ou informe a distância percorrida).' };
    if (!viaNumOk(r.combustivel_valor)) return { msg: 'Carro próprio: informe o valor de combustível.' };
  }
  if (t.taxi_uber) {
    if (!t.taxi_uber_corridas.length) return { msg: 'Adicione ao menos uma corrida de táxi/Uber.' };
    const i = t.taxi_uber_corridas.findIndex(x => !String(x.origem || '').trim() || !String(x.destino || '').trim() || !viaNumOk(x.valor));
    if (i >= 0) return { msg: `Corrida ${i + 1} de táxi/Uber: preencha origem, destino e valor.` };
  }
  return null;
}

// Avisa e leva o foco ao campo que falta — só o toast obrigava a pessoa a
// caçar o campo na tela.
function viaWizAvisar(erro) {
  toast(erro.msg);
  if (erro.foco) {
    const el = document.getElementById(erro.foco);
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}

function viaWizStep1() {
  const w = VIA_WIZ, c = $('#content');
  c.innerHTML = `
    <div class="via-wiz-container">
      ${viaWizProgress(1)}
      <div class="card">
        <h3 style="margin-bottom:14px">Seus dados</h3>
        <div class="field-row">
          <div class="field"><label>Nome</label><input value="${esc(w.colab.name)}" disabled></div>
          <div class="field"><label>Cargo</label><input value="${esc(w.colab.cargo || '—')}" disabled></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Tier (TUD)</label><input value="${TIER_LABEL[w.colab.tier]}" disabled></div>
          <div class="field"><label>Cidade-base</label><input value="${w.colab.cidade_base_municipio ? esc(w.colab.cidade_base_municipio) + '/' + esc(w.colab.cidade_base_uf) : 'Não cadastrada'}" disabled></div>
        </div>
        <p class="hint" style="margin-top:8px">Esses dados vêm do seu cadastro. Para corrigir algo, fale com o administrador.</p>
      </div>
      <div class="wiz-actions"><span></span><button class="btn primary" id="wiz-next">Avançar</button></div>
    </div>`;
  $('#wiz-next').onclick = () => viaWizStep2();
}

function viaWizStep2() {
  const w = VIA_WIZ, c = $('#content');
  c.innerHTML = `
    <div class="via-wiz-container">
      ${viaWizProgress(2)}
      <div class="card">
        <h3 style="margin-bottom:14px">Dados da viagem</h3>
        ${fld('w2-ot', 'Nº da Ordem de Trabalho', 'text', w.ordem_trabalho)}
        <div class="field"><label>Destinos (cidades da Ordem de Trabalho)</label>
          <div class="field-row" style="align-items:flex-end; margin-bottom:8px">
            ${fldSel('w2-uf', 'Estado', BR_LOCALIDADES.estados.map(e => ({ v: e.uf, t: e.nome })), BR_LOCALIDADES.estados[0].uf)}
            ${fldSel('w2-mun', 'Município', [], null)}
            <button class="btn primary" id="w2-add-dest" type="button">+ Adicionar</button>
          </div>
          <div id="w2-destinos-list"></div>
        </div>
        <label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="w2-internacional" ${w.internacional ? 'checked' : ''}> ✈️ Esta viagem inclui trecho internacional</label>
        <div class="field">
          <label>Categoria de local (calculada automaticamente)</label>
          <div class="via-cat-badge" id="w2-cat-badge"></div>
        </div>
        <div class="field-row">
          ${fld('w2-inicio', 'Data de saída', 'date', w.data_inicio)}
          ${fld('w2-fim', 'Data de retorno', 'date', w.data_fim)}
        </div>
        ${fldSel('w2-motivo', 'Motivo', [{ v: '', t: '— selecione —' }, ...MOTIVO_OPTIONS.map(m => ({ v: m, t: m }))], w.motivo)}
        <div class="field"><label>Objetivo da viagem</label><textarea id="w2-objetivo" rows="3" placeholder="Descreva o que será feito na viagem.">${esc(w.objetivo)}</textarea></div>
      </div>
      <div class="wiz-actions"><button class="btn" id="wiz-back">Voltar</button><button class="btn primary" id="wiz-next">Avançar</button></div>
    </div>`;

  const popularMunicipios = () => {
    const uf = $('#w2-uf').value;
    $('#w2-mun').innerHTML = (BR_LOCALIDADES.municipios[uf] || []).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  };
  // A categoria de local não é mais escolhida manualmente: ela é recalculada
  // sempre que um destino é adicionado/removido ou o flag de viagem
  // internacional muda, pegando sempre o teto mais alto entre os destinos —
  // isso elimina o risco de o usuário selecionar a categoria errada.
  const renderCategoria = () => {
    const cat = viaCalcularCategoriaLocal(w.destinos, w.internacional);
    w.categoria_local = cat;
    $('#w2-cat-badge').innerHTML = `<span class="tag ${cat}">${LOCAL_LABEL[cat]}</span>
      <span class="txt">${w.destinos.length ? 'Definida pelo destino de maior teto entre os selecionados acima' : 'Nenhum destino selecionado ainda — assumindo Interior'}${w.internacional ? ' + viagem internacional marcada.' : '.'}</span>`;
  };
  const renderDestinos = () => {
    const box = $('#w2-destinos-list');
    box.innerHTML = w.destinos.length
      ? `<div class="chip-row">${w.destinos.map((d, i) => `<span class="chip">${esc(d.municipio)}/${esc(d.uf)} <button type="button" data-rm="${i}">×</button></span>`).join('')}</div>`
      : '<span style="color:var(--muted); font-size:13px">Nenhuma cidade adicionada ainda.</span>';
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { w.destinos.splice(Number(b.dataset.rm), 1); renderDestinos(); renderCategoria(); });
    renderCategoria();
  };
  $('#w2-uf').onchange = popularMunicipios; popularMunicipios(); renderDestinos();
  $('#w2-add-dest').onclick = () => {
    const uf = $('#w2-uf').value, municipio = $('#w2-mun').value;
    if (!municipio) return toast('Selecione um município.');
    if (w.destinos.some(d => d.uf === uf && d.municipio === municipio)) return toast('Essa cidade já foi adicionada.');
    w.destinos.push({ uf, municipio }); renderDestinos();
  };
  $('#w2-internacional').onchange = e => { w.internacional = e.target.checked; renderCategoria(); };
  $('#wiz-back').onclick = () => viaWizStep1();
  $('#wiz-next').onclick = () => {
    // Todos os campos desta etapa são obrigatórios: uma solicitação sem OT,
    // motivo ou objetivo chegava na aprovação sem contexto nenhum.
    const erro = viaWizValidarEtapa2({
      ordem_trabalho: $('#w2-ot').value, destinos: w.destinos,
      data_inicio: $('#w2-inicio').value, data_fim: $('#w2-fim').value,
      motivo: $('#w2-motivo').value, objetivo: $('#w2-objetivo').value
    });
    if (erro) return viaWizAvisar(erro);
    w.ordem_trabalho = $('#w2-ot').value.trim(); w.categoria_local = viaCalcularCategoriaLocal(w.destinos, w.internacional);
    w.data_inicio = $('#w2-inicio').value; w.data_fim = $('#w2-fim').value;
    w.motivo = $('#w2-motivo').value; w.objetivo = $('#w2-objetivo').value.trim();
    viaWizStep3();
  };
}

// Combinações permitidas entre modos de transporte (trava de fluxo):
// Carro Próprio é exclusivo; Avião e Ônibus não se combinam entre si;
// Aluguel de Carro e Táxi/Uber combinam com tudo, exceto Carro Próprio.
const VIA_TRANSPORTE_COMPAT = {
  aviao:         ['aluguel_carro', 'taxi_uber'],
  onibus:        ['aluguel_carro', 'taxi_uber'],
  aluguel_carro: ['aviao', 'onibus', 'taxi_uber'],
  carro_proprio: [],
  taxi_uber:     ['aviao', 'onibus', 'aluguel_carro']
};
const VIA_TRANSPORTE_LABEL = { aviao: 'Avião', onibus: 'Ônibus', aluguel_carro: 'Aluguel de Carro', carro_proprio: 'Carro Próprio', taxi_uber: 'Táxi / Uber' };
const VIA_TRANSPORTE_IDS = { aviao: 'w3-aviao', onibus: 'w3-onibus', aluguel_carro: 'w3-aluguel', carro_proprio: 'w3-proprio', taxi_uber: 'w3-taxiuber' };

// Bloqueia os cartões incompatíveis com o que já está marcado. Cartões
// marcados nunca são bloqueados (o usuário sempre pode desmarcar).
// Painel de situação da documentação. Serve o assistente (explicando por que um
// cartão está bloqueado) e a tela de Viáticos (avisando com antecedência). Só
// aparece quando há algo a dizer — cadastro completo e longe do vencimento não
// polui a tela.
function viaPainelDocumentacao(av, opts = {}) {
  const noWizard = opts.contexto === 'wizard';
  const blocos = [];

  if (!av.podeAlugar) {
    blocos.push(`<div class="alert-item late"><strong>🚫 Você não está habilitado a dirigir a serviço.</strong>
      Nem carro próprio, nem aluguel de carro. Motivo: ${esc(av.bloqueiosCNH.join('; '))}.
      ${noWizard ? 'Use avião, ônibus ou táxi/Uber nesta viagem, ou' : ''} Procure o administrador para regularizar a CNH em Viáticos → Configurações → Colaboradores.</div>`);
  } else if (!av.podeCarroProprio) {
    blocos.push(`<div class="alert-item warn"><strong>⚠️ Veículo próprio indisponível.</strong>
      Sua CNH está em dia, então o <strong>aluguel de carro está liberado</strong>, mas o veículo próprio não:
      ${esc(av.bloqueiosProprio.filter(b => !av.bloqueiosCNH.includes(b)).join('; '))}.</div>`);
  }

  if (av.vencendo.length) {
    blocos.push(`<div class="alert-item warn"><strong>📅 Documento vencendo</strong> (aviso com 2 meses de antecedência):
      <ul style="margin:6px 0 0 18px">${av.vencendo.map(v =>
        `<li><strong>${esc(v.nome)}</strong> vence em ${brDate(v.data)} — ${v.dias === 0 ? 'hoje' : v.dias === 1 ? 'amanhã' : `faltam ${v.dias} dias`}.</li>`).join('')}</ul>
      Depois do vencimento a modalidade correspondente é bloqueada automaticamente.</div>`);
  }

  if (av.avisos.length && (av.podeAlugar || noWizard)) {
    blocos.push(`<div class="alert-item">ℹ️ Pendências no cadastro (não bloqueiam a solicitação): ${esc(av.avisos.join('; '))}.</div>`);
  }

  if (!blocos.length) return '';
  return `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px">${blocos.join('')}</div>`;
}

// Resumo da documentação da equipe, para quem administra Viáticos: quem está
// impedido de dirigir, quem só pode alugar e o que vence nos próximos 2 meses.
// É o administrador que regulariza os cadastros, então precisa ver isso antes de
// a viagem ser barrada no assistente.
function viaResumoEquipeDoc(colaboradores) {
  const semDirigir = [], soAluguel = [], vencendo = [];
  colaboradores.forEach(c => {
    const av = viaAvaliarDocumentacao(c);
    if (!av.podeAlugar) semDirigir.push({ c, motivos: av.bloqueiosCNH });
    else if (!av.podeCarroProprio) soAluguel.push({ c, motivos: av.bloqueiosProprio.filter(b => !av.bloqueiosCNH.includes(b)) });
    av.vencendo.forEach(v => vencendo.push({ nome: c.name, doc: v.nome, data: v.data, dias: v.dias }));
  });
  vencendo.sort((a, b) => a.dias - b.dias);
  return { semDirigir, soAluguel, vencendo, temAlgo: !!(semDirigir.length || soAluguel.length || vencendo.length) };
}

function viaDetalheEquipeDoc(r) {
  const lista = arr => arr.map(x => `<li><strong>${esc(x.c.name)}</strong>${x.c.cargo ? ` (${esc(x.c.cargo)})` : ''} — ${esc(x.motivos.join('; '))}</li>`).join('');
  const blocos = [];
  if (r.semDirigir.length) {
    blocos.push(`<div class="alert-item late"><strong>🚫 Sem habilitação para dirigir a serviço</strong>
      — não podem usar carro próprio nem alugar:<ul style="margin:6px 0 0 18px">${lista(r.semDirigir)}</ul></div>`);
  }
  if (r.soAluguel.length) {
    blocos.push(`<div class="alert-item warn"><strong>⚠️ Só podem alugar carro</strong>
      — CNH em dia, mas o veículo próprio está impedido:<ul style="margin:6px 0 0 18px">${lista(r.soAluguel)}</ul></div>`);
  }
  if (r.vencendo.length) {
    blocos.push(`<div class="alert-item warn"><strong>📅 Vencendo nos próximos 2 meses</strong>
      <ul style="margin:6px 0 0 18px">${r.vencendo.map(v =>
        `<li><strong>${esc(v.nome)}</strong> — ${esc(v.doc)} em ${brDate(v.data)} (${v.dias <= 0 ? 'hoje' : `${v.dias} dia(s)`})</li>`).join('')}</ul></div>`);
  }
  return blocos.join('');
}

// Barra compacta de documentação: uma linha com contadores, que expande no
// clique. Os avisos completos ocupavam o topo inteiro da tela de Viáticos — o
// administrador precisa saber que existe pendência, não ler a lista toda a cada
// visita. O detalhamento em destaque continua onde decide algo: na etapa de
// transporte do assistente.
function viaBarraDocumentacao(meuCadastro, colaboradores) {
  const avProprio = meuCadastro ? viaAvaliarDocumentacao(meuCadastro) : null;
  const eq = (Array.isArray(colaboradores) && colaboradores.length) ? viaResumoEquipeDoc(colaboradores) : null;

  const chips = [];
  if (avProprio && !avProprio.podeAlugar) chips.push('<span class="badge late">Você não está habilitado a dirigir</span>');
  else if (avProprio && !avProprio.podeCarroProprio) chips.push('<span class="badge warn">Seu veículo próprio está indisponível</span>');
  if (eq && eq.semDirigir.length) chips.push(`<span class="badge late">${eq.semDirigir.length} não habilitado(s)</span>`);
  if (eq && eq.soAluguel.length) chips.push(`<span class="badge warn">${eq.soAluguel.length} só aluguel</span>`);
  if (eq && eq.vencendo.length) chips.push(`<span class="badge warn">${eq.vencendo.length} vencendo</span>`);
  if (!chips.length) return '';

  const detalhe = (avProprio ? viaPainelDocumentacao(avProprio, { contexto: 'viaticos' }) : '')
    + (eq && eq.temAlgo ? `<div style="display:flex; flex-direction:column; gap:8px">${viaDetalheEquipeDoc(eq)}</div>` : '');

  return `<div class="via-doc-bar" id="via-doc-bar">
      <button type="button" class="via-doc-toggle" id="via-doc-toggle" aria-expanded="false" aria-controls="via-doc-detalhe">
        <span class="via-doc-ico">🪪</span>
        <span class="via-doc-titulo">Documentação</span>
        <span class="via-doc-chips">${chips.join('')}</span>
        <span class="via-doc-chevron">▾</span>
      </button>
      <div class="via-doc-detalhe" id="via-doc-detalhe" hidden>
        ${detalhe}
        <p class="hint" style="margin:8px 0 0">Ajuste em Configurações → Colaboradores → Editar.</p>
      </div>
    </div>`;
}

// Modalidades barradas pela documentação do colaborador. Diferente da trava de
// combinação, esta vale mesmo com o cartão já marcado — documentação vencida não
// é escolha do usuário.
function viaTravasDocumentacao() {
  const av = viaAvaliarDocumentacao(VIA_WIZ.colab);
  const travas = {};
  if (!av.podeCarroProprio) travas.carro_proprio = av.bloqueiosProprio;
  if (!av.podeAlugar) travas.aluguel_carro = av.bloqueiosCNH;
  return travas;
}

// Desmarca o que a documentação não permite. Chamado ao entrar na etapa 3, antes
// de desenhar: se o cadastro mudou (ou a CNH venceu) entre uma solicitação e
// outra, a seleção antiga não pode sobreviver escondida no estado.
function viaGarantirTransportePermitido() {
  const travas = viaTravasDocumentacao();
  Object.keys(travas).forEach(k => { if (VIA_WIZ.transporte[k]) VIA_WIZ.transporte[k] = false; });
  return travas;
}

function viaAplicarTravasTransporte() {
  const w = VIA_WIZ;
  const travasDoc = viaTravasDocumentacao();
  const marcados = Object.keys(VIA_TRANSPORTE_IDS).filter(k => w.transporte[k]);
  Object.keys(VIA_TRANSPORTE_IDS).forEach(k => {
    const input = document.getElementById(VIA_TRANSPORTE_IDS[k]);
    if (!input) return;
    const tile = input.closest('.via-transport-tile');
    const bloqueadores = marcados.filter(m => m !== k && !VIA_TRANSPORTE_COMPAT[m].includes(k));
    const porDoc = travasDoc[k];
    const bloqueado = !!porDoc || (!w.transporte[k] && bloqueadores.length > 0);
    input.disabled = bloqueado;
    if (tile) {
      tile.classList.toggle('disabled', bloqueado);
      tile.title = porDoc
        ? `Indisponível — ${porDoc.join('; ')}.`
        : (bloqueado ? `Não pode ser combinado com ${bloqueadores.map(b => VIA_TRANSPORTE_LABEL[b]).join(' + ')}.` : '');
    }
  });
}

// Pares marcados que violam a regra (protege contra rascunhos antigos
// gravados antes da trava existir).
function viaTransporteConflitos() {
  const marcados = Object.keys(VIA_TRANSPORTE_COMPAT).filter(k => VIA_WIZ.transporte[k]);
  const conflitos = [];
  for (let i = 0; i < marcados.length; i++)
    for (let j = i + 1; j < marcados.length; j++)
      if (!VIA_TRANSPORTE_COMPAT[marcados[i]].includes(marcados[j]))
        conflitos.push(`${VIA_TRANSPORTE_LABEL[marcados[i]]} + ${VIA_TRANSPORTE_LABEL[marcados[j]]}`);
  return conflitos;
}

function viaWizStep3() {
  const w = VIA_WIZ, c = $('#content');
  VIA_MAP = null; // a div #via-map é recriada do zero a cada entrada nesta etapa
  // Documentação decide antes de desenhar: o que não é permitido já entra
  // desmarcado, e o motivo aparece em destaque em vez de só no tooltip.
  const travasDoc = viaGarantirTransportePermitido();
  const av = viaAvaliarDocumentacao(w.colab);
  const avisoDoc = viaPainelDocumentacao(av, { contexto: 'wizard' });
  c.innerHTML = `
    <div class="via-wiz-container-wide">
      ${viaWizProgress(3)}
      <div class="via-wiz-2col">
        <div class="card">
          <h3 style="margin-bottom:6px">Transporte</h3>
          <p class="hint" style="margin-bottom:14px">Marque o que se aplica a esta viagem — dá pra combinar (ex.: avião pra chegar + carro alugado no destino). Combinações não permitidas ficam bloqueadas: Carro Próprio não combina com nada, e Avião e Ônibus não combinam entre si.</p>
          ${avisoDoc}
          <div class="via-transport-grid">
            <label class="via-transport-tile"><input type="checkbox" id="w3-aviao" ${w.transporte.aviao ? 'checked' : ''}><span class="vt-icon">✈️</span><span class="vt-name">Avião</span></label>
            <label class="via-transport-tile"><input type="checkbox" id="w3-onibus" ${w.transporte.onibus ? 'checked' : ''}><span class="vt-icon">🚌</span><span class="vt-name">Ônibus</span></label>
            <label class="via-transport-tile"><input type="checkbox" id="w3-aluguel" ${w.transporte.aluguel_carro ? 'checked' : ''}><span class="vt-icon">🚗</span><span class="vt-name">Aluguel de Carro</span></label>
            <label class="via-transport-tile"><input type="checkbox" id="w3-proprio" ${w.transporte.carro_proprio ? 'checked' : ''}><span class="vt-icon">🚙</span><span class="vt-name">Carro Próprio</span></label>
            <label class="via-transport-tile"><input type="checkbox" id="w3-taxiuber" ${w.transporte.taxi_uber ? 'checked' : ''}><span class="vt-icon">🚕</span><span class="vt-name">Táxi / Uber</span></label>
          </div>
          <div id="w3-aviao-block"></div>
          <div id="w3-onibus-block"></div>
          <div id="w3-aluguel-block"></div>
          <div id="w3-proprio-block"></div>
          <div id="w3-taxiuber-block"></div>
        </div>
        <div class="card via-map-card">
          <h3 style="margin-bottom:10px">Mapa da rota</h3>
          <div id="via-map" style="display:none"></div>
          <p class="hint" id="via-map-placeholder">O mapa aparece aqui depois de calcular uma rota (Carro Próprio ou Aluguel de Carro).</p>
        </div>
      </div>
      <div class="wiz-actions"><button class="btn" id="wiz-back">Voltar</button><button class="btn primary" id="wiz-next">Avançar</button></div>
    </div>`;

  viaRenderAviaoBlock(); viaRenderOnibusBlock(); viaRenderAluguelBlock(); viaRenderProprioBlock(); viaRenderTaxiUberBlock();
  viaAplicarTravasTransporte();

  $('#w3-aviao').onchange = e => { w.transporte.aviao = e.target.checked; viaRenderAviaoBlock(); viaAplicarTravasTransporte(); viaAtualizarVisibilidadeUsoLocal(); };
  $('#w3-onibus').onchange = e => { w.transporte.onibus = e.target.checked; viaRenderOnibusBlock(); viaAplicarTravasTransporte(); };
  $('#w3-aluguel').onchange = e => { w.transporte.aluguel_carro = e.target.checked; viaRenderAluguelBlock(); viaAplicarTravasTransporte(); };
  $('#w3-proprio').onchange = e => { w.transporte.carro_proprio = e.target.checked; viaRenderProprioBlock(); viaAplicarTravasTransporte(); };
  $('#w3-taxiuber').onchange = e => { w.transporte.taxi_uber = e.target.checked; viaRenderTaxiUberBlock(); viaAplicarTravasTransporte(); };
  $('#wiz-back').onclick = () => viaWizStep2();
  $('#wiz-next').onclick = () => {
    const conflitos = viaTransporteConflitos();
    if (conflitos.length) { toast(`Combinação de transportes não permitida: ${conflitos.join('; ')}. Ajuste antes de avançar.`); return; }
    const erro = viaWizValidarEtapa3(w.transporte, w.colab);
    if (erro) return viaWizAvisar(erro);
    viaWizStep4();
  };
}

function viaRenderTaxiUberBlock() {
  const w = VIA_WIZ, box = $('#w3-taxiuber-block');
  box.style.display = w.transporte.taxi_uber ? '' : 'none';
  if (!w.transporte.taxi_uber) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="via-subcard"><h4>🚕 Táxi / Uber</h4>
    <div id="w3-taxi-list"></div>
    <button class="btn" id="w3-add-taxi" type="button">+ Adicionar corrida</button>
  </div>`;
  const renderLista = () => {
    const listaEl = $('#w3-taxi-list');
    listaEl.innerHTML = w.transporte.taxi_uber_corridas.map((t, i) => `
      <div class="via-item-row">
        <div class="field-row">${fld(`tx-origem-${i}`, 'De', 'text', t.origem || '')}${fld(`tx-destino-${i}`, 'Para', 'text', t.destino || '')}${fld(`tx-valor-${i}`, 'Valor (R$)', 'number', t.valor || '', 'step="0.01" min="0"')}</div>
        <button class="btn sm danger-ghost" data-rmtaxi="${i}" type="button">Remover</button>
      </div>`).join('') || '<p class="hint">Nenhuma corrida adicionada ainda.</p>';
    w.transporte.taxi_uber_corridas.forEach((t, i) => ['origem', 'destino', 'valor'].forEach(f => {
      const elx = document.getElementById(`tx-${f}-${i}`); if (elx) elx.oninput = () => t[f] = elx.value;
    }));
    listaEl.querySelectorAll('[data-rmtaxi]').forEach(b => b.onclick = () => { w.transporte.taxi_uber_corridas.splice(Number(b.dataset.rmtaxi), 1); renderLista(); });
  };
  renderLista();
  $('#w3-add-taxi').onclick = () => { w.transporte.taxi_uber_corridas.push({ origem: '', destino: '', valor: '' }); renderLista(); };
}

function viaRenderAviaoBlock() {
  const w = VIA_WIZ, box = $('#w3-aviao-block');
  box.style.display = w.transporte.aviao ? '' : 'none';
  if (!w.transporte.aviao) { box.innerHTML = ''; return; }
  const CLASSES_VOO = ['Econômica', 'Econômica Premium', 'Executiva', 'Primeira Classe'];
  const datalistCias = `<datalist id="via-cia-list">${BR_AVIACAO.companhias.map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>`;
  const datalistAero = `<datalist id="via-aero-list">${BR_AVIACAO.aeroportos.map(a => `<option value="${a.iata}">${esc(a.nome)} — ${esc(a.cidade)} (${esc(a.pais)})</option>`).join('')}</datalist>`;
  box.innerHTML = `<div class="via-subcard"><h4>✈️ Voos</h4>
    ${datalistCias}${datalistAero}
    ${w.transporte.aviao_trechos.map((t, i) => `
      <div class="via-item-row">
        <div class="field-row">
          ${fld(`av-cia-${i}`, 'Companhia', 'text', t.cia || '', 'list="via-cia-list" placeholder="Digite para buscar…"')}
          ${fld(`av-voo-${i}`, 'Nº do Voo', 'text', t.numero_voo || '')}
          ${fldSel(`av-classe-${i}`, 'Classe', CLASSES_VOO.map(c => ({ v: c, t: c })), t.classe || 'Econômica')}
        </div>
        <div class="field-row">
          ${fld(`av-origem-${i}`, 'Origem', 'text', t.origem || '', 'list="via-aero-list" placeholder="Código ou cidade…"')}
          ${fld(`av-destino-${i}`, 'Destino', 'text', t.destino || '', 'list="via-aero-list" placeholder="Código ou cidade…"')}
          ${fld(`av-data-${i}`, 'Data', 'date', t.data || w.data_inicio)}
        </div>
        <div class="field-row">${fld(`av-saida-${i}`, 'Horário de saída', 'time', t.saida || '')}${fld(`av-chegada-${i}`, 'Horário de chegada', 'time', t.chegada || '')}${fld(`av-valor-${i}`, 'Valor (R$)', 'number', t.valor || '', 'step="0.01" min="0"')}</div>
        <button class="btn sm danger-ghost" data-rmaviao="${i}" type="button">Remover trecho</button>
      </div>`).join('') || '<p class="hint">Nenhum trecho adicionado ainda.</p>'}
    <button class="btn" id="w3-add-aviao" type="button">+ Adicionar trecho (ida, volta ou extra)</button>
  </div>`;
  const campos = { cia: 'cia', numero_voo: 'voo', classe: 'classe', origem: 'origem', destino: 'destino', data: 'data', saida: 'saida', chegada: 'chegada', valor: 'valor' };
  w.transporte.aviao_trechos.forEach((t, i) => Object.entries(campos).forEach(([campo, elKey]) => {
    const input = document.getElementById(`av-${elKey}-${i}`);
    // Cada digitação no voo pode liberar/esconder a opção de paradas manuais
    // do Aluguel de Carro, que depende de ter voo preenchido.
    if (input) input.oninput = () => { t[campo] = input.value; viaAtualizarVisibilidadeUsoLocal(); };
    if (input && elKey === 'classe') input.onchange = () => { t[campo] = input.value; };
  }));
  box.querySelectorAll('[data-rmaviao]').forEach(b => b.onclick = () => { w.transporte.aviao_trechos.splice(Number(b.dataset.rmaviao), 1); viaRenderAviaoBlock(); viaAtualizarVisibilidadeUsoLocal(); });
  $('#w3-add-aviao').onclick = () => { w.transporte.aviao_trechos.push({ cia: '', numero_voo: '', classe: 'Econômica', origem: '', destino: '', data: w.data_inicio, saida: '', chegada: '', valor: '' }); viaRenderAviaoBlock(); };
}

function viaRenderOnibusBlock() {
  const w = VIA_WIZ, box = $('#w3-onibus-block');
  box.style.display = w.transporte.onibus ? '' : 'none';
  if (!w.transporte.onibus) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="via-subcard"><h4>🚌 Ônibus</h4>
    ${w.transporte.onibus_trechos.map((t, i) => `
      <div class="via-item-row">
        <div class="field-row">${fld(`ob-empresa-${i}`, 'Empresa', 'text', t.empresa || '')}${fld(`ob-origem-${i}`, 'Origem', 'text', t.origem || '')}${fld(`ob-destino-${i}`, 'Destino', 'text', t.destino || '')}</div>
        <div class="field-row">${fld(`ob-data-${i}`, 'Data', 'date', t.data || w.data_inicio)}${fld(`ob-horario-${i}`, 'Horário', 'time', t.horario || '')}${fld(`ob-valor-${i}`, 'Valor (R$)', 'number', t.valor || '', 'step="0.01" min="0"')}</div>
        <button class="btn sm danger-ghost" data-rmonibus="${i}" type="button">Remover trecho</button>
      </div>`).join('') || '<p class="hint">Nenhum trecho adicionado ainda.</p>'}
    <button class="btn" id="w3-add-onibus" type="button">+ Adicionar trecho</button>
  </div>`;
  const campos = { empresa: 'empresa', origem: 'origem', destino: 'destino', data: 'data', horario: 'horario', valor: 'valor' };
  w.transporte.onibus_trechos.forEach((t, i) => Object.entries(campos).forEach(([campo, elKey]) => {
    const input = document.getElementById(`ob-${elKey}-${i}`);
    if (input) input.oninput = () => { t[campo] = input.value; };
  }));
  box.querySelectorAll('[data-rmonibus]').forEach(b => b.onclick = () => { w.transporte.onibus_trechos.splice(Number(b.dataset.rmonibus), 1); viaRenderOnibusBlock(); });
  $('#w3-add-onibus').onclick = () => { w.transporte.onibus_trechos.push({ empresa: '', origem: '', destino: '', data: w.data_inicio, horario: '', valor: '' }); viaRenderOnibusBlock(); };
}

function viaRenderAluguelBlock() {
  const w = VIA_WIZ, box = $('#w3-aluguel-block');
  box.style.display = w.transporte.aluguel_carro ? '' : 'none';
  if (!w.transporte.aluguel_carro) { box.innerHTML = ''; return; }
  // Retirada/devolução por Estado + Município (não mais digitação livre): evita
  // erro de grafia e devolve um ponto que o cálculo de rota já sabe resolver,
  // do mesmo jeito que faz com os destinos da OT.
  const temBase = !!(w.colab.cidade_base_uf && w.colab.cidade_base_municipio);
  const ufOpcoes = [{ v: '', t: '— selecione —' }, ...BR_LOCALIDADES.estados.map(e => ({ v: e.uf, t: e.nome }))];
  const munOpcoes = (uf, atual) => uf
    ? [{ v: '', t: '— selecione —' }, ...(BR_LOCALIDADES.municipios[uf] || []).map(m => ({ v: m, t: m }))]
    : [{ v: '', t: '— escolha o estado —' }];

  box.innerHTML = `<div class="via-subcard"><h4>🚗 Aluguel de Carro</h4>
    ${w.transporte.alugueis.map((a, i) => {
      const kmCombDisabled = a.manual_override ? '' : 'disabled';
      return `
      <div class="via-item-row">
        <div class="field-row">
          ${fld(`al-locadora-${i}`, 'Locadora', 'text', a.locadora || '')}
          <div class="field"><label for="al-diaria-${i}">Valor da diária (R$)</label><input id="al-diaria-${i}" type="text" inputmode="decimal" placeholder="0,00" value="${esc(a.valor_diaria || '')}"></div>
          ${fld(`al-dias-${i}`, 'Nº de diárias', 'number', a.dias || 1, 'min="1"')}
        </div>
        ${temBase ? `<label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="al-localbase-${i}" ${a.local_base ? 'checked' : ''}> 🏠 Retirada e devolução na cidade-base (${esc(w.colab.cidade_base_municipio)}/${esc(w.colab.cidade_base_uf)})</label>` : ''}
        <div class="field-row">
          ${fldSel(`al-retuf-${i}`, 'Estado (retirada)', ufOpcoes, a.retirada_uf || '')}
          ${fldSel(`al-retmun-${i}`, 'Município (retirada)', munOpcoes(a.retirada_uf, a.retirada_municipio), a.retirada_municipio || '')}
          ${fld(`al-retdata-${i}`, 'Data de retirada', 'date', a.retirada_data || w.data_inicio)}
        </div>
        <div class="field-row">
          ${fldSel(`al-devuf-${i}`, 'Estado (devolução)', ufOpcoes, a.devolucao_uf || '')}
          ${fldSel(`al-devmun-${i}`, 'Município (devolução)', munOpcoes(a.devolucao_uf, a.devolucao_municipio), a.devolucao_municipio || '')}
          ${fld(`al-devdata-${i}`, 'Data de devolução', 'date', a.devolucao_data || w.data_fim)}
        </div>
        <p class="hint" style="margin:-4px 0 10px">A rota do carro alugado parte e retorna ao <strong>município de retirada</strong> informado acima — não à cidade-base. Assim, quando você voa até outra cidade e aluga o carro lá, o trecho feito de avião não entra no cálculo.</p>

        <div id="al-usolocal-wrap-${i}" style="${viaTemVooPreenchido() ? '' : 'display:none'}">
          <label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="al-usolocal-${i}" ${a.uso_local ? 'checked' : ''}> 🛫 Rodei apenas por lugares específicos no destino — quero listar as paradas manualmente (em vez de usar as cidades da OT)</label>
        </div>

        ${a.uso_local ? `
        <div class="field"><label>Paradas visitadas (na ordem em que foram visitadas)</label>
          <div class="field-row" style="align-items:flex-end; margin-bottom:8px">
            <div class="field" style="flex:1; margin-bottom:0"><label for="al-parada-end-${i}">Nome do lugar ou endereço</label><input id="al-parada-end-${i}" type="text" placeholder="Ex.: Hotel Slaviero, ou SHS Quadra 6, Bloco A" autocomplete="off"></div>
            <button class="btn primary" id="al-add-parada-${i}" type="button">+ Adicionar</button>
          </div>
          <p class="hint" style="margin:-2px 0 8px">Digite e escolha um resultado da lista pra maior precisão — ou clique em "+ Adicionar" pra usar o texto digitado do jeito que está.</p>
          <div id="al-paradas-list-${i}"></div>
        </div>` : ''}

        <div class="btn-group" style="gap:8px">
          <button class="btn" id="al-calc-${i}" type="button">📍 Calcular rota automaticamente</button>
          ${viaBotaoRotasBrasil()}
        </div>
        <div id="al-status-${i}" style="margin-top:8px"></div>
        <div class="field-row" style="margin-top:8px">${fld(`al-km-${i}`, 'Distância percorrida (km)', 'number', a.distancia_km || '', `step="0.1" min="0" ${kmCombDisabled}`)}${fld(`al-comb-${i}`, 'Combustível (R$)', 'number', a.combustivel_valor || '', `step="0.01" min="0" ${kmCombDisabled}`)}${fld(`al-pedagio-${i}`, 'Pedágio total (R$)', 'number', viaPedagioPonderado(a.trechos) > 0 ? viaPedagioPonderado(a.trechos).toFixed(2) : (a.pedagio_valor || ''), `step="0.01" min="0" ${kmCombDisabled}`)}</div>
        <label class="check-chip" style="margin-top:2px"><input type="checkbox" id="al-manual-${i}" ${a.manual_override ? 'checked' : ''}> ✏️ Rota não pôde ser calculada — preencher km/combustível manualmente</label>
        <p class="hint" style="margin-top:8px">${viaPedagioPonderado(a.trechos) > 0
          ? 'Pedágio somado automaticamente a partir da coluna de pedágio da tabela de trechos acima — por isso o campo está travado.'
          : 'Informe o pedágio de cada trecho na tabela acima: o total é somado automaticamente neste campo, que fica travado como a distância e o combustível. Para digitar o total à mão, marque "preencher manualmente".'}</p>
        <div class="field-row">${fld(`al-estacqtd-${i}`, 'Estacionamento — Qtd.', 'number', a.estacionamento_qtd || 1, 'min="1"')}${fld(`al-estacvalor-${i}`, 'Valor unitário (R$)', 'number', a.estacionamento_valor || '', 'step="0.01" min="0"')}</div>
        <p style="font-weight:600">Total da diária: ${brl(viaNum(a.valor_diaria) * (Number(a.dias) || 0))}</p>
        <button class="btn sm danger-ghost" data-rmaluguel="${i}" type="button">Remover aluguel</button>
      </div>`;
    }).join('') || '<p class="hint">Nenhum aluguel adicionado ainda.</p>'}
    <button class="btn" id="w3-add-aluguel" type="button">+ Adicionar aluguel</button>
  </div>`;
  const campos = { locadora: 'locadora', dias: 'dias', retirada_data: 'retdata', devolucao_data: 'devdata', pedagio_valor: 'pedagio', estacionamento_qtd: 'estacqtd', estacionamento_valor: 'estacvalor' };
  w.transporte.alugueis.forEach((a, i) => {
    Object.entries(campos).forEach(([campo, elKey]) => {
      const input = document.getElementById(`al-${elKey}-${i}`);
      if (input) input.oninput = () => { a[campo] = input.value; if (campo === 'dias') viaRenderAluguelBlock(); };
    });
    const diariaInput = document.getElementById(`al-diaria-${i}`);
    if (diariaInput) diariaInput.oninput = () => { a.valor_diaria = diariaInput.value; };
    diariaInput.onblur = () => viaRenderAluguelBlock(); // atualiza o "Total da diária" ao sair do campo

    // Estado → Município em cascata. `retirada_local` / `devolucao_local`
    // continuam sendo mantidos como texto ("Município/UF") porque a validação,
    // o resumo e o PDF já leem esses campos.
    const ligarLocal = (prefUf, prefMun, campoUf, campoMun, campoTexto) => {
      const selUf = document.getElementById(`al-${prefUf}-${i}`);
      const selMun = document.getElementById(`al-${prefMun}-${i}`);
      if (!selUf || !selMun) return;
      const sincronizar = () => {
        a[campoUf] = selUf.value;
        a[campoMun] = selMun.value;
        a[campoTexto] = (selUf.value && selMun.value) ? `${selMun.value}/${selUf.value}` : '';
        if (campoTexto === 'retirada_local') a.retirada_coord = null;   // ponto agora vem do município
      };
      selUf.onchange = () => {
        a[campoUf] = selUf.value; a[campoMun] = '';
        selMun.innerHTML = munOpcoes(selUf.value).map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
        sincronizar();
      };
      selMun.onchange = sincronizar;
    };
    ligarLocal('retuf', 'retmun', 'retirada_uf', 'retirada_municipio', 'retirada_local');
    ligarLocal('devuf', 'devmun', 'devolucao_uf', 'devolucao_municipio', 'devolucao_local');

    // "Na cidade-base": preenche os quatro campos de uma vez. Desmarcar limpa,
    // pra não deixar a base gravada como se tivesse sido escolhida à mão.
    const chkBase = document.getElementById(`al-localbase-${i}`);
    if (chkBase) chkBase.onchange = e => {
      a.local_base = e.target.checked;
      if (a.local_base) {
        a.retirada_uf = a.devolucao_uf = w.colab.cidade_base_uf;
        a.retirada_municipio = a.devolucao_municipio = w.colab.cidade_base_municipio;
        a.retirada_local = a.devolucao_local = `${w.colab.cidade_base_municipio}/${w.colab.cidade_base_uf}`;
        a.retirada_coord = null;
      } else {
        a.retirada_uf = a.devolucao_uf = ''; a.retirada_municipio = a.devolucao_municipio = '';
        a.retirada_local = a.devolucao_local = '';
      }
      viaRenderAluguelBlock();
    };

    if (a.uso_local) {
      const renderParadas = () => {
        const listEl = document.getElementById(`al-paradas-list-${i}`);
        listEl.innerHTML = (a.paradas || []).length
          ? `<div class="chip-row">${a.paradas.map((p, j) => `<span class="chip">${esc(p.endereco)} <button type="button" data-rmparada="${j}">×</button></span>`).join('')}</div>`
          : '<span style="color:var(--muted); font-size:13px">Nenhuma parada adicionada ainda.</span>';
        listEl.querySelectorAll('[data-rmparada]').forEach(b => b.onclick = () => { a.paradas.splice(Number(b.dataset.rmparada), 1); renderParadas(); });
      };
      const paradaInput = document.getElementById(`al-parada-end-${i}`);
      viaAnexarAutocompleteEndereco(paradaInput,
        () => {},
        s => {
          a.paradas = a.paradas || [];
          a.paradas.push({ endereco: s.endereco, lat: s.lat, lng: s.lng });
          paradaInput.value = '';
          renderParadas();
        });
      document.getElementById(`al-add-parada-${i}`).onclick = () => {
        const endereco = paradaInput.value.trim();
        if (!endereco) return toast('Digite o nome de um lugar ou um endereço.');
        a.paradas = a.paradas || [];
        a.paradas.push({ endereco });
        paradaInput.value = '';
        renderParadas();
      };
      renderParadas();
    }

    const btnUsoLocal = document.getElementById(`al-usolocal-${i}`);
    if (btnUsoLocal) btnUsoLocal.onchange = e => { a.uso_local = e.target.checked; viaRenderAluguelBlock(); };
    const btnManual = document.getElementById(`al-manual-${i}`);
    if (btnManual) btnManual.onchange = e => { a.manual_override = e.target.checked; viaRenderAluguelBlock(); };

    const btnCalc = document.getElementById(`al-calc-${i}`);
    if (btnCalc) btnCalc.onclick = () => {
      // A rota de um carro alugado parte SEMPRE do local onde ele foi
      // retirado (quando informado) — só cai na cidade-base se o campo
      // ficar em branco. Isso evita, no caso "voou até outra cidade e
      // alugou lá", incluir por engano o trecho cidade-base → destino,
      // que na verdade foi percorrido de avião e não com o carro alugado.
      const temRetirada = !!(a.retirada_uf && a.retirada_municipio);
      if (!temRetirada) return toast('Escolha o estado e o município de retirada antes de calcular a rota.');
      const pontoFixo = { uf: a.retirada_uf, municipio: a.retirada_municipio };
      const intermediarios = a.uso_local ? (a.paradas || []) : w.destinos;
      viaExecutarCalculoRota(pontoFixo, intermediarios, w.colab, w.preco_combustivel, `al-status-${i}`, `aluguel-${i}`, a.trechos || [], (km, trechos, meta) => {
        a.manual_override = false;
        a.distancia_km = km.toFixed(1);
        a.combustivel_valor = (km / w.colab.veiculo_consumo_kml * w.preco_combustivel).toFixed(2);
        a.trechos = trechos;
        if (meta) { a.rota_pontos = meta.pontos; a.rota_geometry = meta.geometry; }
        const kmEl = document.getElementById(`al-km-${i}`), combEl = document.getElementById(`al-comb-${i}`), manualEl = document.getElementById(`al-manual-${i}`);
        if (kmEl) { kmEl.value = a.distancia_km; kmEl.disabled = true; }
        if (combEl) { combEl.value = a.combustivel_valor; combEl.disabled = true; }
        if (manualEl) manualEl.checked = false;
        viaSincronizarPedagioTotal(document.getElementById(`al-pedagio-${i}`), a, trechos);
      }, () => viaRenderAluguelBlock());
    };
  });
  box.querySelectorAll('[data-rmaluguel]').forEach(b => b.onclick = () => { w.transporte.alugueis.splice(Number(b.dataset.rmaluguel), 1); viaRenderAluguelBlock(); });
  $('#w3-add-aluguel').onclick = () => {
    w.transporte.alugueis.push({
      locadora: '', valor_diaria: '', dias: 1,
      local_base: false,
      retirada_uf: '', retirada_municipio: '', retirada_local: '', retirada_data: w.data_inicio, retirada_coord: null,
      devolucao_uf: '', devolucao_municipio: '', devolucao_local: '', devolucao_data: w.data_fim,
      distancia_km: '', combustivel_valor: '', pedagio_valor: '', estacionamento_qtd: 1, estacionamento_valor: '',
      trechos: [], manual_override: false, uso_local: false, paradas: []
    });
    viaRenderAluguelBlock();
  };
}

function viaRenderProprioBlock() {
  const w = VIA_WIZ, box = $('#w3-proprio-block'), colab = w.colab, rota = w.transporte.carro_proprio_rota;
  box.style.display = w.transporte.carro_proprio ? '' : 'none';
  if (!w.transporte.carro_proprio) { box.innerHTML = ''; return; }
  const kmCombDisabled = rota.manual_override ? '' : 'disabled';
  // Quem chega aqui já passou pela trava do cartão, então o que ainda importa
  // avisar é documento vencendo durante ou logo depois da viagem.
  const avDoc = viaAvaliarDocumentacao(colab);
  const avisoDoc = avDoc.vencendo.length
    ? `<div class="alert-item warn" style="margin-bottom:10px">⏳ Atenção ao vencimento: ${esc(avDoc.vencendo.map(v => `${v.nome} vence em ${brDate(v.data)}`).join('; '))}. Regularize antes da viagem.</div>`
    : '';
  box.innerHTML = `<div class="via-subcard"><h4>🚙 Carro Próprio</h4>
    ${avisoDoc}
    <p class="hint">Veículo cadastrado: <strong>${esc(colab.veiculo_modelo || 'não informado')}</strong>${colab.veiculo_placa ? ' — placa ' + esc(colab.veiculo_placa) : ''}${colab.veiculo_consumo_kml ? ` (consumo ${colab.veiculo_consumo_kml} km/L)` : ''}</p>
    <div class="btn-group" style="gap:8px">
      <button class="btn primary" id="w3-proprio-calc" type="button">📍 Calcular rota automaticamente</button>
      ${viaBotaoRotasBrasil()}
    </div>
    <div id="w3-proprio-status" style="margin-top:8px"></div>
    <div class="field-row" style="margin-top:10px">
      ${fld('w3-proprio-km', 'Distância percorrida (km)', 'number', rota.distancia_km, `step="0.1" min="0" ${kmCombDisabled}`)}
      ${fld('w3-proprio-comb', 'Combustível (R$)', 'number', rota.combustivel_valor, `step="0.01" min="0" ${kmCombDisabled}`)}
      ${fld('w3-proprio-pedagio', 'Pedágio total (R$)', 'number', viaPedagioPonderado(rota.trechos) > 0 ? viaPedagioPonderado(rota.trechos).toFixed(2) : rota.pedagio_valor, `step="0.01" min="0" ${kmCombDisabled}`)}
    </div>
    <label class="check-chip" style="margin-top:2px"><input type="checkbox" id="w3-proprio-manual" ${rota.manual_override ? 'checked' : ''}> ✏️ Rota não pôde ser calculada — preencher km/combustível manualmente</label>
    <p class="hint" style="margin-top:8px">${viaPedagioPonderado(rota.trechos) > 0
      ? 'Pedágio somado automaticamente a partir da coluna de pedágio da tabela de trechos acima — por isso o campo está travado.'
      : 'Informe o pedágio de cada trecho na tabela acima: o total é somado automaticamente neste campo, que fica travado como a distância e o combustível. Para digitar o total à mão, marque "preencher manualmente".'}</p>
    <div class="field-row">
      ${fld('w3-proprio-estac-qtd', 'Estacionamento — Qtd.', 'number', rota.estacionamento_qtd, 'min="1"')}
      ${fld('w3-proprio-estac-valor', 'Valor unitário (R$)', 'number', rota.estacionamento_valor, 'step="0.01" min="0"')}
    </div>
  </div>`;
  $('#w3-proprio-km').oninput = e => rota.distancia_km = e.target.value;
  $('#w3-proprio-comb').oninput = e => rota.combustivel_valor = e.target.value;
  $('#w3-proprio-pedagio').oninput = e => rota.pedagio_valor = e.target.value;
  $('#w3-proprio-estac-qtd').oninput = e => rota.estacionamento_qtd = e.target.value;
  $('#w3-proprio-estac-valor').oninput = e => rota.estacionamento_valor = e.target.value;
  $('#w3-proprio-manual').onchange = e => { rota.manual_override = e.target.checked; viaRenderProprioBlock(); };
  $('#w3-proprio-calc').onclick = () => viaExecutarCalculoRota(
    { uf: colab.cidade_base_uf, municipio: colab.cidade_base_municipio }, w.destinos, colab, w.preco_combustivel,
    'w3-proprio-status', 'proprio', rota.trechos || [], (km, trechos, meta) => {
      rota.manual_override = false;
      rota.distancia_km = km.toFixed(1);
      rota.combustivel_valor = (km / colab.veiculo_consumo_kml * w.preco_combustivel).toFixed(2);
      rota.trechos = trechos;
      if (meta) { rota.rota_pontos = meta.pontos; rota.rota_geometry = meta.geometry; }
      $('#w3-proprio-km').value = rota.distancia_km; $('#w3-proprio-km').disabled = true;
      $('#w3-proprio-comb').value = rota.combustivel_valor; $('#w3-proprio-comb').disabled = true;
      $('#w3-proprio-manual').checked = false;
      viaSincronizarPedagioTotal($('#w3-proprio-pedagio'), rota, trechos);
    }, () => viaRenderProprioBlock());
}

function viaWizStep4() {
  const w = VIA_WIZ, c = $('#content'), dias = viaWizDias(w);
  const noitesPeriodo = viaWizNoites(w);
  const hospDevida = viaHospedagemDevida(w.destinos, w.colab.cidade_base_uf, w.colab.cidade_base_municipio);
  const noites = hospDevida ? noitesPeriodo : 0;
  const tudHosp = w.tud.find(t => t.tier === w.colab.tier && t.categoria_local === w.categoria_local && t.tipo_despesa === 'hospedagem');
  const tudAlim = w.tud.find(t => t.tier === w.colab.tier && t.categoria_local === w.categoria_local && t.tipo_despesa === 'alimentacao');

  const valorHosp = tudHosp ? tudHosp.valor_diaria : 0, totalHosp = valorHosp * noites;
  const valorAlim = tudAlim ? tudAlim.valor_diaria : 0, totalAlim = valorAlim * dias;
  const aviaoTotal = w.transporte.aviao ? w.transporte.aviao_trechos.reduce((s, t) => s + (Number(t.valor) || 0), 0) : 0;
  const onibusTotal = w.transporte.onibus ? w.transporte.onibus_trechos.reduce((s, t) => s + (Number(t.valor) || 0), 0) : 0;
  const aluguelTotal = w.transporte.aluguel_carro ? w.transporte.alugueis.reduce((s, a) => s + viaNum(a.valor_diaria) * (Number(a.dias) || 0), 0) : 0;
  const combustivelTotal = (w.transporte.carro_proprio ? Number(w.transporte.carro_proprio_rota.combustivel_valor) || 0 : 0)
    + (w.transporte.aluguel_carro ? w.transporte.alugueis.reduce((s, a) => s + (Number(a.combustivel_valor) || 0), 0) : 0);
  const pedagioTotal = (w.transporte.carro_proprio ? viaPedagioTotal(w.transporte.carro_proprio_rota) : 0)
    + (w.transporte.aluguel_carro ? w.transporte.alugueis.reduce((s, a) => s + viaPedagioTotal(a), 0) : 0);
  const estacionamentoTotal = (w.transporte.carro_proprio ? (Number(w.transporte.carro_proprio_rota.estacionamento_qtd) || 0) * (Number(w.transporte.carro_proprio_rota.estacionamento_valor) || 0) : 0)
    + (w.transporte.aluguel_carro ? w.transporte.alugueis.reduce((s, a) => s + (Number(a.estacionamento_qtd) || 0) * (Number(a.estacionamento_valor) || 0), 0) : 0);
  const taxiTotal = w.transporte.taxi_uber ? w.transporte.taxi_uber_corridas.reduce((s, t) => s + (Number(t.valor) || 0), 0) : 0;

  const linha = (emoji, label, valor) => `<div class="via-resumo-linha"><span>${emoji} ${label}</span><strong>${brl(valor)}</strong></div>`;
  const total = totalHosp + totalAlim + aviaoTotal + onibusTotal + aluguelTotal + combustivelTotal + pedagioTotal + estacionamentoTotal + taxiTotal;

  c.innerHTML = `
    <div class="via-wiz-container">
      ${viaWizProgress(4)}
      <div class="card">
        <h3 style="margin-bottom:6px">Despesas previstas</h3>
        <p class="hint" style="margin-bottom:16px">Visão somente leitura de tudo que foi definido nas etapas anteriores. Pra corrigir algum valor, use "Voltar".</p>
        ${hospDevida
          ? linha('🏨', `Hospedagem — ${noites} diária(s) × ${brl(valorHosp)} (teto da TUD)`, totalHosp)
          : `<div class="via-resumo-linha"><span>🏨 Hospedagem — não se aplica: viagem na própria cidade-sede (${esc(w.colab.cidade_base_municipio)}/${esc(w.colab.cidade_base_uf)})</span><strong>${brl(0)}</strong></div>`}
        ${linha('🍽️', `Alimentação — ${dias} dia(s) × ${brl(valorAlim)} (teto da TUD)`, totalAlim)}
        ${w.transporte.aviao ? linha('✈️', 'Passagem de Avião (soma dos trechos)', aviaoTotal) : ''}
        ${w.transporte.onibus ? linha('🚌', 'Passagem de Ônibus (soma dos trechos)', onibusTotal) : ''}
        ${w.transporte.aluguel_carro ? linha('🚗', 'Aluguel de Carro (soma das diárias)', aluguelTotal) : ''}
        ${combustivelTotal > 0 ? linha('⛽', 'Combustível (calculado na rota)', combustivelTotal) : ''}
        ${pedagioTotal > 0 ? linha('🛣️', 'Pedágio (informado na rota)', pedagioTotal) : ''}
        ${estacionamentoTotal > 0 ? linha('🅿️', 'Estacionamento', estacionamentoTotal) : ''}
        ${w.transporte.taxi_uber ? linha('🚕', 'Táxi/Uber (soma das corridas)', taxiTotal) : ''}
        <div class="via-resumo-linha" style="border-top:2px solid var(--verde-700,#00783F); margin-top:10px; padding-top:12px; font-weight:700; font-size:15px">
          <span>Total previsto</span><span>${brl(total)}</span>
        </div>
      </div>
      <div class="wiz-actions"><button class="btn" id="wiz-back">Voltar</button><button class="btn primary" id="wiz-next">Avançar</button></div>
    </div>`;

  $('#wiz-back').onclick = () => viaWizStep3();
  $('#wiz-next').onclick = () => viaWizStep5();
}

function viaComputeResumo(w) {
  const dias = viaWizDias(w), cat = {};
  // Viagem inteiramente na cidade-sede não gera hospedagem (dorme em casa).
  const noites = viaNoitesFaturaveis(w.destinos, w.colab.cidade_base_uf, w.colab.cidade_base_municipio, viaWizNoites(w));
  const add = (k, v) => { if (v) cat[k] = (cat[k] || 0) + v; };
  const tudHosp = w.tud.find(t => t.tier === w.colab.tier && t.categoria_local === w.categoria_local && t.tipo_despesa === 'hospedagem');
  const tudAlim = w.tud.find(t => t.tier === w.colab.tier && t.categoria_local === w.categoria_local && t.tipo_despesa === 'alimentacao');
  add('hospedagem', (tudHosp ? tudHosp.valor_diaria : 0) * noites);
  add('alimentacao', (tudAlim ? tudAlim.valor_diaria : 0) * dias);
  if (w.transporte.aviao) add('passagem_aviao', w.transporte.aviao_trechos.reduce((s, t) => s + (Number(t.valor) || 0), 0));
  if (w.transporte.onibus) add('passagem_onibus', w.transporte.onibus_trechos.reduce((s, t) => s + (Number(t.valor) || 0), 0));
  if (w.transporte.aluguel_carro) w.transporte.alugueis.forEach(a => {
    add('aluguel_carro', viaNum(a.valor_diaria) * (Number(a.dias) || 0));
    add('combustivel', Number(a.combustivel_valor) || 0);
    add('pedagio', viaPedagioTotal(a));
    add('estacionamento', (Number(a.estacionamento_qtd) || 0) * (Number(a.estacionamento_valor) || 0));
  });
  if (w.transporte.carro_proprio) {
    add('combustivel', Number(w.transporte.carro_proprio_rota.combustivel_valor) || 0);
    add('pedagio', viaPedagioTotal(w.transporte.carro_proprio_rota));
    add('estacionamento', (Number(w.transporte.carro_proprio_rota.estacionamento_qtd) || 0) * (Number(w.transporte.carro_proprio_rota.estacionamento_valor) || 0));
  }
  if (w.transporte.taxi_uber) add('taxi_uber', w.transporte.taxi_uber_corridas.reduce((s, t) => s + (Number(t.valor) || 0), 0));
  const total = Object.values(cat).reduce((s, v) => s + v, 0);
  return { dias, noites, cat, total, memoria: viaMemoriaCategorias(w, cat) };
}

// Linhas do "Detalhamento de Viáticos" (resumo da etapa 5 e PDF) — fonte única.
// Inclui uma linha de Hospedagem com R$ 0,00 quando ela foi deliberadamente
// zerada (cidade-sede ou ida e volta no mesmo dia): sem isso o conceito
// simplesmente desaparecia da tabela e quem aprova não saberia se foi
// descartado por regra ou esquecido.
function viaLinhasDetalhamento(r) {
  const linhas = Object.entries(r.cat || {}).map(([k, v]) => ({
    chave: k, label: DESP_CAT_LABEL[k] || k, memoria: (r.memoria && r.memoria[k]) || '—', valor: v
  }));
  const memHosp = r.memoria && r.memoria.hospedagem;
  if (!(r.cat || {}).hospedagem && memHosp && memHosp.startsWith('Não se aplica')) {
    linhas.unshift({ chave: 'hospedagem', label: DESP_CAT_LABEL.hospedagem, memoria: memHosp, valor: 0 });
  }
  return linhas;
}

// Memória de cálculo por categoria — o "como chegou nesse valor" que aparecia
// só na etapa 4 e agora acompanha o conceito no resumo e no PDF, para quem
// aprova não precisar recalcular de cabeça. Fonte única: as duas telas e o
// documento leem daqui.
function viaMemoriaCategorias(w, cat) {
  const t = w.transporte || {}, m = {};
  const { dias, noites: noitesPeriodo } = viaDiasNoites(w.data_inicio, w.data_fim);
  const hospDevida = viaHospedagemDevida(w.destinos, w.colab.cidade_base_uf, w.colab.cidade_base_municipio);
  const noites = hospDevida ? noitesPeriodo : 0;
  // Valor unitário: usa a TUD quando disponível (fluxo do assistente) e, no PDF
  // regerado de uma solicitação salva, deriva do próprio valor gravado —
  // preservando o histórico mesmo que a TUD tenha mudado depois.
  const tudVal = tipo => {
    const r = (w.tud || []).find(x => x.tier === w.colab.tier && x.categoria_local === w.categoria_local && x.tipo_despesa === tipo);
    return r ? Number(r.valor_diaria) : null;
  };
  const unit = (total, qtd) => (qtd > 0 ? (Number(total) || 0) / qtd : 0);

  if (!hospDevida) {
    const cid = w.colab.cidade_base_municipio ? ` (${w.colab.cidade_base_municipio}/${w.colab.cidade_base_uf})` : '';
    m.hospedagem = `Não se aplica — viagem na própria cidade-sede${cid}`;
  } else if (noites === 0) {
    m.hospedagem = 'Não se aplica — ida e volta no mesmo dia';
  } else {
    const v = tudVal('hospedagem') ?? unit(cat.hospedagem, noites);
    m.hospedagem = `${noites} diária(s) × ${brl(v)} (teto da TUD)`;
  }
  const vAlim = tudVal('alimentacao') ?? unit(cat.alimentacao, dias);
  m.alimentacao = `${dias} dia(s) × ${brl(vAlim)} (teto da TUD)`;

  if (t.aviao) m.passagem_aviao = `${(t.aviao_trechos || []).length} trecho(s) de voo`;
  if (t.onibus) m.passagem_onibus = `${(t.onibus_trechos || []).length} trecho(s) de ônibus`;
  if (t.aluguel_carro && (t.alugueis || []).length) {
    m.aluguel_carro = t.alugueis.length === 1
      ? `${Number(t.alugueis[0].dias) || 0} diária(s) × ${brl(viaNum(t.alugueis[0].valor_diaria))}${t.alugueis[0].locadora ? ' — ' + t.alugueis[0].locadora : ''}`
      : `${t.alugueis.length} aluguéis somados`;
  }
  // Combustível: km ponderado ÷ consumo × preço/litro (a premissa que gerou o valor).
  const blocos = [...(t.aluguel_carro ? (t.alugueis || []) : []), ...(t.carro_proprio ? [t.carro_proprio_rota || {}] : [])];
  const kmTotal = blocos.reduce((s, b) => s + viaKmPonderado(b.trechos), 0);
  if (cat.combustivel) {
    const consumo = w.colab.veiculo_consumo_kml;
    // O preço/litro não é gravado na solicitação (auditoria, achado B3), mas
    // pode ser reconstruído do próprio valor: combustível = km ÷ consumo ×
    // preço ⇒ preço = combustível × consumo ÷ km. Assim o PDF regerado mostra
    // a premissa real daquele momento, não a configuração de hoje.
    let preco = w.preco_combustivel || null;
    if (!preco && kmTotal > 0 && consumo) {
      const derivado = (Number(cat.combustivel) * consumo) / kmTotal;
      // Só exibe a fórmula se o preço reconstruído for plausível: fora dessa
      // faixa, o valor foi editado à mão e não segue km ÷ consumo × preço —
      // mostrar a conta nesse caso passaria uma premissa que não é verdade.
      if (derivado >= 2 && derivado <= 15) preco = derivado;
    }
    m.combustivel = (kmTotal > 0 && consumo && preco)
      ? `${kmTotal.toFixed(1)} km ÷ ${consumo} km/L × ${brl(preco)}/L`
      : 'Informado manualmente';
  }
  if (cat.pedagio) {
    const nTrechos = blocos.reduce((s, b) => s + (b.trechos || []).filter(x => viaNum(x.pedagio) > 0).length, 0);
    m.pedagio = nTrechos > 0 ? `${nTrechos} trecho(s) com pedágio (valor × repetições)` : 'Valor total informado';
  }
  if (cat.estacionamento) {
    const qtd = blocos.reduce((s, b) => s + (Number(b.estacionamento_qtd) || 0), 0);
    m.estacionamento = `${qtd} diária(s) de estacionamento`;
  }
  if (t.taxi_uber) m.taxi_uber = `${(t.taxi_uber_corridas || []).length} corrida(s)`;
  return m;
}

function viaResumoTrechosHtml(titulo, trechos, campos) {
  if (!trechos.length) return '';
  const labels = { cia: 'Cia', numero_voo: 'Nº Voo', origem: 'Origem', destino: 'Destino', data: 'Data', saida: 'Saída', chegada: 'Chegada', classe: 'Classe', valor: 'Valor', empresa: 'Empresa', horario: 'Horário' };
  return `<h4 style="margin:18px 0 8px">${titulo}</h4>
    <div class="table-wrap"><table><thead><tr>${campos.map(f => `<th>${labels[f]}</th>`).join('')}</tr></thead>
    <tbody>${trechos.map(t => `<tr>${campos.map(f => `<td>${f === 'valor' ? brl(Number(t[f]) || 0) : (f === 'data' ? brDate(t[f]) : esc(t[f] || '—'))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function viaResumoAlugueisHtml(alugueis) {
  if (!alugueis.length) return '';
  return `<h4 style="margin:18px 0 8px">🚗 Aluguel de Carro</h4>
    <div class="table-wrap"><table><thead><tr><th>Locadora</th><th>Retirada</th><th>Devolução</th><th class="num">Diária</th><th class="num">Dias</th><th class="num">Total</th></tr></thead>
    <tbody>${alugueis.map(a => `<tr><td>${esc(a.locadora || '—')}</td><td>${esc(a.retirada_local || '—')} (${brDate(a.retirada_data)})</td><td>${esc(a.devolucao_local || '—')} (${brDate(a.devolucao_data)})</td>
    <td class="num">${brl(viaNum(a.valor_diaria))}</td><td class="num">${a.dias || 0}</td><td class="num">${brl(viaNum(a.valor_diaria) * (Number(a.dias) || 0))}</td></tr>`).join('')}</tbody></table></div>`;
}
function viaResumoTaxiHtml(corridas) {
  return `<h4 style="margin:18px 0 8px">🚕 Táxi / Uber</h4>
    <div class="table-wrap"><table><thead><tr><th>De</th><th>Para</th><th class="num">Valor</th></tr></thead>
    <tbody>${corridas.map(t => `<tr><td>${esc(t.origem || '—')}</td><td>${esc(t.destino || '—')}</td><td class="num">${brl(Number(t.valor) || 0)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------
// Trajeto completo da viagem (avião + ônibus + automóvel) — usado no
// resumo da etapa 5 e no PDF, para dar à aprovação a visão de toda a rota.
// ------------------------------------------------------------
function viaColetarTrajeto(w) {
  const t = w.transporte;
  const voos = t.aviao ? (t.aviao_trechos || []).filter(v => v.origem || v.destino) : [];
  const onibus = t.onibus ? (t.onibus_trechos || []).filter(o => o.origem || o.destino) : [];
  const carros = [];
  if (t.aluguel_carro) (t.alugueis || []).forEach(a => {
    if (a.trechos && a.trechos.length) carros.push({
      titulo: 'Carro alugado' + (a.locadora ? ' — ' + a.locadora : ''),
      legs: a.trechos, totalKm: viaKmPonderado(a.trechos),
      pontos: a.rota_pontos || null, geometry: a.rota_geometry || null
    });
  });
  if (t.carro_proprio && t.carro_proprio_rota.trechos && t.carro_proprio_rota.trechos.length) {
    const rota = t.carro_proprio_rota;
    carros.push({ titulo: 'Carro próprio', legs: rota.trechos, totalKm: viaKmPonderado(rota.trechos),
      pontos: rota.rota_pontos || null, geometry: rota.rota_geometry || null });
  }
  return { voos, onibus, carros };
}

// Rótulo curto para tabelas/itinerário: um endereço geocodificado longo
// (ex.: "Alameda Aeroporto, Jardim Guanabara, Goiânia, ...") vira só o
// primeiro trecho ("Alameda Aeroporto"); rótulos de cidade ("Abadia/GO")
// não têm vírgula e ficam intactos. O endereço completo segue no mapa.
function viaLabelCurto(s) { return String(s || '—').split(',')[0].trim() || '—'; }

function viaTrajetoResumoHtml(w) {
  const { voos, onibus, carros } = viaColetarTrajeto(w);
  if (!voos.length && !onibus.length && !carros.length) return '';
  const temMapa = carros.some(c => c.geometry && c.geometry.length);
  const itin = [];
  const rota = (de, para) => `<strong title="${esc(de || '')} → ${esc(para || '')}">${esc(viaLabelCurto(de))} → ${esc(viaLabelCurto(para))}</strong>`;
  voos.forEach(v => itin.push(`<li><span class="via-trj-tag av">✈️ Avião</span> ${rota(v.origem, v.destino)}<br><small>${esc(v.cia || '')} ${esc(v.numero_voo || '')} · ${v.data ? brDate(v.data) : '—'} ${esc(v.saida || '')}${v.chegada ? '–' + esc(v.chegada) : ''}${v.classe ? ' · ' + esc(v.classe) : ''}</small></li>`));
  onibus.forEach(o => itin.push(`<li><span class="via-trj-tag on">🚌 Ônibus</span> ${rota(o.origem, o.destino)}<br><small>${esc(o.empresa || '')} · ${o.data ? brDate(o.data) : '—'} ${esc(o.horario || '')}</small></li>`));
  carros.forEach(c => {
    c.legs.forEach(l => itin.push(`<li><span class="via-trj-tag ca">🚗 Carro</span> ${rota(l.de, l.para)}<br><small>${l.km.toFixed(1)} km${(l.repeticoes || 1) > 1 ? ` · ${l.repeticoes}× passagens` : ''}${viaNum(l.km_extra) > 0 ? ` + ${viaNum(l.km_extra).toFixed(1)} km no destino = ${viaKmTrecho(l).toFixed(1)} km` : ''}</small></li>`));
    itin.push(`<li class="via-trj-total">Subtotal ${esc(c.titulo)}: <strong>${c.totalKm.toFixed(1)} km</strong></li>`);
  });
  return `
    <h4 style="margin:22px 0 6px">Trajeto completo da viagem</h4>
    <p class="hint" style="margin-top:0">Todos os deslocamentos previstos para esta OT — avião, ônibus e automóvel. O mapa mostra o trajeto rodoviário calculado; os voos são ponto a ponto e estão listados ao lado.</p>
    <div class="via-trj-wrap">
      <ul class="via-trj-list">${itin.join('')}</ul>
      ${temMapa ? '<div id="via-map-resumo" class="via-trj-map"></div>' : '<div class="via-trj-map via-trj-map-vazio">Sem trajeto rodoviário calculado para exibir no mapa.</div>'}
    </div>`;
}

function viaRenderMapaResumo(w) {
  const el = document.getElementById('via-map-resumo');
  if (!el) return;
  const comGeo = viaColetarTrajeto(w).carros.filter(c => c.geometry && c.geometry.length);
  if (!comGeo.length) { el.style.display = 'none'; return; }
  const map = L.map(el);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  const cores = ['#2a8055', '#1f6fb2', '#a4681f'];
  const todos = [];
  comGeo.forEach((c, idx) => {
    L.polyline(c.geometry, { color: cores[idx % cores.length], weight: 4, opacity: 0.85 }).addTo(map);
    c.geometry.forEach(p => todos.push(p));
    (c.pontos || []).forEach((p, i) => {
      const base = i === 0 || i === c.pontos.length - 1;
      const icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div style="width:${base ? 24 : 22}px;height:${base ? 24 : 22}px;border-radius:50%;background:${base ? '#0d2b1e' : cores[idx % cores.length]};border:${base ? 3 : 2}px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${base ? 'B' : i}</div>` });
      L.marker(p.coord, { icon }).addTo(map).bindPopup(`<strong>${esc(p.label)}</strong>`);
    });
  });
  if (todos.length) map.fitBounds(L.latLngBounds(todos), { padding: [25, 25] });
  setTimeout(() => map.invalidateSize(), 120);
}

// Desenha o trajeto rodoviário como mapa vetorial no PDF (sem tiles — evita
// problemas de CORS/canvas e não depende de biblioteca extra). Projeta
// lat/lng no retângulo, com norte para cima e correção de longitude por cos(lat).
function viaPdfDesenharMapa(doc, comGeo, x, y, boxW, boxH) {
  doc.setFillColor(238, 242, 240); doc.setDrawColor(205, 213, 208); doc.setLineWidth(0.3);
  doc.rect(x, y, boxW, boxH, 'FD');
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const acc = (lat, lng) => { if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; };
  comGeo.forEach(c => { c.geometry.forEach(([lat, lng]) => acc(lat, lng)); (c.pontos || []).forEach(p => acc(p.coord[0], p.coord[1])); });
  if (!isFinite(minLat)) return;
  const pad = 5, midLat = (minLat + maxLat) / 2, cos = Math.cos(midLat * Math.PI / 180) || 1;
  const spanLat = (maxLat - minLat) || 0.02, spanLng = ((maxLng - minLng) || 0.02) * cos;
  const scale = Math.min((boxW - pad * 2) / spanLng, (boxH - pad * 2) / spanLat);
  const offX = x + (boxW - spanLng * scale) / 2, offY = y + (boxH - spanLat * scale) / 2;
  const px = lng => offX + (lng - minLng) * cos * scale;
  const py = lat => offY + (maxLat - lat) * scale;
  const cores = [[42, 128, 85], [31, 111, 178], [164, 104, 31]];
  comGeo.forEach((c, idx) => {
    const cor = cores[idx % cores.length];
    doc.setDrawColor(...cor); doc.setLineWidth(0.7);
    const g = c.geometry;
    for (let i = 0; i < g.length - 1; i++) doc.line(px(g[i][1]), py(g[i][0]), px(g[i + 1][1]), py(g[i + 1][0]));
    (c.pontos || []).forEach((p, i) => {
      const base = i === 0 || i === c.pontos.length - 1;
      const cx = px(p.coord[1]), cy = py(p.coord[0]);
      doc.setFillColor(...(base ? [13, 43, 30] : cor)); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
      doc.circle(cx, cy, base ? 2 : 1.6, 'FD');
      doc.setFontSize(6); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
      doc.text(base ? 'B' : String(i), cx, cy + 0.8, { align: 'center' });
    });
  });
  doc.setFontSize(6.5); doc.setTextColor(90, 100, 94); doc.setFont('helvetica', 'italic');
  doc.text('Trajeto rodoviario calculado (B = base/retirada, numeros = paradas na ordem)', x + 3, y + boxH - 2);
}

// Monta um MAPA REAL como imagem PNG (dataURL): baixa os tiles do
// OpenStreetMap que cobrem o trajeto, achata a rota e os marcadores por
// cima num canvas e devolve a imagem pronta para addImage no PDF. Assim o
// PDF mostra ruas/cidades de fundo, não só a linha. Retorna null se algo
// falhar (o chamador cai no desenho vetorial simples).
async function viaPdfMapaImagem(comGeo, boxW, boxH) {
  try {
    const PXPMM = 6.6, TILE = 256, PAD = 0.12;          // ~168 dpi, 12% de margem
    const Wpx = Math.round(boxW * PXPMM), Hpx = Math.round(boxH * PXPMM);
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    const acc = (la, ln) => { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln); };
    comGeo.forEach(c => { c.geometry.forEach(([la, ln]) => acc(la, ln)); (c.pontos || []).forEach(p => acc(p.coord[0], p.coord[1])); });
    if (!isFinite(minLat)) return null;

    const worldX = (ln, z) => (ln + 180) / 360 * TILE * Math.pow(2, z);
    const worldY = (la, z) => { const s = Math.sin(la * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z); };
    let zoom = 3;
    for (let z = 16; z >= 3; z--) {
      if (Math.abs(worldX(maxLng, z) - worldX(minLng, z)) <= Wpx * (1 - 2 * PAD) &&
          Math.abs(worldY(minLat, z) - worldY(maxLat, z)) <= Hpx * (1 - 2 * PAD)) { zoom = z; break; }
    }
    const nTiles = Math.pow(2, zoom);
    const originX = (worldX(minLng, zoom) + worldX(maxLng, zoom)) / 2 - Wpx / 2;
    const originY = (worldY(minLat, zoom) + worldY(maxLat, zoom)) / 2 - Hpx / 2;

    const canvas = document.createElement('canvas');
    canvas.width = Wpx; canvas.height = Hpx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8ede9'; ctx.fillRect(0, 0, Wpx, Hpx);

    const sub = ['a', 'b', 'c'];
    const carregarTile = (tx, ty) => new Promise(resolve => {
      if (ty < 0 || ty >= nTiles) return resolve();
      const x = ((tx % nTiles) + nTiles) % nTiles;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { try { ctx.drawImage(img, tx * TILE - originX, ty * TILE - originY, TILE, TILE); } catch (_) {} resolve(); };
      img.onerror = () => resolve();
      img.src = `https://${sub[(((x + ty) % 3) + 3) % 3]}.tile.openstreetmap.org/${zoom}/${x}/${ty}.png`;
    });
    const tarefas = [];
    for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + Wpx) / TILE); tx++)
      for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + Hpx) / TILE); ty++)
        tarefas.push(carregarTile(tx, ty));
    await Promise.all(tarefas);

    const px = ln => worldX(ln, zoom) - originX, py = la => worldY(la, zoom) - originY;
    const cores = ['#1f7a46', '#1f6fb2', '#a4681f'];
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    comGeo.forEach((c, idx) => {
      const cor = cores[idx % cores.length];
      const traçar = () => { ctx.beginPath(); c.geometry.forEach(([la, ln], i) => { const X = px(ln), Y = py(la); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); };
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7; traçar();   // halo branco
      ctx.strokeStyle = cor; ctx.lineWidth = 4; traçar();                       // linha colorida
      (c.pontos || []).forEach((p, i) => {
        const base = i === 0 || i === c.pontos.length - 1, X = px(p.coord[1]), Y = py(p.coord[0]);
        ctx.beginPath(); ctx.arc(X, Y, base ? 11 : 9, 0, 2 * Math.PI);
        ctx.fillStyle = base ? '#0d2b1e' : cor; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${base ? 12 : 11}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(base ? 'B' : String(i), X, Y + 0.5);
      });
    });

    const cred = '© OpenStreetMap contributors';
    ctx.font = '11px Helvetica, Arial, sans-serif';
    const cw = ctx.measureText(cred).width + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fillRect(Wpx - cw, Hpx - 16, cw, 16);
    ctx.fillStyle = '#333'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(cred, Wpx - 4, Hpx - 3);

    return canvas.toDataURL('image/png');
  } catch (e) { console.error('[viaPdfMapaImagem]', e); return null; }
}

async function viaPdfTrajeto(doc, w, y, MARGIN, pageW, VERDE, VERDE_CLARO, CINZA) {
  const { voos, onibus, carros } = viaColetarTrajeto(w);
  if (!voos.length && !onibus.length && !carros.length) return y;
  const pageH = doc.internal.pageSize.getHeight();
  if (y > 205) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
  doc.text('Trajeto da viagem', MARGIN, y); y += 5;

  const comGeo = carros.filter(c => c.geometry && c.geometry.length);
  if (comGeo.length) {
    const boxW = pageW - MARGIN * 2, boxH = 82;
    if (y + boxH + 8 > pageH - 20) { doc.addPage(); y = 20; }
    const mapaImg = await viaPdfMapaImagem(comGeo, boxW, boxH);
    if (mapaImg) {
      doc.addImage(mapaImg, 'PNG', MARGIN, y, boxW, boxH);
      doc.setDrawColor(205, 213, 208); doc.setLineWidth(0.3); doc.rect(MARGIN, y, boxW, boxH);
    } else {
      viaPdfDesenharMapa(doc, comGeo, MARGIN, y, boxW, boxH); // fallback vetorial
    }
    y += boxH + 3;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...CINZA);
    doc.text('B = base / retirada · números = paradas na ordem visitada · trajeto rodoviário calculado.', MARGIN, y);
    y += 5;
  }

  // Colunas Origem/Destino separadas (sem a seta "→", que a fonte do jsPDF
  // não possui — imprimia lixo e corrompia o espaçamento da célula inteira).
  const rows = [];
  voos.forEach(v => rows.push(['Avião', viaLabelCurto(v.origem), viaLabelCurto(v.destino), `${v.cia || ''} ${v.numero_voo || ''} · ${v.data ? brDate(v.data) : '—'} ${v.saida || ''}${v.chegada ? '-' + v.chegada : ''}${v.classe ? ' · ' + v.classe : ''}`.trim()]));
  onibus.forEach(o => rows.push(['Ônibus', viaLabelCurto(o.origem), viaLabelCurto(o.destino), `${o.empresa || ''} · ${o.data ? brDate(o.data) : '—'} ${o.horario || ''}`.trim()]));
  let totalKmGeral = 0;
  carros.forEach(c => {
    c.legs.forEach(l => rows.push([c.titulo, viaLabelCurto(l.de), viaLabelCurto(l.para), `${l.km.toFixed(1)} km${(l.repeticoes || 1) > 1 ? ` (${l.repeticoes}x)` : ''}${viaNum(l.km_extra) > 0 ? ` + ${viaNum(l.km_extra).toFixed(1)} no destino` : ''}`]));
    totalKmGeral += c.totalKm;
  });
  doc.autoTable({
    startY: y, margin: { left: MARGIN, right: MARGIN },
    head: [['Modo', 'Origem', 'Destino', 'Detalhe / Distância']],
    body: rows,
    foot: totalKmGeral > 0 ? [[{ content: 'Distância total por automóvel', colSpan: 3, styles: { halign: 'left' } }, { content: totalKmGeral.toFixed(1) + ' km', styles: { halign: 'right' } }]] : undefined,
    showFoot: 'lastPage', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: VERDE, textColor: 255, fontSize: 8 },
    footStyles: { fillColor: VERDE_CLARO, textColor: VERDE, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 42 }, 2: { cellWidth: 42 }, 3: { halign: 'left' } }
  });
  return doc.lastAutoTable.finalY + 10;
}

function viaWizStep5() {
  const w = VIA_WIZ, c = $('#content'), r = viaComputeResumo(w);
  c.innerHTML = `
    <div class="via-wiz-container-lg">
      ${viaWizProgress(5)}
      <div class="card">
        <h3 style="margin-bottom:6px">Resumo — confira antes de enviar</h3>
        <p class="hint" style="margin-bottom:14px">Esta etapa é só leitura. Se precisar corrigir algo, use "Voltar".</p>
        <table class="via-resumo-tbl">
          <tr><td>Solicitante</td><td>${esc(w.colab.name)} — ${esc(w.colab.cargo || '')}</td></tr>
          <tr><td>Tier</td><td>${TIER_LABEL[w.colab.tier]}</td></tr>
          <tr><td>Ordem de Trabalho</td><td>${esc(w.ordem_trabalho) || '—'}</td></tr>
          <tr><td>Categoria de local</td><td>${LOCAL_LABEL[w.categoria_local]}</td></tr>
          <tr><td>Destinos</td><td>${w.destinos.map(d => `${esc(d.municipio)}/${esc(d.uf)}`).join(', ') || '—'}</td></tr>
          <tr><td>Período</td><td>${brDate(w.data_inicio)} a ${brDate(w.data_fim)} (${r.dias} dia(s))</td></tr>
          <tr><td>Motivo</td><td>${esc(w.motivo)}</td></tr>
          <tr><td>Objetivo</td><td>${esc(w.objetivo) || '—'}</td></tr>
        </table>
        <h4 style="margin:18px 0 8px">Detalhamento de Viáticos</h4>
        <div class="table-wrap"><table>
          <thead><tr><th>Descrição</th><th>Como foi calculado</th><th class="num">Total (R$)</th></tr></thead>
          <tbody>${viaLinhasDetalhamento(r).map(l => `<tr><td>${esc(l.label)}</td>
            <td><small style="color:var(--ink-2)">${esc(l.memoria)}</small></td>
            <td class="num">${brl(l.valor)}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Nenhuma despesa prevista.</div></td></tr>'}
          <tr style="font-weight:700; background:var(--verde-050)"><td>Total Geral</td><td></td><td class="num">${brl(r.total)}</td></tr></tbody>
        </table></div>
        ${w.transporte.aviao ? viaResumoTrechosHtml('✈️ Voos', w.transporte.aviao_trechos, ['cia', 'numero_voo', 'origem', 'destino', 'data', 'saida', 'chegada', 'classe', 'valor']) : ''}
        ${w.transporte.onibus ? viaResumoTrechosHtml('🚌 Ônibus', w.transporte.onibus_trechos, ['empresa', 'origem', 'destino', 'data', 'horario', 'valor']) : ''}
        ${w.transporte.aluguel_carro ? viaResumoAlugueisHtml(w.transporte.alugueis) : ''}
        ${w.transporte.taxi_uber && w.transporte.taxi_uber_corridas.length ? viaResumoTaxiHtml(w.transporte.taxi_uber_corridas) : ''}
        ${viaTrajetoResumoHtml(w)}
      </div>
      <div class="wiz-actions"><button class="btn" id="wiz-back">Voltar</button>
        <div style="display:flex; gap:10px">
          <button class="btn" id="wiz-pdf">Gerar PDF</button>
          <button class="btn primary" id="wiz-enviar">Enviar solicitação</button>
        </div>
      </div>
    </div>`;

  VIA_MAP = null; // o mapa do resumo é uma instância nova a cada entrada na etapa
  viaRenderMapaResumo(w);
  $('#wiz-back').onclick = () => viaWizStep4();
  $('#wiz-pdf').onclick = async (ev) => {
    const btn = ev.currentTarget, txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gerando mapa…';
    try { await viaGerarPDF(w, r); } finally { btn.disabled = false; btn.textContent = txt; }
  };
  $('#wiz-enviar').onclick = async () => {
    // Revalida tudo antes de enviar: dá para chegar aqui, voltar, apagar um
    // campo e avançar de novo pelos botões das etapas.
    const erro = viaWizValidarEtapa2(w) || viaWizValidarEtapa3(w.transporte);
    if (erro) return toast(`Não é possível enviar: ${erro.msg}`);
    try {
      await api('/api/viaticos/solicitacoes/autosservico', { method: 'POST', body: {
        // categoria_local e previsao_por_categoria vão só como referência —
        // o servidor recalcula os dois a partir de destinos/período/internacional
        // e dos itens de transporte, e é o que de fato é gravado (não confia
        // no total que o navegador já somou — auditoria 2026-07-29, achado A4).
        ordem_trabalho: w.ordem_trabalho, categoria_local: w.categoria_local, destinos: w.destinos,
        internacional: !!w.internacional,
        data_inicio: w.data_inicio, data_fim: w.data_fim, motivo: w.motivo, objetivo: w.objetivo,
        previsao_por_categoria: r.cat, transporte_detalhes: w.transporte, notes: ''
      }});
      toast('Solicitação enviada! Ela segue para aprovação.');
      renderViaticos();
    } catch (e) { toast(e.message); }
  };
}

// "Tem PDF" = solicitação criada pelo assistente de autosserviço (novo
// modelo, que gera o PDF). As criadas pelo admin (modelo antigo) não têm.
function viaTemPdfSolicitacao(s) { return !!s && s.origem === 'colaborador'; }

// Regenera e baixa o PDF de uma solicitação já salva, a partir dos dados
// gravados (mesmo conteúdo emitido na solicitação — inclui o trajeto/mapa,
// pois a geometria da rota fica guardada em transporte_detalhes).
async function viaBaixarPdfSolicitacao(s) {
  if (!viaTemPdfSolicitacao(s)) {
    return toast('Esta solicitação não possui PDF (foi criada antes do novo modelo de autosserviço).');
  }
  const cat = s.previsao_por_categoria && typeof s.previsao_por_categoria === 'object' ? s.previsao_por_categoria : {};
  const total = Object.values(cat).reduce((a, b) => a + (Number(b) || 0), 0);
  const { dias } = viaDiasNoites(s.data_inicio, s.data_fim);
  const w = {
    ordem_trabalho: s.ordem_trabalho, categoria_local: s.categoria_local,
    destinos: Array.isArray(s.destinos) ? s.destinos : [],
    data_inicio: s.data_inicio, data_fim: s.data_fim,
    motivo: s.motivo || '', objetivo: s.objetivo || '',
    // cidade-base e consumo entram para a memória de cálculo sair correta
    // (hospedagem na cidade-sede, premissa do combustível). Sem `tud`, os
    // valores unitários são derivados do que foi gravado na solicitação —
    // o documento reflete o histórico, não a TUD de hoje.
    colab: {
      name: s.colaborador_name, cargo: s.colaborador_cargo || '', tier: s.tier,
      cidade_base_uf: s.colaborador_cidade_base_uf || null,
      cidade_base_municipio: s.colaborador_cidade_base_municipio || null,
      veiculo_consumo_kml: s.colaborador_veiculo_consumo_kml || null
    },
    transporte: (s.transporte_detalhes && typeof s.transporte_detalhes === 'object') ? s.transporte_detalhes : {}
  };
  toast('Gerando PDF…');
  await viaGerarPDF(w, { cat, total, dias, memoria: viaMemoriaCategorias(w, cat) }, { dataEmissao: s.created_at });
}

async function viaGerarPDF(w, r, opts = {}) {
  if (!window.jspdf) return toast('Biblioteca de PDF ainda carregando. Tente novamente em instantes.');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114];
    const MARGIN = 14;
    // Data de emissão: hoje na solicitação nova; a data original quando o PDF
    // é regerado depois, a partir de uma solicitação já salva (opts.dataEmissao).
    const dataDoc = opts.dataEmissao ? new Date(opts.dataEmissao) : new Date();

    doc.setFillColor(...VERDE); doc.rect(0, 0, pageW, 3, 'F');
    const logoW = 30, logoH = logoW * (139 / 600);
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', pageW - MARGIN - logoW, 10, logoW, logoH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(30, 38, 32);
    doc.text('Solicitação de Viáticos', MARGIN, 18);
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3); doc.line(MARGIN, 24, pageW - MARGIN, 24);

    let y = 32;
    doc.autoTable({
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'grid',
      body: [
        ['Nome do Solicitante', w.colab.name, 'Data', dataDoc.toLocaleDateString('pt-BR')],
        ['Cargo', w.colab.cargo || '—', 'Tier', w.colab.tier],
        ['Data de Saída', brDate(w.data_inicio), 'Data de Retorno', brDate(w.data_fim)],
        ['Ordem de Trabalho', w.ordem_trabalho || '—', 'Categoria de Local', LOCAL_LABEL[w.categoria_local]],
        ['Destinos', w.destinos.map(d => `${d.municipio}/${d.uf}`).join(', ') || '—', 'Motivo', w.motivo]
      ],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: [40, 46, 42] },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: VERDE_CLARO, cellWidth: 38 }, 2: { fontStyle: 'bold', fillColor: VERDE_CLARO, cellWidth: 38 } }
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...VERDE);
    doc.text('Objetivo da Viagem', MARGIN, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 46, 42);
    const objLines = doc.splitTextToSize(w.objetivo || '—', pageW - MARGIN * 2 - 6);
    const objH = Math.max(12, objLines.length * 4.5 + 6);
    doc.setDrawColor(210, 218, 213); doc.rect(MARGIN, y, pageW - MARGIN * 2, objH);
    doc.text(objLines, MARGIN + 3, y + 6);
    y += objH + 10;

    const trechoTabela = (titulo, head, body) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...VERDE); doc.text(titulo, MARGIN, y); y += 4;
      doc.autoTable({ startY: y, margin: { left: MARGIN, right: MARGIN }, head: [head], body,
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2 }, headStyles: { fillColor: VERDE, textColor: 255, fontSize: 7.5 } });
      y = doc.lastAutoTable.finalY + 8;
    };
    // Sem emojis nos títulos: a fonte padrão do jsPDF (helvetica) não tem
    // esses glifos e imprime lixo no lugar (ex.: "Ø=Þ—").
    if (w.transporte.aviao && w.transporte.aviao_trechos.length) trechoTabela('Voos', ['Cia', 'Nº Voo', 'Origem', 'Destino', 'Data', 'Saída', 'Chegada', 'Classe', 'Valor'],
      w.transporte.aviao_trechos.map(t => [t.cia, t.numero_voo, t.origem, t.destino, brDate(t.data), t.saida, t.chegada, t.classe, brl(Number(t.valor) || 0)]));
    if (w.transporte.onibus && w.transporte.onibus_trechos.length) trechoTabela('Ônibus', ['Empresa', 'Origem', 'Destino', 'Data', 'Horário', 'Valor'],
      w.transporte.onibus_trechos.map(t => [t.empresa, t.origem, t.destino, brDate(t.data), t.horario, brl(Number(t.valor) || 0)]));
    if (w.transporte.aluguel_carro && w.transporte.alugueis.length) trechoTabela('Aluguel de Carro', ['Locadora', 'Retirada', 'Devolução', 'Diária', 'Dias', 'Total'],
      w.transporte.alugueis.map(a => [a.locadora, `${a.retirada_local} (${brDate(a.retirada_data)})`, `${a.devolucao_local} (${brDate(a.devolucao_data)})`, brl(viaNum(a.valor_diaria)), String(a.dias || 0), brl(viaNum(a.valor_diaria) * (Number(a.dias) || 0))]));

    // Trajeto completo da viagem (mapa + itinerário) — logo antes do detalhamento.
    y = await viaPdfTrajeto(doc, w, y, MARGIN, pageW, VERDE, VERDE_CLARO, CINZA);

    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE);
    doc.text('Detalhamento de Viáticos', MARGIN, y); y += 5;
    doc.autoTable({
      startY: y, margin: { left: MARGIN, right: MARGIN },
      // "Como foi calculado" acompanha cada conceito: a aprovação enxerga a
      // memória de cálculo sem precisar abrir o sistema.
      head: [['Descrição', 'Como foi calculado', 'Total (R$)']],
      body: viaLinhasDetalhamento(r).map(l => [l.label, l.memoria, brl(l.valor)]),
      // Total Geral: valor justificado à direita (como os demais) e fonte um
      // pouco maior, para diferenciar a linha de fechamento.
      foot: [[
        { content: 'Total Geral', colSpan: 2, styles: { halign: 'left', fontSize: 11 } },
        { content: brl(r.total), styles: { halign: 'right', fontSize: 11 } }
      ]],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, headStyles: { fillColor: VERDE, textColor: 255 },
      footStyles: { fillColor: VERDE_CLARO, textColor: VERDE, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 46 }, 1: { fontSize: 8, textColor: CINZA }, 2: { halign: 'right', cellWidth: 32 } }
    });
    y = doc.lastAutoTable.finalY + 12;

    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CINZA);
    const decl = doc.splitTextToSize(`Declaro que me comprometo a utilizar os valores destinados às despesas de viagem exclusivamente de acordo com o objetivo da viagem que me foi atribuído pela ${COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME}. Estou ciente de que a verificação e a validação dessas despesas serão realizadas após a data de retorno.`, pageW - MARGIN * 2);
    doc.text(decl, MARGIN, y); y += decl.length * 4 + 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 46, 42);
    doc.text(`Assinado eletronicamente por ${w.colab.name} em ${dataDoc.toLocaleDateString('pt-BR')}`, MARGIN, y);

    const safeName = String(w.colab.name || 'colaborador').replace(/\s+/g, '_');
    const safeOt = String(w.ordem_trabalho || 'sem_OT').replace(/\s+/g, '_');
    doc.save(`Solicitacao_Viaticos_${safeOt}_${safeName}.pdf`);
    toast('PDF gerado — confira e envie manualmente ao Approvals por enquanto.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  }
}

// Calcula o status de uma data de validade (CNH, CRLV, seguro): vencido,
// vencendo em breve (dentro de "diasAlerta" dias) ou em dia. Reaproveita as
// classes de badge já existentes no CSS (ok/warn/late/off).
// Antecedência do aviso de vencimento de documento: 2 meses. Prazo suficiente
// para renovar CNH/CRLV/seguro antes de a viagem ser barrada.
const VIA_DIAS_ALERTA_DOC = 60;
const viaDiasAte = dataStr => dataStr ? Math.round((new Date(dataStr) - new Date(todayISO())) / 86400000) : null;

// FONTE ÚNICA da habilitação para dirigir a serviço. Decide o que o colaborador
// pode usar e devolve, junto, o motivo de cada bloqueio — a mesma avaliação
// alimenta as travas do assistente, os avisos da tela de Viáticos e a validação
// no servidor (que é reimplementada em api/index.js, e as duas precisam casar).
//
// Regras: aluguel de carro exige CNH em dia; carro próprio exige CNH em dia MAIS
// a documentação do veículo (CRLV, aptidão, e a apólice quando o seguro é
// declarado). Consumo em km/L também entra, porque sem ele não há como apurar o
// combustível da rota.
function viaAvaliarDocumentacao(c) {
  c = c || {};
  const hoje = todayISO();
  const aval = d => ({ data: d || null, dias: viaDiasAte(d), vencido: !!d && d < hoje,
    vencendo: !!d && d >= hoje && viaDiasAte(d) <= VIA_DIAS_ALERTA_DOC });
  // Normaliza para o dia do calendário. A API entrega DATE como ISO com hora
  // ('2027-05-05T03:00:00.000Z'); Date só apareceria se a função fosse chamada
  // fora do navegador (num teste), mas custa uma linha aceitar as duas formas.
  const dia = v => !v ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const vCnh = dia(c.cnh_validade), vCrlv = dia(c.veiculo_crlv_validade), vSeg = dia(c.veiculo_seguro_validade);
  const cnh = aval(vCnh), crlv = aval(vCrlv), seguro = aval(vSeg);
  const temSeguro = !!c.veiculo_possui_seguro;
  const txt = v => String(v == null ? '' : v).trim();

  const bloqueiosCNH = [];
  if (!txt(c.cnh_numero)) bloqueiosCNH.push('nº da CNH não cadastrado');
  if (!vCnh) bloqueiosCNH.push('validade da CNH não cadastrada');
  else if (cnh.vencido) bloqueiosCNH.push(`CNH vencida em ${brDate(vCnh)}`);
  if (c.motorista_apto === false) bloqueiosCNH.push('motorista marcado como inapto para dirigir a serviço');

  const bloqueiosProprio = bloqueiosCNH.slice();
  if (c.veiculo_apto === false) bloqueiosProprio.push('veículo marcado como inapto para uso a serviço');
  if (!txt(c.veiculo_placa)) bloqueiosProprio.push('placa do veículo não cadastrada');
  if (!txt(c.veiculo_modelo)) bloqueiosProprio.push('modelo do veículo não cadastrado');
  if (!(Number(c.veiculo_consumo_kml) > 0)) bloqueiosProprio.push('consumo (km/L) do veículo não cadastrado — sem ele não há como calcular o combustível');
  if (!vCrlv) bloqueiosProprio.push('validade do CRLV não cadastrada');
  else if (crlv.vencido) bloqueiosProprio.push(`CRLV vencido em ${brDate(vCrlv)}`);
  // Seguro é OBRIGATÓRIO para rodar de carro próprio a serviço, independente de
  // CNH e CRLV: é a empresa que assume o risco da viagem. Sem seguro declarado,
  // ou com a apólice incompleta/vencida, o carro próprio fica indisponível.
  if (!temSeguro) {
    bloqueiosProprio.push('veículo sem seguro cadastrado (obrigatório para usar carro próprio a serviço)');
  } else {
    if (!txt(c.veiculo_seguradora) || !txt(c.veiculo_apolice)) bloqueiosProprio.push('apólice de seguro incompleta (seguradora ou nº)');
    if (!vSeg) bloqueiosProprio.push('vigência do seguro não cadastrada');
    else if (seguro.vencido) bloqueiosProprio.push(`seguro do veículo vencido em ${brDate(vSeg)}`);
  }

  // Avisos não travam a solicitação, mas aparecem para o colaborador e para quem
  // administra.
  const avisos = [];
  if (!txt(c.cnh_categoria)) avisos.push('categoria da CNH não informada');

  const vencendo = [];
  if (cnh.vencendo) vencendo.push({ nome: 'CNH', data: vCnh, dias: cnh.dias });
  if (crlv.vencendo) vencendo.push({ nome: 'CRLV (licenciamento)', data: vCrlv, dias: crlv.dias });
  if (temSeguro && seguro.vencendo) vencendo.push({ nome: 'Seguro do veículo', data: vSeg, dias: seguro.dias });

  return { cnh, crlv, seguro, temSeguro, bloqueiosCNH, bloqueiosProprio, avisos, vencendo,
    podeAlugar: bloqueiosCNH.length === 0, podeCarroProprio: bloqueiosProprio.length === 0 };
}

function viaStatusValidadeDoc(dataStr, diasAlerta = VIA_DIAS_ALERTA_DOC) {
  if (!dataStr) return { label: 'Não informado', cls: 'off' };
  dataStr = String(dataStr).slice(0, 10);   // API manda DATE como ISO com hora
  const hoje = todayISO();
  if (dataStr < hoje) return { label: `Vencido em ${brDate(dataStr)}`, cls: 'late' };
  const diffDias = Math.round((new Date(dataStr) - new Date(hoje)) / 86400000);
  if (diffDias <= diasAlerta) return { label: `Vence em ${brDate(dataStr)}`, cls: 'warn' };
  return { label: `Válido até ${brDate(dataStr)}`, cls: 'ok' };
}
// Consolida CNH + CRLV + seguro + os dois flags manuais (motorista/veículo
// aptos) num único selo pra dar uma visão rápida na listagem de
// colaboradores, sem precisar abrir "Editar" pra descobrir se falta algo.
// Selo da coluna "Documentação". Responde UMA pergunta: o que esta pessoa pode
// usar de carro? São só três respostas possíveis — liberado para os dois, só
// aluguel, ou nada. "Vencendo" saiu da lista de status: era um quarto rótulo
// que competia com os outros e escondia o mais importante (quem estava sem
// seguro E com a CNH vencendo aparecia como "Vencendo"). Virou um marcador
// separado, que acompanha qualquer um dos três estados.
function viaStatusDocumentacaoColaborador(c) {
  const av = viaAvaliarDocumentacao(c);
  const vence = av.vencendo.length ? {
    texto: `⏳ ${av.vencendo.length}`,
    title: 'Vence em menos de 2 meses: ' + av.vencendo.map(v => `${v.nome} em ${brDate(v.data)} (${v.dias <= 0 ? 'hoje' : v.dias + ' dias'})`).join('; ') + '.'
  } : null;

  if (!av.podeAlugar) {
    return { label: 'Não habilitado', cls: 'late', vence,
      title: 'Não pode dirigir a serviço — nem carro próprio, nem aluguel. Falta: ' + av.bloqueiosCNH.join('; ') + '.' };
  }
  if (!av.podeCarroProprio) {
    const soProprio = av.bloqueiosProprio.filter(b => !av.bloqueiosCNH.includes(b));
    return { label: 'Só aluguel', cls: 'warn', vence,
      title: 'Pode alugar carro (CNH em dia), mas não pode usar o veículo próprio. Falta: ' + soProprio.join('; ') + '.' };
  }
  return { label: 'Liberado', cls: 'ok', vence,
    title: 'Habilitado para carro próprio e para aluguel.' };
}

// Célula da coluna: o status e, quando houver, o marcador de vencimento ao lado.
function viaCelulaDocumentacao(c) {
  const doc = viaStatusDocumentacaoColaborador(c);
  return `<span class="badge ${doc.cls}" title="${esc(doc.title)}">${esc(doc.label)}</span>`
    + (doc.vence ? ` <span class="doc-vence" title="${esc(doc.vence.title)}">${doc.vence.texto}</span>` : '');
}

async function renderViaticosConfig() {
  const [colaboradores, tud, usuarios, viaConfig] = await Promise.all([api('/api/colaboradores'), api('/api/viaticos/tud'), api('/api/users'), api('/api/viaticos/config')]);

  const tudGrid = tier => `<h4 style="margin:14px 0 8px">Tier ${tier}</h4>
    <div class="table-wrap"><table><thead><tr><th>Categoria de local</th><th class="num">Hospedagem (dia)</th><th class="num">Alimentação (dia)</th></tr></thead>
      <tbody>${Object.entries(LOCAL_LABEL).map(([local, label]) => {
        const h = tud.find(t => t.tier === tier && t.categoria_local === local && t.tipo_despesa === 'hospedagem');
        const a = tud.find(t => t.tier === tier && t.categoria_local === local && t.tipo_despesa === 'alimentacao');
        return `<tr><td>${label}</td>
          <td class="num"><input type="number" step="0.01" min="0" data-tud="${tier}:${local}:hospedagem" value="${h ? h.valor_diaria : ''}" style="width:110px;text-align:right"></td>
          <td class="num"><input type="number" step="0.01" min="0" data-tud="${tier}:${local}:alimentacao" value="${a ? a.valor_diaria : ''}" style="width:110px;text-align:right"></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

  const nAtivos = colaboradores.filter(c => c.ativo !== false).length;
  const nInativos = colaboradores.length - nAtivos;

  const anpValor = viaConfig.combustivel_anp_valor, margem = viaConfig.combustivel_margem_pct != null ? viaConfig.combustivel_margem_pct : 10;
  const atualizadoEm = viaConfig.combustivel_anp_atualizado_em
    ? new Date(viaConfig.combustivel_anp_atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const body = `
    <div class="card anp-card">
      <h4 style="margin:0 0 4px">⛽ Combustível — preço automático (ANP)</h4>
      <p class="hint" style="margin:0 0 12px">Buscado sozinho toda semana no Levantamento de Preços da ANP (média nacional, Gasolina Comum) — não precisa preencher. Usado no cálculo de rota de Carro Próprio e Aluguel de Carro.</p>
      ${viaConfig.combustivel_anp_erro ? `<div class="alert-item late" style="margin-bottom:10px">⚠️ Última busca falhou: ${esc(viaConfig.combustivel_anp_erro)}. O valor abaixo é o último obtido com sucesso.</div>` : ''}
      <div class="anp-grid">
        <div class="anp-box">
          <small>Preço médio ANP <span style="white-space:nowrap">(Gasolina Comum, Brasil)</span></small>
          <strong>${anpValor != null ? brl(anpValor) : '<span style="color:var(--muted); font-weight:600; font-size:14px">ainda não buscado</span>'}</strong>
        </div>
        <div class="anp-box">
          <small>Margem de segurança</small>
          <div class="anp-margem">
            <input id="cfg-margem" type="number" step="0.1" min="0" max="200" value="${esc(margem)}">
            <span>% do valor da ANP</span>
          </div>
        </div>
        <div class="anp-box final">
          <small>Preço final usado nos cálculos</small>
          <strong>${viaConfig.preco_combustivel_litro != null ? brl(viaConfig.preco_combustivel_litro) : '—'}</strong>
        </div>
      </div>
      <div class="anp-rodape">
        <p class="hint" style="margin:0">${atualizadoEm ? `Atualizado em ${atualizadoEm}` : 'Nunca atualizado'}${viaConfig.combustivel_anp_semana_fim ? ` · semana da pesquisa ANP encerrada em ${brDate(viaConfig.combustivel_anp_semana_fim)}` : ''}.</p>
        <div class="btn-group">
          <button class="btn primary" id="cfg-margem-save" type="button">Salvar margem</button>
          <button class="btn" id="cfg-anp-refresh" type="button">Atualizar agora</button>
        </div>
      </div>
    </div>
    <p class="hint">Estacionamento é sempre lançado "por recibo" (sem teto) e Veículo próprio fica fora da TUD — não precisam de configuração aqui.</p>
    ${tudGrid('A')}${tudGrid('B')}
    <h3 style="margin:20px 0 10px; font-size:15px">Colaboradores</h3>
    <div class="field-row" style="align-items:flex-end">
      ${fld('cb-nome', 'Nome', 'text', '')}
      ${fld('cb-cargo', 'Cargo', 'text', '')}
      ${fldSel('cb-tier', 'Tier', [{ v: 'A', t: 'A' }, { v: 'B', t: 'B' }], 'B')}
      <button class="btn primary" id="cb-add" type="button">+ Adicionar</button>
    </div>
    <p class="hint" style="margin-top:6px">Vínculo com usuário, cidade-base e veículo (pro autosserviço) se ajustam depois, clicando em "Editar".</p>
    <div class="cb-filtro">
      <label for="cb-filtro-ativo">Mostrar</label>
      <select id="cb-filtro-ativo">
        <option value="ativos">Somente ativos (${nAtivos})</option>
        <option value="inativos">Somente inativos (${nInativos})</option>
        <option value="todos">Todos (${colaboradores.length})</option>
      </select>
      <span class="hint" style="margin:0">Inativar preserva o histórico e os dados do colaborador — só o esconde das novas solicitações. Excluir apaga o cadastro.</span>
    </div>
    <div class="table-wrap" style="margin-top:10px"><table class="tbl-colaboradores">
      <thead><tr><th>Nome</th><th>Cargo</th><th>Tier</th><th>Ativo</th><th>Documentação</th><th class="actions">Ações</th></tr></thead>
      <tbody id="cb-tbody"></tbody>
    </table></div>`;

  openModal('Configurações de Viáticos (TUD e Colaboradores)', body, [{ label: 'Fechar', cls: 'primary', onClick: closeModal }], { xwide: true });

  // Lista de colaboradores com filtro de situação. Inativar em vez de excluir é
  // o caminho recomendado (o histórico de viagens aponta para o cadastro), então
  // a tela precisa deixar ver os inativos sem misturá-los com quem está ativo.
  const FILTRO_KEY = 'cfg-colab-filtro';
  const desenharColaboradores = () => {
    const modo = $('#cb-filtro-ativo').value;
    try { sessionStorage.setItem(FILTRO_KEY, modo); } catch { /* sessionStorage indisponível */ }
    const lista = colaboradores.filter(c =>
      modo === 'todos' ? true : modo === 'inativos' ? c.ativo === false : c.ativo !== false);
    $('#cb-tbody').innerHTML = lista.map(c => {
      return `<tr${c.ativo === false ? ' class="cb-inativo"' : ''}>
        <td class="nowrap">${esc(c.name)}</td><td>${esc(c.cargo || '—')}</td><td>${c.tier}</td>
        <td>${c.ativo ? '<span class="badge ok">Sim</span>' : '<span class="badge off">Não</span>'}</td>
        <td class="nowrap">${viaCelulaDocumentacao(c)}</td>
        <td class="actions"><div class="btn-group">
          <button class="btn sm" data-editar-colab="${c.id}">Editar</button>
          <button class="btn sm" data-toggle-colab="${c.id}">${c.ativo ? 'Inativar' : 'Ativar'}</button>
          <button class="btn sm danger-ghost" data-del-colab="${c.id}">Excluir</button>
        </div></td></tr>`;
    }).join('') || `<tr><td colspan="6"><div class="empty">${
      modo === 'inativos' ? 'Nenhum colaborador inativo.' : modo === 'ativos' ? 'Nenhum colaborador ativo.' : 'Nenhum colaborador cadastrado.'
    }</div></td></tr>`;
    ligarAcoesColaboradores();
  };

  $('#cfg-margem-save').onclick = async () => {
    const v = Number($('#cfg-margem').value);
    if (!isFinite(v) || v < 0 || v > 200) return toast('Margem inválida (0 a 200%).');
    try { await api('/api/viaticos/config', { method: 'PUT', body: { margem_pct: v } }); toast('Margem atualizada.'); renderViaticosConfig(); }
    catch (e) { toast(e.message); }
  };
  $('#cfg-anp-refresh').onclick = async (ev) => {
    const btn = ev.currentTarget, txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Buscando na ANP…';
    try { await api('/api/viaticos/config/atualizar-anp', { method: 'POST' }); toast('Preço atualizado com a ANP.'); renderViaticosConfig(); }
    catch (e) { toast(e.message); btn.disabled = false; btn.textContent = txt; }
  };

  document.querySelectorAll('[data-tud]').forEach(inp => inp.onchange = async () => {
    const [tier, categoria_local, tipo_despesa] = inp.dataset.tud.split(':');
    const valor_diaria = Number(inp.value);
    if (!isFinite(valor_diaria) || valor_diaria < 0) return toast('Valor inválido.');
    try { await api('/api/viaticos/tud', { method: 'POST', body: { tier, categoria_local, tipo_despesa, valor_diaria } }); toast('TUD atualizada.'); }
    catch (e) { toast(e.message); }
  });

  $('#cb-add').onclick = async () => {
    const nome = $('#cb-nome').value.trim();
    if (!nome) return toast('Informe o nome.');
    try {
      await api('/api/colaboradores', { method: 'POST', body: { name: nome, cargo: $('#cb-cargo').value, tier: $('#cb-tier').value } });
      toast('Colaborador adicionado.'); renderViaticosConfig();
    } catch (e) { toast(e.message); }
  };
  // Religados a cada redesenho da lista (o filtro reconstrói o tbody).
  function ligarAcoesColaboradores() {
  document.querySelectorAll('[data-editar-colab]').forEach(b => b.onclick = () => {
    const c = colaboradores.find(x => x.id == b.dataset.editarColab);
    formEditarColaborador(c, usuarios);
  });
  document.querySelectorAll('[data-toggle-colab]').forEach(b => b.onclick = async () => {
    const c = colaboradores.find(x => x.id == b.dataset.toggleColab);
    await api(`/api/colaboradores/${c.id}`, { method: 'PUT', body: {
      name: c.name, cargo: c.cargo, tier: c.tier, ativo: !c.ativo, usuario_id: c.usuario_id,
      cidade_base_uf: c.cidade_base_uf, cidade_base_municipio: c.cidade_base_municipio,
      veiculo_placa: c.veiculo_placa, veiculo_modelo: c.veiculo_modelo, veiculo_ano: c.veiculo_ano,
      veiculo_consumo_kml: c.veiculo_consumo_kml, veiculo_crlv_validade: c.veiculo_crlv_validade,
      veiculo_possui_seguro: c.veiculo_possui_seguro, veiculo_seguradora: c.veiculo_seguradora,
      veiculo_apolice: c.veiculo_apolice, veiculo_seguro_validade: c.veiculo_seguro_validade,
      veiculo_apto: c.veiculo_apto, veiculo_observacao: c.veiculo_observacao,
      cnh_numero: c.cnh_numero, cnh_categoria: c.cnh_categoria, cnh_validade: c.cnh_validade,
      cnh_restricoes: c.cnh_restricoes, motorista_apto: c.motorista_apto, motorista_observacao: c.motorista_observacao
    }});
    renderViaticosConfig();
  });
  document.querySelectorAll('[data-del-colab]').forEach(b => b.onclick = () => confirmDelete('este colaborador', `/api/colaboradores/${b.dataset.delColab}`, renderViaticosConfig));
  }

  // Restaura o filtro escolhido na sessão e desenha a lista.
  const filtroSalvo = (() => { try { return sessionStorage.getItem(FILTRO_KEY); } catch { return null; } })();
  if (filtroSalvo) $('#cb-filtro-ativo').value = filtroSalvo;
  $('#cb-filtro-ativo').onchange = desenharColaboradores;
  desenharColaboradores();
}

// ---- Validadores de documento do colaborador ----
// Conferem os dígitos verificadores da CNH e o formato da placa. São AVISOS na
// tela (não travam o cadastro): o backend só barra o que é inequívoco, porque
// recusar um documento legítimo por variação de algoritmo seria pior que
// mostrar um alerta para a pessoa reconferir.
function viaConferirCNH(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return { cls: 'off', label: 'Não informado' };
  if (d.length !== 11) return { cls: 'late', label: `${d.length} de 11 dígitos` };
  if (/^(\d)\1{10}$/.test(d)) return { cls: 'late', label: 'Número inválido (dígitos repetidos)' };
  let s1 = 0, s2 = 0;
  for (let i = 0; i < 9; i++) { s1 += Number(d[i]) * (9 - i); s2 += Number(d[i]) * (1 + i); }
  let dv1 = s1 % 11, desconto = 0;
  if (dv1 >= 10) { dv1 = 0; desconto = 2; }
  let dv2 = s2 % 11;
  dv2 = dv2 >= 10 ? 0 : dv2 - desconto;
  if (dv2 < 0) dv2 += 11;
  return (dv1 === Number(d[9]) && dv2 === Number(d[10]))
    ? { cls: 'ok', label: 'Nº com dígitos conferidos' }
    : { cls: 'warn', label: 'Dígitos verificadores não conferem — reconfira' };
}
function viaConferirPlaca(bruto) {
  const p = String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return { cls: 'off', label: 'Não informada' };
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) return { cls: 'ok', label: `Placa Mercosul (${p})` };
  if (/^[A-Z]{3}\d{4}$/.test(p)) return { cls: 'ok', label: `Placa modelo antigo (${p.slice(0, 3)}-${p.slice(3)})` };
  return { cls: 'late', label: 'Formato inválido — use ABC-1234 ou ABC1D23' };
}
const viaBadge = s => `<span class="badge ${s.cls}">${esc(s.label)}</span>`;

// Anexos embutidos na própria seção do formulário. Propositalmente NÃO usa
// openAttachments: aquele fluxo abre outro modal e substituiria o formulário,
// jogando fora tudo que a pessoa já tinha digitado e não salvou.
async function colabAnexosInline(type, colabId, mountId, kindPadrao) {
  const box = document.getElementById(mountId);
  if (!box) return;
  const podeEditar = canEditPage('viaticos');
  const desenhar = items => {
    box.innerHTML = `
      <div class="ec-anexos-head">
        <strong>Documentos anexados</strong>
        <span class="ec-anexos-n">${items.length ? `${items.length} arquivo(s)` : 'nenhum'}</span>
      </div>
      ${items.length ? items.map(a => `
        <div class="ec-anexo-item">
          <span>${KIND_ICON[a.kind] || '📎'}</span>
          <div class="ec-anexo-nome" title="${esc(a.file_name)}">${esc(a.file_name)}</div>
          <small>${fmtSize(a.byte_size)} · ${brDate(a.created_at.slice(0, 10))}</small>
          <button class="btn sm" data-ver="${a.id}" type="button">Ver</button>
          ${podeEditar ? `<button class="btn sm danger-ghost" data-rem="${a.id}" type="button">Excluir</button>` : ''}
        </div>`).join('') : '<div class="ec-anexo-vazio">Nenhum documento anexado nesta seção.</div>'}
      ${podeEditar ? `
      <div class="ec-anexo-add">
        <input type="file" id="${mountId}-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx">
        <button class="btn sm primary" id="${mountId}-send" type="button">📎 Anexar</button>
        <small>Até 3 MB — PDF ou foto do documento.</small>
      </div>` : ''}`;

    box.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => colabVerAnexo(b.dataset.ver));
    box.querySelectorAll('[data-rem]').forEach(b => b.onclick = async () => {
      if (b.dataset.confirmando !== '1') { b.dataset.confirmando = '1'; b.textContent = 'Confirmar?'; return; }
      try { await api(`/api/attachments/${b.dataset.rem}`, { method: 'DELETE' }); toast('Anexo excluído.'); carregar(); }
      catch (e) { toast(e.message); }
    });
    const send = document.getElementById(`${mountId}-send`);
    if (send) send.onclick = async () => {
      const input = document.getElementById(`${mountId}-file`), file = input.files[0];
      if (!file) return toast('Selecione um arquivo.');
      if (file.size > 3 * 1024 * 1024) return toast('Arquivo acima do limite de 3 MB.');
      send.disabled = true; send.textContent = 'Enviando…';
      try {
        const data = await readFileAsBase64(file);
        await api(`/api/attachments/${type}/${colabId}`, { method: 'POST', body: {
          file_name: file.name, mime_type: file.type || 'application/octet-stream', kind: kindPadrao, data
        }});
        toast('Documento anexado.'); input.value = ''; carregar();
      } catch (e) { toast(e.message); }
      finally { send.disabled = false; send.textContent = '📎 Anexar'; }
    };
  };
  const carregar = async () => {
    try { desenhar(await api(`/api/attachments/${type}/${colabId}`)); }
    catch (e) { box.innerHTML = `<div class="ec-anexo-vazio">${esc(e.message)}</div>`; }
  };
  box.innerHTML = '<div class="ec-anexo-vazio">Carregando anexos…</div>';
  carregar();
}

// Abre o documento numa aba nova, em vez de num modal: manter o formulário de
// edição aberto por trás é o ponto — quem está conferindo a CNH normalmente
// está justamente preenchendo a validade ao lado.
async function colabVerAnexo(attId) {
  try {
    const r = await api(`/api/attachments/file/${attId}`);
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime_type }));
    const aba = window.open(url, '_blank');
    if (!aba) toast('O navegador bloqueou a nova aba. Libere pop-ups para ver o documento.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message || 'Não foi possível abrir o anexo.'); }
}

async function formEditarColaborador(c, usuarios) {
  const body = `
    ${fld('ec-nome', 'Nome', 'text', c.name)}
    ${fld('ec-cargo', 'Cargo', 'text', c.cargo || '')}
    ${fldSel('ec-tier', 'Tier', [{ v: 'A', t: 'A' }, { v: 'B', t: 'B' }], c.tier)}
    ${fldSel('ec-usuario', 'Vincular a um usuário (autosserviço)', [{ v: '', t: '— nenhum —' }, ...usuarios.map(u => ({ v: u.id, t: `${u.name} (${u.email})` }))], c.usuario_id || '')}
    <div class="field-row">
      ${fldSel('ec-uf', 'Estado (cidade-base)', [{ v: '', t: '— não informado —' }, ...BR_LOCALIDADES.estados.map(e => ({ v: e.uf, t: e.nome }))], c.cidade_base_uf || '')}
      ${fldSel('ec-municipio', 'Município (cidade-base)', [{ v: '', t: c.cidade_base_uf ? '— selecione —' : '— escolha o estado primeiro —' }], '')}
    </div>

    <div class="ec-sec">
      <div class="ec-sec-head">
        <h4>🪪 Habilitação do motorista (CNH)</h4>
        <span class="ec-sec-badges" id="ec-badges-cnh"></span>
      </div>
      <div class="field-row">
        ${fld('ec-cnh-numero', 'Nº da CNH', 'text', c.cnh_numero || '', 'inputmode="numeric" maxlength="14" placeholder="11 dígitos"')}
        ${fldSel('ec-cnh-categoria', 'Categoria', [{ v: '', t: '— não informado —' }, ...['A', 'B', 'AB', 'C', 'D', 'E'].map(x => ({ v: x, t: x }))], c.cnh_categoria || '')}
        ${fld('ec-cnh-validade', 'Validade da CNH', 'date', c.cnh_validade || '')}
      </div>
      ${fld('ec-cnh-restricoes', 'Restrições (ex.: uso de lentes corretivas, só veículo automático)', 'text', c.cnh_restricoes || '')}
      <label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="ec-motorista-apto" ${c.motorista_apto === false ? '' : 'checked'}> Motorista apto para dirigir a serviço da empresa</label>
      <div class="field"><label>Observações sobre o motorista</label><textarea id="ec-motorista-obs" rows="2" placeholder="Ex.: restrição médica temporária, pendência de reciclagem, etc.">${esc(c.motorista_observacao || '')}</textarea></div>
      <div class="ec-anexos" id="ec-anexos-cnh"></div>
    </div>

    <div class="ec-sec">
      <div class="ec-sec-head">
        <h4>🚙 Veículo próprio (pra Solicitação de Viáticos)</h4>
        <span class="ec-sec-badges" id="ec-badges-veiculo"></span>
      </div>
      <div class="field-row">
        ${fld('ec-placa', 'Placa', 'text', c.veiculo_placa || '', 'maxlength="8" placeholder="ABC-1234 ou ABC1D23" style="text-transform:uppercase"')}
        ${fld('ec-modelo', 'Modelo', 'text', c.veiculo_modelo || '')}
        ${fld('ec-ano', 'Ano', 'text', c.veiculo_ano || '', 'inputmode="numeric" maxlength="4"')}
        ${fld('ec-consumo', 'Consumo (km/L)', 'number', c.veiculo_consumo_kml || '', 'step="0.1" min="0"')}
      </div>
      ${fld('ec-crlv-validade', 'Validade do CRLV (licenciamento)', 'date', c.veiculo_crlv_validade || '')}
      <label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="ec-veiculo-apto" ${c.veiculo_apto === false ? '' : 'checked'}> Veículo apto para uso a serviço da empresa</label>
      <div class="field"><label>Observações sobre o veículo</label><textarea id="ec-veiculo-obs" rows="2" placeholder="Ex.: revisão pendente, problema mecânico, etc.">${esc(c.veiculo_observacao || '')}</textarea></div>
      <div class="ec-anexos" id="ec-anexos-veiculo"></div>
    </div>

    <div class="ec-sec">
      <div class="ec-sec-head">
        <h4>🛡️ Apólice de seguro do veículo</h4>
        <span class="ec-sec-badges" id="ec-badges-seguro"></span>
      </div>
      <label class="check-chip" style="margin-bottom:10px"><input type="checkbox" id="ec-possui-seguro" ${c.veiculo_possui_seguro ? 'checked' : ''}> O veículo possui seguro</label>
      <div id="ec-seguro-fields" style="${c.veiculo_possui_seguro ? '' : 'display:none'}">
        <div class="field-row">
          ${fld('ec-seguradora', 'Seguradora', 'text', c.veiculo_seguradora || '')}
          ${fld('ec-apolice', 'Nº da apólice', 'text', c.veiculo_apolice || '')}
          ${fld('ec-seguro-validade', 'Vigência até', 'date', c.veiculo_seguro_validade || '')}
        </div>
        <p class="hint" style="margin:0 0 4px">Marcando "possui seguro", seguradora, nº da apólice e vigência passam a ser obrigatórios — sem os três o campo não serve de controle.</p>
      </div>
      <div class="ec-anexos" id="ec-anexos-seguro"></div>
    </div>`;

  openModal(`Editar colaborador — ${esc(c.name)}`, body,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Salvar', cls: 'primary', onClick: async () => {
        try {
          await api(`/api/colaboradores/${c.id}`, { method: 'PUT', body: {
            name: $('#ec-nome').value, cargo: $('#ec-cargo').value, tier: $('#ec-tier').value, ativo: c.ativo,
            usuario_id: $('#ec-usuario').value || null, cidade_base_uf: $('#ec-uf').value || null,
            cidade_base_municipio: $('#ec-municipio').value || null, veiculo_placa: $('#ec-placa').value || null,
            veiculo_modelo: $('#ec-modelo').value || null, veiculo_ano: $('#ec-ano').value || null,
            veiculo_consumo_kml: $('#ec-consumo').value || null,
            veiculo_crlv_validade: $('#ec-crlv-validade').value || null,
            veiculo_possui_seguro: $('#ec-possui-seguro').checked,
            veiculo_seguradora: $('#ec-seguradora').value || null, veiculo_apolice: $('#ec-apolice').value || null,
            veiculo_seguro_validade: $('#ec-seguro-validade').value || null,
            veiculo_apto: $('#ec-veiculo-apto').checked, veiculo_observacao: $('#ec-veiculo-obs').value || null,
            cnh_numero: $('#ec-cnh-numero').value || null, cnh_categoria: $('#ec-cnh-categoria').value || null,
            cnh_validade: $('#ec-cnh-validade').value || null, cnh_restricoes: $('#ec-cnh-restricoes').value || null,
            motorista_apto: $('#ec-motorista-apto').checked, motorista_observacao: $('#ec-motorista-obs').value || null
          }});
          closeModal(); toast('Colaborador atualizado.'); renderViaticosConfig();
        } catch (e) { modalError(e.message); }
     }}], { xwide: true });

  // ---- Validadores ao vivo: o estado de cada seção aparece no cabeçalho dela,
  // então dá pra ver de longe qual documento está vencido ou faltando.
  const pintarBadges = () => {
    const cnh = viaConferirCNH($('#ec-cnh-numero').value);
    const cnhVal = viaStatusValidadeDoc($('#ec-cnh-validade').value || null);
    $('#ec-badges-cnh').innerHTML = viaBadge(cnh) + ' ' + viaBadge(cnhVal);

    const placa = viaConferirPlaca($('#ec-placa').value);
    const crlv = viaStatusValidadeDoc($('#ec-crlv-validade').value || null);
    $('#ec-badges-veiculo').innerHTML = viaBadge(placa) + ' ' + viaBadge({ ...crlv, label: 'CRLV: ' + crlv.label });

    const temSeguro = $('#ec-possui-seguro').checked;
    if (!temSeguro) {
      $('#ec-badges-seguro').innerHTML = viaBadge({ cls: 'off', label: 'Sem seguro declarado' });
    } else {
      const faltando = [];
      if (!$('#ec-seguradora').value.trim()) faltando.push('seguradora');
      if (!$('#ec-apolice').value.trim()) faltando.push('nº da apólice');
      if (!$('#ec-seguro-validade').value) faltando.push('vigência');
      $('#ec-badges-seguro').innerHTML = faltando.length
        ? viaBadge({ cls: 'late', label: 'Falta preencher: ' + faltando.join(', ') })
        : viaBadge({ ...viaStatusValidadeDoc($('#ec-seguro-validade').value), label: 'Vigente: ' + viaStatusValidadeDoc($('#ec-seguro-validade').value).label });
    }
  };
  ['ec-cnh-numero', 'ec-cnh-validade', 'ec-placa', 'ec-crlv-validade', 'ec-seguradora', 'ec-apolice', 'ec-seguro-validade']
    .forEach(id => { const e = $('#' + id); if (e) { e.oninput = pintarBadges; e.onchange = pintarBadges; } });
  $('#ec-possui-seguro').onchange = e => {
    $('#ec-seguro-fields').style.display = e.target.checked ? '' : 'none';
    pintarBadges();
  };
  pintarBadges();

  // Anexos por seção, carregados dentro do próprio formulário.
  colabAnexosInline('colab_cnh', c.id, 'ec-anexos-cnh', 'outro');
  colabAnexosInline('colab_veiculo', c.id, 'ec-anexos-veiculo', 'outro');
  colabAnexosInline('colab_seguro', c.id, 'ec-anexos-seguro', 'contrato');

  // Município (cidade-base) em lista suspensa, filtrada pelo estado — evita
  // erro de digitação (acento, grafia) que faria a regra de hospedagem na
  // cidade-sede (viaHospedagemDevida) não reconhecer a viagem como local.
  const popularMunicipiosColab = () => {
    const uf = $('#ec-uf').value;
    const lista = uf ? (BR_LOCALIDADES.municipios[uf] || []) : [];
    const atual = c.cidade_base_uf === uf ? (c.cidade_base_municipio || '') : '';
    $('#ec-municipio').innerHTML = uf
      ? lista.map(m => `<option value="${esc(m)}" ${m === atual ? 'selected' : ''}>${esc(m)}</option>`).join('')
      : `<option value="">— escolha o estado primeiro —</option>`;
  };
  $('#ec-uf').onchange = popularMunicipiosColab;
  popularMunicipiosColab();
}

// ============================================================
// USUÁRIOS (admin)
// ============================================================
// Recarrega a lista a cada 60s para manter o status Online/Offline
// atualizado — só enquanto a página estiver aberta e sem modal ativo.
let USERS_POLL_TIMER = null;
function scheduleUsersRefresh() {
  clearTimeout(USERS_POLL_TIMER);
  USERS_POLL_TIMER = setTimeout(() => {
    if (location.hash.replace('#', '') !== 'usuarios') return;
    if ($('#modal-back').classList.contains('open')) return scheduleUsersRefresh();
    renderUsuarios();
  }, 60000);
}

async function renderUsuarios() {
  const rows = await api('/api/users');
  const byId = id => rows.find(u => String(u.id) === String(id));

  const permChips = u => {
    if (u.role === 'admin') return '<span class="badge ok">Acesso total</span>';
    const p = u.permissions || {}, keys = PERM_PAGES.filter(k => p[k]);
    if (!keys.length) return '<small style="color:var(--muted)">Nenhuma página</small>';
    return `<div class="chip-row">${keys.map(k =>
      `<span class="chip ${p[k] === 'edit' ? 'chip-edit' : ''}">${PAGE_LABELS[k]}${p[k] === 'edit' ? ' ✎' : ''}</span>`).join('')}</div>`;
  };

  const c = $('#content');
  c.innerHTML = `
    <div class="card user-head">
      <div>
        <h3 style="margin:0">Usuários cadastrados</h3>
        <p style="font-size:13px;color:var(--ink-2);margin:4px 0 0">O acesso à plataforma é criado exclusivamente por você. Defina as páginas e o nível (ver / editar) de cada colaborador.</p>
      </div>
      <button class="btn primary" id="btn-new-user">+ Criar usuário</button>
    </div>

    <div class="user-list">
      ${rows.map(u => {
        const initials = u.name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
        const isSuper = u.email.toLowerCase() === 'm.atanazio@proagroseguros.com';
        return `<div class="user-row">
          <div class="user-id">
            <div class="avatar">${initials}</div>
            <div>
              <div class="user-name">${esc(u.name)} ${u.id === USER.id ? '<span style="color:var(--muted);font-weight:400">(você)</span>' : ''}</div>
              <div class="user-mail">${esc(u.email)} · cadastro: ${brDate(u.created_at.slice(0, 10))}</div>
              <div style="margin-top:6px">${permChips(u)}</div>
            </div>
          </div>
          <div class="user-meta">
            <span class="badge ${u.role === 'admin' ? 'pend' : 'off'}">${u.role === 'admin' ? 'admin' : 'usuário'}</span>
            <span class="badge ${u.active ? 'ok' : 'late'}">${u.active ? 'Ativo' : 'Inativo'}</span>
            <span class="badge ${u.online ? 'online' : 'offline'}">${u.online ? 'Online' : 'Offline'}</span>
          </div>
          <div class="user-actions">${
            isSuper
              ? '<small style="color:var(--muted)">administrador principal</small>'
              : `<button class="btn sm" data-perms="${u.id}">Acesso</button>
                 <button class="btn sm" data-reset="${u.id}">Redefinir senha</button>
                 <button class="btn sm" data-toggle="${u.id}">${u.active ? 'Desativar' : 'Ativar'}</button>`
          }</div>
        </div>`;
      }).join('')}
    </div>`;

  $('#btn-new-user').onclick = openCreateUser;
  c.querySelectorAll('[data-perms]').forEach(b => b.onclick = () => openEditPerms(byId(b.dataset.perms)));
  c.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => openReset(byId(b.dataset.reset)));
  c.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    try { await api(`/api/users/${b.dataset.toggle}/toggle`, { method: 'POST' }); toast('Situação atualizada.'); renderUsuarios(); }
    catch (e) { toast(e.message); }
  });

  scheduleUsersRefresh();
}

// Presets de perfil que pré-preenchem a matriz de permissões (ajustável depois).
const PERM_PRESETS = {
  admin:      null, // acesso total (ignora a matriz)
  financeiro: { dashboard:'view', pagar:'edit', receber:'edit', fluxo:'view', conciliacao:'edit', fornecedores:'edit', orcamento:'view', orcadoreal:'view', relatorios:'view' },
  consulta:   { dashboard:'view', pagar:'view', receber:'view', fluxo:'view', conciliacao:'view', fornecedores:'view', orcamento:'view', orcadoreal:'view', relatorios:'view' },
  custom:     {}
};

// ---- Componentes reutilizáveis da administração de usuários ----
function permMatrixHTML(perms) {
  perms = perms || {};
  return `<div class="perm-grid">${PERM_PAGES.map(pg => {
    const cur = perms[pg] || 'none';
    return `<div class="perm-row">
      <span>${PAGE_LABELS[pg]}</span>
      <select data-perm="${pg}">
        <option value="none" ${cur === 'none' ? 'selected' : ''}>Sem acesso</option>
        <option value="view" ${cur === 'view' ? 'selected' : ''}>Ver</option>
        <option value="edit" ${cur === 'edit' ? 'selected' : ''}>Ver e editar</option>
      </select></div>`;
  }).join('')}</div>`;
}
function readPermMatrix(scope) {
  const out = {};
  (scope || document).querySelectorAll('[data-perm]').forEach(s => { if (s.value !== 'none') out[s.dataset.perm] = s.value; });
  return out;
}
function pwGenFieldHTML(label = 'Senha inicial') {
  return `<div class="field"><label>${label}</label>
    <div style="display:flex; gap:8px; align-items:center">
      <input id="gpw" type="text" readonly style="font-family:monospace; letter-spacing:.5px">
      <button class="btn sm" id="gpw-gen" type="button">Gerar</button>
      <button class="btn sm" id="gpw-copy" type="button">Copiar</button>
    </div>
    <small style="color:var(--muted)">Senha forte de 16 caracteres. O usuário deverá trocá-la no primeiro acesso.</small>
  </div>`;
}
function wirePwGen() {
  $('#gpw').value = gerarSenhaForte(16);
  $('#gpw-gen').onclick = () => { $('#gpw').value = gerarSenhaForte(16); };
  $('#gpw-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#gpw').value); toast('Senha copiada.'); }
    catch { toast('Selecione e copie manualmente.'); }
  };
}
function showGeneratedPassword(u, pw) {
  openModal('Acesso criado', `
    <p style="font-size:13.5px; color:var(--ink-2)">Repasse estas credenciais a <strong>${esc(u.name)}</strong>.
    Por segurança, esta senha <strong>não poderá ser consultada novamente</strong>.</p>
    <div class="cred-box">
      <div><span>E-mail</span><code>${esc(u.email)}</code></div>
      <div><span>Senha</span><code>${esc(pw)}</code></div>
    </div>`,
    [{ label: 'Copiar senha', onClick: async () => { try { await navigator.clipboard.writeText(pw); toast('Senha copiada.'); } catch { toast('Copie manualmente.'); } } },
     { label: 'Concluir', cls: 'primary', onClick: closeModal }]);
}
function applyPreset(presetKey, scope) {
  const preset = PERM_PRESETS[presetKey];
  const isAdmin = presetKey === 'admin';
  const box = scope.querySelector('.perm-box');
  if (box) box.style.display = isAdmin ? 'none' : 'block';
  if (isAdmin || presetKey === 'custom') return;
  scope.querySelectorAll('[data-perm]').forEach(sel => { sel.value = (preset && preset[sel.dataset.perm]) || 'none'; });
}

function openCreateUser() {
  openModal('Criar usuário', `
    <p style="font-size:13.5px; color:var(--ink-2)">O acesso é criado por você. Defina os dados, o perfil e as páginas liberadas. A senha inicial é exibida uma única vez.</p>
    <div class="field"><label for="cu-name">Nome completo</label><input id="cu-name" placeholder="Nome do colaborador"></div>
    <div class="field"><label for="cu-email">E-mail institucional</label><input id="cu-email" type="email" placeholder="colaborador@proagroseguros.com"></div>
    <div class="field"><label for="cu-preset">Perfil <span style="font-weight:400;color:var(--muted)">(pré-preenche as páginas — ajuste se necessário)</span></label>
      <select id="cu-preset">
        <option value="custom" selected>Personalizado</option>
        <option value="financeiro">Financeiro (operacional)</option>
        <option value="consulta">Consulta (somente leitura)</option>
        <option value="admin">Administrador (acesso total)</option>
      </select></div>
    ${pwGenFieldHTML()}
    <div class="perm-box">
      <label style="font-weight:600; font-size:12.5px; color:var(--ink-2); display:block; margin:6px 0">Páginas com acesso</label>
      ${permMatrixHTML({})}
    </div>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Criar e gerar acesso', cls: 'primary', onClick: async () => {
        const name = $('#cu-name').value.trim();
        const email = $('#cu-email').value.trim();
        const preset = $('#cu-preset').value;
        const role = preset === 'admin' ? 'admin' : 'usuario';
        const password = $('#gpw').value;
        const permissions = role === 'admin' ? {} : readPermMatrix($('#modal-body'));
        try {
          const r = await api('/api/users', { method: 'POST', body: { name, email, role, password, permissions } });
          closeModal();
          showGeneratedPassword({ name, email }, password);
          renderUsuarios();
        } catch (e) { modalError(e.message); }
     }}]);
  wirePwGen();
  const presetSel = $('#cu-preset');
  presetSel.onchange = () => applyPreset(presetSel.value, $('#modal-body'));
  applyPreset('custom', $('#modal-body'));
}
function openEditPerms(u) {
  openModal('Permissões de acesso', `
    <p style="font-size:13.5px; color:var(--ink-2)">Editar o acesso de <strong>${esc(u.name)}</strong>.</p>
    <div class="field"><label for="ep-role">Perfil</label>
      <select id="ep-role">
        <option value="usuario" ${u.role !== 'admin' ? 'selected' : ''}>Usuário</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador (acesso total)</option>
      </select></div>
    <div id="ep-perms">
      <label style="font-weight:600; font-size:12.5px; color:var(--ink-2); display:block; margin:6px 0">Permissões por página</label>
      ${permMatrixHTML(u.permissions)}
    </div>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Salvar', cls: 'primary', onClick: async () => {
        const role = $('#ep-role').value, permissions = readPermMatrix($('#ep-perms'));
        try { await api(`/api/users/${u.id}/permissions`, { method: 'PUT', body: { role, permissions } }); closeModal(); toast('Permissões atualizadas.'); renderUsuarios(); }
        catch (e) { modalError(e.message); }
     }}]);
  const roleSel = $('#ep-role'), permsBox = $('#ep-perms');
  permsBox.style.display = roleSel.value === 'admin' ? 'none' : 'block';
  roleSel.onchange = () => { permsBox.style.display = roleSel.value === 'admin' ? 'none' : 'block'; };
}
function openReset(u) {
  openModal('Redefinir senha', `
    <p style="font-size:13.5px; color:var(--ink-2)">Gerar uma nova senha para <strong>${esc(u.name)}</strong>. A senha atual deixará de funcionar imediatamente.</p>
    ${pwGenFieldHTML('Nova senha')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Redefinir', cls: 'primary', onClick: async () => {
        const password = $('#gpw').value;
        try { await api(`/api/users/${u.id}/reset-password`, { method: 'POST', body: { password } }); closeModal(); showGeneratedPassword(u, password); }
        catch (e) { modalError(e.message); }
     }}]);
  wirePwGen();
}
// ============================================================
// CONFIGURAÇÕES (categorias e centros de custo)
// ============================================================
const CFG_TYPE_LABEL = { despesa: 'Categorias de Despesa', receita: 'Categorias de Receita', fornecedor: 'Categorias de Fornecedor' };

async function renderCategorias() {
  const data = await api('/api/settings/manage');
  const c = $('#content');

  const section = (type, items) => {
    const rows = items.filter(x => x.type === type);
    return `<div class="card cfg-card">
      <h3>${CFG_TYPE_LABEL[type]}</h3>
      <div class="cfg-add-row">
        <input type="text" placeholder="Nova categoria…" data-newcat="${type}">
        <button class="btn sm primary" data-addcat="${type}">+ Adicionar</button>
      </div>
      <div class="cfg-list">${rows.length ? rows.map(x => `
        <div class="cfg-item ${x.active ? '' : 'inactive'}">
          <span class="cfg-name">${esc(x.name)}</span>
          <span class="badge ${x.active ? 'ok' : 'off'}">${x.active ? 'Ativa' : 'Inativa'}</span>
          <div class="cfg-actions">
            <button class="btn sm" data-catedit="${x.id}">Renomear</button>
            <button class="btn sm" data-cattoggle="${x.id}">${x.active ? 'Desativar' : 'Ativar'}</button>
            <button class="btn sm danger-ghost" data-catdel="${x.id}">Excluir</button>
          </div>
        </div>`).join('') : '<div class="empty">Nenhuma categoria cadastrada.</div>'}</div>
    </div>`;
  };

  c.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>Categorias e Centros de Custo</h3>
      <p style="font-size:13.5px; color:var(--ink-2)">Gerencie aqui as categorias de despesas, receitas e fornecedores, além dos centros de custo.
      Essas listas alimentam os formulários de <strong>Contas a Pagar</strong>, <strong>Contas a Receber</strong>, <strong>Fornecedores</strong> e <strong>Orçamento Anual</strong>,
      e toda movimentação lançada com elas aparece automaticamente em <strong>Orçado x Realizado</strong> e <strong>Relatórios Gerenciais</strong>.
      Categorias <strong>desativadas</strong> somem das opções de novos lançamentos, mas continuam valendo para o histórico já registrado.</p>
    </div>
    ${section('despesa', data.categories)}
    ${section('receita', data.categories)}
    ${section('fornecedor', data.categories)}
    <div class="card cfg-card">
      <h3>Centros de Custo</h3>
      <div class="cfg-add-row">
        <input type="text" placeholder="Novo centro de custo…" id="cfg-newcc">
        <button class="btn sm primary" id="cfg-addcc">+ Adicionar</button>
      </div>
      <div class="cfg-list">${data.costCenters.length ? data.costCenters.map(x => `
        <div class="cfg-item ${x.active ? '' : 'inactive'}">
          <span class="cfg-name">${esc(x.name)}</span>
          <span class="badge ${x.active ? 'ok' : 'off'}">${x.active ? 'Ativo' : 'Inativo'}</span>
          <div class="cfg-actions">
            <button class="btn sm" data-ccedit="${x.id}">Renomear</button>
            <button class="btn sm" data-cctoggle="${x.id}">${x.active ? 'Desativar' : 'Ativar'}</button>
            <button class="btn sm danger-ghost" data-ccdel="${x.id}">Excluir</button>
          </div>
        </div>`).join('') : '<div class="empty">Nenhum centro de custo cadastrado.</div>'}</div>
    </div>`;

  // --- Categorias: adicionar ---
  c.querySelectorAll('[data-addcat]').forEach(b => b.onclick = async () => {
    const type = b.dataset.addcat;
    const input = c.querySelector(`[data-newcat="${type}"]`);
    const name = input.value.trim();
    if (!name) return toast('Digite o nome da categoria.');
    try { await api('/api/settings/categories', { method: 'POST', body: { type, name } }); toast('Categoria adicionada.'); await loadSettings(); renderCategorias(); }
    catch (e) { toast(e.message); }
  });
  c.querySelectorAll('[data-newcat]').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') c.querySelector(`[data-addcat="${inp.dataset.newcat}"]`).click();
  }));

  // --- Categorias: renomear ---
  c.querySelectorAll('[data-catedit]').forEach(b => b.onclick = () => {
    const id = b.dataset.catedit, cur = data.categories.find(x => String(x.id) === id);
    openModal('Renomear categoria', `${fld('cfg-catname', 'Nome', 'text', cur.name)}`,
      [{ label: 'Cancelar', onClick: closeModal },
       { label: 'Salvar', cls: 'primary', onClick: async () => {
          const name = $('#cfg-catname').value.trim();
          if (!name) return modalError('Informe o nome.');
          try { await api(`/api/settings/categories/${id}`, { method: 'PUT', body: { name } }); closeModal(); toast('Categoria renomeada — os lançamentos existentes foram atualizados.'); await loadSettings(); renderCategorias(); }
          catch (e) { modalError(e.message); }
       }}]);
  });

  // --- Categorias: ativar/desativar ---
  c.querySelectorAll('[data-cattoggle]').forEach(b => b.onclick = async () => {
    const id = b.dataset.cattoggle, cur = data.categories.find(x => String(x.id) === id);
    try { await api(`/api/settings/categories/${id}`, { method: 'PUT', body: { active: !cur.active } }); toast('Situação atualizada.'); await loadSettings(); renderCategorias(); }
    catch (e) { toast(e.message); }
  });

  // --- Categorias: excluir ---
  c.querySelectorAll('[data-catdel]').forEach(b => b.onclick = () => {
    const id = b.dataset.catdel, cur = data.categories.find(x => String(x.id) === id);
    openModal('Excluir categoria', `<p>Deseja excluir a categoria <strong>${esc(cur.name)}</strong>? Se ela estiver em uso em algum lançamento, será necessário desativá-la em vez de excluir.</p>`,
      [{ label: 'Cancelar', onClick: closeModal },
       { label: 'Excluir', cls: 'primary', onClick: async () => {
          try { await api(`/api/settings/categories/${id}`, { method: 'DELETE' }); closeModal(); toast('Categoria excluída.'); await loadSettings(); renderCategorias(); }
          catch (e) { modalError(e.message); }
       }}]);
  });

  // --- Centros de custo: adicionar ---
  $('#cfg-addcc').onclick = async () => {
    const name = $('#cfg-newcc').value.trim();
    if (!name) return toast('Digite o nome do centro de custo.');
    try { await api('/api/settings/cost-centers', { method: 'POST', body: { name } }); toast('Centro de custo adicionado.'); await loadSettings(); renderCategorias(); }
    catch (e) { toast(e.message); }
  };
  $('#cfg-newcc').addEventListener('keydown', e => { if (e.key === 'Enter') $('#cfg-addcc').click(); });

  // --- Centros de custo: renomear / ativar / excluir ---
  c.querySelectorAll('[data-ccedit]').forEach(b => b.onclick = () => {
    const id = b.dataset.ccedit, cur = data.costCenters.find(x => String(x.id) === id);
    openModal('Renomear centro de custo', `${fld('cfg-ccname', 'Nome', 'text', cur.name)}`,
      [{ label: 'Cancelar', onClick: closeModal },
       { label: 'Salvar', cls: 'primary', onClick: async () => {
          const name = $('#cfg-ccname').value.trim();
          if (!name) return modalError('Informe o nome.');
          try { await api(`/api/settings/cost-centers/${id}`, { method: 'PUT', body: { name } }); closeModal(); toast('Centro de custo renomeado.'); await loadSettings(); renderCategorias(); }
          catch (e) { modalError(e.message); }
       }}]);
  });
  c.querySelectorAll('[data-cctoggle]').forEach(b => b.onclick = async () => {
    const id = b.dataset.cctoggle, cur = data.costCenters.find(x => String(x.id) === id);
    try { await api(`/api/settings/cost-centers/${id}`, { method: 'PUT', body: { active: !cur.active } }); toast('Situação atualizada.'); await loadSettings(); renderCategorias(); }
    catch (e) { toast(e.message); }
  });
  c.querySelectorAll('[data-ccdel]').forEach(b => b.onclick = () => {
    const id = b.dataset.ccdel, cur = data.costCenters.find(x => String(x.id) === id);
    openModal('Excluir centro de custo', `<p>Deseja excluir <strong>${esc(cur.name)}</strong>? Se estiver em uso em algum título, será necessário desativá-lo em vez de excluir.</p>`,
      [{ label: 'Cancelar', onClick: closeModal },
       { label: 'Excluir', cls: 'primary', onClick: async () => {
          try { await api(`/api/settings/cost-centers/${id}`, { method: 'DELETE' }); closeModal(); toast('Centro de custo excluído.'); await loadSettings(); renderCategorias(); }
          catch (e) { modalError(e.message); }
       }}]);
  });
}

// ============================================================
// CONFIGURAÇÕES (dados da empresa + log de auditoria)
// ============================================================
async function renderConfig() {
  const [company, log] = await Promise.all([
    api('/api/company').catch(() => ({})),
    api('/api/audit-log').catch(() => [])
  ]);
  const c = $('#content');

  c.innerHTML = `
    <div class="dash-section-title">Dados da empresa</div>
    <div class="card" style="margin-bottom:16px">
      <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:14px">Essas informações aparecem no cabeçalho e rodapé dos relatórios em PDF gerados pelo sistema (ex.: Contas a Pagar).</p>
      <div class="form-row">
        ${fld('cfg-legal', 'Razão social', 'text', company.legal_name || '')}
        ${fld('cfg-trade', 'Nome fantasia', 'text', company.trade_name || '')}
      </div>
      <div class="form-row">
        ${fld('cfg-cnpj', 'CNPJ', 'text', company.cnpj || '', 'placeholder="00.000.000/0000-00"')}
        ${fld('cfg-phone', 'Telefone', 'text', company.phone || '')}
      </div>
      <div class="form-row">
        ${fld('cfg-email', 'E-mail', 'email', company.email || '')}
        ${fld('cfg-address', 'Endereço', 'text', company.address || '')}
      </div>
      <button class="btn primary" id="cfg-save-company">Salvar dados da empresa</button>
    </div>

    <div class="dash-section-title">Log de auditoria</div>
    <div class="card">
      <p style="font-size:13.5px; color:var(--ink-2); margin-bottom:12px">Registro de toda ação de escrita realizada na plataforma — data, hora, usuário e ação. Mostrando os 500 registros mais recentes que atendem aos filtros.</p>
      <div class="toolbar" style="margin-bottom:14px">
        <input type="search" id="al-q" placeholder="Buscar por usuário ou ação…">
        <div class="date-range">
          <label>De <input type="date" id="al-de"></label>
          <label>Até <input type="date" id="al-ate"></label>
        </div>
        <button class="btn" id="al-filter">Filtrar</button>
        <button class="btn" id="al-clear">Limpar</button>
      </div>
      <div id="al-list"></div>
    </div>`;

  const drawLog = rows => {
    $('#al-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl-audit">
      <colgroup><col class="c-audit-data"><col class="c-audit-user"><col class="c-audit-acao"></colgroup>
      <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="white-space:nowrap">${new Date(r.created_at).toLocaleString('pt-BR')}</td>
        <td style="white-space:nowrap">${esc(r.user_name)}</td>
        <td>${esc(r.action)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Nenhum registro encontrado para os filtros aplicados.</div>';
  };
  drawLog(log);

  $('#cfg-save-company').onclick = async () => {
    const body = {
      legal_name: $('#cfg-legal').value, trade_name: $('#cfg-trade').value, cnpj: $('#cfg-cnpj').value,
      phone: $('#cfg-phone').value, email: $('#cfg-email').value, address: $('#cfg-address').value
    };
    try { await api('/api/company', { method: 'PUT', body }); toast('Dados da empresa atualizados.'); await loadSettings(); }
    catch (e) { toast(e.message); }
  };

  const applyLogFilter = async () => {
    const params = new URLSearchParams();
    if ($('#al-q').value) params.set('q', $('#al-q').value);
    if ($('#al-de').value) params.set('de', $('#al-de').value);
    if ($('#al-ate').value) params.set('ate', $('#al-ate').value);
    try { drawLog(await api('/api/audit-log?' + params.toString())); }
    catch (e) { toast(e.message); }
  };
  $('#al-filter').onclick = applyLogFilter;
  $('#al-q').addEventListener('keydown', e => { if (e.key === 'Enter') applyLogFilter(); });
  $('#al-clear').onclick = () => { $('#al-q').value = ''; $('#al-de').value = ''; $('#al-ate').value = ''; drawLog(log); };
}

function confirmAction(label, fn, okMsg) {
  openModal('Confirmar', `<p>Deseja realmente ${esc(label)}?</p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar', cls: 'primary', onClick: async () => {
        try { await fn(); closeModal(); toast(okMsg || 'Concluído.'); renderUsuarios(); }
        catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// Anexos (boletos, notas fiscais, comprovantes)
// ============================================================
const KIND_LABELS = { boleto: 'Boleto', nota_fiscal: 'Nota Fiscal', comprovante: 'Comprovante', contrato: 'Contrato', outro: 'Outro' };
const KIND_ICON = { boleto: '🧾', nota_fiscal: '📄', comprovante: '✅', contrato: '📑', outro: '📎' };
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const pageForType = t => ({ payable: 'pagar', receivable: 'receber', viatico: 'viaticos',
  colab_cnh: 'viaticos', colab_veiculo: 'viaticos', colab_seguro: 'viaticos', contrato: 'contratos' }[t] || 'receber');

function readFileAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(file);
  });
}
function b64toBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
// Abre uma prévia do anexo dentro do próprio sistema (PDF/imagem embutidos
// num modal largo), em vez de depender de uma aba nova do navegador — evita
// os bloqueios de pop-up/segurança e deixa a pessoa ver antes de decidir
// se baixa ou imprime.
async function openAttachmentFile(attId, parentType, parentId, parentLabel) {
  try {
    const r = await api(`/api/attachments/file/${attId}`);
    const blob = b64toBlob(r.data, r.mime_type);
    const url = URL.createObjectURL(blob);
    // Lista explícita em vez de "image/*": SVG é uma imagem que EXECUTA script
    // e, exibido em <iframe> por blob: URL, rodaria na origem do ERP
    // (auditoria 2026-07-29, achado C4). O que não está aqui só é baixado.
    const previewable = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(r.mime_type || '').toLowerCase());
    const body = previewable
      ? `<iframe id="att-preview-frame" src="${url}" class="att-preview-frame"></iframe>`
      : `<div class="empty">Pré-visualização não disponível para "${esc(r.file_name)}". Use "Baixar" para abrir no seu computador.</div>`;

    const voltar = () => { URL.revokeObjectURL(url); openAttachments(parentType, parentId, parentLabel); };
    const baixar = () => { const a = document.createElement('a'); a.href = url; a.download = r.file_name; a.click(); };
    const imprimir = () => {
      const ifr = document.getElementById('att-preview-frame');
      if (ifr && ifr.contentWindow) { try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch { toast('Não foi possível imprimir. Tente baixar o arquivo.'); } }
    };
    const btns = [{ label: 'Voltar', onClick: voltar }, { label: 'Baixar', onClick: baixar }];
    if (previewable) btns.push({ label: 'Imprimir', onClick: imprimir });
    btns.push({ label: 'Fechar', cls: 'primary', onClick: () => { URL.revokeObjectURL(url); closeModal(); } });

    openModal(r.file_name, body, btns, { wide: true });
  } catch (e) {
    toast(e.message || 'Não foi possível abrir o anexo.');
  }
}

function updateAttBadge(type, id, n) {
  const b = document.querySelector(`[data-att="${type}:${id}"]`);
  if (b) b.textContent = '📎' + (n ? ' ' + n : '');
}

function openAttachments(type, id, label) {
  const editable = canEditPage(pageForType(type));
  // Tipo já sugerido pelo contexto: em Contratos o anexo esperado é o próprio
  // contrato assinado, não faz sentido a pessoa ter de escolher "Outro" e trocar.
  const kindPadrao = type === 'contrato' ? 'contrato' : 'outro';
  const opt = (v, t) => `<option value="${v}"${v === kindPadrao ? ' selected' : ''}>${t}</option>`;
  openModal('Anexos — ' + label, `
    ${editable ? `
    <div class="att-upload">
      <div class="field" style="margin:0">
        <label>Adicionar documento</label>
        <div class="att-upload-row">
          <select id="att-kind">
            ${opt('boleto', 'Boleto')}
            ${opt('nota_fiscal', 'Nota Fiscal')}
            ${opt('comprovante', 'Comprovante de pagamento')}
            ${opt('contrato', 'Contrato assinado')}
            ${opt('outro', 'Outro')}
          </select>
          <input type="file" id="att-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.xls,.xlsx,.docx">
          <button class="btn primary" id="att-send" type="button">Anexar</button>
        </div>
        <small style="color:var(--muted)">Até 3 MB por arquivo (PDF, imagem, XML, planilha…).</small>
      </div>
    </div>` : ''}
    <div id="att-list" style="margin-top:${editable ? '16px' : '0'}"><div class="empty">Carregando…</div></div>`,
    [{ label: 'Fechar', cls: 'primary', onClick: closeModal }]);

  const loadList = async () => {
    try {
      const items = await api(`/api/attachments/${type}/${id}`);
      updateAttBadge(type, id, items.length);
      const box = $('#att-list');
      if (!box) return;
      if (!items.length) { box.innerHTML = '<div class="empty">Nenhum documento anexado.</div>'; return; }
      box.innerHTML = items.map(a => `
        <div class="att-item">
          <span class="att-ico">${KIND_ICON[a.kind] || '📎'}</span>
          <div class="att-info">
            <div class="att-name">${esc(a.file_name)}</div>
            <div class="att-meta">${KIND_LABELS[a.kind] || 'Outro'} · ${fmtSize(a.byte_size)} · ${brDate(a.created_at.slice(0, 10))}</div>
          </div>
          <div class="att-act">
            <button class="btn sm" data-attview="${a.id}">Ver</button>
            ${editable ? `<button class="btn sm danger-ghost" data-attdel="${a.id}">Excluir</button>` : ''}
          </div>
        </div>`).join('');
      box.querySelectorAll('[data-attview]').forEach(b => b.onclick = () => openAttachmentFile(b.dataset.attview, type, id, label));
      box.querySelectorAll('[data-attdel]').forEach(b => b.onclick = () => {
        openModal('Excluir anexo', '<p>Deseja excluir este documento? Esta ação não pode ser desfeita.</p>',
          [{ label: 'Cancelar', onClick: () => openAttachments(type, id, label) },
           { label: 'Excluir', cls: 'primary', onClick: async () => {
              try { await api(`/api/attachments/${b.dataset.attdel}`, { method: 'DELETE' }); toast('Anexo excluído.'); openAttachments(type, id, label); }
              catch (e) { modalError(e.message); }
           }}]);
      });
    } catch (e) {
      const box = $('#att-list'); if (box) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  if (editable) {
    $('#att-send').onclick = async () => {
      const input = $('#att-file'), file = input.files[0];
      if (!file) return toast('Selecione um arquivo.');
      if (file.size > 3 * 1024 * 1024) return toast('Arquivo acima do limite de 3 MB.');
      const btn = $('#att-send'); btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const data = await readFileAsBase64(file);
        await api(`/api/attachments/${type}/${id}`, { method: 'POST', body: {
          file_name: file.name, mime_type: file.type || 'application/octet-stream', kind: $('#att-kind').value, data
        }});
        toast('Documento anexado.'); input.value = '';
        loadList();
      } catch (e) { toast(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Anexar'; }
    };
  }
  loadList();
}

// ============================================================
// Auxiliares gerais
// ============================================================
function confirmDelete(what, url, refresh) {
  openModal('Confirmar exclusão', `<p>Deseja realmente excluir este ${what}? Esta ação não pode ser desfeita.</p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Excluir', cls: 'primary', onClick: async () => {
        try { await api(url, { method: 'DELETE' }); closeModal(); toast('Excluído com sucesso.'); refresh(); }
        catch (e) { modalError(e.message); }
     }}]);
}

function exportCSV(name, headers, rows) {
  const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exportado.');
}

// Carrega uma imagem do próprio domínio e devolve como data URL (base64),
// necessário para embutir a logo no PDF via jsPDF.
function loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Logo ProAgro Seguros embutida em base64 (usada no cabeçalho do PDF de
// Contas a Pagar) — evita depender de requisição de rede na hora de gerar o PDF.
const LOGO_PROAGRO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAACLCAMAAACKjRdGAAAA/1BMVEUgWCZelTtckDgcZDBVdS4dazNen0FcjzNYkzxrbGsPNBpGfDRwrEGp/lUVajQAqVQAfn6qqlX//////wA7ikBkoUD//385sztsqEcA//9CfTeCxEpx5B44gTty1lgA/384gTtAfjmZzDN/wUmAv0j/AAAAAH8zzDOZmTMAAAB3s0RrqEIoejoYczkRbTZYmUA0gjxVqlVIij1UlD4+fj4A/wAAfwB/vz9//39roj1/fwBgnkAAfz8AVVVspD4rdzgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACPspqcAAAAQHRSTlMenl9gG57uI9QCCWSgA84DAgMBAf5bAgYWAZ7/A6MHAszIBf//AQIFBQD+/Pz9/P39A/v5BAECBAKvAv0EA8/MGTbc+wAANdZJREFUeNrtnQ1X4zi2rhXHiWNDgJDqKqq7p3tmzjn3XpWBYGI7iUnC//9XR9/asiRLDlTPrHVHa800BZasj0fv3tqSbYStlNL/y5LJ9Xnx40Npgit0iLzydzwyVZk77dKq82X5fXQWO+W7e9FN2cNDlvKf17sKj04dv/vv+ficuz3/AZE6PDykhfj9QC0+pe3VTiLyoNt+v3M2AFmZKVWTc/njE1KGk+grLxgZf1pWPylLdc8mXXKYn0vaReV5fkiSjLL1qQ0YrAOlKk2Syfy8YHUoz+frCa8FXv287pKCQ9vObyvbvq+CYJErUDL/8UkpHqwD3o/qinucXLtTkiSsB9Kml2WPfwlk2TWhIWWTbm5NunI+ycSf45WvycTts1Ftp2hnybVj4pdnby2GuosrTxq678rb9sR5VxOsJcYAq7JcnMckdlP4jxQXZFoFE82WjBuWPT7/5qWUjHNSWG3d4euhLIcEBdCgf0yufSXMHbccLu3Aq/PbeQRYHbk0OfjNCa3F2rZtX/FiuLtwuO1+wSmvSf517ger41ixapdE5dIMjRnsK5r1IP9FnKsyxeuYjIfxkrXHAedtTkRo3wdrOEs5SfF9MzRlh7V8nowgq8PZBX4ArUOw4RjXNliTH+VwrmJgAJo9LsJtX/nAqoi+UJliVKGRZnqN05LUvZQenQArfbjX6eu9K+dX3sXJKPcgCBa5e8KmSjxYdhZ70oUHNdIVXpKh1n5AZNO/4jRiMTS3Qf0K7ja+7lVU2zMzPwKzIeVyRWcuGbpd1a2b6JHOyEiXFI9a9BsHy9vNTQduPF6yIsAiRRbw/hFgkSzIXeWaTbqI5S2y5cKVWjoPFc8p+XeMyOEkbk2V4PvRYPW7C3IVt7afGIKNdL+TWlO5olhVVTNOsEhumjnBO9kSDhZR7olMh0Omat5hzVEmJav6ZLB+m6e4GQfWj7lzkHds0sUkMnF3kf0FQYjIQxzWQ+yqaYKbZjRYv52RS0l2OIttewqGEMGWllzRdt1IO0jKy7iDtcMarLLMgCMhaq7ENTX82LGSFQUWnYSrcWCVP85o3wxjIBY25/PhcOZBB5g/jpI1OsMRQeuILrbY5nU4nO2l2m+HdD8arB//daCrN1fby5i2kz+AWYXkdKB6xaR8Fy9WTZdXVd413T49MwdLLUgkWOaAlIgrSEYnQaLkqxrvZWmwSqKEIk2stv420WVqsEJZqhBX5wlZ2Ai5TZPJvG+IduMEi2ZZjuWK+MEyRInSrL9SnPjAuqjt8CqyhEzFfVPS9tKcVZkSDCSHtuSzLdYeNdVuBcIkE557hQfBmuCcc5XwxdDewGSMZGmwJuZaBPViPNqR1WBdm1n6w9K3yWmvbw8Jj3Tf7/fClekNaxKMCt3js0lqqOk55ao0F72iDjIIDysx6TlZGiyzu1J/dzlnAKEZm21HvVWqKgBxjycVXEXKVbWUY5I9ZGnKHawJmKkQrOssEfsHcvJxdcxw3pesajxYh/1yz9O9HOds4oq8ArD2+36WdKLZ6Y1yZdrza9qK5aprpGivaKuzw5h9hF6R4RzNHp1l/Uq+gsNVmsvBWlfpClbCMmkALEd3HWB3VWZFDa4OGds3Am2n94GRT+pX5xqsFT5zrrIosVrxLYXDvGSxibKcl8zBAjsDBlggJsGYSIQvkpuXj5EsAJbZiV1FjUAChyy3FcvovbZKKyxgt0e5u0/1X1hAwt7AqFZwwUYuz+67QHDU2nlYDZvOA+CK+Cv2xgKoxAF/bbxgmXa6q3ZGd5UZXBl21JAZwZhV5doJgIvVecp9VCS4ZEu6qJ1gUnQhZbdkif2X4bx3+VjX1UPFUs4Ni7S6v1tTOF6yvGCx/vgn6Crl8XjBYll+B1mMzq/0mLJ1z9655ZrvgQ9U9ie+HRwVJc7POuLQDcVFzTWkx9R2SxbnOhT7NY4Ei2X7w9VdTEEKYLGvU7zqPJtMmdH2lQAr44ZwErVOzmVsnxP1Q/P1o6RWYuVSrJ0RGTz8t712GutlDYKFCbMHyxYOgoXxP/XC6Qw8FMMYHAq/ppvRgMGFyE7e6rdJFuPxG5ZzMJ5BgJucHaG4QbAw/sPRXezXEyNKlfobhA59HxXRQZow47iPiDIIueVQlYv5fDKZz8UeOynjkGJuBPxgrZnf2re6YyUrAFbVZf2VaAisrlOyDwKW3RoEMg8Y54NT7gBinmtvb/5Pk2qjKyXhPBBx2KurSqqZu+EgqivEGwCrWmcgWNu4eJ7gITwqs+0dq4YyhOHFfsNFjxk/suyUW4lFxpbcDC2xrjTA2j3kTQ+sh75F+TpOsgJgibsIryGPAQuu1LSTtQKG8IyHPacOBtcGWqJXWgfg3viXklo02YrnW3CU8FiwSDrbTpbZnFU7vCsArOaEDgki3X6ONIQ5ltH5csIFZ7n7fblb3sslN0Xrmk0ptutpOO/5crerCPUCrP7cHylZIbCWulNkkSGwdlr41SDvwaQt04iYQBmxzmvUGFBvqQxGHNZgzCJiZA0eD5bRXbntBJyD5qwCbS+zpsOoJp4kSVmTh712dBCyRPp9+U+jZku+bOWitTPAmicqlEe76SsDy7rduB3DEFgOSsJg2epRAS8jCe8CwrHwtkR74gvU7PSI+kjc+ZYVI1IILKO7qr4Bjjp/YVZzhdGKeViTcM41i9GVfI/6Dx5xELuA7KjXjkU0OFnpshcgLak3RgEruOr+ge/3ux3d575MssJgJePB+qWfBS63o8YUDFCZeRwyPWATepY4CUUc7rVgndGq+dlg/SIugB5WZNsP0FFDbElIBCs0nt06Y9jQ4NwDPcQId6j4EcqllLQJX1CU9gnSsjyzXYBES9j96oIdw79GsSAnA944CIkBX3/i3qbRA0a6pwWenSfiUBmxgItOHl+kWCvAiWP71LEibTJosRF13YmBX4dlnho3eq7kgQaqSxnEUqEsGu2/J04YJ2uJkusMr9OzZ7O3PB/oOe00A6yMkKywjzX5kI8lBlCLxSS4m9e/7wJ5LOEBSpSB8855/SR64+disJZ6g14IbQN8piSu7QBFwhNiljC8u8XBotGMB1xMShXGkv8vbOQfwr2fqD7IkuT6YG+Ea8DmibEwjOu9+FXhj9hVIdjXFlmAWMT4oEzXGzge1VBwlP8dDOAcNS5XHBaY/iSw7FVhCtqeNlEGuGrgoViE5swZ2oeHMpuXhJcUM5NINYpIzkOWPSSJ0C/qXf3BTSvphIc0N3d6k+vJee54ouy3A8pBxaK6LwBW3qVWYCYYx1IjKLUGaFh0HATs1jjHUJcprIShrbuhoHuZ4ubngAXCfmdxjyVsxzLuLp2ezQkZcULEOe4gcpHitToPyB/OkPY14SJGKsHj+GUp52uV7nZfwZUZdfmvjcfLfhMsVfGSFQDrnw4kAmA9wCzLfmQraSLFIm2SHyY5PQVKSxMjcGbN1XID7gs9rCBY/3TMhuI82rPbwZUIShgOqygg8Z6fFCVOGbVf+11dVXnF9jFpsIGT9YBTpl6pEU7syGW75RoARheV19xGipH+vYn2sj57r7D5A2f9czNrbYUiDw9bmTp/36snTXJXYBaEbQ8ft4SBvULYXcILABZ7EX1XkKlM0SR6m5AsevgBmbKcFAQNMB8b+hCl9K4emAfviWC0OQVsD7Su1Jtzq2jJ8oLV5Klx1CDidAPO6cEAHVg4F+v+euwc97hRX+bsHtDBTmVgdkMRh2aY0w+DJbrLir4ZYZARSwbtqqFI313ejq0BXecB85WIc03YQb7QJlHTURu54hNcgpVHHyUFYC1V+ipOGMHDVc7zWMs/hrLoZWRyQWDSFcB3eUxAnQaEsQOheeTxsPKlK3nOvE/s7spA2zPV9smoA/l2AB9dA38otKWzTgVXmWeP+8y9qz9YaOIccZKbr6LUcQJ+RuUcs5RwnyDFqHccNHyCVGYp+0deLuvcQRx1tcEJiuUAihEB1FGK9d+D3aWPJht7PPUFbU/QgqCQxikWOwbh5Yo+I5WeKXjpas/crIj4R2coFuGMWaQw6HqE5geQznMzruE58w5yTA5GFkJ1mrf9DGPOthooLH3BUYhqrn9rPVWRBlVzj5Prg52ujcC/VqyB7qIPksins/ZwqymPbTus7Qiwau5gDZwzrbnfPhHR1AVqRoKF+QZTWLIin9I5p/rMW8xTOiX0ZL7qwNYI9wZ4sIf+431am8rU3Zi+ZIGh+sUNFinT9fT8b7/AubCPeEqHHcnp1Bpk7jxTGj+pRoC1ptcyF2pQC1l5FWLSFaxTH6wqcmEIoplG/B88cFAaPcXBKh1Z9IHF0nw0Trrh5UiwHqRRPVt2nx+eZculpZOes/VegCRgkpbcjPTTDwuscrC76CgYrZyLXy9QfPRMPjtB/nfNfKyrGLVbCWgGDyVVeCFWhhO6UG3+ZyRYsV5WULFot5mPNWuwfGLFclTWGmccWI3u3LNr2kkZMBqIFrJqvYhDJFiO1njA8nbWD7LShxRIxVoU8a4cAGuOJsy6RSjWWjBTBejjUpWjySQLB38ssLKGPfoakqxBsETjEvPA5xBYXLSs1xd8MlhrpBcI+/5KsjROjP+VYLnb/kGwzhSsqHBDzvynMm26wGULRuq3EVUxDpnHeVluUyjO3stXx5gPjLtMIeja8kxfuNI4IlKjTeEPtyk0IFlZflkpHvDpvckkdMS0bwpDYDnbTt9D1OtwaQrLS00hj7yHweLuU/Dc1o5JFt2DrpZO+9rQACk9ieUBK25hqMAqnfrjetmVAsuRhT7ei/s5Vh913nuPjWpQZQjWaI6omxnZUO5X6Qt5LJ1+uQ8sV9sTR9vXelI9XOi8XxEOFvg+JtZApagJBDVaJmwL3+ZjruvPHs+jYJUGWOIYxXnY7WMjwebdfGIk9o46qt7LBjvAEscwZCrlb0iO+8qbYXS4gWczww1y16J0MLLTfzPjoLX+w8QPVpzzzotXbVc3xI5HJVWGcmy4QdYWpcR0LWK2wgpy4Vv4wobZQvdZ1mbPzp1eT67ZLNl3TrBiJEuDNXG6eo6TlpoTHSCd6FH7f84Yuo+E4MKY32dnECer7BDANXXf5b1SE9NSYurxDlKYMjlXPGDp7jrotmcDuI4NkMpciAtRMHPOjsYvYsL63gJzulVdwtcAVBKsvWGCuGT9HgXWYWfsZOx2aZV7Wq3A2vEtnYdlWg5o0i6oFr4tHRcie6zG/GB7HiCX0RkdVlWcRwWx0xBYorv+2GdSWF1735e1falpJWBxn6gKgnUlfKcwtQysncNIwIOn1A6n7JBNP0afNxn/XRWnWMvYEdeKVRkRFD5s1vFbGhEH5mLEJrQCq/JogMPzUNgZ49xgpMy1L1LZdCAFwZIDs4Qor1wGPaSUjoTOSpQRG9m3oOtfCbCCo1gLUnd2CfKEoFyd0IjAMmPtM06UV+GF4eeAhXN2zNFTzlpP/3jvvTMytb0oxBClwCyvHA2Nsscdjgary+WlrqhAazSjiW17plbmCN2L+EAdA9Z1uG0+sIQpoC+NTpKEvkiek7VPrTM2EZL1SWCBielwCw3xiTyVtGu0Gw6FCdiW8nyeW4m+Pa10UAzd+vC7NUaABdcFridFigvaDmUOcdO1QF2cYl0KFntWXZ4QZNJ/YGRle7kLZEnWYkCyYE99ACyxqekxCD7HJ2q52nNO1tJKlP5AZemQJm2Py4hduzFg4b1mx3aFgKWMPlaxhhMR0f0EJlmrKLD2cWBZ0sabRhcl611d1fS7IezQFh2xRf+sYReUrM8C6/cmA+O5ci1YxKDGPkwBy6scC/Fw6j1VodeL4YO+o8DScu3oakPPmqjjsxWYAyl7d8OkfCNe1n0bsypch8fPtSpUL4j4qqzQUv6KS2bRWAvDAcn6LLD4nWQH9rdB13BOR01bUNwctijHi2iwTOMD41TBZxtHgQXlem4/OqhdsMh14QoK/Jp47Q3aErImw7swZHmyLctt+KkL6rO9WUcHlSyB6v/OfXSExQmL3NIKv+f3aWBBH9YyCFBn0hjJyptU0WEOYRbPlWl4My2bpMg6DFYZDdZ+DYtOvbawTPMuSrCgMUf8wPHbW8h/XzuBcS05OYBtxwYi36XpLhegpMZ3MeiYMs9BaJwZTRyWrE8Dy4Cn37oWuzmJCGKZXuNXd3jcm+BCQi8hfHHnS8ECGmMXbQK9ixGsM1h+sDf67Rkzm3SQrJpZzOAt6oZQSk1mJ4RO1DL5YZuTpXwGlrv7K9tX8XL8eWARH3aht1P2PnWPWhwBSI3GdgDQwGEfOzMslFSw+0SwMJDrRd/W7wF1EdH3ndH2pXxVZPm2KRf10HxgF5XbIhjvmpSbku4SoJRFNui2VIb589a9jcaq4TvgrOSeHZJe1u8/HSz5hIjLk+q0aWPHF0NtN67OXWaFxlq8aQJyt84FZWBijwVrZfjvtde0heN4tdF24u0j4QGVmw3dOh4Ck7hCm5AtJE7G5u2NiF+TELyQeEcG0dk5U9vcEVBbpDjdbvob4RUfUp9MfCJYwIe1DQKULOIN7odH1SAAhM8buiEriRlKC5c81sBYDx/gHQ0WPZipbfd9jj39QmZ46HW96fmHsbxGSo3eGFnfBm0huaTY44DBpJD8zgxnKsSA3IpvdXe9BQHr8Afilm2sbUhxbN4zlheAlfrAkg8fufz3NtcTkZ55q4f6FjpS0N8FgUPSM7UvVQ+6AONxAWiU6MK6+0ywMm/bQb8wu5IPDTuYU2f28QIkKkQla1NuM/+rJlvqllPJQsPRrg295oECthFg/VhkTrBIN7yV5byiy1Jru7KTklX9bLB6ntTK8gA0WchviYjtN4a/gsHRRRmzLZMDcwINUwfiaWyI6zBYZRxYhv/e7+vKkMrCX/Ud0CtZDFLdt6FkbejX7tohNRry8bucmcsFPd+jwWJfUXA9vsg7kooSmkyQIyzC/pr/dLCavRp5IjX71mcQ6GT0jCr9OND5hzsusNJsBp5MANJktHsFw6v0K1p7j3qkFZ2qY8BqgSwt+sGsftvvKzcX/CF4M3CBVACv3G42xCSxj385693kTLIWyOdmtRwnwlO+B2Bd0+k8YQu/2nEQwkdGOiRZ/NjhZWCV1454ldcgYEgdqU5BV769jqnvMRC2/gjttesUCLPWoJQUOlMptLLiKwY2ofRb4GikYkEPzl673KcwCEJfgNa/bUuGFE1K6C/w+yLdJALWZrstt+xzhbWj4jm+mm+2pc/VSO8ZTcyoGWClWSWi6/vehJD7353rO3bVgGRdBlbpAUvUxG0QoIESbzTE+1p896Ppqpo2KpnDETCCvXCtGHrOrtEQm4O8NwNh7N3CqhL0Y1k1c2yKZOEDy7uszNOFd+G7N9peLvinVqy2g6opfwdhQ7JKKlocLVJEXX/bgVRT4aFkOX38Gou/Fg/ZrtpJsN7KyW6X7dItC6/CJc03HsBId+nOmR4youuewK3qqfKTwNJejLU8qczeJd3bM9soWZQmV5U1P4R9uw8t2tW1b6n58RFk7glN7G/gFtkE1MMNliMQCb3IRb9nKkOJHbdNfW1H2u2eE8FacLQ2i0ni9qQmzMe/8oUjNhu5utNg8ZPACffPcqgEGxbyGkh8idl9Clj1AFhiw5QNqG180x5Z5Rt9ySX3JOjLmMyuLU0ntMXK7QnHGTus5cO8OAd/ERCoStDDycmkV41osEDbHY7HrkcWbftVivhdXW2X+RH0BLbEw1rMKVr0/xb0fci/GCn5JWGe2GbS90LvUbJlxnTyS8IuXJDLUobTgmb7hRMJvvlAe0pd70wik8vL2ovOeBsP1psLrG5NKGcFvjkM1soaVZK2C5K21u8Xvdy1HLY3utEVOjKn2vXWf0FBbrgyRiUWC8euUNIHS3bXzrEYfWPtplsm1j438fXsNvLbvjnarm6KQKSAEoNwwlVrs5nPXdtYdPFIw04otwLuNNNmDq4jYM2pfZW/IOip3lqnzPZuhjfNNszy3rsH4I3G3kaBRbM4wWJO5uaN/33iMJV0VFVHvr2BPgX/ID/YH4WmKx5Z1SpcSV2Nnr61bIHw5q4Eaxn8lwMsUYede7fkzVfHmh0SiGy7/eleJVnkp6sJQ2SzEf+BSf2lH0bfzrdWHgYWKIv8fCXuTb/suPXco3e3rePRIL442GxGgsWzuMBqcm7JN1wja8tBw8kb51Ileqn5m/It6ccRaxHI4d0RPoq5VtWwfIBmj6lDY1eiVws22gvjMXTYXTtHlIh4wLLtV45ZhSekaZtA2zfms9QI9yQr/UZfzjdnFo+emWW3s07S9oWaQm9fk96nW/ibzZwoVqMWQHO7XDttnKdbaU9tRU9V48DaOsFibqqYGqSW6z7K7T19FKQcmgUle/q67R/p4sJMlTfmAT0TxLxfxyLZDFeC24BF4u+unfumsu0LZPsJONz2NxpdM84nQlu7mG/nZKDqHSK3mRPn8OrqaksAm1z1U2I1urCvqakuJcavtJdBfIbkKiYlyDEgpKeIFpI0HwOWyOJ7Hbco0lMo/VjmhHoJLh1nC57Ejp7S2Ur/TC6YRz2g19H9rY2vFjkdYobW1ifwxO+aJLj3SR3VNs+xu7wgszzQduZ8+9o+sV7yiLAlWTgnBNMlIvsbqdFmgS9NDf6UtLYpWChtjwZLmoOFMwtdpc5FZ82vHFaLHjAjXsKc655KrMj5dnJF3wLuGDEx0+evca+mrmQ1ibw7zhRULLpBbmhWgg84HXrXywIMU/jNvRUnOZnbQsn2Dem02paetqfY2gpERteSpRwjtkGv9KfmIatSKl5J9VATBxakQvznG011xqNevUStQmf+it69fagzmivNUhSZHMBeMT2lT1RHwtviRGS58mXhZdJrrpxnsOlnasnCHvgI/Cc+ms4NDyTLTK7iqtlpJSdavXZtb1DZWsBKiFqQalyx83WVr7uopWndAqDbnjpNNrutt+25lcUEC0oWsYGoobs0VLKKPEeTzStL235axNsj5lxNNovtYHo1E+mx+PcHfCBFEMrePYFY1GhBq7ZYTEjHskNtf0UNxQ6SIFZXgtbiKmUvHNrX7U9qe7Uf03bUMzBCsnIuWbhqG0S9LDLd0t7CEJrZMW+Krlkodlya22uVHGhgZJJZvAhUhrL6hlXWpCBJZfSOpioyGrxWZWn8LcGgEuoNVnvXRlxkd1WGofGoab13td15T9Q3tUQwCCbc3xKSRX5aIIycrhu9fjNGsITF3Y7hinp5F77jvKtW7GUZVd58nmaQUaru9YD8ZVplmsS61m+1pP/o/hK5zPVt74fajrAlWRtqeLqC/6QlK6WkWadp6VWvqBsjvzWD9nUSnfj96/GdUJkhruXuJyPQ1bvd8us9vt9/3e12ab7G//8m1N9v3TLJyi3JYmDZy8PXCwadStZmi6KvZ/cvxkLRsXUd/XYPS+Ijr64vSVZVtYJp6d4U7wK3c52IWVZ+oezWJDX/agCaPN0tVxVNSzIXRtdnndMvQezqvklA1rqUCxVugWRRehJEh/fb//2mU10Lz37kZ/T4ImGBqjompd/QBfQ2bF1+0F/rpF9IZN+Vqn7G8FS01IJ9HuhwPp8P7GOMnOWPevX8LTL7Xh93xqub4BGUMSax21lDt9+NWIf1TMIKmASE3ZLVCYNFJKvmkjFlimUEV6WVHDtWOSsxNl91gWRV4mOdvXdu8tOsnRkie7i+Nl/B37PE0ur7X53Al+KHedl/mIu/gtJ93pO/KA243p+XhnQSYMHPZ9DPsR2uaR+oubCLYrNbSZPwyy/aJOzWTrDEmNN3NORISBaPam1+3fbBqpS8jQYLiZtEuanNaMlim8bONyj+6H8IqAOf/RpMv/meGKKl8Q+H2Hejb9klMllZPqh8wGIxfFx5hROxtTWBAGbkhk53lI0wYyuE1ppikSXXvUcdy2t2iDAse9QkpOytQfr7zdAk9MHKqC+1JQ6Q8LJepZfFAq0GWJW4NK+ZWLfxwi5EcKRkxcey9vAQtv3ODeMgHn3h//g3KpgdnMz9tyN/OWS2ATa+L+eHIMXJfzlei71zf45CDzAKmXyGxdyeDUrWA581D5oE5B5FqiatlKyGSYYFVi6WkJctGuihrth3A0nJqmL1ajJIiPH45RiwamcHJ+cfw8/Ps3eD+14LMfzpB3BZD6wBksXbyAfe8lI5PuttyPokGyZzxfJ7TULuAIuYKYoQC7/zhSFWkmWAJRQtfchYeshixlxenT1wyYoTIeHlRX6Msgq/KAGQ9TGwaufxOwdaCTZXTfrB+UGw6gvA0k9c5N5SiwFJF3MBDb73zjjo3st7oNMIOT3rVxbLuicLw1flZb1uXw2waKTrdQv2XVDwuBErWmV4jbZuzMt6jZSsGgeH+sdWnx38EFi1eP1lRJp4pCgSrHIkWHx8nZ5SM4iFQWbnm7pJyCTkLrCIZL1uptzLIuPPFoZXlAgIVsV/pVPYiyclvxr7gNtppHWr8a8ErKiFYW42erFgqzp4Ipyex8vHK5bz+J+zgxdusrK1M2sIrNIBVhrz9hrzG1V6luJhLECNC+x5kDB498z1WLOWrA5LyVpTyYBgNQQSY9eF/D10pLtiggU3cxYozro1UrKCC8PmXh4FZucoEyWiiL5yQ5zzhO4yeMz4bWEe8A0pFoPjTR/NLbeE4jTLUJZZzxm89T6FVX8UrBgyFurbi3CxUjjyvjlOsJc/FqnvSGSI6QVCbmFhakK8rKmQLK5PAKwWI+M4XtS4MzpepzrXNDb8XgnJ6iIcLH7y6G3DDgrj/XJX1zsWCEwW/A0VKTyT1OmnaK54aAlsWF3BBz2yHgA1e0kPOA3cezSKP46l/pwYdl8Ts40Da+sG602HGuzHKn64jgqmC31wns0G+rQP4g1nkwEcY3eR1ePqbcEifRN6WAuoe4p8ysJjWUyyfhULw9deHAsmNu7Dj81xe7qJPJd0qZeFturE2hW+BzvvVUXn6rb/Th0CloRj3Efi4SHijTgNfJ/Wedc1XZdWPIBND6nLc/SVReVb8NkddpkNlvQj5bN1qvEoY3C8+Z6+7dhDenoyEKrMAG1GAQGH+K3DWU1HXwAZMAlX9FWRA5JVMcl6JZLFlogmWA3cdqlojlc0OO7fubeP6m8646id6wgvix8k4+nK/sAyGY/+aqejL1ESZ8y7tOu6vIIJtLH/XoMr/WhJuSVYrfvnR9jhloQ9p2B9D42DxQQ0RK/jsh09v8+fOFrtZboX0zqdvClnYFGYc32vTrSyN3WwJ5OrusrZtweqesUA2YJLrDe5qIO47E0fBX3cinWPMAkbaRKQ3/BQL0tJFoPNr1jcL/t1+M1tFNLhawKxrLC1pecSxVMBjjdJpRhZr+OBYI04TigOfYgeJrS6X5hBA0YL9lhu7da7bRgseZ7a+LV+MGRvbinTQy3JxvPQDaBCvqajV+2chbjmumnWwxVoq47TXcH3WDQVfbkLNQnsiV3kDstRAZpP6W2FZKFhsOR1A6GmPY81IHzRCUe+Cg3HstRwb9O127Q1fWcWXQIWP1krjO7Qm4VqaoAn+A8PMdt5FFi9y7xgsRbl+gS7SXSlrTepu+fFQvSAaiIf5ttsew8V6Ad6KFdZv7baJKAhXxlIVjYMFm5YzGvq7+CWwUpK2uPLFKth+YcDFB3fQ7c2CcyNvU8ASzx4wkdogofeDErKvMLW8Rj+vMoHwBK5r111ziX1pBtq051UXG2vvBuCZKmWLtS02fQffRVFu0wCfVy7MF5j5PSyiGTVSrICYNV4xlBcD67rQm7YcB9P2R2GP0mdiGdIovfGO7bTsBXH0KItodjk4nfaXdIafkA78AiU4m/jBmvjBKtdq8myBRaCHeNkVWYbKgNrFeIiLdTE2YJznA0wCairBkwCwpGSxcD6hxesVqKYDwrW4gNPRRDJmg+KojpbTfvu158JltqWjyO4ci9GpLQOg+W6rFbHAia+tzzJftDRN905jKtvw/dFi43jKUvdWxv3x04b66UgLsl6ZeH36Sv3sgbBEih6h5OvL+fTD5yzY+I5XxTt8CV/AVh0lsj7vKL77iL9/Zlg0Z0KUT+93FkDlb0KfbS7ZtIkKVQfAgczNzChvN/YZabtH0yy/kF+mlHS5oNgTecDvjnxweaECvSRo7hMsuZDkkVNYewGkwZLPtCGYsGquVl/5U5fjf8NwUossGogWMPvXnZcXrnAqi8DCywMmWQFwOLo+PqZY3fpKEDVmw/FsnKcygF/LZposESKBottIYzj92KwrobAeg2DpcdfV1q+zjFQQ7KK5zfRcvFxsEgRRLLmXLLeCTEzCtb7YJCYGruFezyJAHI9+1Bq5JLCe4GmhECMRoPVxQOu8lwOlhjlCy6r5TGRAbB6ilrrQwNxh3HzRh0Z0BBVqumh03RoaBOFeVlVziVrGgCrwf5h56NH7Gn9IbC4l/X3ofB7vpjzhhNlixIgA6zoA1+RvRsB508CS1KkINJHlmJXUJUy+BslF6nqrU1AJRAelqx3KVmvjwGwaAbiAs1cXV1JwWo/KlkvwyuACng/vxZRE3M8WJj6epzei237zwVLo/8qzlS0hpZXI7VcrfbNYuqLwGrpKL4AL4v8YxAsPkQvzuFhQMw+/OgVc9Xm7/6FYc2XEEKzkP3qbEetpyPBAjkut+3RYE2HwXIvfluFvmyUNt/zRaT3SRqqJOtXBRENhKsa5ZeAxWTmRUnWC0nDYOF7etl85jpoOaX50cdf7dGgRwa7f65QhCVZr9Mi+FzfeLBYLJj37exj4V4+zkNnQuBljUOR3DX4pj2hX0Wf72Gl6+g6zsEctUzCDA+Nw2C0hsLEw++vEWAxfl4fHS8dKjhx+49yxW9BJCsf0rQXleZ/Zye+qoHn7AhY/FqitdW3yk7WOQy6EBHFX77K1cS8XwSWwMRpBWrDhtX9CYdiPx4O7J6adNAksBhpPR4sLllfqOERkvXlPXBGFD2Si6zeJoP9heSefsa7iO7dtwCeQfH+RZP18uVlRmUL576XqCiwXh6jHx19l6V7Na7KZdI/Gac5a+51hsH629wN1vyFOScz66tSNYOIYURneaNEgv2G/Cr+Cdl75lz3nElN6MucjKnPJCAckqwXFn5nP70EwCLt/ULpy61YA/t1+3Gu6Iwh3Ax4WaLSEC3CFm1mUw+D9fL3v/E0c6UarH4fZY7iA+0QshcGS2ivBRb79Wz/hzqQJZ64RlOt2NJP593Gc8Sb79qhzT2T8D71vCALBUF54V4W/SkEVs4HFZml5pLP+hPAaho2rIMLw+nLS5+tR85WNQiWutyVvsl5Acj1dgeauhIyx+yLLOT7IFjisj5Y/NdfZub1BZrOHpVi6zmuwfoyYhxq1TdfNI652yT0X/g2CBZdGHIkhGSFTCExmV9gJSCexee8WEVKVh7RHSZcbHJZ2U7Oq+2kwDq5ettRRbsG0Gv+JLDIjIHp/fHxBd4aabBkhjETHMyhmdLV3DYJ73zafq9iwVKSRb2sWQRYfEwfjVPcLQ65ReNSi94D3UNqQWbtI2z8I/vXI2n/3YVgKXcKTOO/uStRe4r8GWCZ8mrVGdkZEI6OkTRQnEeahOGbKMmqeP+/B99VaUPE5+8j+hQXSw3boACSSTWjMPUTRQv36kEb9hhOWrFqleFl5gfrETD96Lj8w2DJO/QaqO5KBhs8NXKvMowbCOVOPn4LTJwvXx6ZTcyjwFJm7I4LYBCsWkjcPQw9vfutxkVuVhGSLNq66bsbrVlhdiwB6zEmoZFgOe7dA0sAMNinBKwXH1jDE+HlHT6N9J2sZPnvx4FVPEoeb3sm4cVlEt4JWvsosLgdY6MYBVYr3ffcso7tZ4FVCS9rqCoNRWv26GDry7tZlTiwXn4GWPy3AbCcl4XA4tJ8wjZYj4/1qJfvKx7vzCHwmYR3aRIQjpOsSMWiEd4X2oUViDW8PH6mYHHJenwJ7HjRXkXEm7XaT6Zy8xGwdIZ/T7DoNGbrFDh9AFijFcsBVoRJCIGlJCsSrFwKlDK1QsJOnwcW92GCy8z8O1v4W2yRAT45wXJ9usCOFZAW6YL2MavCnwmWdZfHd1dkZa9JHAFWo5v63gOlZWgNmAQUNjwzNooEkMcIsJSc1DD77HM/AHBn3sM/K/ir9mkHGGRBsQNgxYU7W9Db3itmkkcaBPiZYL2rUINRqdo1ijxN4+f4YFPzAZPwvQmD1dKIJB2LSLBqDiJutOA9vnxarGGUZHG2GtYBJlpg1kLFaq2ETjIZ9kGXE5NuXiTPbrDuLgfrRQdIZ0OeX63/PGIsDKtvi3PeuNliOhLuGiFZ8WCxQYeWNOgPjY9lxXhZhm6hmcfbgWDFGYkGvz8GZr/+uESNavT+OATWbEhB4GV30GWSsM7qB36fOwRwP/ndvpfZuMj7YK47bhJmDpOAovSQjuK/E1gjJItXozLRenf7WHFgVcPi4FhZ/QywVA0qy9jd2L1taM/diL3CoM4Jd8MyCSiyeGI4qR6339pAqls+5q0wLIhVq0XtZyYqAyMtLLly5rKF48E66hw3UUv3QbAeBzfnNS5usB4VWLynfUKqvaVY+82NflCbPSYh6oED6mXRJvi9VTNBxeIOCTtd8clpnGTRZvxJyHqy+omC9UTT41MkWHd40Oo4fCw3WArOgfSnuiwElhE3QXftECPHsb57kMYTNQnv0CSgMdpPZCsiUX3TS/cp61L0+Wm0iSUT5Ekk0LkArPhDMDePopwZvo27+vGR3rQGsieJeUIxVNpg8TJBBdrihk8c+ts+77dar2fxnw4Feb6HevdomoQoXWzQ479lontNI0SOdq4LLIlbLFhHVc7TE2raWAwNqThKnp+GhbJ4enQg/F2VCX590kU+WZarUH8MkQwjR4rUGJVD3wFZce9qDG9N/avIGhXHOGqGtNetwXqOBeuEtfTNInr85mkIrCH35U7d6dFYJzjBIsWoiXOD7qxYp0Oug8GGpxj4FVnEJKhGoUgjosO8at/gpf+7R/BXuZpQMQ7wu8hCHgcKURnGPLNvgHW8HCw6rk+6y0+RYD3BAT1BZI5D6wRHZlABEywFz5MFj5brp2d0FweWsvg3cStJaBJiv4DNJOudJu6cxf307vvpA1mNQkZJFgBr+iGwbnVBTzdhL8sFFlGQZ1VC43efZxrguxBYdGCffDZ6kLpAbz1Fahzs4DiwhGSxxR1Si4Sp/ulF7ohQAN/lIpvHhel65EVn9Rais9KfbnqFPPoKadwb0G7fyPZBgI8Vvw4n3seTFj90AVhQ9byi12oYTOo9YLXfFa1Plv9+Z8hsRPxSlxU75caDxU4N0lGs0DcRiK9RTVcsZNgRYlFf8tO3I4//TpsaCWLuUC1+OhXfODuIZqWF3JBCbot3o5ApKURQ3CJZyOkoYsDo9iQKKSpRiL0wbH2fzm5dYwnAur1E+ygv6AKwAOXepaX3Gg9YhpT2XbeTIbPHcBNnYwXrErCaRgz78U5Kxu1Jqg2Sw95QMWbD3jJPkgeG7wQ7ldK940kWUteqkKMqpBLidYdzwW6Fvwt27UL6klXgYup0NU/O+S8745m4HiO2wcH0D5LlBAsB0+STLCAaU1xEgEX6WtXL8qRgnYNrDgQwfLbChREmIbYzBQDkFowYNux3LKZMdxwbMey1GvZbOew0djZ9VNiJn3ghNyTrHYvU0P5RxNypn2RWfDrCQgS7uWLXaBy6cQ81bfYzZwgEhShYz6PBgh4LHfU/20Gwnh0TH9hCzzAjPU49YyTzPvezFtpjtITQqHNAhJApybdxJkGj+4ziD9aLwa5aqTbHWyhZBjscuxkj5sTiITwuJwupW1v32mOvkBtWiIkd+Unf/05KVmuo8TPvCxTnjF4GFjQ6z7S8gXEissNvYA5mYdQHDQ3us43ejSiz/4eTnD10cHulgr8NT4bWMPV9b63AKGwS4sGiFNHgGh92ugJt2bDzUModjWDQhTP1N9mwF0qyECeGxkJ41if0ncdcGDutKoSFQShsip3TCVrKRx7cE/cX5rYfyiFcPfOhvj0ZWNG+eraNHgOLJvLbIzrKdHKktre0ViNIOp+UeGycbj7GbrDYCuDZLyDMVqoKNzgOLO3vP9sL1jt1R1pl72QAfcXv3fa4ijEJI1ZCYNj5T6dbHmZhxPSwK1omWU9sK+KuEOyorNRBEoWcVCFHZyEmdpTdBhbS2+MjxoNjQoca3xantm1PRNtwMeN/oH+D2g7AGrdZ+Z3077Mq8pk+odJjj9+YDZK47bHvTT/7NI+UNn1Wf7ZjqDeymY541ZNu58mmTq8bkROtE91QfoLSdttzNYRJ6IvWt5AER0vWnRr2k9ioEsPOoru3QhkRvoUAzkQhJ6sQLVlHPu+kpeTurSxE3R9ZktUiQM8zf0JXTH8mZOIvN3AjSIH1/DwNJNQfpWdAFkGL/f1OSN7td3HjG8GVBZbBwNOMgnmk84DweMsmwpOzwgGw2lZVi/rvrb0yNCeDoeu0l7EQ/WcpbMceBdoktAMmYYRfIYk5igUN97LEquYoh52zQ/riO/5TSVZTAHY4MaqQkyqklYVgJ7sseGQUImuiJAsONWnjzWw6ZefWZ89PgAFjIgOwngaT4fILl8K83fPMYK8ozBtbYJE5CHGHmYuplsNecDQAltEgK5h11CyzDuL3PIm5IO8MLrFCIVPTJByRayawoRkbvJGS8cS9rJlY8/KYIWunxE4N++mo2OG6QxewspA7sZjgxDw/KVeNF3KSWREshLN7B+7PVyVTMNKcFP0f3erCPQ6B1AeLknXzZN7u+WY2m4mj7jf2jY+We94Dc4pCEyEIFvF3b7zGEKqkYzKg6ezGqHKPzDvTJPhmAvVhxqyEGmVdG6k2J6g2ethpDK7Q2N2J+Ipi52kK2AGFcPF65uyKQk52Ia20833JEr57AI8j/hywqH8962U2Rc7803RIXcAECPEYAOsEJMs2oic8e3qyJgN/7oNNBbPF3/3W/5nm9M6E8UtsMOwYstOoYW+02kjJKiQ7qpBWFaIl64Q5McpVe4KuGjIkU9REYndSa/hhsizrMAqsWzvIHyRZD6GDkGMwvycuPwAWDyt4qbzt39I3FWiFG+z30QSW8L9gbTTqJZpNISTr/9iWSpi7Z+5lMbVpoNrgvmRJYgxXrbDY1eaOrBCQrxAVu2bxUe9QEX+1rzofAos/6vX0FIPVzdR13jVAFq3wLR4NFtIl2AfGjj0LHt9XNln+bhoF1tGyVMawA8kyzR3S5q6R5q6AutcK7O5UIUdtM21XrWmPSrJuTcmi/5160GJewS3+VLCG7gddmZtp4evTATKfbny7PUNgGctNx7MaBXG0gx7DM1mmHkdPBHbDP/FYsLRkaS+n71zT4GPhcJBaW7L8rprP3Cp2MbbYRdo8EU/yue/iMD/Vsct1VNGkYHIbpbahaD374OBODPJvsJ2YOX1y4kgGt8DjwaIze8j1RzRUNSyUzr7i0MaZhHFg3bJRgJLVsGHnnPLArmTnGXhZU20pFTvCUj4LdqSX1Vi6dzr1JIuye7Ik609ji5Ssb6D38MxXP/YzBvRgVCB8pZ41nnqOu/HXRPQXgdIJF8uugYdcGh7t6udlqy7ftsvz4DYj3JJ5dp3+vOVoPXn01YvV0EQQJuGELwCLSZbJzq32siR2MrgvJetZeehmVmJINYDQVXtWlvLZYJdLVo9d1POyWOOpN1MgBcUUFWyxjH9SYveja3XlDNMfbm7EjWn7hre0icgKMvVEKIZo1EFbN3rFDMwHR7vbOxa8fXbwzPS1GfgAgDQJgzyO7OujZKeVw35H46BPz8rL6mFnBhVkVs4ONrCzC8GQHVJzpAtpWi2euhBjH7V/aOTom/wN3QcsjHR0piE6Wi4chXqNCEKFvDGK6VdGpjkRblv8E1N70pNBLQlvuL7eBSeCbRJuTJMwdhIryWrlsNPdZjHsRQ87aO64lyWwKyR2EsCTCL4IV43rnlOyLN2jXpbbl2gJILd3d6fbY3HCPz+1x9um/5tj9I1PPf/tFBhbAbuXPRFMJ2mgwqy++pU64kjCsY2cCEi5CVOLx7Fg3TqG/aSGXXlZLVQbMeyFZAdIlizkO3DVGlHIsQWWUhSisWs1gE7J+heltuXid0Lj5YZMhFuqnmQitH9VdfuT4XRsY3P2nwMyc452O6TaFHzpIZ1rTsxREXNUgy2xOwovi4bsZCFHsX4h9AnJKiS7N+poiqcQqHaikBb/J11CF+K2/zS2/+gpI2IS7lxuwmiweBiK2h22HGPDeSd+wjweQFWMH6ulAoQa/tOtOHVNt+qO4ickdhh0IYUqhEZ9VVZeCA0WwvtPRVZZSPMfSP5t0viFUotnNzzWf1fQn1r2dAhdfLQ8EM33Jls8pcuLVv3ElvbkJ6H6qhAkC2l6heisjfipkIVMQSEtLOQ/6d8l/S+WzL5StokatgAAAABJRU5ErkJggg==';
const COMPANY_LEGAL_NAME = 'PROTEÇÃO AGROPECUÁRIA SERVIÇOS TÉCNICOS E CORRETAGEM DE SEGUROS LTDA';
const PM_LABELS_PDF = { boleto: 'Boleto', pix: 'PIX', transferencia: 'Transferência' };

// Relatório de Contas a Pagar em PDF — layout corporativo com logo, cabeçalho
// e rodapé com numeração de página. Exporta exatamente o conjunto filtrado
// exibido na tela (mesmo critério usado na exportação em CSV).
async function exportPagarPDF(rows, filtersLabel) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  const btn = $('#btn-pdf');
  const originalLabel = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando PDF…'; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], AZUL = [31, 78, 120], CINZA = [110, 120, 114];
    const MARGIN = 12;

    // Faixa de destaque superior
    doc.setFillColor(...VERDE);
    doc.rect(0, 0, pageW, 3, 'F');

    // Logo (embutida em base64 — sem depender de requisição de rede)
    const logoW = 34;
    const logoAspect = 139 / 600; // altura/largura do arquivo original
    const logoH = logoW * logoAspect;
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', MARGIN, 11, logoW, logoH);

    // Nome da empresa e título do relatório
    const textX = MARGIN + logoW + 6;
    doc.setTextColor(30, 38, 32);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text('PROAGRO BRASIL', textX, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
    doc.text('ERP Financeiro · Módulo Contas a Pagar', textX, 19);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...VERDE);
    doc.text('Relatório de Contas a Pagar', pageW - MARGIN, 15, { align: 'right' });
    const now = new Date();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
    doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR').slice(0, 5)} por ${USER.name}`, pageW - MARGIN, 20.5, { align: 'right' });

    // Linha separadora
    doc.setDrawColor(210, 218, 213); doc.setLineWidth(0.3);
    doc.line(MARGIN, 25, pageW - MARGIN, 25);

    // Filtros aplicados
    let y = 30;
    if (filtersLabel) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...AZUL);
      doc.text('Filtros aplicados:', MARGIN, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 68, 62);
      doc.text(filtersLabel, MARGIN + 27, y);
      y += 6;
    }

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const totalPago = rows.filter(r => r.status === 'pago').reduce((s, r) => s + r.amount, 0);
    const totalPendente = total - totalPago;

    const body = rows.map(r => [
      r.id,
      brDate(r.due_date),
      r.description,
      r.supplier_name || '—',
      r.category,
      r.cost_center || '—',
      r.payment_method ? (PM_LABELS_PDF[r.payment_method] || r.payment_method) : '—',
      brl(r.amount),
      r.status === 'pago' ? `Pago em ${brDate(r.payment_date)}` : (r.due_date < todayISO() ? 'Vencido' : 'Pendente')
    ]);

    doc.autoTable({
      startY: y,
      head: [['ID', 'Venc.', 'Descrição', 'Fornecedor', 'Categoria', 'Centro de Custo', 'Forma de Pagamento', 'Valor', 'Status']],
      body,
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: [40, 46, 42], lineColor: [225, 231, 227], lineWidth: 0.15 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8.2 },
      alternateRowStyles: { fillColor: VERDE_CLARO },
      columnStyles: {
        0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 22 }, 7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 24 }
      },
      didParseCell: hook => {
        if (hook.section === 'body' && hook.column.index === 8) {
          const v = hook.cell.raw;
          if (v === 'Vencido') hook.cell.styles.textColor = [178, 58, 47];
          else if (v === 'Pendente') hook.cell.styles.textColor = [31, 78, 120];
          else hook.cell.styles.textColor = [0, 120, 63];
        }
      },
      didDrawPage: () => {
        const pageH = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...VERDE); doc.setLineWidth(0.4);
        doc.line(MARGIN, pageH - 14, pageW - MARGIN, pageH - 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
        doc.text(COMPANY_INFO.legal_name || COMPANY_LEGAL_NAME, MARGIN, pageH - 9);
        doc.text('Documento de uso interno — gerado automaticamente pelo ERP Financeiro.', MARGIN, pageH - 5.5);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - MARGIN, pageH - 7, { align: 'right' });
      }
    });

    // Resumo final (após a tabela)
    let yEnd = doc.lastAutoTable.finalY + 8;
    const pageH = doc.internal.pageSize.getHeight();
    if (yEnd > pageH - 26) { doc.addPage(); yEnd = 20; }
    doc.setFillColor(...VERDE_CLARO);
    doc.roundedRect(MARGIN, yEnd, pageW - MARGIN * 2, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...VERDE);
    doc.text(`Total filtrado: ${rows.length} título(s) · ${brl(total)}`, MARGIN + 5, yEnd + 6.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 68, 62);
    doc.text(`Pago: ${brl(totalPago)}   ·   Pendente/vencido: ${brl(totalPendente)}`, MARGIN + 5, yEnd + 12);

    doc.save(`contas_a_pagar_${todayISO()}.pdf`);
    toast('PDF gerado com sucesso.');
  } catch (e) {
    console.error(e); toast('Não foi possível gerar o PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

// ------------------ Inicialização ------------------
(async function init() {
  try {
    const me = await api('/api/auth/me');
    USER = me.user; enterApp();
  } catch {
    showLogin();
  }
})();
