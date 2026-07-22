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
const PERM_PAGES = ['dashboard','pagar','receber','fluxo','conciliacao','fornecedores','orcamento','orcadoreal','relatorios'];
const PAGE_LABELS = {
  dashboard:'Dashboard', pagar:'Contas a Pagar', receber:'Contas a Receber', fluxo:'Fluxo de Caixa',
  conciliacao:'Conciliação Bancária', fornecedores:'Fornecedores', orcamento:'Orçamento Anual',
  orcadoreal:'Orçado x Realizado', relatorios:'Relatórios Gerenciais'
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
const brDate = iso => { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const todayISO = () => new Date().toISOString().slice(0, 10);

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
  if (method !== 'GET' && USER && USER.role !== 'admin' && READONLY
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
  via: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18"/></svg>'
};

const PAGES = [
  { hash: 'dashboard', title: 'Dashboard', icon: 'dash', section: 'Visão geral' },
  { hash: 'pagar', title: 'Contas a Pagar', icon: 'out', section: 'Movimentação' },
  { hash: 'receber', title: 'Contas a Receber', icon: 'in' },
  { hash: 'fluxo', title: 'Fluxo de Caixa', icon: 'flow' },
  { hash: 'conciliacao', title: 'Conciliação Bancária', icon: 'bank' },
  { hash: 'orcamento', title: 'Orçamento Anual', icon: 'bud', section: 'Planejamento' },
  { hash: 'orcadoreal', title: 'Orçado x Realizado', icon: 'vs' },
  { hash: 'relatorios', title: 'Relatórios Gerenciais', icon: 'rep' },
  { hash: 'viaticos', title: 'Viáticos', icon: 'via', super: true },
  { hash: 'fornecedores', title: 'Fornecedores', icon: 'sup', section: 'Administração', sub: 'Cadastros' },
  { hash: 'usuarios', title: 'Usuários', icon: 'usr', sub: 'Cadastros', super: true },
  { hash: 'categorias', title: 'Categorias', icon: 'tag', sub: 'Cadastros', super: true },
  { hash: 'config', title: 'Configurações', icon: 'cfg', super: true }
];

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
        <col class="c-id"><col class="c-venc"><col class="c-desc"><col class="c-forn"><col class="c-cat"><col class="c-cc"><col class="c-pm">
        <col class="c-val"><col class="c-status"><col class="c-acoes">
      </colgroup>
      <thead><tr><th>ID</th><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Centro de Custo</th><th>Forma de<br>Pagamento</th>
        <th class="num">Valor</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => {
        const late = r.status === 'pendente' && r.due_date < today;
        return `<tr>
          <td class="id-cell">${r.id}</td>
          <td>${brDate(r.due_date)}</td>
          <td>${esc(r.description)}</td>
          <td>${esc(r.supplier_name || '—')}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.cost_center || '—')}</td>
          <td class="pm-cell">${r.payment_method ? esc(PM_LABELS[r.payment_method] || r.payment_method) : '—'}</td>
          <td class="num">${brl(r.amount)}</td>
          <td>${r.status === 'pago'
            ? `<span class="badge ok">Pago ${brDate(r.payment_date)}</span>`
            : late ? '<span class="badge late">Vencido</span>' : '<span class="badge pend">Pendente</span>'}</td>
          <td class="actions">
            ${r.status === 'pendente' ? `<button class="btn sm primary" data-pay="${r.id}">Baixar</button>` : `<button class="btn sm" data-unpay="${r.id}">Estornar</button>`}
            <button class="btn sm att-btn" data-att="payable:${r.id}">📎${r.attachment_count ? ' ' + r.attachment_count : ''}</button>
            <button class="btn sm" data-edit="${r.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
          </td></tr>`;
      }).join('') || '<tr><td colspan="10"><div class="empty">Nenhum título encontrado.</div></td></tr>'}</tbody>
      <tfoot><tr><td colspan="7">Total filtrado (${filtered.length})</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot>`;



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
          <td>${brDate(r.due_date)}</td><td>${esc(r.client_name)}</td><td>${esc(r.description)}</td>
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
      }).join('') || '<tr><td colspan="8"><div class="empty">Nenhum recebível encontrado.</div></td></tr>'}</tbody>
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
  const monthEndD = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const monthEnd = monthEndD.toISOString().slice(0, 10);

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
      <button class="btn primary" id="btn-save">Salvar orçamento</button>
    </div>
    ${tableFor('receita', CAT_RECEITA)}
    ${tableFor('despesa', CAT_DESPESA)}
    <p class="hint">Digite os valores mensais orçados. O botão <strong>→12</strong> replica o valor de janeiro para os 12 meses. Clique em <strong>Salvar orçamento</strong> para gravar.</p>`;

  $('#o-year').onchange = e => { sessionStorage.setItem('orc-year', e.target.value); renderOrcamento(); };

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
      <button class="btn" id="btn-csv">Exportar CSV</button>
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
  $('#btn-csv').onclick = () => exportCSV(`orcado_x_realizado_${year}`,
    ['Tipo','Categoria','Orcado','Realizado','Variacao','PctRealizado'],
    [...rec.map(r => ['Receita', r.cat, r.orc, r.real, r.dif, r.pct?.toFixed(1) ?? '']),
     ...desp.map(r => ['Despesa', r.cat, r.orc, r.real, r.dif, r.pct?.toFixed(1) ?? ''])]
      .map(row => row.map(v => String(v).replace('.', ','))));

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
const LOCAL_LABEL = { interior: 'Interior', capital: 'Capital', sp_df_rj_intl: 'SP/DF/RJ + Internacional' };
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
const VIA_STATUS_LABEL = {
  liberado: 'Liberado', em_viagem: 'Em viagem', aguardando_comprovacao: 'Aguardando comprovação',
  comprovado: 'Comprovado', devolvido: 'Devolvido (sobrou)', divergente: 'Divergente (estourou)', arquivado: 'Arquivado'
};
const VIA_STATUS_BADGE = {
  liberado: 'off', em_viagem: 'pend', aguardando_comprovacao: 'warn',
  comprovado: 'ok', devolvido: 'ok', divergente: 'late', arquivado: 'off'
};

