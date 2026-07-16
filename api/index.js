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
const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Super-administrador: ÚNICO usuário que gerencia contas e permissões.
// Para transferir essa função, altere o e-mail abaixo (e faça deploy).
const SUPER_ADMIN_EMAIL = 'm.atanazio@proagroseguros.com';

app.use(express.json({ limit: '12mb' }));
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

// Páginas cujo acesso é configurável por usuário.
// "usuarios" não entra aqui: é exclusiva do administrador.
const PERM_PAGES = ['dashboard','pagar','receber','fluxo','conciliacao','fornecedores','orcamento','orcadoreal','relatorios'];

// Normaliza o objeto de permissões recebido do frontend para o formato
// { pagina: 'view' | 'edit' }, descartando páginas desconhecidas e níveis inválidos.
function normalizePermissions(input) {
  const out = {};
  const src = (input && typeof input === 'object') ? input : {};
  for (const page of PERM_PAGES) {
    const lvl = src[page];
    if (lvl === 'view' || lvl === 'edit') out[page] = lvl;
  }
  return out;
}

function levelOf(user, page) {
  if (user.role === 'admin') return 'edit';
  const p = (user.permissions || {})[page];
  return (p === 'edit' || p === 'view') ? p : 'none';
}
const canView = (user, page) => { const l = levelOf(user, page); return l === 'view' || l === 'edit'; };
const canEdit = (user, page) => levelOf(user, page) === 'edit';

// requireAuth agora carrega o usuário completo do banco a CADA requisição.
// Assim, mudanças de permissão ou desativação de conta têm efeito imediato,
// sem depender do que estava no token (que só guarda o id).
async function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' }); }
  try {
    const rows = await query(
      'SELECT id, name, email, role, status, active, permissions, must_change_password FROM erp_users WHERE id = $1',
      [payload.sub]
    );
    const u = rows[0];
    if (!u || u.active !== true || u.status !== 'ativo') {
      return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    }
    u.permissions = u.permissions || {};
    req.user = u;
    next();
  } catch (e) {
    console.error('[requireAuth]', e);
    return res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
}

// Trava da administração de usuários: somente o super-administrador (por e-mail).
function requireSuperAdmin(req, res, next) {
  if (req.user && String(req.user.email).toLowerCase() === SUPER_ADMIN_EMAIL) return next();
  return res.status(403).json({ error: 'Apenas o administrador principal pode gerenciar usuários.' });
}

// Exige permissão de LEITURA em ao menos uma das páginas que consomem o dado.
// (alguns endpoints alimentam mais de uma tela — ex.: /api/suppliers também
// abastece o seletor de fornecedores em Contas a Pagar.)
function requireViewAny(pages) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (pages.some(p => canView(req.user, p))) return next();
    return res.status(403).json({ error: 'Você não tem permissão para visualizar estes dados.' });
  };
}
// Exige permissão de EDIÇÃO na página dona do recurso. Esta é a trava de
// segurança real: um usuário "somente leitura" não consegue gravar nada,
// mesmo que envie a requisição manualmente.
function requireEdit(page) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (canEdit(req.user, page)) return next();
    return res.status(403).json({ error: 'Você não tem permissão para editar nesta seção.' });
  };
}

