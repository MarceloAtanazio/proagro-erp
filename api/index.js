// ============================================================
// ProAgro ERP — API (Módulo Financeiro)
// Versão Vercel (serverless) + Supabase (Postgres)
//
// Diferenças em relação à versão local (Express + SQLite):
//  - better-sqlite3  -> pg (Postgres / Supabase), tudo assíncrono
//  - express-session -> cookie httpOnly com JWT assinado (stateless,
//    necessário pois funções serverless não compartilham memória
//    entre execuções)
//  - rate limit de login em Map()  -> tabela erp_login_attempts
//  - toda a lógica de negócio (validações, regras de conciliação,
//    relatórios) foi preservada
// ============================================================
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { query, n } = require('../src/db');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[auth] Variável JWT_SECRET não definida. Configure-a nas variáveis de ambiente da Vercel (string aleatória longa).');
}
const COOKIE_NAME = 'proagro_token';
const SESSION_HOURS = 8;

// Domínios corporativos autorizados
const ALLOWED_DOMAINS = ['proagroseguros.com', 'proagroinsur.tech'];

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ------------------------------------------------------------
// Segurança / utilitários
// ------------------------------------------------------------
function emailDomainAllowed(email) {
  const m = String(email || '').toLowerCase().trim().match(/^[^@\s]+@([^@\s]+)$/);
  return !!m && ALLOWED_DOMAINS.includes(m[1]);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: '/'
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
}

// Rate limit de login usando tabela Postgres (funções serverless não
// compartilham memória entre execuções, então um Map() local não funciona).
async function loginRateLimit(req, res, next) {
  try {
    const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const rows = await query(`
      INSERT INTO erp_login_attempts (ip, count, first_attempt)
      VALUES ($1, 1, now())
      ON CONFLICT (ip) DO UPDATE SET
        count = CASE WHEN now() - erp_login_attempts.first_attempt > interval '15 minutes'
                     THEN 1 ELSE erp_login_attempts.count + 1 END,
        first_attempt = CASE WHEN now() - erp_login_attempts.first_attempt > interval '15 minutes'
                     THEN now() ELSE erp_login_attempts.first_attempt END
      RETURNING count
    `, [ip]);
    if (rows[0].count > 10) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde 15 minutos.' });
    }
    next();
  } catch (e) {
    console.error('[loginRateLimit]', e);
    next(); // não bloqueia o login por falha do rate limiter
  }
}

const sanitize = v => (typeof v === 'string' ? v.trim() : v);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// Envolve handlers async para propagar erros ao Express corretamente.
const h = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

