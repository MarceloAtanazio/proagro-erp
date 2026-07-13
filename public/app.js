/* ============================================================
   ProAgro ERP — Módulo Financeiro (frontend SPA)
   ============================================================ */
'use strict';

// ------------------ Constantes ------------------
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CAT_DESPESA = ['Folha de Pagamento','Instalações','Frota','RH / Benefícios','Jurídico','Tecnologia','Serviços Técnicos','Viáticos','Impostos e Taxas','Marketing e Eventos','Outros'];
const CAT_RECEITA = ['Comissões','Serviços Intercompany','Serviços Técnicos','Receitas Financeiras','Outros'];
const CENTROS = ['Administrativo','Comercial','Operação a Campo','Diretoria'];
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
function openModal(title, bodyHTML, buttons) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
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
function enterApp() {
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

$('#btn-logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); USER = null; location.hash = ''; showLogin(); };

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
  usr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
};

const PAGES = [
  { hash: 'dashboard', title: 'Dashboard', icon: 'dash', section: 'Visão geral' },
  { hash: 'pagar', title: 'Contas a Pagar', icon: 'out', section: 'Movimentação' },
  { hash: 'receber', title: 'Contas a Receber', icon: 'in' },
  { hash: 'fluxo', title: 'Fluxo de Caixa', icon: 'flow' },
  { hash: 'conciliacao', title: 'Conciliação Bancária', icon: 'bank' },
  { hash: 'fornecedores', title: 'Fornecedores', icon: 'sup', section: 'Cadastros' },
  { hash: 'orcamento', title: 'Orçamento Anual', icon: 'bud', section: 'Planejamento' },
  { hash: 'orcadoreal', title: 'Orçado x Realizado', icon: 'vs' },
  { hash: 'relatorios', title: 'Relatórios Gerenciais', icon: 'rep' },
  { hash: 'usuarios', title: 'Usuários', icon: 'usr', section: 'Administração', super: true }
];

function buildNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  let curSection = null, emitted = null;
  PAGES.forEach(p => {
    if (p.section) curSection = p.section;
    const visible = p.super ? !!USER.is_super : canViewPage(p.hash);
    if (!visible) return;
    if (curSection && curSection !== emitted) { nav.appendChild(el('div', 'nav-section', curSection)); emitted = curSection; }
    const a = el('a', '', ICONS[p.icon] + '<span>' + p.title + '</span>');
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
    orcadoreal: renderOrcadoReal, relatorios: renderRelatorios, usuarios: renderUsuarios
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
  const [d, cf] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/cashflow/' + new Date().getFullYear())]);
  const c = $('#content');
  const resultadoMes = d.recebidoMes - d.pagoMes;
  c.innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><div class="label">Saldo bancário (extrato)</div>
        <div class="value ${d.saldoBanco < 0 ? 'neg' : ''}">${brl(d.saldoBanco)}</div>
        <div class="detail">${d.naoConciliados} lançamento(s) não conciliado(s)</div></div>
      <div class="card kpi red"><div class="label">A pagar — próx. 30 dias</div>
        <div class="value">${brl(d.pagar30.v)}</div>
        <div class="detail">${d.pagar30.n} título(s) · vencidos: ${brl(d.pagarVencido.v)}</div></div>
      <div class="card kpi blue"><div class="label">A receber — próx. 30 dias</div>
        <div class="value">${brl(d.receber30.v)}</div>
        <div class="detail">${d.receber30.n} título(s) · vencidos: ${brl(d.receberVencido.v)}</div></div>
      <div class="card kpi ${resultadoMes >= 0 ? '' : 'warn'}"><div class="label">Resultado do mês (caixa)</div>
        <div class="value ${resultadoMes >= 0 ? 'pos' : 'neg'}">${brl(resultadoMes)}</div>
        <div class="detail">Recebido ${brl(d.recebidoMes)} · Pago ${brl(d.pagoMes)}</div></div>
    </div>
    <div class="two-col" style="margin-top:16px">
      <div class="card"><h3>Fluxo de caixa ${new Date().getFullYear()} — realizado + projetado</h3>
        <div class="chart-box"><canvas id="ch-fluxo"></canvas></div></div>
      <div class="card"><h3>Vencimentos — próximos 30 dias</h3>
        ${d.vencendo.length ? `<div style="overflow-x:auto"><table>
          <thead><tr><th>Venc.</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
          <tbody>${d.vencendo.map(v => `<tr>
            <td>${brDate(v.due_date)}</td>
            <td><span class="badge ${v.tipo === 'pagar' ? 'late' : 'pend'}">${v.tipo === 'pagar' ? 'Pagar' : 'Receber'}</span></td>
            <td>${esc(v.description)}${v.party ? '<br><small style="color:var(--muted)">' + esc(v.party) + '</small>' : ''}</td>
            <td class="num">${brl(v.amount)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty">Nenhum vencimento nos próximos 30 dias.</div>'}
      </div>
    </div>`;

  const sum = arr => { const m = Array(12).fill(0); arr.forEach(r => m[r.month - 1] += r.total); return m; };
  const entR = sum(cf.entradas.realizado), entP = sum(cf.entradas.projetado);
  const saiR = sum(cf.saidas.realizado), saiP = sum(cf.saidas.projetado);
  makeChart($('#ch-fluxo'), {
    type: 'bar',
    data: { labels: MESES, datasets: [
      { label: 'Entradas', data: entR.map((v, i) => v + entP[i]), backgroundColor: CORES.verdeMed, borderRadius: 4 },
      { label: 'Saídas', data: saiR.map((v, i) => v + saiP[i]), backgroundColor: CORES.azul, borderRadius: 4 },
      { label: 'Resultado', type: 'line', data: entR.map((v, i) => v + entP[i] - saiR[i] - saiP[i]),
        borderColor: CORES.verde, backgroundColor: CORES.verde, tension: .3, pointRadius: 3 }
    ]},
    options: chartOpts()
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
  c.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Buscar descrição, fornecedor…">
      <select id="f-status"><option value="">Todos os status</option><option value="pendente">Pendentes</option>
        <option value="vencido">Vencidos</option><option value="pago">Pagos</option></select>
      <select id="f-cat"><option value="">Todas as categorias</option>${CAT_DESPESA.map(x => `<option>${x}</option>`).join('')}</select>
      <div class="spacer"></div>
      <button class="btn" id="btn-csv">Exportar CSV</button>
      <button class="btn primary" id="btn-new">+ Novo título</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#f-status').value, fc = $('#f-cat').value, today = todayISO();
    const filtered = rows.filter(r => {
      const late = r.status === 'pendente' && r.due_date < today;
      if (fs === 'pendente' && r.status !== 'pendente') return false;
      if (fs === 'pago' && r.status !== 'pago') return false;
      if (fs === 'vencido' && !late) return false;
      if (fc && r.category !== fc) return false;
      return !q || (r.description + ' ' + (r.supplier_name || '') + ' ' + (r.document || '')).toLowerCase().includes(q);
    });
    const total = filtered.reduce((s, r) => s + r.amount, 0);
    $('#tbl').innerHTML = `
      <thead><tr><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Doc.</th>
        <th class="num">Valor</th><th>Status</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => {
        const late = r.status === 'pendente' && r.due_date < today;
        return `<tr>
          <td>${brDate(r.due_date)}</td>
          <td>${esc(r.description)}</td>
          <td>${esc(r.supplier_name || '—')}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.document || '—')}</td>
          <td class="num">${brl(r.amount)}</td>
          <td>${r.status === 'pago'
            ? `<span class="badge ok">Pago ${brDate(r.payment_date)}</span>`
            : late ? '<span class="badge late">Vencido</span>' : '<span class="badge pend">Pendente</span>'}</td>
          <td class="actions">
            ${r.status === 'pendente' ? `<button class="btn sm primary" data-pay="${r.id}">Baixar</button>` : `<button class="btn sm" data-unpay="${r.id}">Estornar</button>`}
            <button class="btn sm" data-edit="${r.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
          </td></tr>`;
      }).join('') || '<tr><td colspan="8"><div class="empty">Nenhum título encontrado.</div></td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">Total filtrado (${filtered.length})</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot>`;

    $('#tbl').querySelectorAll('[data-pay]').forEach(b => b.onclick = () => baixaPagar(rows.find(r => r.id == b.dataset.pay)));
    $('#tbl').querySelectorAll('[data-unpay]').forEach(b => b.onclick = async () => { await api(`/api/payables/${b.dataset.unpay}/unpay`, { method: 'POST' }); toast('Baixa estornada.'); renderPagar(); });
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formPagar(rows.find(r => r.id == b.dataset.edit), sups));
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('título', `/api/payables/${b.dataset.del}`, renderPagar));
  };
  ['q', 'f-status', 'f-cat'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-new').onclick = () => formPagar(null, sups);
  $('#btn-csv').onclick = () => exportCSV('contas_a_pagar',
    ['Vencimento','Descricao','Fornecedor','Categoria','CentroCusto','Documento','Valor','Status','Pagamento'],
    rows.map(r => [r.due_date, r.description, r.supplier_name || '', r.category, r.cost_center || '', r.document || '', String(r.amount).replace('.', ','), r.status, r.payment_date || '']));
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
    ${fld('p-notes', 'Observações', 'text', r.notes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Criar título', cls: 'primary', onClick: async () => {
        const body = {
          description: $('#p-desc').value, supplier_id: $('#p-sup').value || null, category: $('#p-cat').value,
          cost_center: $('#p-cc').value, document: $('#p-doc').value, amount: $('#p-val').value,
          due_date: $('#p-due').value, notes: $('#p-notes').value
        };
        try {
          if (isEdit) await api('/api/payables/' + r.id, { method: 'PUT', body });
          else await api('/api/payables', { method: 'POST', body });
          closeModal(); toast(isEdit ? 'Título atualizado.' : 'Título criado.'); renderPagar();
        } catch (e) { modalError(e.message); }
     }}]);
}