// Gerador de senha forte no servidor (usado como fallback/garantia).
function generateStrongPassword(len = 16) {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnopqrstuvwxyz', D = '23456789', S = '!@#$%&*?-_+=';
  const all = U + L + D + S;
  const crypto = require('crypto');
  const pick = set => set[crypto.randomInt(set.length)];
  let out = [pick(U), pick(L), pick(D), pick(S)];
  for (let i = out.length; i < len; i++) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
function passwordStrongEnough(pw) {
  return typeof pw === 'string' && pw.length >= 10 &&
    /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
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

// Autocadastro DESATIVADO: novos usuários são criados exclusivamente pelo
// super-administrador, em Administração > Usuários.
app.post('/api/auth/register', (req, res) =>
  res.status(403).json({ error: 'Cadastro indisponível. Solicite seu acesso ao administrador.' }));

app.post('/api/auth/login', loginRateLimit, h(async (req, res) => {
  const email = String(sanitize(req.body.email) || '').toLowerCase();
  const password = String(req.body.password || '');
  if (!emailDomainAllowed(email)) {
    return res.status(403).json({ error: 'Acesso permitido apenas para e-mails @proagroseguros.com ou @proagroinsur.tech.' });
  }
  const rows = await query('SELECT * FROM erp_users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  if (user.status === 'pendente') {
    return res.status(403).json({ error: 'Sua solicitação de acesso ainda não foi aprovada pelo administrador.' });
  }
  if (user.status === 'recusado' || user.active !== true) {
    return res.status(403).json({ error: 'Conta inativa. Contate o administrador.' });
  }
  setAuthCookie(res, user);
  res.json({ ok: true, user: {
    id: user.id, name: user.name, email: user.email, role: user.role,
    status: user.status, permissions: user.permissions || {},
    must_change_password: !!user.must_change_password,
    is_super: String(user.email).toLowerCase() === SUPER_ADMIN_EMAIL
  }});
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, h(async (req, res) => {
  const u = req.user;
  res.json({ user: {
    id: u.id, name: u.name, email: u.email, role: u.role,
    status: u.status, permissions: u.permissions || {},
    must_change_password: !!u.must_change_password,
    is_super: String(u.email).toLowerCase() === SUPER_ADMIN_EMAIL
  }});
}));

// Troca de senha do próprio usuário (usada também na troca obrigatória do
// primeiro acesso, quando o administrador gerou a senha inicial).
app.post('/api/auth/change-password', requireAuth, h(async (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (!passwordStrongEnough(next)) {
    return res.status(400).json({ error: 'A nova senha deve ter ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.' });
  }
  const rows = await query('SELECT password_hash, must_change_password FROM erp_users WHERE id = $1', [req.user.id]);
  const u = rows[0];
  // Na troca obrigatória de primeiro acesso não exigimos a senha atual.
  if (!u.must_change_password) {
    if (!bcrypt.compareSync(current, u.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }
  }
  await query('UPDATE erp_users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [bcrypt.hashSync(next, 10), req.user.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Fornecedores
// ------------------------------------------------------------
app.get('/api/suppliers', requireAuth, requireViewAny(['fornecedores','pagar']), h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_suppliers ORDER BY name'));
}));

app.post('/api/suppliers', requireAuth, requireEdit('fornecedores'), h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Razão social é obrigatória.' });
  const rows = await query(`INSERT INTO erp_suppliers (name, cnpj, category, contact_name, email, phone, payment_terms, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes)]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/suppliers/:id', requireAuth, requireEdit('fornecedores'), h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Razão social é obrigatória.' });
  await query(`UPDATE erp_suppliers SET name=$1, cnpj=$2, category=$3, contact_name=$4, email=$5, phone=$6, payment_terms=$7, status=$8, notes=$9 WHERE id=$10`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/suppliers/:id', requireAuth, requireEdit('fornecedores'), h(async (req, res) => {
  const usedRows = await query('SELECT COUNT(*)::int AS n FROM erp_payables WHERE supplier_id = $1', [req.params.id]);
  const used = usedRows[0].n;
  if (used > 0) return res.status(409).json({ error: `Fornecedor possui ${used} título(s) vinculado(s). Inative-o em vez de excluir.` });
  await query('DELETE FROM erp_suppliers WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Pagar
// ------------------------------------------------------------
app.get('/api/payables', requireAuth, requireViewAny(['pagar']), h(async (req, res) => {
  const rows = await query(`
    SELECT p.*, s.name AS supplier_name
    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id = p.supplier_id
    ORDER BY p.due_date`);
  res.json(rows);
}));

const PAYMENT_METHODS = ['boleto', 'pix', 'transferencia'];

function validateTitle(b) {
  if (!sanitize(b.description)) return 'Descrição é obrigatória.';
  if (!sanitize(b.category)) return 'Categoria é obrigatória.';
  const amount = Number(b.amount);
  if (!isFinite(amount) || amount <= 0) return 'Valor deve ser maior que zero.';
  if (!isDate(b.due_date)) return 'Data de vencimento inválida.';
  if (b.payment_method && !PAYMENT_METHODS.includes(b.payment_method)) return 'Forma de pagamento inválida.';
  if (b.payment_method === 'pix' && !sanitize(b.pix_key)) return 'Informe a chave PIX para essa forma de pagamento.';
  return null;
}

app.post('/api/payables', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  const pm = b.payment_method || null;
  const rows = await query(`INSERT INTO erp_payables (supplier_id, description, category, cost_center, document, amount, due_date, payment_method, pix_key, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [b.supplier_id || null, sanitize(b.description), sanitize(b.category), sanitize(b.cost_center),
     sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/payables/:id', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  const pm = b.payment_method || null;
  await query(`UPDATE erp_payables SET supplier_id=$1, description=$2, category=$3, cost_center=$4, document=$5, amount=$6, due_date=$7, payment_method=$8, pix_key=$9, notes=$10 WHERE id=$11`,
    [b.supplier_id || null, sanitize(b.description), sanitize(b.category), sanitize(b.cost_center),
     sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/payables/:id/pay', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const d = req.body.payment_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de pagamento inválida.' });
  await query(`UPDATE erp_payables SET status='pago', payment_date=$1 WHERE id=$2`, [d, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/payables/:id/unpay', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  await query(`UPDATE erp_payables SET status='pendente', payment_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/payables/:id', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['payable', req.params.id]);
  await query('DELETE FROM erp_payables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Receber
// ------------------------------------------------------------
app.get('/api/receivables', requireAuth, requireViewAny(['receber']), h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_receivables ORDER BY due_date'));
}));

app.post('/api/receivables', requireAuth, requireEdit('receber'), h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  if (!sanitize(b.client_name)) return res.status(400).json({ error: 'Cliente é obrigatório.' });
  const rows = await query(`INSERT INTO erp_receivables (client_name, description, category, document, amount, due_date, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [sanitize(b.client_name), sanitize(b.description), sanitize(b.category),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/receivables/:id', requireAuth, requireEdit('receber'), h(async (req, res) => {
  const b = req.body, err = validateTitle(b);
  if (err) return res.status(400).json({ error: err });
  if (!sanitize(b.client_name)) return res.status(400).json({ error: 'Cliente é obrigatório.' });
  await query(`UPDATE erp_receivables SET client_name=$1, description=$2, category=$3, document=$4, amount=$5, due_date=$6, notes=$7 WHERE id=$8`,
    [sanitize(b.client_name), sanitize(b.description), sanitize(b.category),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/receive', requireAuth, requireEdit('receber'), h(async (req, res) => {
  const d = req.body.receipt_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de recebimento inválida.' });
  await query(`UPDATE erp_receivables SET status='recebido', receipt_date=$1 WHERE id=$2`, [d, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/unreceive', requireAuth, requireEdit('receber'), h(async (req, res) => {
  await query(`UPDATE erp_receivables SET status='pendente', receipt_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/receivables/:id', requireAuth, requireEdit('receber'), h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['receivable', req.params.id]);
  await query('DELETE FROM erp_receivables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Anexos (boletos, notas fiscais, comprovantes) — armazenados no banco
// ------------------------------------------------------------
const ATTACH_TYPES = { payable: 'pagar', receivable: 'receber' };
const ATTACH_KINDS = ['boleto', 'nota_fiscal', 'comprovante', 'contrato', 'outro'];
const MAX_ATTACH_BYTES = 3 * 1024 * 1024; // 3 MB por arquivo (limite seguro p/ Vercel)

function pageForType(type) { return ATTACH_TYPES[type] || null; }

// Lista de anexos (metadados, sem o binário) de um título específico.
app.get('/api/attachments/:type/:id', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão para visualizar.' });
  const rows = await query(
    `SELECT id, kind, file_name, mime_type, byte_size, created_at
       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC`,
    [req.params.type, Number(req.params.id)]
  );
  res.json(rows);
}));

// Contagem de anexos por título (para exibir o total na listagem).
app.get('/api/attachments/count/:type', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão.' });
  const rows = await query(
    'SELECT entity_id, COUNT(*)::int AS n FROM erp_attachments WHERE entity_type=$1 GROUP BY entity_id',
    [req.params.type]
  );
  const map = {};
  rows.forEach(r => { map[r.entity_id] = r.n; });
  res.json(map);
}));

// Upload de um anexo (arquivo enviado em base64).
app.post('/api/attachments/:type/:id', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canEdit(req.user, page)) return res.status(403).json({ error: 'Sem permissão para anexar nesta seção.' });

  const fileName = sanitize(req.body.file_name);
  const mime = sanitize(req.body.mime_type) || 'application/octet-stream';
  const kind = ATTACH_KINDS.includes(req.body.kind) ? req.body.kind : 'outro';
  const b64 = String(req.body.data || '');
  if (!fileName) return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });
  if (!b64) return res.status(400).json({ error: 'Arquivo vazio.' });

  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { return res.status(400).json({ error: 'Arquivo inválido.' }); }
  if (!buf.length) return res.status(400).json({ error: 'Arquivo vazio.' });
  if (buf.length > MAX_ATTACH_BYTES) return res.status(413).json({ error: 'Arquivo acima do limite de 3 MB.' });

  // Confirma que o título existe.
  const table = req.params.type === 'payable' ? 'erp_payables' : 'erp_receivables';
  const own = await query(`SELECT id FROM ${table} WHERE id=$1`, [Number(req.params.id)]);
  if (!own.length) return res.status(404).json({ error: 'Título não encontrado.' });

  const ins = await query(
    `INSERT INTO erp_attachments (entity_type, entity_id, kind, file_name, mime_type, byte_size, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.params.type, Number(req.params.id), kind, fileName, mime, buf.length, buf, req.user.id]
  );
  res.json({ ok: true, id: ins[0].id });
}));

// Download / visualização de um anexo.
// Retornamos em base64 dentro de um JSON (texto puro) em vez de enviar o
// binário cru: funções serverless da Vercel às vezes corrompem respostas
// binárias dependendo do Content-Type — texto nunca tem esse problema.
app.get('/api/attachments/file/:id', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT entity_type, file_name, mime_type, data FROM erp_attachments WHERE id=$1', [Number(req.params.id)]);
  const a = rows[0];
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });
  const page = pageForType(a.entity_type);
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão.' });
  res.json({ file_name: a.file_name, mime_type: a.mime_type || 'application/octet-stream', data: a.data.toString('base64') });
}));

// Excluir um anexo.
app.delete('/api/attachments/:id', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT entity_type FROM erp_attachments WHERE id=$1', [Number(req.params.id)]);
  const a = rows[0];
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });
  const page = pageForType(a.entity_type);
  if (req.user.role !== 'admin' && !canEdit(req.user, page)) return res.status(403).json({ error: 'Sem permissão para excluir.' });
  await query('DELETE FROM erp_attachments WHERE id=$1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Configurações: categorias (despesa/receita/fornecedor) e centros de custo
// ------------------------------------------------------------
const CAT_TYPES = ['despesa', 'receita', 'fornecedor'];

// Leitura: qualquer usuário autenticado (precisa para popular os formulários).
// Só itens ATIVOS — o que está desativado some das opções de novos lançamentos,
// mas continua valendo para os lançamentos já existentes.
app.get('/api/settings', requireAuth, h(async (req, res) => {
  const cats = await query('SELECT id, type, name FROM erp_categories WHERE active = true ORDER BY type, name');
  const ccs = await query('SELECT id, name FROM erp_cost_centers WHERE active = true ORDER BY name');
  const grouped = { despesa: [], receita: [], fornecedor: [] };
  cats.forEach(c => grouped[c.type].push(c.name));
  res.json({ categories: grouped, costCenters: ccs.map(c => c.name) });
}));

// Gestão completa (inclui inativos) — somente o super-administrador.
app.get('/api/settings/manage', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const cats = await query('SELECT id, type, name, active FROM erp_categories ORDER BY type, name');
  const ccs = await query('SELECT id, name, active FROM erp_cost_centers ORDER BY name');
  res.json({ categories: cats, costCenters: ccs });
}));

app.post('/api/settings/categories', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const type = req.body.type, name = sanitize(req.body.name);
  if (!CAT_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de categoria inválido.' });
  if (!name) return res.status(400).json({ error: 'Informe o nome da categoria.' });
  const dup = await query('SELECT id FROM erp_categories WHERE type=$1 AND lower(name)=lower($2)', [type, name]);
  if (dup.length) return res.status(409).json({ error: 'Já existe uma categoria com este nome.' });
  const ins = await query('INSERT INTO erp_categories (type, name) VALUES ($1,$2) RETURNING id', [type, name]);
  res.json({ ok: true, id: ins[0].id });
}));

// Renomear (propaga para os lançamentos já cadastrados) e/ou ativar/desativar.
app.put('/api/settings/categories/:id', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT * FROM erp_categories WHERE id=$1', [id]);
  const cat = rows[0];
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });

  const name = sanitize(req.body.name);
  const active = req.body.active;
  if (name && name !== cat.name) {
    const dup = await query('SELECT id FROM erp_categories WHERE type=$1 AND lower(name)=lower($2) AND id<>$3', [cat.type, name, id]);
    if (dup.length) return res.status(409).json({ error: 'Já existe uma categoria com este nome.' });
    await query('UPDATE erp_categories SET name=$1 WHERE id=$2', [name, id]);
    // Propaga o novo nome para os lançamentos que já usam a categoria antiga.
    if (cat.type === 'despesa') {
      await query('UPDATE erp_payables SET category=$1 WHERE category=$2', [name, cat.name]);
      await query("UPDATE erp_budgets SET category=$1 WHERE category=$2 AND type='despesa'", [name, cat.name]);
    } else if (cat.type === 'receita') {
      await query('UPDATE erp_receivables SET category=$1 WHERE category=$2', [name, cat.name]);
      await query("UPDATE erp_budgets SET category=$1 WHERE category=$2 AND type='receita'", [name, cat.name]);
    } else {
      await query('UPDATE erp_suppliers SET category=$1 WHERE category=$2', [name, cat.name]);
    }
  }
  if (typeof active === 'boolean') await query('UPDATE erp_categories SET active=$1 WHERE id=$2', [active, id]);
  res.json({ ok: true });
}));

// Exclui a categoria — só se não estiver em uso em nenhum lançamento
// (caso contrário, oriente a desativar em vez de excluir).
app.delete('/api/settings/categories/:id', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT * FROM erp_categories WHERE id=$1', [id]);
  const cat = rows[0];
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });

  let used = 0;
  if (cat.type === 'despesa') {
    used = (await query('SELECT COUNT(*)::int AS n FROM erp_payables WHERE category=$1', [cat.name]))[0].n
         + (await query("SELECT COUNT(*)::int AS n FROM erp_budgets WHERE category=$1 AND type='despesa'", [cat.name]))[0].n;
  } else if (cat.type === 'receita') {
    used = (await query('SELECT COUNT(*)::int AS n FROM erp_receivables WHERE category=$1', [cat.name]))[0].n
         + (await query("SELECT COUNT(*)::int AS n FROM erp_budgets WHERE category=$1 AND type='receita'", [cat.name]))[0].n;
  } else {
    used = (await query('SELECT COUNT(*)::int AS n FROM erp_suppliers WHERE category=$1', [cat.name]))[0].n;
  }
  if (used > 0) return res.status(409).json({ error: `Esta categoria está em uso em ${used} registro(s). Desative-a em vez de excluir.` });
  await query('DELETE FROM erp_categories WHERE id=$1', [id]);
  res.json({ ok: true });
}));

app.post('/api/settings/cost-centers', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const name = sanitize(req.body.name);
  if (!name) return res.status(400).json({ error: 'Informe o nome do centro de custo.' });
  const dup = await query('SELECT id FROM erp_cost_centers WHERE lower(name)=lower($1)', [name]);
  if (dup.length) return res.status(409).json({ error: 'Já existe um centro de custo com este nome.' });
  const ins = await query('INSERT INTO erp_cost_centers (name) VALUES ($1) RETURNING id', [name]);
  res.json({ ok: true, id: ins[0].id });
}));

app.put('/api/settings/cost-centers/:id', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT * FROM erp_cost_centers WHERE id=$1', [id]);
  const cc = rows[0];
  if (!cc) return res.status(404).json({ error: 'Centro de custo não encontrado.' });

  const name = sanitize(req.body.name);
  const active = req.body.active;
  if (name && name !== cc.name) {
    const dup = await query('SELECT id FROM erp_cost_centers WHERE lower(name)=lower($1) AND id<>$2', [name, id]);
    if (dup.length) return res.status(409).json({ error: 'Já existe um centro de custo com este nome.' });
    await query('UPDATE erp_cost_centers SET name=$1 WHERE id=$2', [name, id]);
    await query('UPDATE erp_payables SET cost_center=$1 WHERE cost_center=$2', [name, cc.name]);
  }
  if (typeof active === 'boolean') await query('UPDATE erp_cost_centers SET active=$1 WHERE id=$2', [active, id]);
  res.json({ ok: true });
}));

app.delete('/api/settings/cost-centers/:id', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT * FROM erp_cost_centers WHERE id=$1', [id]);
  const cc = rows[0];
  if (!cc) return res.status(404).json({ error: 'Centro de custo não encontrado.' });
  const used = (await query('SELECT COUNT(*)::int AS n FROM erp_payables WHERE cost_center=$1', [cc.name]))[0].n;
  if (used > 0) return res.status(409).json({ error: `Este centro de custo está em uso em ${used} título(s). Desative-o em vez de excluir.` });
  await query('DELETE FROM erp_cost_centers WHERE id=$1', [id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Conciliação Bancária
// ------------------------------------------------------------
app.get('/api/bank', requireAuth, requireViewAny(['conciliacao']), h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_bank_transactions ORDER BY txn_date DESC, id DESC'));
}));

app.post('/api/bank', requireAuth, requireEdit('conciliacao'), h(async (req, res) => {
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
app.post('/api/bank/import', requireAuth, requireEdit('conciliacao'), h(async (req, res) => {
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
app.get('/api/bank/:id/suggestions', requireAuth, requireViewAny(['conciliacao']), h(async (req, res) => {
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

app.post('/api/bank/:id/reconcile', requireAuth, requireEdit('conciliacao'), h(async (req, res) => {
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

app.post('/api/bank/:id/unreconcile', requireAuth, requireEdit('conciliacao'), h(async (req, res) => {
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/bank/:id', requireAuth, requireEdit('conciliacao'), h(async (req, res) => {
  await query('DELETE FROM erp_bank_transactions WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Orçamento
// ------------------------------------------------------------
app.get('/api/budgets/:year', requireAuth, requireViewAny(['orcamento','orcadoreal']), h(async (req, res) => {
  const year = Number(req.params.year);
  res.json(await query('SELECT * FROM erp_budgets WHERE year = $1 ORDER BY type, category, month', [year]));
}));

// Upsert em lote: [{month, type, category, amount}, ...]
app.post('/api/budgets/:year', requireAuth, requireEdit('orcamento'), h(async (req, res) => {
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

app.delete('/api/budgets/:year/category', requireAuth, requireEdit('orcamento'), h(async (req, res) => {
  const { type, category } = req.body;
  await query('DELETE FROM erp_budgets WHERE year=$1 AND type=$2 AND category=$3', [Number(req.params.year), type, category]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Relatórios / agregações
// ------------------------------------------------------------

// Realizado por mês/categoria/tipo em um ano (para Orçado x Realizado e DRE)
app.get('/api/reports/actuals/:year', requireAuth, requireViewAny(['orcadoreal','relatorios']), h(async (req, res) => {
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
app.get('/api/reports/cashflow/:year', requireAuth, requireViewAny(['dashboard','fluxo']), h(async (req, res) => {
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

// KPIs e análises do dashboard
app.get('/api/reports/dashboard', requireAuth, requireViewAny(['dashboard']), h(async (req, res) => {
  const todayD = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (d, n2) => new Date(d.getTime() + n2 * 86400000);
  const today = iso(todayD);
  const in7 = iso(addDays(todayD, 7)), in15 = iso(addDays(todayD, 15)), in30 = iso(addDays(todayD, 30));
  const mesAtual = today.slice(0, 7);
  const anoAtual = todayD.getFullYear(), mesNum = todayD.getMonth() + 1;
  const monthStart = mesAtual + '-01';
  const monthEnd = iso(new Date(anoAtual, mesNum, 0));
  // Janela móvel dos últimos 12 meses (inclui o mês corrente).
  const start12 = new Date(todayD.getFullYear(), todayD.getMonth() - 11, 1);
  const start12ISO = iso(start12);

  const one = async (sql, params) => (await query(sql, params))[0];
  const wrap = r => ({ v: n(r.v), n: r.c });

  // ---- Posição de contas a pagar (aberto, por horizonte) ----
  const pagarPend = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente'`);
  const pagarHoje = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date = $1`, [today]);
  const pagar7 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in7]);
  const pagar15 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in15]);
  const pagar30 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in30]);
  const pagarVencido = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_payables WHERE status='pendente' AND due_date < $1`, [today]);

  // ---- Posição de contas a receber (aberto, por horizonte — alimenta o Fluxo de Caixa) ----
  const receberHoje = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date = $1`, [today]);
  const receber7 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in7]);
  const receber15 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in15]);
  const receber30 = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date BETWEEN $1 AND $2`, [today, in30]);
  const receberVencido = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE status='pendente' AND due_date < $1`, [today]);

  // ---- Contas a receber com vencimento no mês atual (indicador principal) ----
  const receberMesAtual = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE due_date BETWEEN $1 AND $2`, [monthStart, monthEnd]);
  const receberMesRecebido = await one(`SELECT COALESCE(SUM(amount),0) AS v, COUNT(*)::int AS c FROM erp_receivables WHERE due_date BETWEEN $1 AND $2 AND status='recebido'`, [monthStart, monthEnd]);

  // ---- Caixa / bancos ----
  const naoConciliados = await one(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions WHERE reconciled=false`);
  const saldoBanco = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions`);

  // ---- Despesas do mês (indicador principal) ----
  const pagoMes = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago' AND to_char(payment_date,'YYYY-MM')=$1`, [mesAtual]);

  // ---- Evolução últimos 12 meses (receitas x despesas, regime de caixa) ----
  const recMensal = await query(`SELECT to_char(date_trunc('month', receipt_date),'YYYY-MM') AS ym, SUM(amount) AS total
    FROM erp_receivables WHERE status='recebido' AND receipt_date >= $1 GROUP BY 1`, [start12ISO]);
  const despMensal = await query(`SELECT to_char(date_trunc('month', payment_date),'YYYY-MM') AS ym, SUM(amount) AS total
    FROM erp_payables WHERE status='pago' AND payment_date >= $1 GROUP BY 1`, [start12ISO]);
  const last12 = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(todayD.getFullYear(), todayD.getMonth() - i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const label = MES_ABREV[d.getMonth()] + '/' + String(d.getFullYear()).slice(2);
    last12.push({
      ym, label,
      receitas: n((recMensal.find(r => r.ym === ym) || {}).total),
      despesas: n((despMensal.find(r => r.ym === ym) || {}).total)
    });
  }

  // ---- Despesas por categoria (últimos 12 meses — gráfico de Receitas x Despesas) ----
  const despCatRows = await query(`SELECT category, SUM(amount) AS total FROM erp_payables
    WHERE status='pago' AND payment_date >= $1 GROUP BY category ORDER BY total DESC`, [start12ISO]);
  const despesasPorCategoria = despCatRows.map(r => ({ category: r.category, total: n(r.total) }));

  // ---- Análise por categoria: orçado x realizado do mês atual ----
  const orcadoCatRows = await query(`SELECT category, amount FROM erp_budgets WHERE year=$1 AND month=$2 AND type='despesa'`, [anoAtual, mesNum]);
  const realCatRows = await query(`SELECT category, SUM(amount) AS total FROM erp_payables
    WHERE status='pago' AND to_char(payment_date,'YYYY-MM')=$1 GROUP BY category`, [mesAtual]);
  const catSet = new Set([...orcadoCatRows.map(r => r.category), ...realCatRows.map(r => r.category)]);
  const categoriaMes = [...catSet].map(cat => {
    const orcado = n((orcadoCatRows.find(r => r.category === cat) || {}).amount);
    const realizado = n((realCatRows.find(r => r.category === cat) || {}).total);
    return { category: cat, orcado, realizado, variacao: realizado - orcado,
      variacaoPct: orcado > 0 ? ((realizado - orcado) / orcado) * 100 : (realizado > 0 ? null : 0) };
  }).sort((a, b) => b.realizado - a.realizado);
  const orcadoDespesaMes = orcadoCatRows.reduce((s, r) => s + n(r.amount), 0);

  // ---- Análise por centro de custo (últimos 12 meses, ranking completo) ----
  const centrosRows = await query(`SELECT cost_center, SUM(amount) AS total FROM erp_payables
    WHERE status='pago' AND payment_date >= $1 AND cost_center IS NOT NULL AND cost_center <> ''
    GROUP BY cost_center ORDER BY total DESC`, [start12ISO]);
  const centrosCusto = centrosRows.map(r => ({ centro: r.cost_center, total: n(r.total) }));
  const centrosCustoTotal = centrosCusto.reduce((s, c) => s + c.total, 0);

  // ---- Projeção diária de caixa (30 dias) ----
  const saidasDia = await query(`SELECT due_date, SUM(amount) AS total FROM erp_payables
    WHERE status='pendente' AND due_date BETWEEN $1 AND $2 GROUP BY due_date`, [today, in30]);
  const entradasDia = await query(`SELECT due_date, SUM(amount) AS total FROM erp_receivables
    WHERE status='pendente' AND due_date BETWEEN $1 AND $2 GROUP BY due_date`, [today, in30]);
  const projecaoDiaria = [];
  let running = n(saldoBanco.v);
  for (let i = 0; i <= 30; i++) {
    const d = iso(addDays(todayD, i));
    if (i > 0) running += n((entradasDia.find(r => r.due_date === d) || {}).total) - n((saidasDia.find(r => r.due_date === d) || {}).total);
    projecaoDiaria.push({ date: d, saldo: running });
  }
  const saldoNegativoEm = projecaoDiaria.find(p => p.saldo < 0)?.date || null;

  // ---- Contas a pagar: vencimentos próximos e maiores títulos em aberto ----
  const vencendoPagar = await query(`
    SELECT p.description, p.amount, p.due_date, p.category, s.name AS party
    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id=p.supplier_id
    WHERE p.status='pendente' AND p.due_date BETWEEN $1 AND $2
    ORDER BY p.due_date LIMIT 12`, [today, in30]);
  const maioresPagarAbertos = await query(`
    SELECT p.description, p.category, p.cost_center, p.amount, p.due_date, s.name AS fornecedor
    FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id=p.supplier_id
    WHERE p.status='pendente' ORDER BY p.amount DESC LIMIT 8`);

  // ---- Aging de contas a pagar vencidas ----
  const pagarVencidas = await query(`SELECT due_date, amount FROM erp_payables WHERE status='pendente' AND due_date < $1`, [today]);
  const agingPagar = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  pagarVencidas.forEach(r => {
    const dias = Math.floor((todayD - new Date(r.due_date + 'T00:00:00')) / 86400000);
    const b = dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+';
    agingPagar[b] += n(r.amount);
  });

  // ---- Insights para os Alertas ----
  const maiorClienteRows = await query(`SELECT client_name, SUM(amount) AS total, MIN(due_date) AS desde
    FROM erp_receivables WHERE status='pendente' AND due_date < $1 GROUP BY client_name ORDER BY total DESC LIMIT 1`, [today]);
  const maiorFornecedorRows = await query(`SELECT s.name AS fornecedor, SUM(p.amount) AS total
    FROM erp_payables p JOIN erp_suppliers s ON s.id=p.supplier_id
    WHERE p.status='pendente' GROUP BY s.name ORDER BY total DESC LIMIT 1`);

  res.json({
    // KPIs principais
    pagoMes: n(pagoMes.v),
    pagarVencido: wrap(pagarVencido),
    pagarAVencer: { v: n(pagarPend.v) - n(pagarVencido.v), n: pagarPend.c - pagarVencido.c },
    receberMesAtual: wrap(receberMesAtual), receberMesRecebido: wrap(receberMesRecebido),

    // Fluxo de caixa (mantém como já estava)
    saldoAtual: n(saldoBanco.v),
    pagarHoje: wrap(pagarHoje), pagar7: wrap(pagar7), pagar15: wrap(pagar15), pagar30: wrap(pagar30),
    receberHoje: wrap(receberHoje), receber7: wrap(receber7), receber15: wrap(receber15), receber30: wrap(receber30), receberVencido: wrap(receberVencido),
    projecaoDiaria, saldoNegativoEm,

    // Receitas x despesas (mantém como já estava)
    last12, despesasPorCategoria,

    // Contas a pagar (detalhado)
    pagarPend: wrap(pagarPend),
    vencendoPagar: vencendoPagar.map(v => ({ ...v, amount: n(v.amount) })),
    maioresPagarAbertos: maioresPagarAbertos.map(v => ({ ...v, amount: n(v.amount) })),
    agingPagar,

    // Análises por categoria e centro de custo
    categoriaMes, orcadoDespesaMes,
    centrosCusto, centrosCustoTotal,

    // Conciliação (usado apenas no alerta)
    naoConciliados: naoConciliados.c, naoConciliadosValor: n(naoConciliados.v),

    // Insights para os alertas
    maiorClienteInadimplente: maiorClienteRows[0] ? { cliente: maiorClienteRows[0].client_name, total: n(maiorClienteRows[0].total), desde: maiorClienteRows[0].desde } : null,
    maiorFornecedorAberto: maiorFornecedorRows[0] ? { fornecedor: maiorFornecedorRows[0].fornecedor, total: n(maiorFornecedorRows[0].total) } : null
  });
}));

// ------------------------------------------------------------
// Administração de usuários (SOMENTE o super-administrador)
// ------------------------------------------------------------
app.get('/api/users', requireAuth, requireSuperAdmin, h(async (req, res) => {
  res.json(await query(`SELECT id, name, email, role, status, active, permissions, must_change_password, created_at
    FROM erp_users ORDER BY CASE WHEN active THEN 0 ELSE 1 END, name`));
}));

// Cria um usuário diretamente, já ativo, com senha e permissões definidas.
app.post('/api/users', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const name = sanitize(req.body.name);
  const email = String(sanitize(req.body.email) || '').toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'usuario';

  if (!name || name.length < 3) return res.status(400).json({ error: 'Informe o nome completo.' });
  if (!emailDomainAllowed(email)) {
    return res.status(400).json({ error: 'E-mail deve ser @proagroseguros.com ou @proagroinsur.tech.' });
  }
  if (!passwordStrongEnough(password)) {
    return res.status(400).json({ error: 'A senha gerada não atende ao mínimo de segurança (10+ caracteres, com maiúscula, minúscula, número e símbolo).' });
  }
  const exists = await query('SELECT id FROM erp_users WHERE email = $1', [email]);
  if (exists.length) return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });

  const perms = role === 'admin' ? {} : normalizePermissions(req.body.permissions);
  const inserted = await query(
    `INSERT INTO erp_users (name, email, password_hash, role, status, active, permissions, must_change_password)
     VALUES ($1,$2,$3,$4,'ativo',true,$5::jsonb,true) RETURNING id`,
    [name, email, bcrypt.hashSync(password, 10), role, JSON.stringify(perms)]
  );
  res.json({ ok: true, id: inserted[0].id });
}));