// ------------------------------------------------------------
// Autenticação
// ------------------------------------------------------------
app.post('/api/auth/register', loginRateLimit, h(async (req, res) => {
  const name = sanitize(req.body.name);
  const email = String(sanitize(req.body.email) || '').toLowerCase();
  const password = String(req.body.password || '');

  if (!name || name.length < 3) return res.status(400).json({ error: 'Informe o nome completo.' });
  if (!emailDomainAllowed(email)) {
    return res.status(403).json({ error: 'Cadastro permitido apenas para e-mails @proagroseguros.com ou @proagroinsur.tech.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });

  const exists = await query('SELECT id FROM erp_users WHERE email = $1', [email]);
  if (exists.length) return res.status(409).json({ error: 'E-mail já cadastrado.' });

  const hash = bcrypt.hashSync(password, 10);
  const countRows = await query('SELECT COUNT(*)::int AS n FROM erp_users');
  const isFirst = countRows[0].n === 0;
  const role = isFirst ? 'admin' : 'usuario';
  const inserted = await query(
    'INSERT INTO erp_users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id',
    [name, email, hash, role]
  );
  const user = { id: inserted[0].id, name, email, role };
  setAuthCookie(res, user);
  res.json({ ok: true, user });
}));

app.post('/api/auth/login', loginRateLimit, h(async (req, res) => {
  const email = String(sanitize(req.body.email) || '').toLowerCase();
  const password = String(req.body.password || '');
  if (!emailDomainAllowed(email)) {
    return res.status(403).json({ error: 'Acesso permitido apenas para e-mails @proagroseguros.com ou @proagroinsur.tech.' });
  }
  const rows = await query('SELECT * FROM erp_users WHERE email = $1 AND active = true', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  setAuthCookie(res, user);
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT id, name, email, role FROM erp_users WHERE id = $1', [req.user.id]);
  res.json({ user: rows[0] || null });
}));

// ------------------------------------------------------------
// Fornecedores
// ------------------------------------------------------------
app.get('/api/suppliers', requireAuth, h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_suppliers ORDER BY name'));
}));

app.post('/api/suppliers', requireAuth, h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Razão social é obrigatória.' });
  const rows = await query(`INSERT INTO erp_suppliers (name, cnpj, category, contact_name, email, phone, payment_terms, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes)]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/suppliers/:id', requireAuth, h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Razão social é obrigatória.' });
  await query(`UPDATE erp_suppliers SET name=$1, cnpj=$2, category=$3, contact_name=$4, email=$5, phone=$6, payment_terms=$7, status=$8, notes=$9 WHERE id=$10`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/suppliers/:id', requireAuth, h(async (req, res) => {
  const usedRows = await query('SELECT COUNT(*)::int AS n FROM erp_payables WHERE supplier_id = $1', [req.params.id]);
  const used = usedRows[0].n;
  if (used > 0) return res.status(409).json({ error: `Fornecedor possui ${used} título(s) vinculado(s). Inative-o em vez de excluir.` });
  await query('DELETE FROM erp_suppliers WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Pagar
// ------------------------------------------------------------
app.get('/api/payables', requireAuth, h(async (req, res) => {
  const rows = await query(`
    SELECT p.*, s.name AS supplier_name
    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id = p.supplier_id
    ORDER BY p.due_date`);
  res.json(rows);
}));

function validateTitle(b) {
  if (!sanitize(b.description)) return 'Descrição é obrigatória.';
  if (!sanitize(b.category)) return 'Categoria é obrigatória.';
  const amount = Number(b.amount);
  if (!isFinite(amount) || amount <= 0) return 'Valor deve ser maior que zero.';
  if (!isDate(b.due_date)) return 'Data de vencimento inválida.';
  return null;
}

app.post('/api/payables', requireAuth, h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  const rows = await query(`INSERT INTO erp_payables (supplier_id, description, category, cost_center, document, amount, due_date, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [b.supplier_id || null, sanitize(b.description), sanitize(b.category), sanitize(b.cost_center),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/payables/:id', requireAuth, h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  await query(`UPDATE erp_payables SET supplier_id=$1, description=$2, category=$3, cost_center=$4, document=$5, amount=$6, due_date=$7, notes=$8 WHERE id=$9`,
    [b.supplier_id || null, sanitize(b.description), sanitize(b.category), sanitize(b.cost_center),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/payables/:id/pay', requireAuth, h(async (req, res) => {
  const d = req.body.payment_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de pagamento inválida.' });
  await query(`UPDATE erp_payables SET status='pago', payment_date=$1 WHERE id=$2`, [d, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/payables/:id/unpay', requireAuth, h(async (req, res) => {
  await query(`UPDATE erp_payables SET status='pendente', payment_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/payables/:id', requireAuth, h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['payable', req.params.id]);
  await query('DELETE FROM erp_payables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Receber
// ------------------------------------------------------------
app.get('/api/receivables', requireAuth, h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_receivables ORDER BY due_date'));
}));

app.post('/api/receivables', requireAuth, h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  if (!sanitize(b.client_name)) return res.status(400).json({ error: 'Cliente é obrigatório.' });
  const rows = await query(`INSERT INTO erp_receivables (client_name, description, category, document, amount, due_date, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [sanitize(b.client_name), sanitize(b.description), sanitize(b.category),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/receivables/:id', requireAuth, h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  if (!sanitize(b.client_name)) return res.status(400).json({ error: 'Cliente é obrigatório.' });
  await query(`UPDATE erp_receivables SET client_name=$1, description=$2, category=$3, document=$4, amount=$5, due_date=$6, notes=$7 WHERE id=$8`,
    [sanitize(b.client_name), sanitize(b.description), sanitize(b.category),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/receive', requireAuth, h(async (req, res) => {
  const d = req.body.receipt_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de recebimento inválida.' });
  await query(`UPDATE erp_receivables SET status='recebido', receipt_date=$1 WHERE id=$2`, [d, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/unreceive', requireAuth, h(async (req, res) => {
  await query(`UPDATE erp_receivables SET status='pendente', receipt_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/receivables/:id', requireAuth, h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['receivable', req.params.id]);
  await query('DELETE FROM erp_receivables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Conciliação Bancária
// ------------------------------------------------------------
app.get('/api/bank', requireAuth, h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_bank_transactions ORDER BY txn_date DESC, id DESC'));
}));

app.post('/api/bank', requireAuth, h(async (req, res) => {
  const b = req.body;
  if (!isDate(b.txn_date)) return res.status(400).json({ error: 'Data inválida.' });
  if (!sanitize(b.description)) return res.status(400).json({ error: 'Descrição é obrigatória.' });
  const amount = Number(b.amount);
  if (!isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Valor inválido.' });
  const rows = await query('INSERT INTO erp_bank_transactions (txn_date, description, amount, imported_batch) VALUES ($1,$2,$3,$4) RETURNING id',
    [b.txn_date, sanitize(b.description), amount, 'manual']);
  res.json({ ok: true, id: rows[0].id });
}));

// Importação de extrato CSV: colunas data;descricao;valor (ou data,descricao,valor)
app.post('/api/bank/import', requireAuth, h(async (req, res) => {
  const text = String(req.body.csv || '');
  if (!text.trim()) return res.status(400).json({ error: 'Arquivo vazio.' });
  const batch = 'import-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const parseAmount = s => {
    s = String(s).trim().replace(/["'R$\s]/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // formato BR
    return Number(s);
  };
  const toISO = s => {
    s = String(s).trim().replace(/"/g, '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  let ok = 0, skipped = 0;
  for (const line of lines) {
    const sep = line.includes(';') ? ';' : ',';
    const parts = line.split(sep);
    if (parts.length < 3) { skipped++; continue; }
    const date = toISO(parts[0]);
    const amount = parseAmount(parts[parts.length - 1]);
    const desc = parts.slice(1, parts.length - 1).join(' ').replace(/"/g, '').trim();
    if (!date || !desc || !isFinite(amount) || amount === 0) { skipped++; continue; }
    await query('INSERT INTO erp_bank_transactions (txn_date, description, amount, imported_batch) VALUES ($1,$2,$3,$4)', [date, desc, amount, batch]);
    ok++;
  }
  res.json({ ok: true, imported: ok, skipped });
}));

// Sugestões de conciliação: títulos com mesmo valor, em janela de ±7 dias
app.get('/api/bank/:id/suggestions', requireAuth, h(async (req, res) => {
  const rows0 = await query('SELECT * FROM erp_bank_transactions WHERE id = $1', [req.params.id]);
  const t = rows0[0];
  if (!t) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  const abs = Math.abs(t.amount);
  let rows;
  if (t.amount < 0) {
    rows = await query(`
      SELECT p.id, p.description, p.amount, p.due_date AS ref_date, p.status, s.name AS party, 'payable' AS kind
      FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id = p.supplier_id
      WHERE ABS(p.amount - $1) < 0.01
        AND ABS(p.due_date - $2::date) <= 7
      ORDER BY ABS(p.due_date - $2::date)`, [abs, t.txn_date]);
  } else {
    rows = await query(`
      SELECT r.id, r.description, r.amount, r.due_date AS ref_date, r.status, r.client_name AS party, 'receivable' AS kind
      FROM erp_receivables r
      WHERE ABS(r.amount - $1) < 0.01
        AND ABS(r.due_date - $2::date) <= 7
      ORDER BY ABS(r.due_date - $2::date)`, [abs, t.txn_date]);
  }
  res.json(rows);
}));

app.post('/api/bank/:id/reconcile', requireAuth, h(async (req, res) => {
  const { matched_type, matched_id } = req.body;
  const rows0 = await query('SELECT * FROM erp_bank_transactions WHERE id = $1', [req.params.id]);
  const t = rows0[0];
  if (!t) return res.status(404).json({ error: 'Lançamento não encontrado.' });

  if (matched_type === 'payable' && matched_id) {
    await query(`UPDATE erp_payables SET status='pago', payment_date=COALESCE(payment_date, $1) WHERE id=$2`, [t.txn_date, matched_id]);
  } else if (matched_type === 'receivable' && matched_id) {
    await query(`UPDATE erp_receivables SET status='recebido', receipt_date=COALESCE(receipt_date, $1) WHERE id=$2`, [t.txn_date, matched_id]);
  }
  await query('UPDATE erp_bank_transactions SET reconciled=true, matched_type=$1, matched_id=$2 WHERE id=$3',
    [matched_type || 'manual', matched_id || null, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/bank/:id/unreconcile', requireAuth, h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/bank/:id', requireAuth, h(async (req, res) => {
  await query('DELETE FROM erp_bank_transactions WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Orçamento
// ------------------------------------------------------------
app.get('/api/budgets/:year', requireAuth, h(async (req, res) => {
  const year = Number(req.params.year);
  res.json(await query('SELECT * FROM erp_budgets WHERE year = $1 ORDER BY type, category, month', [year]));
}));

// Upsert em lote: [{month, type, category, amount}, ...]
app.post('/api/budgets/:year', requireAuth, h(async (req, res) => {
  const year = Number(req.params.year);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: 'Ano inválido.' });
  for (const it of items) {
    const m = Number(it.month), a = Number(it.amount);
    if (m < 1 || m > 12 || !['receita', 'despesa'].includes(it.type) || !sanitize(it.category) || !isFinite(a) || a < 0) continue;
    await query(`INSERT INTO erp_budgets (year, month, type, category, amount) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (year, month, type, category) DO UPDATE SET amount = excluded.amount`,
      [year, m, it.type, sanitize(it.category), a]);
  }
  res.json({ ok: true });
}));

app.delete('/api/budgets/:year/category', requireAuth, h(async (req, res) => {
  const { type, category } = req.body;
  await query('DELETE FROM erp_budgets WHERE year=$1 AND type=$2 AND category=$3', [Number(req.params.year), type, category]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Relatórios / agregações
// ------------------------------------------------------------

// Realizado por mês/categoria/tipo em um ano (para Orçado x Realizado e DRE)
app.get('/api/reports/actuals/:year', requireAuth, h(async (req, res) => {
  const y = Number(req.params.year);
  const despesas = await query(`
    SELECT EXTRACT(MONTH FROM payment_date)::int AS month, category, SUM(amount) AS total
    FROM erp_payables WHERE status='pago' AND EXTRACT(YEAR FROM payment_date) = $1
    GROUP BY month, category`, [y]);
  const receitas = await query(`
    SELECT EXTRACT(MONTH FROM receipt_date)::int AS month, category, SUM(amount) AS total
    FROM erp_receivables WHERE status='recebido' AND EXTRACT(YEAR FROM receipt_date) = $1
    GROUP BY month, category`, [y]);
  res.json({
    despesas: despesas.map(r => ({ ...r, total: n(r.total) })),
    receitas: receitas.map(r => ({ ...r, total: n(r.total) }))
  });
}));

// Fluxo de caixa: realizado (pagos/recebidos) + projetado (pendentes por vencimento)
app.get('/api/reports/cashflow/:year', requireAuth, h(async (req, res) => {
  const y = Number(req.params.year);
  const q = async (table, dateCol, statusVal, statusPend) => {
    const realizado = await query(`SELECT EXTRACT(MONTH FROM ${dateCol})::int AS month, SUM(amount) AS total
      FROM ${table} WHERE status='${statusVal}' AND EXTRACT(YEAR FROM ${dateCol}) = $1 GROUP BY month`, [y]);
    const projetado = await query(`SELECT EXTRACT(MONTH FROM due_date)::int AS month, SUM(amount) AS total
      FROM ${table} WHERE status='${statusPend}' AND EXTRACT(YEAR FROM due_date) = $1 GROUP BY month`, [y]);
    return {
      realizado: realizado.map(r => ({ ...r, total: n(r.total) })),
      projetado: projetado.map(r => ({ ...r, total: n(r.total) }))
    };
  };
  res.json({
    entradas: await q('erp_receivables', 'receipt_date', 'recebido', 'pendente'),
    saidas: await q('erp_payables', 'payment_date', 'pago', 'pendente')
  });
}));

// KPIs do dashboard
app.get('/api/reports/dashboard', requireAuth, h(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const mesAtual = today.slice(0, 7);

  const one = async (sql, params) => (await query(sql, params))[0];

  const pagarPend = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente'`);
  const pagar30 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in30]);
  const pagarVencido = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date < $1`, [today]);
  const receberPend = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente'`);
  const receber30 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in30]);
  const receberVencido = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date < $1`, [today]);
  const naoConciliados = await one(`SELECT COUNT(*)::int AS c FROM erp_bank_transactions WHERE reconciled=false`);
  const saldoBanco = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions`);
  const recebidoMes = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_receivables WHERE status='recebido' AND to_char(receipt_date,'YYYY-MM')=$1`, [mesAtual]);
  const pagoMes = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago' AND to_char(payment_date,'YYYY-MM')=$1`, [mesAtual]);

  const vencendo = await query(`
    SELECT 'pagar' AS tipo, p.description, p.amount, p.due_date, s.name AS party
    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id=p.supplier_id
    WHERE p.status='pendente' AND p.due_date BETWEEN $1 AND $2
    UNION ALL
    SELECT 'receber', description, amount, due_date, client_name
    FROM erp_receivables WHERE status='pendente' AND due_date BETWEEN $1 AND $2
    ORDER BY due_date LIMIT 10`, [today, in30]);

  const wrap = r => ({ v: n(r.v), n: r.c });
  res.json({
    pagarPend: wrap(pagarPend), pagar30: wrap(pagar30), pagarVencido: wrap(pagarVencido),
    receberPend: wrap(receberPend), receber30: wrap(receber30), receberVencido: wrap(receberVencido),
    naoConciliados: naoConciliados.c, saldoBanco: n(saldoBanco.v),
    recebidoMes: n(recebidoMes.v), pagoMes: n(pagoMes.v),
    vencendo: vencendo.map(v => ({ ...v, amount: n(v.amount) }))
  });
}));

// ------------------------------------------------------------
// Administração de usuários (somente admin)
// ------------------------------------------------------------
app.get('/api/users', requireAuth, requireAdmin, h(async (req, res) => {
  res.json(await query('SELECT id, name, email, role, active, created_at FROM erp_users ORDER BY name'));
}));

app.post('/api/users/:id/toggle', requireAuth, requireAdmin, h(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'Não é possível desativar o próprio usuário.' });
  await query('UPDATE erp_users SET active = NOT active WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Rota não encontrada dentro de /api
// (o arquivo estático index.html é servido pela própria Vercel via
// vercel.json — não é preciso express.static aqui)
// ------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ------------------------------------------------------------
// Frontend (servido pelo próprio Express, dentro da função)
// A detecção automática de arquivos estáticos da Vercel não estava
// servindo index.html/app.js/styles.css neste projeto, então servimos
// nós mesmos — mais garantido.
// ------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