async function renderViaticos() {
  const [dash, sols] = await Promise.all([api('/api/viaticos/dashboard'), api('/api/viaticos/solicitacoes')]);
  const c = $('#content');
  const FKEY = 'filters-viaticos';
  const saved = loadFilters(FKEY);

  c.innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi ${dash.saldoCarteira < 0 ? 'red' : ''}"><div class="label">Saldo da Carteira Flash</div>
        <div class="value ${dash.saldoCarteira < 0 ? 'neg' : ''}">${brl(dash.saldoCarteira)}</div>
        <div class="detail">Transferido (total): ${brl(dash.transferido)}</div></div>
      <div class="card kpi blue"><div class="label">Transferido no mês</div><div class="value">${brl(dash.transferidoMes)}</div>
        <div class="detail">Contas a Pagar, categoria "Viáticos"</div></div>
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
      <button class="btn" id="btn-config">Configurações</button>
      <button class="btn primary" id="btn-new">+ Nova solicitação</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  const draw = () => {
    const q = $('#q').value.toLowerCase(), st = $('#f-status').value, de = $('#f-de').value, ate = $('#f-ate').value;
    saveFilters(FKEY, { q, status: st, de, ate });
    const filtered = sols.filter(s => {
      if (q && !(`${s.colaborador_name} ${s.destino || ''}`.toLowerCase().includes(q))) return false;
      if (st && s.status !== st) return false;
      if (de && s.data_inicio < de) return false;
      if (ate && s.data_inicio > ate) return false;
      return true;
    });
    $('#tbl').innerHTML = `
      <thead><tr><th>Colaborador</th><th>Tier</th><th>Local</th><th>Período</th><th class="num">Liberado</th>
        <th class="num">Comprovado</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(s => {
        const dif = s.valor_liberado - s.valor_comprovado;
        const vencida = ['liberado', 'em_viagem', 'aguardando_comprovacao'].includes(s.status) && s.data_expiracao_flash && s.data_expiracao_flash < todayISO();
        return `<tr>
          <td><strong>${esc(s.colaborador_name)}</strong>${s.colaborador_cargo ? `<br><small style="color:var(--muted)">${esc(s.colaborador_cargo)}</small>` : ''}</td>
          <td>${s.tier}</td>
          <td>${LOCAL_LABEL[s.categoria_local]}</td>
          <td>${brDate(s.data_inicio)} – ${brDate(s.data_fim)}${vencida ? '<br><small style="color:#B23A2F">Flash expirado</small>' : ''}</td>
          <td class="num">${brl(s.valor_liberado)}</td>
          <td class="num">${brl(s.valor_comprovado)}${s.anexos_count ? ` <small style="color:var(--muted)">(📎${s.anexos_count})</small>` : ''}</td>
          <td><span class="badge ${VIA_STATUS_BADGE[s.status]}">${VIA_STATUS_LABEL[s.status]}</span></td>
          <td class="actions">
            <button class="btn sm primary" data-view="${s.id}">${['comprovado', 'devolvido', 'divergente', 'arquivado'].includes(s.status) ? 'Ver' : 'Comprovar'}</button>
            <button class="btn sm" data-edit="${s.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${s.id}">Excluir</button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="8"><div class="empty">Nenhuma solicitação encontrada.</div></td></tr>'}</tbody>`;
    $('#tbl').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewSolicitacao(Number(b.dataset.view)));
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formSolicitacao(sols.find(s => s.id == b.dataset.edit)));
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('a solicitação', `/api/viaticos/solicitacoes/${b.dataset.del}`, renderViaticos));
  };

  ['q', 'f-status', 'f-de', 'f-ate'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-clear').onclick = () => { saveFilters(FKEY, {}); renderViaticos(); };
  $('#btn-new').onclick = () => formSolicitacao(null);
  $('#btn-config').onclick = () => renderViaticosConfig();
  draw();
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

  const body = () => `
    ${fldSel('vs-colab', 'Colaborador', ativos.map(c => ({ v: c.id, t: `${c.name}${c.cargo ? ' — ' + c.cargo : ''}` })), existing ? existing.colaborador_id : ativos[0].id)}
    <div id="vs-pendencia-alerta"></div>
    ${fldSel('vs-tier', 'Tier (TUD)', [{ v: 'A', t: TIER_LABEL.A }, { v: 'B', t: TIER_LABEL.B }], existing ? existing.tier : colabAtual.tier)}
    ${fldSel('vs-local', 'Categoria de local (a mais alta tocada na viagem)', Object.entries(LOCAL_LABEL).map(([v, t]) => ({ v, t })), existing ? existing.categoria_local : 'interior')}
    ${fld('vs-destino', 'Destino', 'text', existing ? existing.destino : '')}
    ${fld('vs-motivo', 'Motivo', 'text', existing ? existing.motivo : '')}
    <div class="field-row">
      ${fld('vs-inicio', 'Início da viagem', 'date', existing ? existing.data_inicio : todayISO())}
      ${fld('vs-fim', 'Fim da viagem', 'date', existing ? existing.data_fim : todayISO())}
    </div>
    ${fld('vs-expira', 'Dinheiro disponível no Flash até', 'date', existing ? (existing.data_expiracao_flash || '') : '')}
    <div class="field-row">
      ${fld('vs-solicitado', 'Valor solicitado (referência)', 'number', existing ? existing.valor_solicitado || '' : '', 'step="0.01" min="0"')}
      ${fld('vs-liberado', 'Valor liberado no Flash', 'number', existing ? existing.valor_liberado : '', 'step="0.01" min="0"')}
    </div>
    ${fld('vs-notes', 'Observações', 'text', existing ? existing.notes || '' : '')}`;

  openModal(isEdit ? 'Editar solicitação de viático' : 'Nova solicitação de viático', body(),
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar' : 'Criar', cls: 'primary', onClick: async () => {
        const b = {
          colaborador_id: Number($('#vs-colab').value), tier: $('#vs-tier').value, categoria_local: $('#vs-local').value,
          destino: $('#vs-destino').value, motivo: $('#vs-motivo').value, data_inicio: $('#vs-inicio').value, data_fim: $('#vs-fim').value,
          data_expiracao_flash: $('#vs-expira').value || null, valor_solicitado: $('#vs-solicitado').value || null, valor_liberado: $('#vs-liberado').value || 0,
          notes: $('#vs-notes').value
        };
        const descIds = $('#vs-desc-ids'); if (descIds) b.descontar_pendencia_ids = JSON.parse(descIds.value || '[]');
        try {
          if (isEdit) await api(`/api/viaticos/solicitacoes/${existing.id}`, { method: 'PUT', body: b });
          else await api('/api/viaticos/solicitacoes', { method: 'POST', body: b });
          closeModal(); toast(isEdit ? 'Solicitação atualizada.' : 'Solicitação criada.'); renderViaticos();
        } catch (e) { modalError(e.message); }
     }}]);

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
          <label style="display:block;margin-top:6px;font-weight:400"><input type="checkbox" id="vs-desc-check" checked style="width:auto;margin-right:6px">Descontar automaticamente do valor liberado nesta solicitação</label></div>
          <input type="hidden" id="vs-desc-ids" value='${JSON.stringify(r.solicitacoes.map(s => s.id))}'>`;
        const applyDiscount = () => {
          const liberadoEl = $('#vs-liberado');
          const base = Number(liberadoEl.dataset.base ?? liberadoEl.value ?? 0);
          liberadoEl.dataset.base = base;
          liberadoEl.value = $('#vs-desc-check').checked ? Math.max(0, base - r.total).toFixed(2) : base.toFixed(2);
        };
        $('#vs-desc-check').onchange = applyDiscount;
        applyDiscount();
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
  const comprovado = despesas.reduce((sum, d) => sum + d.valor, 0);
  const dif = s.valor_liberado - comprovado;

  // Validações: período autorizado + teto da TUD por categoria.
  const limite = s.data_expiracao_flash || s.data_fim;
  const foraDoPeriodo = despesas.filter(d => d.data < s.data_inicio || d.data > limite);
  const dias = Math.max(1, Math.round((new Date(s.data_fim) - new Date(s.data_inicio)) / 86400000) + 1);
  const tetos = {};
  ['hospedagem', 'alimentacao'].forEach(cat => {
    const t = tud.find(x => x.tier === s.tier && x.categoria_local === s.categoria_local && x.tipo_despesa === cat);
    if (t) tetos[cat] = t.valor_diaria * dias;
  });
  const estouros = Object.entries(tetos).filter(([cat, teto]) => {
    const gasto = despesas.filter(d => d.categoria === cat).reduce((sum, d) => sum + d.valor, 0);
    return gasto > teto;
  });

  const alertas = [];
  if (foraDoPeriodo.length) alertas.push(`${foraDoPeriodo.length} despesa(s) com data fora do período autorizado (${brDate(s.data_inicio)} a ${brDate(limite)}).`);
  estouros.forEach(([cat]) => alertas.push(`Categoria "${DESP_CAT_LABEL[cat]}" acima do teto da TUD (${brl(tetos[cat])} para ${dias} dia(s)).`));

  const body = `
    <div class="grid kpis" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Liberado</div><div class="value">${brl(s.valor_liberado)}</div></div>
      <div class="card kpi blue"><div class="label">Comprovado</div><div class="value">${brl(comprovado)}</div></div>
      <div class="card kpi ${dif < 0 ? 'red' : ''}"><div class="label">${dif >= 0 ? 'A devolver ao Flash' : 'Estouro (pendência)'}</div>
        <div class="value ${dif < 0 ? 'neg' : 'pos'}">${brl(Math.abs(dif))}</div></div>
    </div>
    ${alertas.length ? `<div class="alert-item late" style="margin-bottom:14px">⚠️ ${alertas.join('<br>⚠️ ')}</div>` : (despesas.length ? '<div class="alert-item ok" style="margin-bottom:14px">✅ Nenhuma divergência encontrada nas despesas lançadas.</div>' : '')}

    ${!finalizada ? `
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
          ${!finalizada ? `<button class="btn sm" data-editdesp="${d.id}">Editar</button><button class="btn sm danger-ghost" data-deldesp="${d.id}">Excluir</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Nenhuma despesa lançada ainda.</div></td></tr>'}</tbody>
    </table></div>`;

  const botoes = [{ label: 'Fechar', onClick: closeModal }];
  if (!finalizada) {
    if (s.status === 'liberado') botoes.push({ label: 'Marcar "Em viagem"', onClick: async () => { await api(`/api/viaticos/solicitacoes/${id}/status`, { method: 'POST', body: { status: 'em_viagem' } }); viewSolicitacao(id); } });
    if (s.status === 'em_viagem') botoes.push({ label: 'Marcar "Aguardando comprovação"', onClick: async () => { await api(`/api/viaticos/solicitacoes/${id}/status`, { method: 'POST', body: { status: 'aguardando_comprovacao' } }); viewSolicitacao(id); } });
    botoes.push({ label: 'Fechar / conferir', cls: 'primary', onClick: async () => {
      const r = await api(`/api/viaticos/solicitacoes/${id}/fechar`, { method: 'POST' });
      closeModal();
      toast(r.status === 'divergente' ? `Encerrado com divergência: ${brl(r.valor_pendencia)} em pendência.` : r.status === 'devolvido' ? `Encerrado — ${brl(r.valor_devolvido)} devolvido à carteira.` : 'Encerrado — valores batem exatamente.');
      renderViaticos();
    }});
  } else if (s.status !== 'arquivado') {
    botoes.push({ label: 'Arquivar', cls: 'primary', onClick: async () => { await api(`/api/viaticos/solicitacoes/${id}/arquivar`, { method: 'POST' }); closeModal(); toast('Arquivado.'); renderViaticos(); } });
  }

  openModal(`${finalizada ? 'Comprovação' : 'Comprovar viagem'} — ${esc(s.colaborador_name)} (${brDate(s.data_inicio)}–${brDate(s.data_fim)})`,
    body, botoes, { wide: true });

  if (!finalizada) {
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
}

async function renderViaticosConfig() {
  const [colaboradores, tud] = await Promise.all([api('/api/colaboradores'), api('/api/viaticos/tud')]);

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

  const body = `
    <p class="hint">Estacionamento é sempre lançado "por recibo" (sem teto) e Veículo próprio fica fora da TUD — não precisam de configuração aqui.</p>
    ${tudGrid('A')}${tudGrid('B')}
    <h3 style="margin:20px 0 10px; font-size:15px">Colaboradores</h3>
    <div class="field-row" style="align-items:flex-end">
      ${fld('cb-nome', 'Nome', 'text', '')}
      ${fld('cb-cargo', 'Cargo', 'text', '')}
      ${fldSel('cb-tier', 'Tier', [{ v: 'A', t: 'A' }, { v: 'B', t: 'B' }], 'B')}
      <button class="btn primary" id="cb-add" type="button">+ Adicionar</button>
    </div>
    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Nome</th><th>Cargo</th><th>Tier</th><th>Ativo</th><th class="actions">Ações</th></tr></thead>
      <tbody>${colaboradores.map(c => `<tr>
        <td>${esc(c.name)}</td><td>${esc(c.cargo || '—')}</td><td>${c.tier}</td>
        <td>${c.ativo ? '<span class="badge ok">Sim</span>' : '<span class="badge off">Não</span>'}</td>
        <td class="actions">
          <button class="btn sm" data-toggle-colab="${c.id}">${c.ativo ? 'Inativar' : 'Ativar'}</button>
          <button class="btn sm danger-ghost" data-del-colab="${c.id}">Excluir</button>
        </td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Nenhum colaborador cadastrado.</div></td></tr>'}</tbody>
    </table></div>`;

  openModal('Configurações de Viáticos (TUD e Colaboradores)', body, [{ label: 'Fechar', cls: 'primary', onClick: closeModal }], { wide: true });

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
  document.querySelectorAll('[data-toggle-colab]').forEach(b => b.onclick = async () => {
    const c = colaboradores.find(x => x.id == b.dataset.toggleColab);
    await api(`/api/colaboradores/${c.id}`, { method: 'PUT', body: { name: c.name, cargo: c.cargo, tier: c.tier, ativo: !c.ativo } });
    renderViaticosConfig();
  });
  document.querySelectorAll('[data-del-colab]').forEach(b => b.onclick = () => confirmDelete('este colaborador', `/api/colaboradores/${b.dataset.delColab}`, renderViaticosConfig));
}

// ============================================================
// USUÁRIOS (admin)
// ============================================================
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
const pageForType = t => ({ payable: 'pagar', receivable: 'receber', viatico: 'viaticos' }[t] || 'receber');

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
    const previewable = r.mime_type === 'application/pdf' || r.mime_type.startsWith('image/');
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
  openModal('Anexos — ' + label, `
    ${editable ? `
    <div class="att-upload">
      <div class="field" style="margin:0">
        <label>Adicionar documento</label>
        <div class="att-upload-row">
          <select id="att-kind">
            <option value="boleto">Boleto</option>
            <option value="nota_fiscal">Nota Fiscal</option>
            <option value="comprovante">Comprovante de pagamento</option>
            <option value="contrato">Contrato</option>
            <option value="outro" selected>Outro</option>
          </select>
          <input type="file" id="att-file" accept=".pdf,.png,.jpg,.jpeg,.xml,.xlsx,.docx,image/*,application/pdf">
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
const LOGO_PROAGRO_PNG = 'data:image/png;base64,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';
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
        0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 18 }, 7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 24 }
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