// Atualizar perfil e permissões de um usuário.
app.put('/api/users/:id/permissions', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT id, email FROM erp_users WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (String(rows[0].email).toLowerCase() === SUPER_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'O administrador principal tem acesso total e não pode ser restringido.' });
  }
  const role = req.body.role === 'admin' ? 'admin' : 'usuario';
  const perms = role === 'admin' ? {} : normalizePermissions(req.body.permissions);
  await query('UPDATE erp_users SET role=$1, permissions=$2::jsonb WHERE id=$3',
    [role, JSON.stringify(perms), id]);
  res.json({ ok: true });
}));

// Redefinir a senha de um usuário (gera nova; troca obrigatória no acesso).
app.post('/api/users/:id/reset-password', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password || '');
  if (!passwordStrongEnough(password)) {
    return res.status(400).json({ error: 'A senha gerada não atende ao mínimo de segurança.' });
  }
  const rows = await query('SELECT id FROM erp_users WHERE id=$1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await query('UPDATE erp_users SET password_hash=$1, must_change_password=true WHERE id=$2',
    [bcrypt.hashSync(password, 10), id]);
  res.json({ ok: true });
}));

app.post('/api/users/:id/toggle', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT email FROM erp_users WHERE id = $1', [id]);
  if (rows.length && String(rows[0].email).toLowerCase() === SUPER_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Não é possível desativar o administrador principal.' });
  }
  await query("UPDATE erp_users SET active = NOT active WHERE id = $1", [id]);
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