// ============================================================
// CONTAS A RECEBER
// ============================================================
async function renderReceber() {
  const rows = await api('/api/receivables');
  const c = $('#content');
  c.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Buscar cliente, descrição…">
      <select id="f-status"><option value="">Todos os status</option><option value="pendente">Pendentes</option>
        <option value="vencido">Vencidos</option><option value="recebido">Recebidos</option></select>
      <div class="spacer"></div>
      <button class="btn" id="btn-csv">Exportar CSV</button>
      <button class="btn primary" id="btn-new">+ Novo recebível</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>`;

  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#f-status').value, today = todayISO();
    const filtered = rows.filter(r => {
      const late = r.status === 'pendente' && r.due_date < today;
      if (fs === 'pendente' && r.status !== 'pendente') return false;
      if (fs === 'recebido' && r.status !== 'recebido') return false;
      if (fs === 'vencido' && !late) return false;
      return !q || (r.description + ' ' + r.client_name + ' ' + (r.document || '')).toLowerCase().includes(q);
    });
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
            <button class="btn sm" data-edit="${r.id}">Editar</button>
            <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
          </td></tr>`;
      }).join('') || '<tr><td colspan="8"><div class="empty">Nenhum recebível encontrado.</div></td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">Total filtrado (${filtered.length})</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot>`;

    $('#tbl').querySelectorAll('[data-rec]').forEach(b => b.onclick = () => baixaReceber(rows.find(r => r.id == b.dataset.rec)));
    $('#tbl').querySelectorAll('[data-unrec]').forEach(b => b.onclick = async () => { await api(`/api/receivables/${b.dataset.unrec}/unreceive`, { method: 'POST' }); toast('Recebimento estornado.'); renderReceber(); });
    $('#tbl').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formReceber(rows.find(r => r.id == b.dataset.edit)));
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('recebível', `/api/receivables/${b.dataset.del}`, renderReceber));
  };
  ['q', 'f-status'].forEach(id => $('#' + id).oninput = draw);
  $('#btn-new').onclick = () => formReceber(null);
  $('#btn-csv').onclick = () => exportCSV('contas_a_receber',
    ['Vencimento','Cliente','Descricao','Categoria','Documento','Valor','Status','Recebimento'],
    rows.map(r => [r.due_date, r.client_name, r.description, r.category, r.document || '', String(r.amount).replace('.', ','), r.status, r.receipt_date || '']));
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
  const year = Number(sessionStorage.getItem('fluxo-year')) || new Date().getFullYear();
  const cf = await api('/api/reports/cashflow/' + year);
  const c = $('#content');

  const arr = () => Array(12).fill(0);
  const entR = arr(), entP = arr(), saiR = arr(), saiP = arr();
  cf.entradas.realizado.forEach(r => entR[r.month - 1] = r.total);
  cf.entradas.projetado.forEach(r => entP[r.month - 1] = r.total);
  cf.saidas.realizado.forEach(r => saiR[r.month - 1] = r.total);
  cf.saidas.projetado.forEach(r => saiP[r.month - 1] = r.total);

  let acum = 0;
  const linhas = MESES.map((m, i) => {
    const ent = entR[i] + entP[i], sai = saiR[i] + saiP[i], res = ent - sai;
    acum += res;
    return { m, entR: entR[i], entP: entP[i], saiR: saiR[i], saiP: saiP[i], res, acum };
  });

  c.innerHTML = `
    <div class="toolbar">
      <label style="font-weight:600; font-size:13px">Ano:</label>
      <input type="number" id="f-year" value="${year}" min="2020" max="2100" style="width:100px">
      <div class="spacer"></div>
      <button class="btn" id="btn-csv">Exportar CSV</button>
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Evolução mensal ${year}</h3>
      <div class="chart-box tall"><canvas id="ch"></canvas></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Mês</th><th class="num">Entradas realizadas</th><th class="num">Entradas projetadas</th>
        <th class="num">Saídas realizadas</th><th class="num">Saídas projetadas</th>
        <th class="num">Resultado do mês</th><th class="num">Saldo acumulado</th></tr></thead>
      <tbody>${linhas.map(l => `<tr>
        <td><strong>${l.m}</strong></td>
        <td class="num">${brl(l.entR)}</td><td class="num" style="color:var(--muted)">${brl(l.entP)}</td>
        <td class="num">${brl(l.saiR)}</td><td class="num" style="color:var(--muted)">${brl(l.saiP)}</td>
        <td class="num ${l.res >= 0 ? 'pos' : 'neg'}">${brl(l.res)}</td>
        <td class="num ${l.acum >= 0 ? 'pos' : 'neg'}">${brl(l.acum)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>
        <td class="num">${brl(entR.reduce((a, b) => a + b))}</td><td class="num">${brl(entP.reduce((a, b) => a + b))}</td>
        <td class="num">${brl(saiR.reduce((a, b) => a + b))}</td><td class="num">${brl(saiP.reduce((a, b) => a + b))}</td>
        <td class="num" colspan="2">${brl(linhas[11].acum)}</td></tr></tfoot>
    </table></div>
    <p class="hint">Projetado = títulos pendentes por data de vencimento. Realizado = pagamentos e recebimentos efetivados.</p>`;

  $('#f-year').onchange = e => { sessionStorage.setItem('fluxo-year', e.target.value); renderFluxo(); };
  $('#btn-csv').onclick = () => exportCSV('fluxo_de_caixa_' + year,
    ['Mes','EntradasRealizadas','EntradasProjetadas','SaidasRealizadas','SaidasProjetadas','Resultado','Acumulado'],
    linhas.map(l => [l.m, l.entR, l.entP, l.saiR, l.saiP, l.res, l.acum].map(v => String(v).replace('.', ','))));

  makeChart($('#ch'), {
    type: 'bar',
    data: { labels: MESES, datasets: [
      { label: 'Entradas', data: linhas.map(l => l.entR + l.entP), backgroundColor: CORES.verdeMed, borderRadius: 4 },
      { label: 'Saídas', data: linhas.map(l => l.saiR + l.saiP), backgroundColor: CORES.azul, borderRadius: 4 },
      { label: 'Saldo acumulado', type: 'line', data: linhas.map(l => l.acum), borderColor: CORES.verde, backgroundColor: CORES.verde, tension: .3 }
    ]},
    options: chartOpts()
  });
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
      ${fldSel('s-cat', 'Categoria', [{ v: '', t: '—' }, ...CAT_DESPESA.map(x => ({ v: x, t: x }))], r.category || '')}
    </div>
    <div class="form-row">
      ${fld('s-contact', 'Contato', 'text', r.contact_name || '')}
      ${fld('s-phone', 'Telefone', 'text', r.phone || '')}
    </div>
    <div class="form-row">
      ${fld('s-email', 'E-mail', 'email', r.email || '')}
      ${fld('s-terms', 'Condição de pagamento', 'text', r.payment_terms || '', 'placeholder="30 dias"')}
    </div>
    ${fldSel('s-status', 'Status', [{ v: 'ativo', t: 'Ativo' }, { v: 'inativo', t: 'Inativo' }], r.status || 'ativo')}
    ${fld('s-notes', 'Observações', 'text', r.notes || '')}`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: isEdit ? 'Salvar alterações' : 'Cadastrar', cls: 'primary', onClick: async () => {
        const body = {
          name: $('#s-name').value, cnpj: $('#s-cnpj').value, category: $('#s-cat').value,
          contact_name: $('#s-contact').value, phone: $('#s-phone').value, email: $('#s-email').value,
          payment_terms: $('#s-terms').value, status: $('#s-status').value, notes: $('#s-notes').value
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
  const rows = await api('/api/bank');
  const c = $('#content');
  const pend = rows.filter(r => !r.reconciled);
  const saldo = rows.reduce((s, r) => s + r.amount, 0);

  c.innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Saldo do extrato</div><div class="value ${saldo < 0 ? 'neg' : ''}">${brl(saldo)}</div></div>
      <div class="card kpi warn"><div class="label">Não conciliados</div><div class="value">${pend.length}</div>
        <div class="detail">${brl(pend.reduce((s, r) => s + r.amount, 0))}</div></div>
      <div class="card kpi blue"><div class="label">Conciliados</div><div class="value">${rows.length - pend.length}</div></div>
    </div>
    <div class="toolbar">
      <select id="f-status"><option value="">Todos</option><option value="0" selected>Não conciliados</option><option value="1">Conciliados</option></select>
      <div class="spacer"></div>
      <button class="btn" id="btn-manual">+ Lançamento manual</button>
      <button class="btn blue" id="btn-import">Importar extrato (CSV)</button>
    </div>
    <div class="table-wrap"><table id="tbl"></table></div>
    <p class="hint">Importação: arquivo CSV com colunas <strong>data;descrição;valor</strong> (datas DD/MM/AAAA ou AAAA-MM-DD; valores negativos = débitos).</p>`;

  const draw = () => {
    const fs = $('#f-status').value;
    const filtered = rows.filter(r => fs === '' || String(r.reconciled) === fs);
    $('#tbl').innerHTML = `
      <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th><th class="actions">Ações</th></tr></thead>
      <tbody>${filtered.map(r => `<tr>
        <td>${brDate(r.txn_date)}</td>
        <td>${esc(r.description)}<br><small style="color:var(--muted)">${esc(r.imported_batch || '')}</small></td>
        <td class="num ${r.amount >= 0 ? 'pos' : 'neg'}">${brl(r.amount)}</td>
        <td>${r.reconciled ? '<span class="badge ok">Conciliado</span>' : '<span class="badge warn">Pendente</span>'}</td>
        <td class="actions">
          ${r.reconciled
            ? `<button class="btn sm" data-unrec="${r.id}">Desfazer</button>`
            : `<button class="btn sm primary" data-rec="${r.id}">Conciliar</button>`}
          <button class="btn sm danger-ghost" data-del="${r.id}">Excluir</button>
        </td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Nenhum lançamento.</div></td></tr>'}</tbody>`;
    $('#tbl').querySelectorAll('[data-rec]').forEach(b => b.onclick = () => conciliar(rows.find(r => r.id == b.dataset.rec)));
    $('#tbl').querySelectorAll('[data-unrec]').forEach(b => b.onclick = async () => { await api(`/api/bank/${b.dataset.unrec}/unreconcile`, { method: 'POST' }); toast('Conciliação desfeita.'); renderConciliacao(); });
    $('#tbl').querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete('lançamento', `/api/bank/${b.dataset.del}`, renderConciliacao));
  };
  $('#f-status').oninput = draw;

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
    <div class="field"><label>Arquivo CSV</label><input type="file" id="b-file" accept=".csv,.txt"></div>
    <p class="hint">Formato aceito: <code>data;descrição;valor</code> — uma linha por lançamento.<br>
    Exemplo: <code>05/07/2026;PAG BOLETO REGUS;-12500,00</code></p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Importar', cls: 'primary', onClick: async () => {
        const f = $('#b-file').files[0];
        if (!f) return modalError('Selecione um arquivo.');
        const text = await f.text();
        try {
          const r = await api('/api/bank/import', { method: 'POST', body: { csv: text } });
          closeModal(); toast(`${r.imported} lançamento(s) importado(s)${r.skipped ? ` · ${r.skipped} ignorado(s)` : ''}.`);
          renderConciliacao();
        } catch (e) { modalError(e.message); }
     }}]);

  draw();
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
    <div class="card" style="margin-bottom:16px"><h3>Despesas — orçado x realizado por categoria (${scope === 'ytd' ? 'Jan–' + MESES[maxM - 1] : 'ano completo'})</h3>
      <div class="chart-box tall"><canvas id="ch"></canvas></div></div>
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

  makeChart($('#ch'), {
    type: 'bar',
    data: { labels: desp.map(r => r.cat), datasets: [
      { label: 'Orçado', data: desp.map(r => r.orc), backgroundColor: '#B9D6C5', borderRadius: 4 },
      { label: 'Realizado', data: desp.map(r => r.real), backgroundColor: CORES.verde, borderRadius: 4 }
    ]},
    options: chartOpts({ indexAxis: 'y', scales: {
      x: { ticks: { callback: v => (v / 1000).toLocaleString('pt-BR') + ' mil', font: { family: 'DM Sans' } }, grid: { color: '#EDF1EE' } },
      y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } } })
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
function confirmAction(label, fn, okMsg) {
  openModal('Confirmar', `<p>Deseja realmente ${esc(label)}?</p>`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Confirmar', cls: 'primary', onClick: async () => {
        try { await fn(); closeModal(); toast(okMsg || 'Concluído.'); renderUsuarios(); }
        catch (e) { modalError(e.message); }
     }}]);
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

// ------------------ Inicialização ------------------
(async function init() {
  try {
    const me = await api('/api/auth/me');
    USER = me.user; enterApp();
  } catch {
    showLogin();
  }
})();
