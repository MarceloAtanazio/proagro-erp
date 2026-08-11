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
const XLSX = require('xlsx');
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
const PERM_PAGES = ['dashboard','pagar','receber','fluxo','conciliacao','fornecedores','orcamento','orcadoreal','relatorios','viaticos','suprimentos','contratos'];

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
    // Heartbeat de presença: marca atividade no máximo 1x por minuto
    // (fire-and-forget — não atrasa nem derruba a requisição).
    query(`UPDATE erp_users SET last_seen_at = now()
           WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds')`,
      [u.id]).catch(() => {});
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

// "Hoje" no fuso do Brasil. A função serverless roda em UTC, então
// new Date().toISOString() vira o DIA SEGUINTE depois das 21h (BRT),
// deslocando vencimentos, status de viagem e datas padrão dos formulários.
// 'en-CA' formata como YYYY-MM-DD.
const TZ_BR = 'America/Sao_Paulo';
const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ_BR });
// Data em ISO a N dias de hoje (N pode ser negativo), sem passar por UTC.
const isoMaisDias = dias => {
  const [y, m, d] = hojeISO().split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d) + dias * 86400000);
  return base.toISOString().slice(0, 10);
};

// Envolve handlers async para propagar erros ao Express corretamente.
// ------------------------------------------------------------
// Log de auditoria
// ------------------------------------------------------------
// Registra a ação no banco (silenciosamente — uma falha ao logar nunca deve
// quebrar a requisição principal).
async function logAudit(user, action) {
  try {
    await query('INSERT INTO erp_audit_log (user_id, user_name, action) VALUES ($1,$2,$3)',
      [user.id, user.name, action]);
  } catch (e) { console.error('[audit]', e.message); }
}

// Traduz "MÉTODO padrão-da-rota" para uma descrição legível em português.
// Cobre toda escrita da plataforma (criação, edição, exclusão e ações como
// baixar/estornar/conciliar) sem precisar instrumentar cada rota manualmente.
const AUDIT_MAP = {
  'POST /api/auth/change-password': () => 'Alterou a própria senha',
  'POST /api/suppliers': req => `Cadastrou o fornecedor "${req.body.name}"`,
  'PUT /api/suppliers/:id': req => `Editou o fornecedor "${req.body.name}" (ID ${req.params.id})`,
  'DELETE /api/suppliers/:id': req => `Excluiu o fornecedor ID ${req.params.id}`,
  'POST /api/contratos': (req, body) => `Cadastrou o contrato "${req.body.titulo}" (ID ${body && body.id})`,
  'PUT /api/contratos/:id': req => `Editou o contrato "${req.body.titulo}" (ID ${req.params.id})`,
  'POST /api/contratos/:id/status': req => `Alterou o status do contrato ID ${req.params.id} para "${req.body.status}"`,
  'POST /api/contratos/:id/gerar-agora': (req, body) => `Gerou manualmente a parcela do contrato ID ${req.params.id}` + (body && body.venc ? ` (venc. ${body.venc})` : ''),
  'DELETE /api/contratos/:id': req => `Excluiu o contrato ID ${req.params.id}`,
  'POST /api/payables': (req, body) => `Criou o título a pagar "${req.body.description}" (ID ${body && body.id})`,
  'PUT /api/payables/:id': req => `Editou o título a pagar "${req.body.description}" (ID ${req.params.id})`,
  'POST /api/payables/:id/pay': req => `Baixou o pagamento do título a pagar ID ${req.params.id}`,
  'POST /api/payables/:id/unpay': req => `Estornou a baixa do título a pagar ID ${req.params.id}`,
  'DELETE /api/payables/:id': req => `Excluiu o título a pagar ID ${req.params.id}`,
  'POST /api/receivables': (req, body) => `Criou o recebível "${req.body.description}" (ID ${body && body.id})`,
  'PUT /api/receivables/:id': req => `Editou o recebível "${req.body.description}" (ID ${req.params.id})`,
  'POST /api/receivables/:id/receive': req => `Baixou o recebimento do recebível ID ${req.params.id}`,
  'POST /api/receivables/:id/unreceive': req => `Estornou a baixa do recebível ID ${req.params.id}`,
  'DELETE /api/receivables/:id': req => `Excluiu o recebível ID ${req.params.id}`,
  'POST /api/attachments/:type/:id': req => {
    const onde = {
      payable: 'ao título a pagar', receivable: 'ao título a receber', viatico: 'à despesa de viático',
      colab_cnh: 'à CNH do colaborador', colab_veiculo: 'ao veículo do colaborador', colab_seguro: 'à apólice de seguro do colaborador'
    }[req.params.type] || `ao registro (${req.params.type})`;
    return `Anexou um documento (${req.body.file_name || ''}) ${onde} ID ${req.params.id}`;
  },
  'DELETE /api/attachments/:id': req => `Excluiu o anexo ID ${req.params.id}`,
  'POST /api/settings/categories': req => `Criou a categoria "${req.body.name}" (${req.body.type})`,
  'PUT /api/settings/categories/:id': req => `Editou a categoria ID ${req.params.id}`,
  'DELETE /api/settings/categories/:id': req => `Excluiu a categoria ID ${req.params.id}`,
  'POST /api/settings/cost-centers': req => `Criou o centro de custo "${req.body.name}"`,
  'PUT /api/settings/cost-centers/:id': req => `Editou o centro de custo ID ${req.params.id}`,
  'DELETE /api/settings/cost-centers/:id': req => `Excluiu o centro de custo ID ${req.params.id}`,
  'POST /api/bank': () => 'Lançou uma movimentação bancária manual',
  'POST /api/bank/import': () => 'Importou lançamentos bancários (extrato)',
  'POST /api/bank/:id/reconcile': req => `Conciliou a movimentação bancária ID ${req.params.id}`,
  'POST /api/bank/:id/unreconcile': req => `Desfez a conciliação da movimentação bancária ID ${req.params.id}`,
  'DELETE /api/bank/:id': req => `Excluiu a movimentação bancária ID ${req.params.id}`,
  'POST /api/budgets/:year': req => `Atualizou o orçamento de ${req.params.year}`,
  'DELETE /api/budgets/:year/category': req => `Removeu uma categoria do orçamento de ${req.params.year}`,
  'POST /api/users': req => `Criou o usuário "${req.body.name}" (${req.body.email})`,
  'PUT /api/users/:id/permissions': req => `Alterou permissões/perfil do usuário ID ${req.params.id}`,
  'POST /api/users/:id/reset-password': req => `Redefiniu a senha do usuário ID ${req.params.id}`,
  'POST /api/users/:id/toggle': req => `Ativou/desativou o usuário ID ${req.params.id}`,
  'PUT /api/company': () => 'Atualizou os dados cadastrais da empresa',

  // Viáticos
  'POST /api/colaboradores': req => `Cadastrou o colaborador de viáticos "${req.body.name}" (Tier ${req.body.tier})`,
  'PUT /api/colaboradores/:id': req => `Editou o colaborador de viáticos ID ${req.params.id} ("${req.body.name}", Tier ${req.body.tier}${req.body.ativo === false ? ', inativado' : ''})`,
  'DELETE /api/colaboradores/:id': req => `Excluiu o colaborador de viáticos ID ${req.params.id}`,
  'POST /api/viaticos/tud': req => `Atualizou a TUD (Tier ${req.body.tier}, ${req.body.categoria_local}, ${req.body.tipo_despesa}) para ${fmtBRL(req.body.valor_diaria)}/dia`,
  'PUT /api/viaticos/config': req => `Atualizou a margem sobre o preço ANP do combustível para ${req.body.margem_pct}%`,
  'POST /api/viaticos/config/atualizar-anp': (req, body) => `Atualizou manualmente o preço do combustível via ANP${body && body.combustivel_anp_valor ? ` (R$ ${body.combustivel_anp_valor}/L, semana ${body.combustivel_anp_semana_fim})` : ''}`,
  'DELETE /api/viaticos/tud/:id': req => `Excluiu uma faixa da TUD (ID ${req.params.id})`,
  'POST /api/viaticos/solicitacoes': (req, body) => {
    let msg = `Criou solicitação de viático (ID ${body && body.id}) para o colaborador ID ${req.body.colaborador_id}`;
    const pi = req.body.pendencia_info;
    if (pi && pi.valor > 0) {
      msg += pi.decisao === 'descontar'
        ? ` — descontou pendência de ${fmtBRL(pi.valor)} de viagem(ns) anterior(es) (ID ${(pi.ids || []).join(', ')}) do valor liberado`
        : ` — optou por NÃO descontar a pendência de ${fmtBRL(pi.valor)} (mantida em aberto, viagem(ns) ID ${(pi.ids || []).join(', ')})`;
    }
    return msg;
  },
  'POST /api/viaticos/solicitacoes/autosservico': (req, body) => `Colaborador enviou uma solicitação de viático via autosserviço (ID ${body && body.id})`,
  'PUT /api/viaticos/solicitacoes/:id': req => `Editou a solicitação de viático ID ${req.params.id}`,
  'POST /api/viaticos/solicitacoes/:id/status': req => `Alterou manualmente o status da solicitação de viático ID ${req.params.id} para "${req.body.status}"` +
    (req.body.valor_liberado ? ` e registrou o valor liberado de R$ ${Number(req.body.valor_liberado).toFixed(2)}` : ''),
  'POST /api/viaticos/solicitacoes/:id/fechar': (req, body) => `Fechou/conferiu a solicitação de viático ID ${req.params.id} — resultado: ${body && body.status}` +
    (body && body.status === 'divergente' ? ` (pendência de ${fmtBRL(body.valor_pendencia)})` : body && body.status === 'devolvido' ? ` (${fmtBRL(body.valor_devolvido)} devolvido à carteira)` : ''),
  'POST /api/viaticos/solicitacoes/:id/arquivar': req => `Arquivou a solicitação de viático ID ${req.params.id}`,
  'POST /api/viaticos/solicitacoes/:id/reabrir': req => `Reabriu (admin) a solicitação de viático ID ${req.params.id}`,
  'POST /api/viaticos/solicitacoes/:id/excesso-status': req => `${req.body.status === 'aprovado' ? 'Aprovou' : 'Reprovou'} o excesso da TUD ("${req.body.chave}") na solicitação de viático ID ${req.params.id}`,
  'DELETE /api/viaticos/solicitacoes/:id': req => `Excluiu a solicitação de viático ID ${req.params.id}`,
  'POST /api/viaticos/solicitacoes/:id/despesas': req => `Lançou despesa de viático (${req.body.categoria}, ${fmtBRL(req.body.valor)}) na solicitação ID ${req.params.id}`,
  'PUT /api/viaticos/despesas/:id': req => `Editou a despesa de viático ID ${req.params.id} (${req.body.categoria}, ${fmtBRL(req.body.valor)})`,
  'DELETE /api/viaticos/despesas/:id': req => `Excluiu a despesa de viático ID ${req.params.id}`,

  // Suprimentos (estoque é área sensível: todo movimento fica registrado)
  'POST /api/suprimentos/itens': (req, body) => `Cadastrou o item de estoque "${req.body.nome}" (ID ${body && body.id})`,
  'PUT /api/suprimentos/itens/:id': req => `Editou o item de estoque ID ${req.params.id} ("${req.body.nome}"${req.body.ativo === false ? ', inativado' : ''})`,
  'DELETE /api/suprimentos/itens/:id': req => `Excluiu o item de estoque ID ${req.params.id}`,
  'POST /api/suprimentos/compras': (req, body) => `Registrou compra de ${req.body.quantidade} un. do item ID ${req.body.item_id} a ${fmtBRL(req.body.custo_unitario)}/un` +
    (body && body.payable_id ? ` — lançada em Contas a Pagar (título ID ${body.payable_id})` : ''),
  'POST /api/suprimentos/envios': (req, body) => `Registrou envio de ${req.body.quantidade} un. do item ID ${req.body.item_id} ao colaborador ID ${req.body.colaborador_id} (movimento ID ${body && body.id})`,
  'POST /api/suprimentos/envios/:id/status': req => `Marcou o envio ID ${req.params.id} como "${req.body.status}"${req.body.status === 'devolvido' ? ' (item retornou ao estoque)' : ''}`,
  'POST /api/suprimentos/ajustes': req => `Ajustou o estoque do item ID ${req.body.item_id}: ${req.body.tipo === 'saida' ? '−' : '+'}${req.body.quantidade} un. — motivo: "${req.body.notes}"`
};

// Intercepta res.json em toda requisição autenticada de escrita (POST/PUT/
// DELETE) e grava um registro no log de auditoria com a descrição da ação.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = body => {
    try {
      if (req.method !== 'GET' && req.user && res.statusCode < 400 && req.route) {
        const describe = AUDIT_MAP[`${req.method} ${req.route.path}`];
        const action = req.auditAction || (describe && describe(req, body));
        if (action) logAudit(req.user, action).catch(() => {});
      }
    } catch (e) { console.error('[audit-mw]', e.message); }
    return originalJson(body);
  };
  next();
});

const fmtBRL = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
const brDateBR = d => { if (!d) return ''; const s = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); const [y, m, day] = s.split('-'); return `${day}/${m}/${y}`; };
const PM_LABEL_PT = { boleto: 'Boleto', pix: 'PIX', transferencia: 'Transferência' };

// Compara valores antigos x novos e devolve uma lista de mudanças legíveis
// (ex.: "Centro de custo: "Administrativo" → "Operação a Campo""), para o
// log de auditoria citar exatamente o que foi alterado em vez de uma frase genérica.
function describeFieldChanges(oldRow, newRow, fields) {
  const changes = [];
  for (const [key, label] of fields) {
    const ov = oldRow[key] ?? '', nv = newRow[key] ?? '';
    if (String(ov) !== String(nv)) changes.push(`${label}: "${ov || '—'}" → "${nv || '—'}"`);
  }
  return changes;
}

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
  query('UPDATE erp_users SET last_seen_at = now() WHERE id = $1', [user.id]).catch(() => {});
  logAudit(user, 'Login realizado');
  res.json({ ok: true, user: {
    id: user.id, name: user.name, email: user.email, role: user.role,
    status: user.status, permissions: user.permissions || {},
    must_change_password: !!user.must_change_password,
    is_super: String(user.email).toLowerCase() === SUPER_ADMIN_EMAIL
  }});
}));

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      // Zera a presença para o usuário aparecer offline imediatamente.
      query('UPDATE erp_users SET last_seen_at = NULL WHERE id=$1', [payload.sub]).catch(() => {});
      query('SELECT id, name FROM erp_users WHERE id=$1', [payload.sub])
        .then(rows => { if (rows[0]) logAudit(rows[0], 'Logout realizado'); })
        .catch(() => {});
    } catch { /* token inválido/expirado — nada a registrar */ }
  }
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
  const rows = await query(`INSERT INTO erp_suppliers (name, cnpj, category, contact_name, email, phone, payment_terms, pix_key, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), sanitize(b.pix_key), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes)]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/suppliers/:id', requireAuth, requireEdit('fornecedores'), h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Razão social é obrigatória.' });
  await query(`UPDATE erp_suppliers SET name=$1, cnpj=$2, category=$3, contact_name=$4, email=$5, phone=$6, payment_terms=$7, pix_key=$8, status=$9, notes=$10 WHERE id=$11`,
    [sanitize(b.name), sanitize(b.cnpj), sanitize(b.category), sanitize(b.contact_name),
     sanitize(b.email), sanitize(b.phone), sanitize(b.payment_terms), sanitize(b.pix_key), b.status === 'inativo' ? 'inativo' : 'ativo', sanitize(b.notes), req.params.id]);
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
// Contratos (aluguel, contabilidade, meteorologia etc.) — fornecedores com
// vínculo recorrente. Cada contrato pode gerar sozinho as parcelas em Contas
// a Pagar, no ciclo definido (mensal/bimestral/.../anual).
//
// Duplicidade é travada em DUAS camadas: (1) "proxima_geracao" é o portão de
// entrada — o usuário decide a partir de qual competência o sistema pode
// gerar sozinho, então parcelas já lançadas manualmente antes disso nunca são
// tocadas; (2) o índice único (contract_id, due_date) no banco (ver migração)
// garante, via ON CONFLICT DO NOTHING, que mesmo duas chamadas concorrentes
// da rotina de geração não dupliquem uma parcela.
// ------------------------------------------------------------
const PERIODO_MESES = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

function proximoCiclo(dataISO, periodicidade) {
  const [y, m, d] = dataISO.split('-').map(Number);
  const meses = PERIODO_MESES[periodicidade] || 1;
  const base = new Date(Date.UTC(y, m - 1 + meses, d));
  // Meses com menos dias (ex.: vencimento dia 31 e o próximo mês só tem 30):
  // Date normaliza rolando pro mês seguinte — corrige voltando pro último dia do mês pretendido.
  if (base.getUTCDate() !== d) base.setUTCDate(0);
  return base.toISOString().slice(0, 10);
}

// Gera as parcelas vencidas/a vencer nos próximos 5 dias, para contratos
// ativos com geração automática ligada — chamada sempre que a lista de
// contratos é aberta (mesmo padrão usado no status automático de viáticos).
// Idempotente: ON CONFLICT DO NOTHING é a garantia real, não apenas o filtro
// de datas.
async function gerarParcelasPendentes() {
  const horizonte = isoMaisDias(5);
  const contratos = await query(
    `SELECT * FROM erp_contratos WHERE status='ativo' AND gerar_parcelas=true AND proxima_geracao IS NOT NULL AND proxima_geracao <= $1`,
    [horizonte]);
  for (const ct of contratos) {
    let venc = ct.proxima_geracao;
    let seguranca = 0; // nunca gera mais que 24 parcelas numa única passada (proteção contra loop)
    while (venc && venc <= horizonte && seguranca < 24) {
      if (ct.data_fim && venc > ct.data_fim) { venc = null; break; }
      const desc = `${ct.titulo} — parcela ${brDateBR(venc)}`;
      await query(
        `INSERT INTO erp_payables (supplier_id, description, category, cost_center, amount, due_date, contract_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (contract_id, due_date) WHERE contract_id IS NOT NULL DO NOTHING`,
        [ct.supplier_id, desc, ct.categoria, ct.cost_center, ct.valor, venc, ct.id]);
      venc = proximoCiclo(venc, ct.periodicidade);
      seguranca++;
    }
    await query('UPDATE erp_contratos SET proxima_geracao=$1 WHERE id=$2', [venc, ct.id]);
  }
}

app.get('/api/contratos', requireAuth, requireViewAny(['contratos']), h(async (req, res) => {
  await gerarParcelasPendentes().catch(e => console.error('[contratos] geração automática:', e.message));
  const rows = await query(`
    SELECT c.*, s.name AS supplier_name,
      (SELECT COUNT(*)::int FROM erp_payables p WHERE p.contract_id = c.id) AS parcelas_geradas
    FROM erp_contratos c JOIN erp_suppliers s ON s.id = c.supplier_id
    ORDER BY CASE WHEN c.status='ativo' THEN 0 ELSE 1 END, c.data_fim NULLS LAST, c.titulo`);
  res.json(rows);
}));

function validContrato(b) {
  if (!b.supplier_id) return 'Selecione o fornecedor.';
  if (!sanitize(b.titulo)) return 'Título do contrato é obrigatório.';
  if (!sanitize(b.categoria)) return 'Categoria é obrigatória.';
  if (!Object.keys(PERIODO_MESES).includes(b.periodicidade)) return 'Periodicidade inválida.';
  const valor = Number(b.valor);
  if (!isFinite(valor) || valor <= 0) return 'Valor deve ser maior que zero.';
  if (!isDate(b.data_inicio)) return 'Data de início inválida.';
  if (b.data_fim && !isDate(b.data_fim)) return 'Data de fim inválida.';
  if (b.data_fim && b.data_fim < b.data_inicio) return 'Data de fim não pode ser antes do início.';
  if (b.gerar_parcelas && !isDate(b.proxima_geracao)) return 'Informe a partir de quando o sistema deve gerar as parcelas automaticamente.';
  return null;
}

app.post('/api/contratos', requireAuth, requireEdit('contratos'), h(async (req, res) => {
  const b = req.body, err = validContrato(b);
  if (err) return res.status(400).json({ error: err });
  const rows = await query(
    `INSERT INTO erp_contratos (supplier_id, titulo, categoria, cost_center, valor, periodicidade, data_inicio, data_fim,
       renovacao_automatica, gerar_parcelas, proxima_geracao, documento, observacoes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [b.supplier_id, sanitize(b.titulo), sanitize(b.categoria), sanitize(b.cost_center), Number(b.valor), b.periodicidade,
     b.data_inicio, b.data_fim || null, b.renovacao_automatica === true, b.gerar_parcelas !== false,
     b.gerar_parcelas !== false ? b.proxima_geracao : null, sanitize(b.documento), sanitize(b.observacoes), req.user.id]);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/contratos/:id', requireAuth, requireEdit('contratos'), h(async (req, res) => {
  const b = req.body, err = validContrato(b);
  if (err) return res.status(400).json({ error: err });
  await query(
    `UPDATE erp_contratos SET supplier_id=$1, titulo=$2, categoria=$3, cost_center=$4, valor=$5, periodicidade=$6,
       data_inicio=$7, data_fim=$8, renovacao_automatica=$9, gerar_parcelas=$10, proxima_geracao=$11,
       documento=$12, observacoes=$13 WHERE id=$14`,
    [b.supplier_id, sanitize(b.titulo), sanitize(b.categoria), sanitize(b.cost_center), Number(b.valor), b.periodicidade,
     b.data_inicio, b.data_fim || null, b.renovacao_automatica === true, b.gerar_parcelas !== false,
     b.gerar_parcelas !== false ? b.proxima_geracao : null, sanitize(b.documento), sanitize(b.observacoes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/contratos/:id/status', requireAuth, requireEdit('contratos'), h(async (req, res) => {
  const status = req.body.status;
  if (!['ativo', 'suspenso', 'encerrado'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  await query('UPDATE erp_contratos SET status=$1 WHERE id=$2', [status, req.params.id]);
  res.json({ ok: true });
}));

// Gera manualmente a PRÓXIMA parcela pendente deste contrato, sem esperar o
// horizonte de 5 dias — mesma trava de idempotência (ON CONFLICT). Gera uma
// parcela por clique; se o usuário estiver atrasado em vários ciclos, repetir
// o clique avança um ciclo de cada vez.
app.post('/api/contratos/:id/gerar-agora', requireAuth, requireEdit('contratos'), h(async (req, res) => {
  const ct = (await query('SELECT * FROM erp_contratos WHERE id=$1', [req.params.id]))[0];
  if (!ct) return res.status(404).json({ error: 'Contrato não encontrado.' });
  if (!ct.proxima_geracao) return res.status(400).json({ error: 'Este contrato não tem geração automática configurada.' });
  const venc = ct.proxima_geracao;
  if (ct.data_fim && venc > ct.data_fim) return res.status(400).json({ error: 'O contrato já encerrou o período de geração de parcelas.' });
  const desc = `${ct.titulo} — parcela ${brDateBR(venc)}`;
  const ins = await query(
    `INSERT INTO erp_payables (supplier_id, description, category, cost_center, amount, due_date, contract_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (contract_id, due_date) WHERE contract_id IS NOT NULL DO NOTHING RETURNING id`,
    [ct.supplier_id, desc, ct.categoria, ct.cost_center, ct.valor, venc, ct.id]);
  const proximo = proximoCiclo(venc, ct.periodicidade);
  await query('UPDATE erp_contratos SET proxima_geracao=$1 WHERE id=$2', [(ct.data_fim && proximo > ct.data_fim) ? null : proximo, ct.id]);
  res.json({ ok: true, gerou: ins.length > 0, venc });
}));

app.delete('/api/contratos/:id', requireAuth, requireEdit('contratos'), h(async (req, res) => {
  const used = (await query('SELECT COUNT(*)::int AS n FROM erp_payables WHERE contract_id=$1', [req.params.id]))[0].n;
  if (used > 0) return res.status(409).json({ error: `Contrato possui ${used} parcela(s) já geradas em Contas a Pagar. Encerre-o em vez de excluir.` });
  await query('DELETE FROM erp_contratos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Pagar
// ------------------------------------------------------------
app.get('/api/payables', requireAuth, requireViewAny(['pagar']), h(async (req, res) => {
  const rows = await query(`
    SELECT p.*, s.name AS supplier_name,
      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id) AS attachment_count
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

  // Registra exatamente o que mudou (para o log de auditoria).
  const oldRows = await query('SELECT p.*, s.name AS supplier_name FROM erp_payables p LEFT JOIN erp_suppliers s ON s.id=p.supplier_id WHERE p.id=$1', [req.params.id]);
  const old = oldRows[0];
  if (old) {
    let newSupplierName = '';
    if (b.supplier_id) newSupplierName = (await query('SELECT name FROM erp_suppliers WHERE id=$1', [b.supplier_id]))[0]?.name || '';
    const changes = describeFieldChanges(
      { ...old, supplier_name: old.supplier_name || '', amount: fmtBRL(old.amount), due_date: brDateBR(old.due_date), payment_method: PM_LABEL_PT[old.payment_method] || '' },
      { supplier_name: newSupplierName, description: sanitize(b.description), category: sanitize(b.category), cost_center: sanitize(b.cost_center),
        document: sanitize(b.document), amount: fmtBRL(b.amount), due_date: brDateBR(b.due_date), payment_method: PM_LABEL_PT[pm] || '', pix_key: pm === 'pix' ? sanitize(b.pix_key) : '', notes: sanitize(b.notes) },
      [['supplier_name','Fornecedor'],['description','Descrição'],['category','Categoria'],['cost_center','Centro de custo'],
       ['document','Documento'],['amount','Valor'],['due_date','Vencimento'],['payment_method','Forma de pagamento'],['pix_key','Chave PIX'],['notes','Observações']]
    );
    req.auditAction = changes.length
      ? `Editou o título a pagar "${old.description}" (ID ${req.params.id}) — ${changes.join('; ')}`
      : `Editou o título a pagar "${old.description}" (ID ${req.params.id}) sem alterações de campo`;
  }

  await query(`UPDATE erp_payables SET supplier_id=$1, description=$2, category=$3, cost_center=$4, document=$5, amount=$6, due_date=$7, payment_method=$8, pix_key=$9, notes=$10 WHERE id=$11`,
    [b.supplier_id || null, sanitize(b.description), sanitize(b.category), sanitize(b.cost_center),
     sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/payables/:id/pay', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const d = req.body.payment_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de pagamento inválida.' });
  const p = (await query('SELECT description, amount FROM erp_payables WHERE id=$1', [req.params.id]))[0];
  if (!p) return res.status(404).json({ error: 'Título não encontrado.' });
  await query(`UPDATE erp_payables SET status='pago', payment_date=$1 WHERE id=$2`, [d, req.params.id]);
  // Não criamos lançamento bancário aqui: o saldo (Dashboard/Fluxo de Caixa) já é
  // calculado direto do status de Contas a Pagar/Receber. Conciliação Bancária
  // fica reservada só para lançamentos manuais e para o extrato importado de
  // verdade — assim ele bate exatamente com o que o banco mostra.
  res.json({ ok: true });
}));

app.post('/api/payables/:id/unpay', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  await query(`DELETE FROM erp_bank_transactions WHERE matched_type='payable' AND matched_id=$1 AND auto_generated=true`, [req.params.id]);
  await query(`UPDATE erp_payables SET status='pendente', payment_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/payables/:id', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  await query(`DELETE FROM erp_bank_transactions WHERE matched_type='payable' AND matched_id=$1 AND auto_generated=true`, [req.params.id]);
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['payable', req.params.id]);
  await query('DELETE FROM erp_payables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Contas a Receber
// ------------------------------------------------------------
app.get('/api/receivables', requireAuth, requireViewAny(['receber']), h(async (req, res) => {
  res.json(await query(`
    SELECT r.*,
      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='receivable' AND a.entity_id=r.id) AS attachment_count
    FROM erp_receivables r ORDER BY r.due_date`));
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

  const oldRows = await query('SELECT * FROM erp_receivables WHERE id=$1', [req.params.id]);
  const old = oldRows[0];
  if (old) {
    const changes = describeFieldChanges(
      { ...old, amount: fmtBRL(old.amount), due_date: brDateBR(old.due_date) },
      { client_name: sanitize(b.client_name), description: sanitize(b.description), category: sanitize(b.category),
        document: sanitize(b.document), amount: fmtBRL(b.amount), due_date: brDateBR(b.due_date), notes: sanitize(b.notes) },
      [['client_name','Cliente'],['description','Descrição'],['category','Categoria'],['document','Documento'],
       ['amount','Valor'],['due_date','Vencimento'],['notes','Observações']]
    );
    req.auditAction = changes.length
      ? `Editou o recebível "${old.description}" (ID ${req.params.id}) — ${changes.join('; ')}`
      : `Editou o recebível "${old.description}" (ID ${req.params.id}) sem alterações de campo`;
  }

  await query(`UPDATE erp_receivables SET client_name=$1, description=$2, category=$3, document=$4, amount=$5, due_date=$6, notes=$7 WHERE id=$8`,
    [sanitize(b.client_name), sanitize(b.description), sanitize(b.category),
     sanitize(b.document), Number(b.amount), b.due_date, sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/receive', requireAuth, requireEdit('receber'), h(async (req, res) => {
  const d = req.body.receipt_date;
  if (!isDate(d)) return res.status(400).json({ error: 'Data de recebimento inválida.' });
  const r = (await query('SELECT description, amount FROM erp_receivables WHERE id=$1', [req.params.id]))[0];
  if (!r) return res.status(404).json({ error: 'Recebível não encontrado.' });
  await query(`UPDATE erp_receivables SET status='recebido', receipt_date=$1 WHERE id=$2`, [d, req.params.id]);
  // Idem: sem lançamento bancário automático — o saldo já vem direto do status
  // de Contas a Receber. Conciliação Bancária fica só para manual + extrato real.
  res.json({ ok: true });
}));

app.post('/api/receivables/:id/unreceive', requireAuth, requireEdit('receber'), h(async (req, res) => {
  await query(`DELETE FROM erp_bank_transactions WHERE matched_type='receivable' AND matched_id=$1 AND auto_generated=true`, [req.params.id]);
  await query(`UPDATE erp_receivables SET status='pendente', receipt_date=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/receivables/:id', requireAuth, requireEdit('receber'), h(async (req, res) => {
  await query(`DELETE FROM erp_bank_transactions WHERE matched_type='receivable' AND matched_id=$1 AND auto_generated=true`, [req.params.id]);
  await query('UPDATE erp_bank_transactions SET reconciled=false, matched_type=NULL, matched_id=NULL WHERE matched_type=$1 AND matched_id=$2', ['receivable', req.params.id]);
  await query('DELETE FROM erp_receivables WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Anexos (boletos, notas fiscais, comprovantes) — armazenados no banco
// ------------------------------------------------------------
// Documentos de colaborador (CNH, veículo/CRLV, apólice de seguro) usam a mesma
// máquina de anexos dos títulos — validação de MIME, conferência da assinatura
// do arquivo, download e log de auditoria já vêm de graça.
const ATTACH_TYPES = {
  payable: 'pagar', receivable: 'receber', viatico: 'viaticos',
  colab_cnh: 'viaticos', colab_veiculo: 'viaticos', colab_seguro: 'viaticos'
};
const ATTACH_TIPOS_COLAB = { colab_cnh: 'CNH', colab_veiculo: 'veículo (CRLV)', colab_seguro: 'apólice de seguro' };
// CNH e apólice são documentos pessoais: quem tem apenas leitura em Viáticos
// (o próprio colaborador de campo) enxerga suas viagens, mas não pode baixar
// documento de colega. Por isso estes tipos exigem permissão de EDIÇÃO até
// para visualizar — diferente dos comprovantes de despesa.
const ehAnexoColaborador = type => Object.prototype.hasOwnProperty.call(ATTACH_TIPOS_COLAB, type);
const ATTACH_KINDS = ['boleto', 'nota_fiscal', 'comprovante', 'contrato', 'outro'];
const MAX_ATTACH_BYTES = 3 * 1024 * 1024; // 3 MB por arquivo (limite seguro p/ Vercel)
// Formatos aceitos como comprovante: os que a operação realmente usa
// (comprovante em PDF/foto, XML de NFe, planilha e documento). Ficam de fora
// justamente os que o navegador EXECUTA: SVG e HTML são marcação com script e
// rodariam na origem do ERP ao abrir o anexo (auditoria 2026-07-29, C4).
const ATTACH_MIMES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/xml', 'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel'                                                 // .xls
];
// Só estes são exibidos embutidos (o resto é baixado) — nenhum executa script.
const ATTACH_MIMES_PREVIEW = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Confere o tipo pela assinatura do próprio arquivo, em vez de confiar no MIME
// que o cliente informou. Devolve o MIME confirmado ou null se o conteúdo não
// corresponder a nada permitido (um SVG renomeado para .png cai aqui).
function mimeDoConteudo(buf, mimeInformado) {
  if (buf.length < 8) return null;
  const hex = buf.subarray(0, 12).toString('hex').toLowerCase();
  if (hex.startsWith('25504446')) return 'application/pdf';                   // %PDF
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';                          // JPEG
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';                 // PNG
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  // XLSX/DOCX são ZIP ("PK\x03\x04"); o formato exato vem do MIME informado,
  // que aqui já passou pela whitelist.
  if (hex.startsWith('504b0304')) {
    return ATTACH_MIMES.includes(mimeInformado) && mimeInformado.includes('openxmlformats')
      ? mimeInformado : 'application/vnd.ms-excel';
  }
  // XML (NFe): texto que começa com declaração ou tag. Recusa marcação
  // executável disfarçada de XML.
  const inicio = buf.subarray(0, 512).toString('utf8').trim().toLowerCase();
  if (inicio.startsWith('<?xml') || inicio.startsWith('<nfe') || inicio.startsWith('<nfeproc')) {
    if (/<svg|<html|<script|<!doctype html/.test(inicio)) return null;
    return 'text/xml';
  }
  return null;
}

function pageForType(type) { return ATTACH_TYPES[type] || null; }

// Um anexo de viático pertence a uma DESPESA, que pertence a uma SOLICITAÇÃO
// de um colaborador. Quem tem apenas leitura em Viáticos vê somente as próprias
// viagens (viaticosEscopo) — e a mesma trava precisa valer para os anexos,
// senão bastava trocar o id na URL para baixar o comprovante de outra pessoa
// (auditoria 2026-07-29, achado C2). Devolve true quando não há restrição
// (admin ou quem edita Viáticos) ou quando o anexo é do próprio colaborador.
async function anexoViaticoNoEscopo(user, despesaId) {
  const escopo = await viaticosEscopo(user);
  if (!escopo) return true;
  const r = await query(
    `SELECT 1 FROM erp_viaticos_despesas d
       JOIN erp_viaticos_solicitacoes s ON s.id = d.solicitacao_id
      WHERE d.id = $1 AND s.colaborador_id = ANY($2)`, [Number(despesaId), escopo]);
  return r.length > 0;
}

// IMPORTANTE: rotas com segmento literal ("file", "count") precisam vir ANTES
// da rota genérica "/:type/:id" — senão o Express casa "file"/"count" como se
// fossem o próprio :type, e a rota certa nunca é alcançada.

// Download / visualização de um anexo.
// Retornamos em base64 dentro de um JSON (texto puro) em vez de enviar o
// binário cru: funções serverless da Vercel às vezes corrompem respostas
// binárias dependendo do Content-Type — texto nunca tem esse problema.
app.get('/api/attachments/file/:id', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT entity_type, entity_id, file_name, mime_type, data FROM erp_attachments WHERE id=$1', [Number(req.params.id)]);
  const a = rows[0];
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });
  const page = pageForType(a.entity_type);
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão.' });
  if (ehAnexoColaborador(a.entity_type) && req.user.role !== 'admin' && !canEdit(req.user, page)) {
    return res.status(403).json({ error: 'Documentos pessoais de colaborador só podem ser abertos por quem administra Viáticos.' });
  }
  if (a.entity_type === 'viatico' && !(await anexoViaticoNoEscopo(req.user, a.entity_id))) {
    return res.status(403).json({ error: 'Este anexo pertence à viagem de outro colaborador.' });
  }
  res.json({ file_name: a.file_name, mime_type: a.mime_type || 'application/octet-stream', data: a.data.toString('base64') });
}));

// Contagem de anexos por título (para exibir o total na listagem).
app.get('/api/attachments/count/:type', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão.' });
  if (ehAnexoColaborador(req.params.type) && req.user.role !== 'admin' && !canEdit(req.user, page)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  // Em viáticos a contagem também respeita o escopo do colaborador — antes
  // devolvia o total da empresa inteira (achado C2).
  const escopoViatico = req.params.type === 'viatico' ? await viaticosEscopo(req.user) : null;
  const rows = escopoViatico
    ? await query(
        `SELECT a.entity_id, COUNT(*)::int AS n FROM erp_attachments a
           JOIN erp_viaticos_despesas d ON d.id = a.entity_id
           JOIN erp_viaticos_solicitacoes s ON s.id = d.solicitacao_id
          WHERE a.entity_type='viatico' AND s.colaborador_id = ANY($1)
          GROUP BY a.entity_id`, [escopoViatico])
    : await query(
        'SELECT entity_id, COUNT(*)::int AS n FROM erp_attachments WHERE entity_type=$1 GROUP BY entity_id',
        [req.params.type]
      );
  const map = {};
  rows.forEach(r => { map[r.entity_id] = r.n; });
  res.json(map);
}));

// Lista de anexos (metadados, sem o binário) de um título específico.
app.get('/api/attachments/:type/:id', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403).json({ error: 'Sem permissão para visualizar.' });
  if (ehAnexoColaborador(req.params.type) && req.user.role !== 'admin' && !canEdit(req.user, page)) {
    return res.status(403).json({ error: 'Documentos pessoais de colaborador só podem ser vistos por quem administra Viáticos.' });
  }
  if (req.params.type === 'viatico' && !(await anexoViaticoNoEscopo(req.user, req.params.id))) {
    return res.status(403).json({ error: 'Esta despesa pertence à viagem de outro colaborador.' });
  }
  const rows = await query(
    `SELECT id, kind, file_name, mime_type, byte_size, created_at
       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC`,
    [req.params.type, Number(req.params.id)]
  );
  res.json(rows);
}));

// Upload de um anexo (arquivo enviado em base64).
app.post('/api/attachments/:type/:id', requireAuth, h(async (req, res) => {
  const page = pageForType(req.params.type);
  if (!page) return res.status(400).json({ error: 'Tipo inválido.' });
  if (req.user.role !== 'admin' && !canEdit(req.user, page)) return res.status(403).json({ error: 'Sem permissão para anexar nesta seção.' });

  if (req.params.type === 'viatico' && !(await anexoViaticoNoEscopo(req.user, req.params.id))) {
    return res.status(403).json({ error: 'Esta despesa pertence à viagem de outro colaborador.' });
  }

  const fileName = sanitize(req.body.file_name);
  // O MIME vem do cliente e antes era aceito como veio: um anexo
  // "image/svg+xml" era servido de volta e renderizado em <iframe>, e SVG
  // executa script na origem do ERP (auditoria 2026-07-29, achado C4).
  // Só formatos de comprovante, e o tipo real é conferido pela assinatura
  // do arquivo — nome e MIME informados não são fonte de verdade.
  const mimeInformado = (sanitize(req.body.mime_type) || '').toLowerCase();
  if (!ATTACH_MIMES.includes(mimeInformado)) {
    return res.status(415).json({ error: 'Formato não permitido. Envie PDF, imagem (JPG/PNG/WEBP), XML de NFe, planilha ou documento Word.' });
  }
  const kind = ATTACH_KINDS.includes(req.body.kind) ? req.body.kind : 'outro';
  const b64 = String(req.body.data || '');
  if (!fileName) return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });
  if (!b64) return res.status(400).json({ error: 'Arquivo vazio.' });

  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { return res.status(400).json({ error: 'Arquivo inválido.' }); }
  if (!buf.length) return res.status(400).json({ error: 'Arquivo vazio.' });
  if (buf.length > MAX_ATTACH_BYTES) return res.status(413).json({ error: 'Arquivo acima do limite de 3 MB.' });

  const mime = mimeDoConteudo(buf, mimeInformado);
  if (!mime) return res.status(415).json({ error: 'O conteúdo do arquivo não corresponde a um formato permitido. Verifique se o arquivo não está corrompido ou renomeado.' });

  // Confirma que o registro dono do anexo existe.
  const table = {
    payable: 'erp_payables', receivable: 'erp_receivables', viatico: 'erp_viaticos_despesas',
    colab_cnh: 'erp_colaboradores', colab_veiculo: 'erp_colaboradores', colab_seguro: 'erp_colaboradores'
  }[req.params.type];
  const own = await query(`SELECT id FROM ${table} WHERE id=$1`, [Number(req.params.id)]);
  if (!own.length) return res.status(404).json({ error: ehAnexoColaborador(req.params.type) ? 'Colaborador não encontrado.' : 'Título não encontrado.' });

  const ins = await query(
    `INSERT INTO erp_attachments (entity_type, entity_id, kind, file_name, mime_type, byte_size, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.params.type, Number(req.params.id), kind, fileName, mime, buf.length, buf, req.user.id]
  );
  res.json({ ok: true, id: ins[0].id });
}));

// Excluir um anexo.
app.delete('/api/attachments/:id', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT entity_type, entity_id FROM erp_attachments WHERE id=$1', [Number(req.params.id)]);
  const a = rows[0];
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });
  const page = pageForType(a.entity_type);
  if (req.user.role !== 'admin' && !canEdit(req.user, page)) return res.status(403).json({ error: 'Sem permissão para excluir.' });
  if (a.entity_type === 'viatico' && !(await anexoViaticoNoEscopo(req.user, a.entity_id))) {
    return res.status(403).json({ error: 'Este anexo pertence à viagem de outro colaborador.' });
  }
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
// Configurações gerais da empresa
// ------------------------------------------------------------
// Leitura liberada para qualquer usuário autenticado (o relatório em PDF de
// Contas a Pagar usa esses dados no cabeçalho, mesmo para quem não é super-admin).
app.get('/api/company', requireAuth, h(async (req, res) => {
  const rows = await query('SELECT legal_name, trade_name, cnpj, address, phone, email FROM erp_company_settings WHERE id=1');
  res.json(rows[0] || {});
}));

app.put('/api/company', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const b = req.body;
  await query(`INSERT INTO erp_company_settings (id, legal_name, trade_name, cnpj, address, phone, email, updated_at)
    VALUES (1,$1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (id) DO UPDATE SET legal_name=$1, trade_name=$2, cnpj=$3, address=$4, phone=$5, email=$6, updated_at=now()`,
    [sanitize(b.legal_name), sanitize(b.trade_name), sanitize(b.cnpj), sanitize(b.address), sanitize(b.phone), sanitize(b.email)]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// Log de auditoria (somente o super-administrador)
// ------------------------------------------------------------
app.get('/api/audit-log', requireAuth, requireSuperAdmin, h(async (req, res) => {
  const conds = [], params = [];
  if (req.query.de) { params.push(req.query.de); conds.push(`created_at >= $${params.length}::date`); }
  if (req.query.ate) { params.push(req.query.ate); conds.push(`created_at < ($${params.length}::date + interval '1 day')`); }
  if (req.query.q) { params.push('%' + req.query.q + '%'); conds.push(`(user_name ILIKE $${params.length} OR action ILIKE $${params.length})`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = await query(`SELECT id, user_name, action, created_at FROM erp_audit_log ${where} ORDER BY created_at DESC LIMIT 500`, params);
  res.json(rows);
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
  let ok = 0, skipped = 0, duplicated = 0;
  for (const line of lines) {
    const sep = line.includes(';') ? ';' : ',';
    const parts = line.split(sep);
    if (parts.length < 3) { skipped++; continue; }
    const date = toISO(parts[0]);
    const amount = parseAmount(parts[parts.length - 1]);
    const desc = parts.slice(1, parts.length - 1).join(' ').replace(/"/g, '').trim();
    if (!date || !desc || !isFinite(amount) || amount === 0) { skipped++; continue; }
    // Evita duplicar: se já existe um lançamento idêntico (mesma data,
    // descrição e valor), pula — assim reimportar o mesmo extrato (ou um
    // período que se sobrepõe a uma importação anterior) não duplica linhas.
    const dup = await query(
      'SELECT id FROM erp_bank_transactions WHERE txn_date=$1 AND amount=$2 AND description=$3 LIMIT 1',
      [date, amount, desc]
    );
    if (dup.length) { duplicated++; continue; }
    await query('INSERT INTO erp_bank_transactions (txn_date, description, amount, imported_batch) VALUES ($1,$2,$3,$4)', [date, desc, amount, batch]);
    ok++;
  }
  res.json({ ok: true, imported: ok, skipped, duplicated });
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
  // Se já existia um lançamento automático (gerado ao Baixar/Receber) para o
  // mesmo título, ele foi substituído por este de verdade — remove o duplicado
  // para não sobrar um "pendente" fantasma na lista.
  if (matched_type && matched_id) {
    await query(`DELETE FROM erp_bank_transactions WHERE matched_type=$1 AND matched_id=$2 AND auto_generated=true AND id<>$3`,
      [matched_type, matched_id, req.params.id]);
  }
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

// Projeção diária do saldo de caixa até o fim do mês corrente — alimenta o
// alerta de "até quando temos saldo" e "quanto falta para fechar o mês" em Fluxo de Caixa.
// ------------------------------------------------------------
// Fluxo de Caixa — endpoint único e completo:
// resumo financeiro, fluxo por período (dia/semana/mês/ano), projeção,
// alertas de saldo negativo e distribuição por categoria.
// ------------------------------------------------------------
app.get('/api/reports/fluxo-caixa', requireAuth, requireViewAny(['dashboard', 'fluxo']), h(async (req, res) => {
  const iso = d => d.toISOString().slice(0, 10);
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const today = iso(todayD);

  const de = isDate(req.query.de) ? req.query.de : iso(new Date(todayD.getFullYear(), todayD.getMonth(), 1));
  const ate = isDate(req.query.ate) ? req.query.ate : iso(new Date(todayD.getFullYear(), todayD.getMonth() + 1, 0));
  const granularidade = ['dia', 'semana', 'mes', 'ano'].includes(req.query.granularidade) ? req.query.granularidade : 'dia';
  const centroCusto = sanitize(req.query.centro_custo) || '';
  const situacao = ['pago', 'recebido', 'pendente', 'vencido'].includes(req.query.situacao) ? req.query.situacao : '';

  // O saldo é o resultado acumulado de TODOS os lançamentos de Contas a Pagar e
  // Contas a Receber já feitos no sistema — desde o primeiro registro — e não
  // apenas do período selecionado. O filtro de período controla só o que é
  // EXIBIDO na tabela; o saldo de cada linha continua sendo o valor real
  // acumulado desde o início. Data efetiva de cada título: a de pagamento/
  // recebimento se já realizado, ou a de vencimento se ainda pendente
  // (isso projeta naturalmente pro futuro e também cobre vencidos ainda em aberto).
  const payRows = await query(`SELECT amount, due_date, payment_date, status, cost_center, category FROM erp_payables`);
  const recRows = await query(`SELECT amount, due_date, receipt_date, status, category FROM erp_receivables`);

  const dateKey = d => (d instanceof Date) ? iso(d) : String(d).slice(0, 10);
  const effDatePay = r => dateKey(r.status === 'pago' ? r.payment_date : r.due_date);
  const effDateRec = r => dateKey(r.status === 'recebido' ? r.receipt_date : r.due_date);

  // ---- Filtros de situação / centro de custo (afetam o que entra no ledger exibido) ----
  const filtraPay = r => {
    if (centroCusto && (r.cost_center || '') !== centroCusto) return false;
    if (!situacao) return true;
    if (situacao === 'pago') return r.status === 'pago';
    if (situacao === 'recebido') return false;
    if (situacao === 'pendente') return r.status === 'pendente' && r.due_date >= today;
    if (situacao === 'vencido') return r.status === 'pendente' && r.due_date < today;
    return true;
  };
  const filtraRec = r => {
    if (!situacao) return true;
    if (situacao === 'recebido') return r.status === 'recebido';
    if (situacao === 'pago') return false;
    if (situacao === 'pendente') return r.status === 'pendente' && r.due_date >= today;
    if (situacao === 'vencido') return r.status === 'pendente' && r.due_date < today;
    return true;
  };

  const payFiltered = payRows.filter(filtraPay);
  const recFiltered = recRows.filter(filtraRec);

  // ---- Ledger diário único, desde o primeiro lançamento existente ----
  const dailyOut = {}, dailyIn = {};
  payFiltered.forEach(r => { const d = effDatePay(r); dailyOut[d] = (dailyOut[d] || 0) + n(r.amount); });
  recFiltered.forEach(r => { const d = effDateRec(r); dailyIn[d] = (dailyIn[d] || 0) + n(r.amount); });

  const todasAsDatas = [...Object.keys(dailyIn), ...Object.keys(dailyOut)].sort();
  const primeiraData = todasAsDatas.length ? todasAsDatas[0] : today;
  // Horizonte do ledger: do primeiro lançamento até o maior entre `ate` e hoje+90 dias
  // (garante que o alerta enxergue pelo menos 90 dias à frente, mesmo se o filtro for menor).
  const horizonteAlerta = iso(new Date(todayD.getTime() + 90 * 86400000));
  const fimLedger = [ate, horizonteAlerta].sort().pop();
  const inicioLedger = [primeiraData, de].sort()[0];

  let cum = 0;
  const cumUpTo = {};
  for (let d = new Date(inicioLedger + 'T00:00:00'); iso(d) <= fimLedger; d.setDate(d.getDate() + 1)) {
    const dstr = iso(d);
    cum += (dailyIn[dstr] || 0) - (dailyOut[dstr] || 0);
    cumUpTo[dstr] = cum;
  }
  const saldoNaData = dstr => {
    if (dstr in cumUpTo) return cumUpTo[dstr];
    // fora do intervalo calculado (antes do primeiro lançamento): saldo é zero.
    return dstr < inicioLedger ? 0 : cum;
  };
  const diaAnterior = dstr => iso(new Date(new Date(dstr + 'T00:00:00').getTime() - 86400000));

  const saldoInicial = saldoNaData(diaAnterior(de));
  const saldoAtual = saldoNaData(today);

  // ---- Agrupa em buckets conforme a granularidade escolhida, dentro de [de, ate] ----
  const bucketKey = dstr => {
    const d = new Date(dstr + 'T00:00:00');
    if (granularidade === 'dia') return { key: dstr, label: brDateBR(dstr) };
    if (granularidade === 'semana') {
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = iso(monday);
      return { key, label: 'Sem. ' + brDateBR(key) };
    }
    if (granularidade === 'mes') {
      const key = dstr.slice(0, 7);
      return { key, label: MES_ABREV[d.getMonth()] + '/' + d.getFullYear() };
    }
    const key = String(d.getFullYear());
    return { key, label: key };
  };

  const diasNoPeriodo = [];
  for (let d = new Date(de + 'T00:00:00'); iso(d) <= ate; d.setDate(d.getDate() + 1)) diasNoPeriodo.push(iso(d));

  const bucketsMap = new Map();
  diasNoPeriodo.forEach(dstr => {
    const { key, label } = bucketKey(dstr);
    if (!bucketsMap.has(key)) bucketsMap.set(key, { key, label, entradas: 0, saidas: 0, ultimoDia: dstr });
    const b = bucketsMap.get(key);
    b.entradas += (dailyIn[dstr] || 0);
    b.saidas += (dailyOut[dstr] || 0);
    b.ultimoDia = dstr; // como percorremos em ordem, o último atribuído é o último dia do bucket
  });
  const buckets = [...bucketsMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map(b => ({
    key: b.key, label: b.label, entradas: b.entradas, saidas: b.saidas,
    saldo: saldoNaData(b.ultimoDia)
  }));

  const totalEntradas = buckets.reduce((s, b) => s + b.entradas, 0);
  const totalSaidas = buckets.reduce((s, b) => s + b.saidas, 0);

  // ---- Saldo previsto: saldo atual + TODOS os pendentes (qualquer data, sem filtro) ----
  const totalPendPagar = n((await query(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pendente'`))[0].v);
  const totalPendReceber = n((await query(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_receivables WHERE status='pendente'`))[0].v);
  const saldoPrevisto = saldoAtual + totalPendReceber - totalPendPagar;

  // ---- Alerta de saldo negativo: usa o ledger completo (sem filtro de situação/
  // centro de custo, para o alerta sempre refletir o risco real), de hoje até o horizonte ----
  const dailyOutAll = {}, dailyInAll = {};
  payRows.forEach(r => { const d = effDatePay(r); dailyOutAll[d] = (dailyOutAll[d] || 0) + n(r.amount); });
  recRows.forEach(r => { const d = effDateRec(r); dailyInAll[d] = (dailyInAll[d] || 0) + n(r.amount); });
  const inicioLedgerAll = [primeiraData, today].sort()[0];
  let cumAll = 0; const cumUpToAll = {};
  for (let d = new Date(inicioLedgerAll + 'T00:00:00'); iso(d) <= horizonteAlerta; d.setDate(d.getDate() + 1)) {
    const dstr = iso(d);
    cumAll += (dailyInAll[dstr] || 0) - (dailyOutAll[dstr] || 0);
    cumUpToAll[dstr] = cumAll;
  }
  let diaCritico = null, minRun = cumUpToAll[today] ?? 0, diaPior = today;
  for (let d = new Date(todayD); iso(d) <= horizonteAlerta; d.setDate(d.getDate() + 1)) {
    const dstr = iso(d);
    const v = cumUpToAll[dstr] ?? minRun;
    if (v < minRun) { minRun = v; diaPior = dstr; }
    if (v < 0 && !diaCritico) diaCritico = dstr;
  }
  const necessidade = minRun < 0 ? Math.abs(minRun) : 0;

  // ---- Contas a pagar / receber futuras (próximos títulos pendentes) ----
  const pagarFuturasQ = centroCusto
    ? await query(`SELECT p.description, p.amount, p.due_date, p.cost_center, s.name AS party FROM erp_payables p
        LEFT JOIN erp_suppliers s ON s.id=p.supplier_id WHERE p.status='pendente' AND p.cost_center=$1 ORDER BY p.due_date LIMIT 20`, [centroCusto])
    : await query(`SELECT p.description, p.amount, p.due_date, p.cost_center, s.name AS party FROM erp_payables p
        LEFT JOIN erp_suppliers s ON s.id=p.supplier_id WHERE p.status='pendente' ORDER BY p.due_date LIMIT 20`);
  const receberFuturasQ = await query(`SELECT description, amount, due_date, client_name FROM erp_receivables
    WHERE status='pendente' ORDER BY due_date LIMIT 20`);

  // ---- Distribuição por categoria dentro do período filtrado (mesmos registros do ledger exibido) ----
  const dentroPeriodo = ds => ds >= de && ds <= ate;
  const despCatMap = {};
  payFiltered.forEach(r => { const ds = effDatePay(r); if (dentroPeriodo(ds)) despCatMap[r.category] = (despCatMap[r.category] || 0) + n(r.amount); });
  const recCatMap = {};
  recFiltered.forEach(r => { const ds = effDateRec(r); if (dentroPeriodo(ds)) recCatMap[r.category] = (recCatMap[r.category] || 0) + n(r.amount); });
  const despCatRows = Object.entries(despCatMap).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  const recCatRows = Object.entries(recCatMap).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);

  // ---- Aporte necessário DENTRO do período filtrado ----
  // Diferente do `alerta` (que olha 90 dias fixos à frente, para nunca
  // esconder um risco fora do filtro), aqui a conta acompanha o período que o
  // usuário escolheu: é o valor que zera o pior momento de caixa até a data
  // final do filtro — a base da Solicitação de Aporte à matriz. Calculado dia
  // a dia (e não por bucket) para não perder o pior dia quando a
  // granularidade é semanal/mensal e o fundo do poço cai no meio do bucket.
  let piorSaldoPeriodo = null, diaPiorPeriodo = null;
  diasNoPeriodo.forEach(dstr => {
    const v = saldoNaData(dstr);
    if (piorSaldoPeriodo === null || v < piorSaldoPeriodo) { piorSaldoPeriodo = v; diaPiorPeriodo = dstr; }
  });
  const saldoFinalPeriodo = diasNoPeriodo.length ? saldoNaData(diasNoPeriodo[diasNoPeriodo.length - 1]) : saldoInicial;
  const aporteNecessario = (piorSaldoPeriodo !== null && piorSaldoPeriodo < 0) ? Math.abs(piorSaldoPeriodo) : 0;

  res.json({
    de, ate, granularidade, centroCusto, situacao,
    resumo: { saldoInicial, totalEntradas, totalSaidas, saldoAtual, saldoPrevisto },
    buckets,
    aporte: { necessario: aporteNecessario, piorSaldo: piorSaldoPeriodo ?? 0, diaPior: diaPiorPeriodo, saldoFinalPeriodo },
    alerta: { diaCritico, necessidade, diaPior, horizonte: horizonteAlerta },
    futuras: {
      pagar: pagarFuturasQ.map(r => ({ ...r, amount: n(r.amount) })),
      receber: receberFuturasQ.map(r => ({ ...r, amount: n(r.amount) }))
    },
    categorias: {
      despesas: despCatRows.map(r => ({ category: r.category, total: n(r.total) })),
      receitas: recCatRows.map(r => ({ category: r.category, total: n(r.total) }))
    }
  });
}));

// KPIs e análises do dashboard
app.get('/api/reports/dashboard', requireAuth, requireViewAny(['dashboard']), h(async (req, res) => {
  const iso = d => d.toISOString().slice(0, 10);
  const today = hojeISO(); // fuso do Brasil (ver hojeISO)
  const in7 = isoMaisDias(7), in15 = isoMaisDias(15), in30 = isoMaisDias(30);
  const mesAtual = today.slice(0, 7);
  const anoAtual = Number(today.slice(0, 4)), mesNum = Number(today.slice(5, 7));
  const monthStart = mesAtual + '-01';
  const monthEnd = iso(new Date(Date.UTC(anoAtual, mesNum, 0)));
  // "Hoje" à meia-noite (em UTC) derivado da data brasileira — base para as
  // contas de calendário abaixo, sem risco de virar o dia por causa do fuso.
  const todayD = new Date(Date.UTC(anoAtual, mesNum - 1, Number(today.slice(8, 10))));
  const addDays = (d, k) => new Date(d.getTime() + k * 86400000);
  // Janela móvel dos últimos 12 meses (inclui o mês corrente).
  const start12 = new Date(Date.UTC(anoAtual, mesNum - 12, 1));
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
  // Saldo real = todo o histórico de recebimentos/pagamentos já realizados +
  // ajustes bancários independentes (não gerados automaticamente por uma baixa).
  const totalRecebidoHistD = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_receivables WHERE status='recebido'`);
  const totalPagoHistD = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago'`);
  const ajustesBancoManuaisD = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions WHERE auto_generated=false`);
  const saldoBanco = { v: n(totalRecebidoHistD.v) - n(totalPagoHistD.v) + n(ajustesBancoManuaisD.v) };

  // ---- Despesas do mês (indicador principal) ----
  const pagoMes = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago' AND to_char(payment_date,'YYYY-MM')=$1`, [mesAtual]);

  // ---- Evolução últimos 12 meses (receitas x despesas, regime de caixa) ----
  const recMensal = await query(`SELECT to_char(date_trunc('month', receipt_date),'YYYY-MM') AS ym, SUM(amount) AS total
    FROM erp_receivables WHERE status='recebido' AND receipt_date >= $1 GROUP BY 1`, [start12ISO]);
  const despMensal = await query(`SELECT to_char(date_trunc('month', payment_date),'YYYY-MM') AS ym, SUM(amount) AS total
    FROM erp_payables WHERE status='pago' AND payment_date >= $1 GROUP BY 1`, [start12ISO]);
  const last12 = [];
  for (let i = 11; i >= 0; i--) {
    // getUTC*: todayD é meia-noite UTC da data brasileira — usar os getters
    // locais faria o mês virar quando o servidor não roda em UTC.
    const d = new Date(Date.UTC(anoAtual, mesNum - 1 - i, 1));
    const ym = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    const label = MES_ABREV[d.getUTCMonth()] + '/' + String(d.getUTCFullYear()).slice(2);
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
    // Ambos em UTC (o 'Z') — misturar com hora local deslocaria o aging em 1 dia.
    const dias = Math.floor((todayD - new Date(String(r.due_date).slice(0, 10) + 'T00:00:00Z')) / 86400000);
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
  res.json(await query(`SELECT id, name, email, role, status, active, permissions, must_change_password, created_at,
      last_seen_at,
      (last_seen_at IS NOT NULL AND last_seen_at > now() - interval '5 minutes') AS online
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
// Viáticos — controle interno (Colaboradores, TUD, Solicitações, Despesas)
// Sem integração com o Flash: tudo alimentado manualmente. A "Carteira Flash"
// é só um saldo calculado (repasses via Contas a Pagar categoria "Viáticos"
// menos o que já foi liberado/gasto em solicitações).
// ------------------------------------------------------------

// ---- Colaboradores ----
// Escopo de visão em Viáticos: admin ou quem tem EDIÇÃO na página vê tudo;
// quem tem apenas LEITURA vê somente o que é do colaborador vinculado ao seu
// usuário. Retorna null (sem restrição) ou a lista de ids de colaborador
// permitidos — [-1] quando o usuário não tem colaborador vinculado, para que
// nenhum registro apareça.
async function viaticosEscopo(user) {
  if (user.role === 'admin' || canEdit(user, 'viaticos')) return null;
  const rows = await query('SELECT id FROM erp_colaboradores WHERE usuario_id = $1', [user.id]);
  return rows.length ? rows.map(r => r.id) : [-1];
}

// ---- Validação de documentos do colaborador ----
// A CNH tem 11 dígitos, com os dois últimos verificadores. O BACKEND só barra o
// que é inequívoco (quantidade de dígitos e repetição óbvia): existem variações
// de implementação do dígito verificador, e recusar o cadastro de uma CNH
// legítima seria pior que deixar passar um dígito trocado. A conferência dos
// verificadores é feita na tela, como AVISO visível (viaConferirCNH em app.js).
function cnhFormatoValido(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 00000000000, 11111111111...
  return true;
}
// Placa: modelo antigo (ABC-1234) e Mercosul (ABC1D23). Normaliza para
// maiúsculas sem separador, para a comparação não depender de como foi digitada.
function placaNormalizada(bruto) {
  const p = String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) return p;
  return null;
}
// Valida só o que foi preenchido: campo vazio continua sendo opcional.
function validarDocsColaborador(b) {
  if (sanitize(b.cnh_numero) && !cnhFormatoValido(b.cnh_numero)) {
    return 'Nº da CNH deve ter 11 dígitos.';
  }
  if (sanitize(b.veiculo_placa) && !placaNormalizada(b.veiculo_placa)) {
    return 'Placa inválida — use ABC-1234 (modelo antigo) ou ABC1D23 (Mercosul).';
  }
  if (sanitize(b.veiculo_ano)) {
    const ano = Number(String(b.veiculo_ano).replace(/\D/g, ''));
    const limite = new Date().getFullYear() + 1;
    if (!isFinite(ano) || ano < 1950 || ano > limite) return `Ano do veículo inválido (use um valor entre 1950 e ${limite}).`;
  }
  if (b.veiculo_consumo_kml) {
    const c = Number(b.veiculo_consumo_kml);
    if (!isFinite(c) || c <= 0 || c > 100) return 'Consumo (km/L) inválido — informe um valor entre 0 e 100.';
  }
  // Marcou que tem seguro: a apólice precisa ter identificação e vigência,
  // senão o "possui seguro" não serve de controle nenhum.
  if (b.veiculo_possui_seguro === true) {
    if (!sanitize(b.veiculo_seguradora)) return 'Informe a seguradora (ou desmarque "possui seguro").';
    if (!sanitize(b.veiculo_apolice)) return 'Informe o nº da apólice (ou desmarque "possui seguro").';
    if (!b.veiculo_seguro_validade) return 'Informe a validade do seguro (ou desmarque "possui seguro").';
  }
  return null;
}

app.get('/api/colaboradores', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const escopo = await viaticosEscopo(req.user);
  const rows = await query(
    `SELECT c.*,
       (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='colab_cnh'     AND a.entity_id=c.id) AS anexos_cnh,
       (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='colab_veiculo' AND a.entity_id=c.id) AS anexos_veiculo,
       (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='colab_seguro'  AND a.entity_id=c.id) AS anexos_seguro
     FROM erp_colaboradores c ${escopo ? 'WHERE c.id = ANY($1)' : ''} ORDER BY c.ativo DESC, c.name`,
    escopo ? [escopo] : []);
  res.json(rows);
}));

app.post('/api/colaboradores', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!['A', 'B'].includes(b.tier)) return res.status(400).json({ error: 'Tier inválido (A ou B).' });
  const erroDoc = validarDocsColaborador(b);
  if (erroDoc) return res.status(400).json({ error: erroDoc });
  if (b.veiculo_placa) b.veiculo_placa = placaNormalizada(b.veiculo_placa);
  const ins = await query(`INSERT INTO erp_colaboradores
    (name, cargo, tier, usuario_id, cidade_base_uf, cidade_base_municipio, veiculo_placa, veiculo_modelo, veiculo_consumo_kml,
     veiculo_ano, veiculo_crlv_validade, veiculo_possui_seguro, veiculo_seguradora, veiculo_apolice, veiculo_seguro_validade,
     veiculo_apto, veiculo_observacao, cnh_numero, cnh_categoria, cnh_validade, cnh_restricoes, motorista_apto, motorista_observacao)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
    [sanitize(b.name), sanitize(b.cargo), b.tier, b.usuario_id || null, b.cidade_base_uf || null, sanitize(b.cidade_base_municipio) || null,
     sanitize(b.veiculo_placa) || null, sanitize(b.veiculo_modelo) || null, b.veiculo_consumo_kml ? Number(b.veiculo_consumo_kml) : null,
     sanitize(b.veiculo_ano) || null, b.veiculo_crlv_validade || null, b.veiculo_possui_seguro === true,
     sanitize(b.veiculo_seguradora) || null, sanitize(b.veiculo_apolice) || null, b.veiculo_seguro_validade || null,
     b.veiculo_apto !== false, sanitize(b.veiculo_observacao) || null, sanitize(b.cnh_numero) || null,
     sanitize(b.cnh_categoria) || null, b.cnh_validade || null, sanitize(b.cnh_restricoes) || null,
     b.motorista_apto !== false, sanitize(b.motorista_observacao) || null]);
  res.json({ ok: true, id: ins[0].id });
}));

app.put('/api/colaboradores/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body;
  if (!sanitize(b.name)) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!['A', 'B'].includes(b.tier)) return res.status(400).json({ error: 'Tier inválido (A ou B).' });
  const erroDoc = validarDocsColaborador(b);
  if (erroDoc) return res.status(400).json({ error: erroDoc });
  if (b.veiculo_placa) b.veiculo_placa = placaNormalizada(b.veiculo_placa);
  await query(`UPDATE erp_colaboradores SET name=$1, cargo=$2, tier=$3, ativo=$4, usuario_id=$5,
    cidade_base_uf=$6, cidade_base_municipio=$7, veiculo_placa=$8, veiculo_modelo=$9, veiculo_consumo_kml=$10,
    veiculo_ano=$11, veiculo_crlv_validade=$12, veiculo_possui_seguro=$13, veiculo_seguradora=$14, veiculo_apolice=$15,
    veiculo_seguro_validade=$16, veiculo_apto=$17, veiculo_observacao=$18, cnh_numero=$19, cnh_categoria=$20,
    cnh_validade=$21, cnh_restricoes=$22, motorista_apto=$23, motorista_observacao=$24 WHERE id=$25`,
    [sanitize(b.name), sanitize(b.cargo), b.tier, b.ativo !== false, b.usuario_id || null, b.cidade_base_uf || null,
     sanitize(b.cidade_base_municipio) || null, sanitize(b.veiculo_placa) || null, sanitize(b.veiculo_modelo) || null,
     b.veiculo_consumo_kml ? Number(b.veiculo_consumo_kml) : null, sanitize(b.veiculo_ano) || null,
     b.veiculo_crlv_validade || null, b.veiculo_possui_seguro === true, sanitize(b.veiculo_seguradora) || null,
     sanitize(b.veiculo_apolice) || null, b.veiculo_seguro_validade || null, b.veiculo_apto !== false,
     sanitize(b.veiculo_observacao) || null, sanitize(b.cnh_numero) || null, sanitize(b.cnh_categoria) || null,
     b.cnh_validade || null, sanitize(b.cnh_restricoes) || null, b.motorista_apto !== false,
     sanitize(b.motorista_observacao) || null, req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/colaboradores/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const used = (await query('SELECT COUNT(*)::int AS n FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1', [req.params.id]))[0].n;
  if (used > 0) return res.status(409).json({ error: `Este colaborador tem ${used} solicitação(ões) vinculada(s). Inative-o em vez de excluir.` });
  await query('DELETE FROM erp_colaboradores WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---- Autosserviço (colaborador solicitando por conta própria) ----
// Disponível para QUALQUER usuário autenticado vinculado a um colaborador —
// não passa pela permissão de página 'viaticos' (essa é a de administração).
// Lançado em 2026-07-30, embutido na própria tela de Viáticos (não é mais
// rota solta). Continua exigindo vínculo com um colaborador ativo.
function requireAutosservico(req, res, next) { return next(); }

// Tabela de capitais e a regra de "categoria do local" — precisa ser IDÊNTICA
// à de public/app.js (CAPITAIS_BR / viaCategoriaDestino / viaCalcularCategoriaLocal).
// Duplicada aqui porque o projeto não tem bundler/módulo compartilhado entre
// front (script solto no navegador) e back (CommonJS) — se um dia um dos dois
// mudar, o outro precisa acompanhar manualmente.
const VIA_CAPITAIS_BR = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
  DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
  MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
  RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista',
  SC: 'Florianópolis', SE: 'Aracaju', SP: 'São Paulo', TO: 'Palmas'
};
const VIA_CATEGORIA_TOPO = new Set(['SP:São Paulo', 'RJ:Rio de Janeiro', 'DF:Brasília']);
const VIA_CATEGORIA_PRIORIDADE = { interior: 0, capital: 1, sp_df_rj_intl: 2 };
function viaCategoriaDestinoServer(uf, municipio) {
  if (VIA_CATEGORIA_TOPO.has(`${uf}:${municipio}`)) return 'sp_df_rj_intl';
  if (VIA_CAPITAIS_BR[uf] === municipio) return 'capital';
  return 'interior';
}
function viaCalcularCategoriaLocalServer(destinos, internacional) {
  let cat = internacional ? 'sp_df_rj_intl' : 'interior';
  (destinos || []).forEach(d => {
    const c = viaCategoriaDestinoServer(d.uf, d.municipio);
    if (VIA_CATEGORIA_PRIORIDADE[c] > VIA_CATEGORIA_PRIORIDADE[cat]) cat = c;
  });
  return cat;
}
function viaMesmaCidadeServer(ufA, munA, ufB, munB) {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return !!norm(munA) && norm(ufA) === norm(ufB) && norm(munA) === norm(munB);
}
function viaHospedagemDevidaServer(destinos, cidadeBaseUf, cidadeBaseMunicipio) {
  const lista = Array.isArray(destinos) ? destinos : [];
  if (!cidadeBaseMunicipio || !cidadeBaseUf || !lista.length) return true;
  return lista.some(d => !viaMesmaCidadeServer(d.uf, d.municipio, cidadeBaseUf, cidadeBaseMunicipio));
}
function viaPedagioPonderadoServer(trechos) {
  return (trechos || []).reduce((s, t) => s + (Number(t && t.pedagio) || 0) * (Number(t && t.repeticoes) || 1), 0);
}
function viaPedagioTotalServer(bloco) {
  const porTrecho = viaPedagioPonderadoServer(bloco && bloco.trechos);
  return porTrecho > 0 ? porTrecho : (Number(bloco && bloco.pedagio_valor) || 0);
}

// Recalcula categoria_local e a previsão por categoria a partir dos dados
// BRUTOS enviados (destinos, período, itens de transporte) — nunca a partir
// dos totais que o navegador já somou. O front usa exatamente as mesmas
// fórmulas (viaComputeResumo/viaMemoriaCategorias em app.js) só para o
// colaborador ver o número antes de enviar; a fonte da verdade do que fica
// gravado — e do que a aprovação vê — é este cálculo aqui (auditoria
// 2026-07-29, achado A4: o servidor aceitava a previsão pronta do cliente).
function viaRecalcularPrevisao(b, colab, tud) {
  const categoriaLocal = viaCalcularCategoriaLocalServer(b.destinos, !!b.internacional);
  const ini = new Date(b.data_inicio), fim = new Date(b.data_fim);
  const dias = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
  const noitesPeriodo = Math.max(0, dias - 1);
  const hospDevida = viaHospedagemDevidaServer(b.destinos, colab.cidade_base_uf, colab.cidade_base_municipio);
  const noites = hospDevida ? noitesPeriodo : 0;

  const tudTier = (tipo) => {
    const r = tud.find(t => t.tier === colab.tier && t.categoria_local === categoriaLocal && t.tipo_despesa === tipo);
    return r ? Number(r.valor_diaria) : 0;
  };
  const cat = {};
  const add = (k, v) => { if (v > 0) cat[k] = Number(((cat[k] || 0) + v).toFixed(2)); };
  add('hospedagem', tudTier('hospedagem') * noites);
  add('alimentacao', tudTier('alimentacao') * dias);

  const t = (b.transporte_detalhes && typeof b.transporte_detalhes === 'object') ? b.transporte_detalhes : {};
  const somaValor = arr => (Array.isArray(arr) ? arr : []).reduce((s, x) => s + (Number(x && x.valor) || 0), 0);
  if (t.aviao) add('passagem_aviao', somaValor(t.aviao_trechos));
  if (t.onibus) add('passagem_onibus', somaValor(t.onibus_trechos));
  if (t.aluguel_carro) (Array.isArray(t.alugueis) ? t.alugueis : []).forEach(a => {
    const diaria = String(a && a.valor_diaria || '').includes(',')
      ? Number(String(a.valor_diaria).replace(/\./g, '').replace(',', '.')) : Number(a && a.valor_diaria);
    add('aluguel_carro', (isFinite(diaria) ? diaria : 0) * (Number(a && a.dias) || 0));
    add('combustivel', Number(a && a.combustivel_valor) || 0);
    add('pedagio', viaPedagioTotalServer(a));
    add('estacionamento', (Number(a && a.estacionamento_qtd) || 0) * (Number(a && a.estacionamento_valor) || 0));
  });
  if (t.carro_proprio && t.carro_proprio_rota) {
    const r = t.carro_proprio_rota;
    add('combustivel', Number(r.combustivel_valor) || 0);
    add('pedagio', viaPedagioTotalServer(r));
    add('estacionamento', (Number(r.estacionamento_qtd) || 0) * (Number(r.estacionamento_valor) || 0));
  }
  if (t.taxi_uber) add('taxi_uber', somaValor(t.taxi_uber_corridas));

  return { categoriaLocal, cat };
}

app.get('/api/viaticos/autosservico/meu-colaborador', requireAuth, requireAutosservico, h(async (req, res) => {
  const rows = await query('SELECT * FROM erp_colaboradores WHERE usuario_id=$1 AND ativo=true', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nenhum colaborador de viáticos vinculado a este usuário.' });
  res.json(rows[0]);
}));

app.post('/api/viaticos/solicitacoes/autosservico', requireAuth, requireAutosservico, h(async (req, res) => {
  const colabRows = await query('SELECT * FROM erp_colaboradores WHERE usuario_id=$1 AND ativo=true', [req.user.id]);
  if (!colabRows.length) return res.status(403).json({ error: 'Seu usuário não está vinculado a um colaborador de viáticos.' });
  const colab = colabRows[0];
  const b = req.body;
  if (b.motivo && !MOTIVO_OPTIONS.includes(b.motivo)) return res.status(400).json({ error: 'Motivo inválido.' });
  if (!isDate(b.data_inicio) || !isDate(b.data_fim)) return res.status(400).json({ error: 'Datas do período inválidas.' });
  if (b.data_fim < b.data_inicio) return res.status(400).json({ error: 'Data final não pode ser antes da inicial.' });
  if (b.destinos !== undefined) {
    if (!Array.isArray(b.destinos)) return res.status(400).json({ error: 'Lista de destinos inválida.' });
    for (const d of b.destinos) {
      if (!d || typeof d.uf !== 'string' || d.uf.length !== 2 || !sanitize(d.municipio)) return res.status(400).json({ error: 'Lista de destinos inválida.' });
    }
  }
  // categoria_local e previsao_por_categoria NUNCA vêm do cliente: o front só
  // usa esses cálculos para o colaborador ver o número antes de enviar — quem
  // grava e quem a aprovação vê é o recálculo abaixo, a partir dos destinos,
  // período e itens de transporte brutos (auditoria 2026-07-29, achado A4).
  const tud = await query('SELECT tier, categoria_local, tipo_despesa, valor_diaria FROM erp_viaticos_tud');
  const { categoriaLocal, cat } = viaRecalcularPrevisao(b, colab, tud);
  // O total da previsão é o `valor_solicitado`: é o que o colaborador pediu e o
  // número que a Tesouraria precisa ver para agendar a transferência. Sem isso
  // gravado, a solicitação aparecia zerada na lista (o cálculo ficava só dentro
  // de `previsao_por_categoria`, que nenhuma tela lia). `valor_liberado` segue
  // 0 de propósito: só recebe valor quando a transferência sai no Flash.
  const totalSolicitado = Number(Object.values(cat).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2));

  const ins = await query(`INSERT INTO erp_viaticos_solicitacoes
    (colaborador_id, tier, categoria_local, ordem_trabalho, destinos, motivo, objetivo, data_inicio, data_fim,
     valor_solicitado, valor_liberado, previsao_por_categoria, transporte_detalhes, notes, created_by, origem)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,'colaborador') RETURNING id`,
    [colab.id, colab.tier, categoriaLocal, sanitize(b.ordem_trabalho), JSON.stringify(b.destinos || []), sanitize(b.motivo),
     sanitize(b.objetivo), b.data_inicio, b.data_fim, totalSolicitado, JSON.stringify(cat), JSON.stringify(b.transporte_detalhes || {}),
     sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: ins[0].id });
}));

// ---- TUD (Tarifa Única Diária) ----
app.get('/api/viaticos/tud', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  res.json(await query('SELECT * FROM erp_viaticos_tud ORDER BY tier, categoria_local, tipo_despesa'));
}));

app.post('/api/viaticos/tud', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body;
  if (!['A', 'B'].includes(b.tier)) return res.status(400).json({ error: 'Tier inválido.' });
  if (!['interior', 'capital', 'sp_df_rj_intl'].includes(b.categoria_local)) return res.status(400).json({ error: 'Categoria de local inválida.' });
  if (!['hospedagem', 'alimentacao'].includes(b.tipo_despesa)) return res.status(400).json({ error: 'Tipo de despesa inválido.' });
  const valor = Number(b.valor_diaria);
  if (!isFinite(valor) || valor < 0) return res.status(400).json({ error: 'Valor inválido.' });
  await query(`INSERT INTO erp_viaticos_tud (tier, categoria_local, tipo_despesa, valor_diaria) VALUES ($1,$2,$3,$4)
    ON CONFLICT (tier, categoria_local, tipo_despesa) DO UPDATE SET valor_diaria=excluded.valor_diaria`,
    [b.tier, b.categoria_local, b.tipo_despesa, valor]);
  res.json({ ok: true });
}));

app.delete('/api/viaticos/tud/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  await query('DELETE FROM erp_viaticos_tud WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---- Solicitações ----
app.get('/api/viaticos/solicitacoes', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  // Atualiza sozinho o status pelas datas: antes da viagem = Liberado, dentro
  // do período = Em viagem, depois do fim = Aguardando comprovação.
  //
  // "Transferência Agendada" é a ÚNICA marcação manual desta faixa (o
  // agendamento é feito na plataforma do Flash, fora do ERP), então ela é
  // preservada enquanto a viagem não começou. A partir da data de início, o
  // registro volta a seguir as datas como os demais.
  //
  // Não existe mais trava por `status_manual`: antes, um único ajuste manual
  // congelava o registro para sempre, e como "Transferência Agendada" é
  // sempre marcada à mão, essas ordens nunca evoluíam — ficavam com o status
  // errado depois do fim da viagem. `status_manual` volta a false quando a
  // regra assume o registro, para a tela não seguir dizendo "definido
  // manualmente". `em_approvals` continua fora desta faixa: é decisão de
  // aprovação, não de calendário.
  const today = hojeISO();
  const STATUS_POR_DATA = `CASE
      WHEN status = 'transferencia_agendada' AND $1 < data_inicio THEN 'transferencia_agendada'
      WHEN $1 < data_inicio THEN 'liberado'
      WHEN $1 > data_fim THEN 'aguardando_comprovacao'
      ELSE 'em_viagem'
    END`;
  await query(`
    UPDATE erp_viaticos_solicitacoes
    SET status = ${STATUS_POR_DATA},
        status_manual = CASE
          WHEN status = 'transferencia_agendada' AND $1 < data_inicio THEN status_manual
          ELSE false
        END
    WHERE status IN ('liberado','em_viagem','aguardando_comprovacao','transferencia_agendada')
      AND status <> ${STATUS_POR_DATA}`, [today]);

  const escopo = await viaticosEscopo(req.user);
  const rows = await query(`
    SELECT s.*, c.name AS colaborador_name, c.cargo AS colaborador_cargo,
      c.cidade_base_uf AS colaborador_cidade_base_uf, c.cidade_base_municipio AS colaborador_cidade_base_municipio,
      c.veiculo_consumo_kml AS colaborador_veiculo_consumo_kml,
      COALESCE((SELECT SUM(d.valor) FROM erp_viaticos_despesas d WHERE d.solicitacao_id=s.id), 0) AS valor_comprovado,
      (SELECT COUNT(*)::int FROM erp_attachments a JOIN erp_viaticos_despesas d ON d.id=a.entity_id AND a.entity_type='viatico' WHERE d.solicitacao_id=s.id) AS anexos_count
    FROM erp_viaticos_solicitacoes s JOIN erp_colaboradores c ON c.id=s.colaborador_id
    ${escopo ? 'WHERE s.colaborador_id = ANY($1)' : ''}
    ORDER BY s.data_inicio DESC, s.id DESC`, escopo ? [escopo] : []);
  res.json(rows.map(r => ({ ...r, valor_solicitado: n(r.valor_solicitado), valor_liberado: n(r.valor_liberado),
    valor_devolvido: n(r.valor_devolvido), valor_pendencia: n(r.valor_pendencia), valor_comprovado: n(r.valor_comprovado) })));
}));

const MOTIVO_OPTIONS = ['Monitoramento', 'Sinistro', 'Comercial'];

function validateSolicitacao(b) {
  if (!b.colaborador_id) return 'Selecione o colaborador.';
  if (!['A', 'B'].includes(b.tier)) return 'Tier inválido.';
  if (!['interior', 'capital', 'sp_df_rj_intl'].includes(b.categoria_local)) return 'Categoria de local inválida.';
  if (b.motivo && !MOTIVO_OPTIONS.includes(b.motivo)) return 'Motivo inválido.';
  if (!isDate(b.data_inicio) || !isDate(b.data_fim)) return 'Datas do período inválidas.';
  if (b.data_fim < b.data_inicio) return 'Data final não pode ser antes da inicial.';
  if (b.data_expiracao_flash && !isDate(b.data_expiracao_flash)) return 'Data de expiração no Flash inválida.';
  const liberado = Number(b.valor_liberado);
  if (!isFinite(liberado) || liberado < 0) return 'Valor liberado inválido.';
  if (b.destinos !== undefined) {
    if (!Array.isArray(b.destinos)) return 'Lista de destinos inválida.';
    for (const d of b.destinos) {
      if (!d || typeof d.uf !== 'string' || d.uf.length !== 2 || !sanitize(d.municipio)) return 'Lista de destinos inválida.';
    }
  }
  return null;
}

// Verifica se o colaborador tem alguma pendência (estouro) de viagem anterior
// ainda não descontada — usado para avisar/auto-preencher ao criar uma nova solicitação.
app.get('/api/viaticos/colaboradores/:id/pendencia', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const escopo = await viaticosEscopo(req.user);
  if (escopo && !escopo.includes(Number(req.params.id))) {
    return res.status(403).json({ error: 'Acesso restrito às suas próprias solicitações.' });
  }
  const rows = await query(`SELECT id, destino, data_fim, valor_pendencia FROM erp_viaticos_solicitacoes
    WHERE colaborador_id=$1 AND status='divergente' AND pendencia_resolvida=false ORDER BY data_fim`, [req.params.id]);
  const total = rows.reduce((s, r) => s + n(r.valor_pendencia), 0);
  res.json({ total, solicitacoes: rows.map(r => ({ ...r, valor_pendencia: n(r.valor_pendencia) })) });
}));

app.post('/api/viaticos/solicitacoes', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body, err = validateSolicitacao(b);
  if (err) return res.status(400).json({ error: err });
  const ins = await query(`INSERT INTO erp_viaticos_solicitacoes
    (colaborador_id, tier, categoria_local, ordem_trabalho, destinos, motivo, data_inicio, data_fim, data_expiracao_flash, valor_solicitado, valor_liberado, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [b.colaborador_id, b.tier, b.categoria_local, sanitize(b.ordem_trabalho), JSON.stringify(b.destinos || []), sanitize(b.motivo), b.data_inicio, b.data_fim,
     b.data_expiracao_flash || null, b.valor_solicitado ? Number(b.valor_solicitado) : null, Number(b.valor_liberado), sanitize(b.notes), req.user.id]);
  // Se o colaborador optou por descontar a pendência anterior automaticamente, marca como resolvida.
  if (b.descontar_pendencia_ids && Array.isArray(b.descontar_pendencia_ids) && b.descontar_pendencia_ids.length) {
    await query(`UPDATE erp_viaticos_solicitacoes SET pendencia_resolvida=true WHERE id = ANY($1::int[]) AND colaborador_id=$2`,
      [b.descontar_pendencia_ids, b.colaborador_id]);
  }
  res.json({ ok: true, id: ins[0].id });
}));

app.put('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body, err = validateSolicitacao(b);
  if (err) return res.status(400).json({ error: err });
  await query(`UPDATE erp_viaticos_solicitacoes SET colaborador_id=$1, tier=$2, categoria_local=$3, ordem_trabalho=$4, destinos=$5, motivo=$6,
    data_inicio=$7, data_fim=$8, data_expiracao_flash=$9, valor_solicitado=$10, valor_liberado=$11, notes=$12 WHERE id=$13`,
    [b.colaborador_id, b.tier, b.categoria_local, sanitize(b.ordem_trabalho), JSON.stringify(b.destinos || []), sanitize(b.motivo), b.data_inicio, b.data_fim,
     b.data_expiracao_flash || null, b.valor_solicitado ? Number(b.valor_solicitado) : null, Number(b.valor_liberado), sanitize(b.notes), req.params.id]);
  res.json({ ok: true });
}));

// Atualiza o status manualmente (Liberado / Em viagem / Aguardando comprovação,
// em qualquer direção — não só avançando). A partir daqui, o recálculo
// automático por data para de mexer nesta solicitação (status_manual=true).
app.post('/api/viaticos/solicitacoes/:id/status', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const status = req.body.status;
  if (!['em_approvals', 'transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'].includes(status)) return res.status(400).json({ error: 'Status inválido para esta transição.' });
  // Agendar a transferência é o momento em que o dinheiro passa a existir (é
  // feito na plataforma do Flash), então a tela pode enviar junto o valor
  // efetivamente transferido. Só é aceito nesta transição.
  if (req.body.valor_liberado !== undefined && req.body.valor_liberado !== null && req.body.valor_liberado !== '') {
    if (status !== 'transferencia_agendada') return res.status(400).json({ error: 'O valor liberado só pode ser informado ao agendar a transferência.' });
    const lib = Number(req.body.valor_liberado);
    if (!isFinite(lib) || lib < 0) return res.status(400).json({ error: 'Valor liberado inválido.' });
    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);
    return res.json({ ok: true });
  }
  await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true WHERE id=$2', [status, req.params.id]);
  res.json({ ok: true });
}));

// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente
// (devolvido / comprovado exato / divergente com pendência registrada).
app.post('/api/viaticos/solicitacoes/:id/fechar', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const s = (await query('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const comprovado = n((await query('SELECT COALESCE(SUM(valor),0) AS v FROM erp_viaticos_despesas WHERE solicitacao_id=$1', [req.params.id]))[0].v);
  const liberado = n(s.valor_liberado);
  const dif = liberado - comprovado; // >0 sobrou, <0 estourou
  let status, valor_devolvido = 0, valor_pendencia = 0, pendencia_resolvida = true;
  if (Math.abs(dif) < 0.005) { status = 'comprovado'; }
  else if (dif > 0) { status = 'devolvido'; valor_devolvido = dif; }
  else { status = 'divergente'; valor_pendencia = Math.abs(dif); pendencia_resolvida = false; }
  await query(`UPDATE erp_viaticos_solicitacoes SET status=$1, valor_devolvido=$2, valor_pendencia=$3, pendencia_resolvida=$4 WHERE id=$5`,
    [status, valor_devolvido, valor_pendencia, pendencia_resolvida, req.params.id]);
  res.json({ ok: true, status, comprovado, valor_devolvido, valor_pendencia });
}));

app.post('/api/viaticos/solicitacoes/:id/arquivar', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  await query(`UPDATE erp_viaticos_solicitacoes SET status='arquivado' WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`, [req.params.id]);
  res.json({ ok: true });
}));

// Reabre uma comprovação já finalizada, para corrigir/editar despesas.
// Restrito a administradores (não basta ter permissão de edição em Viáticos).
app.post('/api/viaticos/solicitacoes/:id/reabrir', requireAuth, requireAdmin, h(async (req, res) => {
  await query(`UPDATE erp_viaticos_solicitacoes SET status='aguardando_comprovacao', valor_devolvido=0, valor_pendencia=0, pendencia_resolvida=true
    WHERE id=$1 AND status IN ('comprovado','devolvido','divergente')`, [req.params.id]);
  res.json({ ok: true });
}));

// Registra a decisão (Aprovar ou Reprovar) sobre um excesso específico da
// TUD. Aprovar = Diretoria autorizou o gasto a mais, resolvendo também a
// pendência de estouro da viagem. Reprovar = mantém a pendência (o valor
// segue precisando ser descontado/cobrado do colaborador).
app.post('/api/viaticos/solicitacoes/:id/excesso-status', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const chave = String(req.body.chave || '').trim();
  const status = req.body.status;
  if (!chave || !['aprovado', 'reprovado'].includes(status)) return res.status(400).json({ error: 'Dados inválidos.' });
  const s = (await query('SELECT excessos_status, status AS sol_status FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];
  if (!s) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const atual = (s.excessos_status && typeof s.excessos_status === 'object') ? s.excessos_status : {};
  atual[chave] = status;
  await query('UPDATE erp_viaticos_solicitacoes SET excessos_status=$1 WHERE id=$2', [JSON.stringify(atual), req.params.id]);
  if (status === 'aprovado' && s.sol_status === 'divergente') {
    await query(`UPDATE erp_viaticos_solicitacoes SET pendencia_resolvida=true WHERE id=$1`, [req.params.id]);
  }
  res.json({ ok: true });
}));

app.delete('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  await query('DELETE FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---- Despesas (itens de comprovação) ----
app.get('/api/viaticos/solicitacoes/:id/despesas', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const escopo = await viaticosEscopo(req.user);
  if (escopo) {
    const dona = await query('SELECT 1 FROM erp_viaticos_solicitacoes WHERE id=$1 AND colaborador_id = ANY($2)', [req.params.id, escopo]);
    if (!dona.length) return res.status(403).json({ error: 'Acesso restrito às suas próprias solicitações.' });
  }
  const rows = await query('SELECT * FROM erp_viaticos_despesas WHERE solicitacao_id=$1 ORDER BY data', [req.params.id]);
  res.json(rows.map(r => ({ ...r, valor: n(r.valor) })));
}));

app.post('/api/viaticos/solicitacoes/:id/despesas', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body;
  if (!['alimentacao', 'aluguel_carro', 'combustivel', 'estacionamento', 'hospedagem', 'outro', 'passagem_aviao', 'passagem_onibus', 'pedagio', 'taxi_uber', 'veiculo'].includes(b.categoria)) return res.status(400).json({ error: 'Categoria inválida.' });
  if (!isDate(b.data)) return res.status(400).json({ error: 'Data inválida.' });
  const valor = Number(b.valor);
  if (!isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
  const ins = await query(`INSERT INTO erp_viaticos_despesas (solicitacao_id, categoria, data, valor, descricao)
    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.params.id, b.categoria, b.data, valor, sanitize(b.descricao)]);
  res.json({ ok: true, id: ins[0].id });
}));

app.put('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const b = req.body;
  if (!['alimentacao', 'aluguel_carro', 'combustivel', 'estacionamento', 'hospedagem', 'outro', 'passagem_aviao', 'passagem_onibus', 'pedagio', 'taxi_uber', 'veiculo'].includes(b.categoria)) return res.status(400).json({ error: 'Categoria inválida.' });
  if (!isDate(b.data)) return res.status(400).json({ error: 'Data inválida.' });
  const valor = Number(b.valor);
  if (!isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
  await query(`UPDATE erp_viaticos_despesas SET categoria=$1, data=$2, valor=$3, descricao=$4 WHERE id=$5`,
    [b.categoria, b.data, valor, sanitize(b.descricao), req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/viaticos/despesas/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  await query('DELETE FROM erp_viaticos_despesas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---- Dashboard / KPIs ----
// ---- Configuração global (preço do combustível p/ cálculo de rota) ----
//
// O preço não é mais digitado: é buscado automaticamente no Levantamento de
// Preços de Combustíveis da ANP (média nacional, Gasolina Comum, planilha
// semanal oficial em gov.br) e recebe uma margem (10% por padrão, ajustável)
// para cobrir a variação entre postos. Guardamos a decomposição completa
// (valor bruto da ANP, margem aplicada, semana de referência) para exibir
// discriminado na tela, como pedido — nada fica "escondido" no valor final.
//
// A ANP publica um arquivo por semana (domingo a sábado) num nome previsível
// (resumo_semanal_lpc_AAAA-MM-DD_AAAA-MM-DD.xlsx). Não existe uma API JSON
// oficial; buscamos esse XLSX diretamente e lemos a aba "BRASIL". Como o dia
// exato da publicação pode variar, tentamos a semana mais recente já
// concluída e, se ainda não publicada, recuamos semana a semana (até 6).
const ANP_BASE_URL = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc';
const ANP_REFRESH_DIAS = 3; // ANP atualiza 1x/semana; conferir a cada poucos dias evita bater no site à toa

async function buscarPrecoANP() {
  const [Y, M, D] = hojeISO().split('-').map(Number);
  const hojeUTC = Date.UTC(Y, M - 1, D);
  const dow = new Date(hojeUTC).getUTCDay(); // 0=domingo .. 6=sábado
  let sabado = hojeUTC - ((dow - 6 + 7) % 7) * 86400000; // sábado da última semana já concluída
  const iso = ms => new Date(ms).toISOString().slice(0, 10);

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const domingo = sabado - 6 * 86400000;
    const anosPossiveis = [...new Set([new Date(domingo).getUTCFullYear(), new Date(sabado).getUTCFullYear()])];
    for (const ano of anosPossiveis) {
      const url = `${ANP_BASE_URL}/${ano}/resumo_semanal_lpc_${iso(domingo)}_${iso(sabado)}.xlsx`;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        const wb = XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets['BRASIL'];
        if (!ws) continue;
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
        const linha = linhas.find(r => String(r[3] || '').trim().toUpperCase() === 'GASOLINA COMUM');
        const valor = linha ? Number(linha[6]) : NaN;
        if (!isFinite(valor) || valor <= 0) continue;
        return { valor, semanaFim: iso(sabado) };
      } catch (e) { /* tenta a próxima combinação de ano/semana */ }
    }
    sabado -= 7 * 86400000;
  }
  throw new Error('não foi possível obter o preço da ANP após várias tentativas (site fora do ar ou formato do arquivo alterado)');
}

// Reconsulta a ANP se o valor estiver desatualizado (ou se forcar=true, usado
// pelo botão "Atualizar agora"). Em falha automática, mantém o último valor
// bom e só registra o erro para diagnóstico — nunca deixa o cálculo de rota
// sem preço por causa de uma falha temporária do site da ANP.
async function atualizarPrecoANPSeNecessario(forcar) {
  const cfg = (await query('SELECT * FROM erp_viaticos_config WHERE id=1'))[0] || {};
  const stale = !cfg.combustivel_anp_atualizado_em ||
    (Date.now() - new Date(cfg.combustivel_anp_atualizado_em).getTime()) > ANP_REFRESH_DIAS * 86400000;
  if (!forcar && !stale) return cfg;

  try {
    const { valor, semanaFim } = await buscarPrecoANP();
    const margem = cfg.combustivel_margem_pct != null ? n(cfg.combustivel_margem_pct) : 10;
    const final = Number((valor * (1 + margem / 100)).toFixed(2));
    await query(`INSERT INTO erp_viaticos_config (id, preco_combustivel_litro, combustivel_anp_valor, combustivel_margem_pct, combustivel_anp_semana_fim, combustivel_anp_atualizado_em, combustivel_anp_erro, updated_at)
      VALUES (1,$1,$2,$3,$4,now(),NULL,now())
      ON CONFLICT (id) DO UPDATE SET preco_combustivel_litro=excluded.preco_combustivel_litro, combustivel_anp_valor=excluded.combustivel_anp_valor,
        combustivel_margem_pct=excluded.combustivel_margem_pct, combustivel_anp_semana_fim=excluded.combustivel_anp_semana_fim,
        combustivel_anp_atualizado_em=excluded.combustivel_anp_atualizado_em, combustivel_anp_erro=NULL, updated_at=now()`,
      [final, valor, margem, semanaFim]);
  } catch (e) {
    console.error('[anp]', e.message);
    await query(`INSERT INTO erp_viaticos_config (id, combustivel_anp_erro, updated_at) VALUES (1,$1,now())
      ON CONFLICT (id) DO UPDATE SET combustivel_anp_erro=excluded.combustivel_anp_erro, updated_at=now()`, [e.message]);
    if (forcar) throw e; // acionado manualmente: o usuário precisa saber que falhou agora
  }
  return (await query('SELECT * FROM erp_viaticos_config WHERE id=1'))[0];
}

app.get('/api/viaticos/config', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const cfg = await atualizarPrecoANPSeNecessario(false);
  res.json({
    preco_combustivel_litro: cfg.preco_combustivel_litro != null ? n(cfg.preco_combustivel_litro) : null,
    combustivel_anp_valor: cfg.combustivel_anp_valor != null ? n(cfg.combustivel_anp_valor) : null,
    combustivel_margem_pct: cfg.combustivel_margem_pct != null ? n(cfg.combustivel_margem_pct) : 10,
    combustivel_anp_semana_fim: cfg.combustivel_anp_semana_fim || null,
    combustivel_anp_atualizado_em: cfg.combustivel_anp_atualizado_em || null,
    combustivel_anp_erro: cfg.combustivel_anp_erro || null
  });
}));

// Força a busca agora, ignorando a janela de atualização — usado pelo botão
// "Atualizar agora" na tela de Configurações. Ao contrário da checagem
// automática, aqui a falha é reportada ao usuário (ele pediu a ação).
app.post('/api/viaticos/config/atualizar-anp', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  try {
    const cfg = await atualizarPrecoANPSeNecessario(true);
    res.json({
      ok: true,
      preco_combustivel_litro: n(cfg.preco_combustivel_litro),
      combustivel_anp_valor: n(cfg.combustivel_anp_valor),
      combustivel_anp_semana_fim: cfg.combustivel_anp_semana_fim
    });
  } catch (e) {
    res.status(502).json({ error: `Não foi possível buscar o preço na ANP agora (${e.message}). O último valor conhecido continua sendo usado nos cálculos.` });
  }
}));

// Ajusta apenas a margem sobre o valor da ANP (o preço final é sempre
// recalculado a partir do último valor bruto conhecido — não se digita mais
// o preço final diretamente).
app.put('/api/viaticos/config', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  const margem = Number(req.body.margem_pct);
  if (!isFinite(margem) || margem < 0 || margem > 200) return res.status(400).json({ error: 'Margem inválida (use um percentual entre 0 e 200).' });
  const cfg = (await query('SELECT * FROM erp_viaticos_config WHERE id=1'))[0];
  const anpValor = cfg && cfg.combustivel_anp_valor != null ? n(cfg.combustivel_anp_valor) : null;
  const final = anpValor != null ? Number((anpValor * (1 + margem / 100)).toFixed(2)) : (cfg ? n(cfg.preco_combustivel_litro) : null);
  await query(`INSERT INTO erp_viaticos_config (id, combustivel_margem_pct, preco_combustivel_litro, updated_at) VALUES (1,$1,$2,now())
    ON CONFLICT (id) DO UPDATE SET combustivel_margem_pct=excluded.combustivel_margem_pct, preco_combustivel_litro=excluded.preco_combustivel_litro, updated_at=now()`,
    [margem, final]);
  res.json({ ok: true });
}));

app.get('/api/viaticos/dashboard', requireAuth, requireViewAny(['viaticos']), h(async (req, res) => {
  const today = hojeISO();
  const mesAtual = today.slice(0, 7);
  const escopo = await viaticosEscopo(req.user);
  const filtroColab = escopo ? ' AND colaborador_id = ANY($1)' : '';
  const paramsColab = escopo ? [escopo] : [];

  // Carteira Flash = total já repassado (Contas a Pagar, categoria "Viáticos", pago)
  // menos o que está de fato alocado em solicitações (liberado - devolvido).
  // São números globais da empresa — usuários restritos (só leitura, vendo
  // apenas as próprias solicitações) não recebem esses valores.
  let saldoCarteira = null, transferido = null, transferidoMes = null;
  if (!escopo) {
    transferido = n((await query(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago' AND category='Viáticos'`))[0].v);
    transferidoMes = n((await query(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_payables WHERE status='pago' AND category='Viáticos' AND to_char(payment_date,'YYYY-MM')=$1`, [mesAtual]))[0].v);
    const alocado = n((await query(`SELECT COALESCE(SUM(valor_liberado - valor_devolvido),0) AS v FROM erp_viaticos_solicitacoes WHERE status NOT IN ('arquivado','em_approvals')`))[0].v);
    saldoCarteira = transferido - alocado;
  }

  const aguardando = await query(`SELECT id, destino, data_expiracao_flash, valor_liberado FROM erp_viaticos_solicitacoes
    WHERE status IN ('liberado','em_viagem','aguardando_comprovacao')${filtroColab}`, paramsColab);
  const vencidas = aguardando.filter(r => r.data_expiracao_flash && r.data_expiracao_flash < today);
  const divergentes = await query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(valor_pendencia),0) AS v FROM erp_viaticos_solicitacoes WHERE status='divergente' AND pendencia_resolvida=false${filtroColab}`, paramsColab);

  res.json({
    saldoCarteira, transferido, transferidoMes,
    aguardandoComprovacao: { n: aguardando.length, v: aguardando.reduce((s, r) => s + n(r.valor_liberado), 0) },
    vencidas: { n: vencidas.length, v: vencidas.reduce((s, r) => s + n(r.valor_liberado), 0) },
    divergentes: { n: divergentes[0].n, v: n(divergentes[0].v) }
  });
}));

// ============================================================
// SUPRIMENTOS — Estoque, Compras e Envios a funcionários
// O estoque é DERIVADO do livro de movimentos (erp_estoque_movimentos):
// tipo 'entrada' soma, 'saida' subtrai. Assim a quantidade nunca fica
// dessincronizada. Compra = entrada; Envio = saída; Devolução = entrada;
// Ajuste manual = entrada/saída com motivo.
// ============================================================
const SUP_VIEW = requireViewAny(['suprimentos']);
const SUP_EDIT = requireEdit('suprimentos');
const SUP_ESTOQUE_SELECT = `
  SELECT i.*,
    COALESCE((SELECT SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE -m.quantidade END)
              FROM erp_estoque_movimentos m WHERE m.item_id = i.id), 0) AS estoque_atual
  FROM erp_estoque_itens i`;

async function estoqueAtualItem(itemId) {
  const r = await query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE -quantidade END),0) AS q
    FROM erp_estoque_movimentos WHERE item_id=$1`, [itemId]);
  return Number(r[0].q);
}
app.get('/api/suprimentos/itens', requireAuth, SUP_VIEW, h(async (req, res) => {
  res.json(await query(`${SUP_ESTOQUE_SELECT} ORDER BY i.ativo DESC, i.nome`));
}));

app.get('/api/suprimentos/colaboradores', requireAuth, SUP_VIEW, h(async (req, res) => {
  res.json(await query('SELECT id, name, cargo FROM erp_colaboradores WHERE ativo = true ORDER BY name'));
}));

app.get('/api/suprimentos/resumo', requireAuth, SUP_VIEW, h(async (req, res) => {
  const itens = await query(`${SUP_ESTOQUE_SELECT} WHERE i.ativo = true`);
  const custodia = await query(`SELECT COALESCE(SUM(quantidade),0) AS q FROM erp_estoque_movimentos WHERE origem='envio' AND status <> 'devolvido'`);
  res.json({
    totalItens: itens.length,
    valorEstoque: itens.reduce((s, i) => s + n(i.estoque_atual) * n(i.custo_medio), 0),
    abaixoMinimo: itens.filter(i => n(i.estoque_atual) < n(i.estoque_minimo)).length,
    emCustodia: n(custodia[0].q)
  });
}));

function validItemEstoque(b) {
  if (!sanitize(b.nome)) return 'Nome do item é obrigatório.';
  if (b.tipo && !['material', 'equipamento'].includes(b.tipo)) return 'Tipo inválido.';
  const naoNeg = (v, label) => (v != null && v !== '' && !(Number(v) >= 0)) ? `${label} inválido(a).` : null;
  for (const [f, l] of [['estoque_minimo', 'Estoque mínimo'], ['estoque_maximo', 'Estoque máximo'],
      ['peso_liquido', 'Peso líquido'], ['peso_bruto', 'Peso bruto'], ['dim_altura', 'Altura'],
      ['dim_largura', 'Largura'], ['dim_profundidade', 'Profundidade'], ['preco_ultima_compra', 'Preço de custo']]) {
    const e = naoNeg(b[f], l); if (e) return e;
  }
  const mn = Number(b.estoque_minimo), mx = Number(b.estoque_maximo);
  if (b.estoque_maximo != null && b.estoque_maximo !== '' && isFinite(mx) && isFinite(mn) && mx > 0 && mx < mn)
    return 'Estoque máximo não pode ser menor que o mínimo.';
  if (sanitize(b.ncm) && String(b.ncm).replace(/\D/g, '').length !== 8) return 'NCM deve ter 8 dígitos.';
  if (sanitize(b.cest) && String(b.cest).replace(/\D/g, '').length !== 7) return 'CEST deve ter 7 dígitos.';
  return null;
}

// Monta o objeto de campos do item na ordem das colunas. As chaves são
// nomes fixos internos (não vêm do usuário), então é seguro interpolá-las.
function itemValues(b) {
  const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
  return {
    nome: sanitize(b.nome), sku: sanitize(b.sku), categoria: sanitize(b.categoria),
    subcategoria: sanitize(b.subcategoria), marca: sanitize(b.marca),
    tipo: b.tipo === 'equipamento' ? 'equipamento' : 'material',
    unidade: sanitize(b.unidade) || 'un', descricao: sanitize(b.descricao),
    estoque_minimo: Number(b.estoque_minimo) || 0, estoque_maximo: num(b.estoque_maximo),
    peso_liquido: num(b.peso_liquido), peso_bruto: num(b.peso_bruto),
    dim_altura: num(b.dim_altura), dim_largura: num(b.dim_largura), dim_profundidade: num(b.dim_profundidade),
    preco_ultima_compra: num(b.preco_ultima_compra),
    ncm: sanitize(b.ncm), cest: sanitize(b.cest),
    origem_mercadoria: sanitize(b.origem_mercadoria), numero_serie: sanitize(b.numero_serie),
    notes: sanitize(b.notes)
  };
}

app.post('/api/suprimentos/itens', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body, err = validItemEstoque(b);
  if (err) return res.status(400).json({ error: err });
  const v = itemValues(b);
  // Preço de custo informado no cadastro serve como custo médio inicial —
  // senão o item entraria com custo 0 e o "Valor em estoque" ficaria zerado
  // até a primeira compra. As compras seguintes recalculam a média.
  if (n(v.preco_ultima_compra) > 0) v.custo_medio = n(v.preco_ultima_compra);
  const cols = Object.keys(v), vals = Object.values(v);
  const ph = cols.map((_, i) => '$' + (i + 1)).join(',');
  const rows = await query(`INSERT INTO erp_estoque_itens (${cols.join(',')}) VALUES (${ph}) RETURNING id`, vals);
  res.json({ ok: true, id: rows[0].id });
}));

app.put('/api/suprimentos/itens/:id', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body, err = validItemEstoque(b);
  if (err) return res.status(400).json({ error: err });
  const v = itemValues(b); v.ativo = b.ativo !== false;
  // Item ainda sem custo médio (nunca comprado): adota o preço de custo
  // informado, para o estoque passar a ser valorizado. Se já há custo médio
  // calculado por compras, ele é preservado.
  const atual = (await query('SELECT custo_medio FROM erp_estoque_itens WHERE id=$1', [req.params.id]))[0];
  if (atual && !(n(atual.custo_medio) > 0) && n(v.preco_ultima_compra) > 0) v.custo_medio = n(v.preco_ultima_compra);
  const cols = Object.keys(v), vals = Object.values(v);
  const set = cols.map((c, i) => `${c}=$${i + 1}`).join(', ');
  vals.push(req.params.id);
  await query(`UPDATE erp_estoque_itens SET ${set} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
}));

app.delete('/api/suprimentos/itens/:id', requireAuth, SUP_EDIT, h(async (req, res) => {
  const used = (await query('SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE item_id=$1', [req.params.id]))[0].n;
  if (used > 0) return res.status(409).json({ error: `Item possui ${used} movimentação(ões). Inative-o em vez de excluir.` });
  await query('DELETE FROM erp_estoque_itens WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/suprimentos/movimentos', requireAuth, SUP_VIEW, h(async (req, res) => {
  const cond = [], params = [];
  if (req.query.item_id) { params.push(req.query.item_id); cond.push(`m.item_id=$${params.length}`); }
  if (req.query.origem) { params.push(req.query.origem); cond.push(`m.origem=$${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  res.json(await query(`
    SELECT m.*, i.nome AS item_nome, i.unidade, i.tipo AS item_tipo,
      s.name AS supplier_name, c.name AS colaborador_name, u.name AS created_by_name
    FROM erp_estoque_movimentos m
    JOIN erp_estoque_itens i ON i.id = m.item_id
    LEFT JOIN erp_suppliers s ON s.id = m.supplier_id
    LEFT JOIN erp_colaboradores c ON c.id = m.colaborador_id
    LEFT JOIN erp_users u ON u.id = m.created_by
    ${where} ORDER BY m.data DESC, m.id DESC`, params));
}));

// Compra: entrada no estoque + custo médio ponderado + (opcional) Conta a Pagar
app.post('/api/suprimentos/compras', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body;
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [b.item_id]))[0];
  if (!item) return res.status(400).json({ error: 'Item inválido.' });
  const qtd = Number(b.quantidade), custo = Number(b.custo_unitario);
  if (!isFinite(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
  if (!isFinite(custo) || custo < 0) return res.status(400).json({ error: 'Custo unitário inválido.' });
  const data = isDate(b.data) ? b.data : hojeISO();
  const valorTotal = Number((qtd * custo).toFixed(2));

  let payableId = null;
  if (b.lancar_pagar) {
    if (!isDate(b.due_date)) return res.status(400).json({ error: 'Informe o vencimento para lançar em Contas a Pagar.' });
    const desc = `Compra de material: ${item.nome} (${qtd} ${item.unidade})`;
    const pr = await query(`INSERT INTO erp_payables (supplier_id, description, category, document, amount, due_date, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.supplier_id || null, desc, sanitize(b.categoria_pagar) || 'Materiais/Suprimentos', sanitize(b.documento), valorTotal, b.due_date, sanitize(b.notes), req.user.id]);
    payableId = pr[0].id;
  }

  const mov = await query(`INSERT INTO erp_estoque_movimentos
    (item_id, tipo, origem, quantidade, custo_unitario, valor_total, supplier_id, documento, data, payable_id, notes, created_by)
    VALUES ($1,'entrada','compra',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [item.id, qtd, custo, valorTotal, b.supplier_id || null, sanitize(b.documento), data, payableId, sanitize(b.notes), req.user.id]);

  // Custo médio ponderado sobre o estoque ANTES desta entrada.
  const baseQtd = Math.max(0, (await estoqueAtualItem(item.id)) - qtd);
  const novoCusto = (baseQtd + qtd) > 0 ? ((Number(item.custo_medio) * baseQtd) + valorTotal) / (baseQtd + qtd) : custo;
  await query('UPDATE erp_estoque_itens SET custo_medio=$1, preco_ultima_compra=$2 WHERE id=$3', [Number(novoCusto.toFixed(2)), custo, item.id]);

  res.json({ ok: true, id: mov[0].id, payable_id: payableId });
}));

// Envio a colaborador: saída do estoque (checa saldo). Equipamento entra em custódia.
app.post('/api/suprimentos/envios', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body;
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [b.item_id]))[0];
  if (!item) return res.status(400).json({ error: 'Item inválido.' });
  if (!b.colaborador_id) return res.status(400).json({ error: 'Selecione o colaborador destinatário.' });
  const colab = (await query('SELECT id FROM erp_colaboradores WHERE id=$1', [b.colaborador_id]))[0];
  if (!colab) return res.status(400).json({ error: 'Colaborador inválido.' });
  const qtd = Number(b.quantidade);
  if (!isFinite(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
  const saldo = await estoqueAtualItem(item.id);
  if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente: disponível ${saldo} ${item.unidade}, solicitado ${qtd}.` });
  const data = isDate(b.data) ? b.data : hojeISO();
  const mov = await query(`INSERT INTO erp_estoque_movimentos
    (item_id, tipo, origem, quantidade, colaborador_id, status, data, notes, created_by)
    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6) RETURNING id`,
    [item.id, qtd, b.colaborador_id, data, sanitize(b.notes), req.user.id]);
  res.json({ ok: true, id: mov[0].id });
}));

// Custódia do envio: entregue | devolvido (a devolução repõe o estoque).
app.post('/api/suprimentos/envios/:id/status', requireAuth, SUP_EDIT, h(async (req, res) => {
  const novo = req.body.status;
  if (!['entregue', 'devolvido'].includes(novo)) return res.status(400).json({ error: 'Status inválido.' });
  const env = (await query(`SELECT * FROM erp_estoque_movimentos WHERE id=$1 AND origem='envio'`, [req.params.id]))[0];
  if (!env) return res.status(404).json({ error: 'Envio não encontrado.' });
  if (env.status === 'devolvido') return res.status(400).json({ error: 'Este envio já foi devolvido.' });
  if (novo === 'devolvido') {
    const data = isDate(req.body.data) ? req.body.data : hojeISO();
    await query(`INSERT INTO erp_estoque_movimentos (item_id, tipo, origem, quantidade, colaborador_id, data, devolucao_de, notes, created_by)
      VALUES ($1,'entrada','devolucao',$2,$3,$4,$5,$6,$7)`,
      [env.item_id, env.quantidade, env.colaborador_id, data, env.id, sanitize(req.body.notes), req.user.id]);
    await query(`UPDATE erp_estoque_movimentos SET status='devolvido', data_devolucao=$1 WHERE id=$2`, [data, env.id]);
  } else {
    await query(`UPDATE erp_estoque_movimentos SET status='entregue' WHERE id=$1`, [env.id]);
  }
  res.json({ ok: true });
}));

// Ajuste manual de estoque (entrada/saída com motivo obrigatório).
app.post('/api/suprimentos/ajustes', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body;
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [b.item_id]))[0];
  if (!item) return res.status(400).json({ error: 'Item inválido.' });
  const tipo = b.tipo === 'saida' ? 'saida' : 'entrada';
  const qtd = Number(b.quantidade);
  if (!isFinite(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
  if (!sanitize(b.notes)) return res.status(400).json({ error: 'Descreva o motivo do ajuste.' });
  if (tipo === 'saida') {
    const saldo = await estoqueAtualItem(item.id);
    if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente: disponível ${saldo} ${item.unidade}.` });
  }
  // Entrada por ajuste também precisa valorizar o estoque: sem custo, o item
  // ficava com custo médio 0 e o "Valor em estoque" zerado. Se o usuário não
  // informar, usa o custo médio atual ou o preço da última compra do cadastro.
  let custo = null;
  if (tipo === 'entrada') {
    const informado = Number(b.custo_unitario);
    custo = (b.custo_unitario != null && b.custo_unitario !== '' && isFinite(informado) && informado >= 0)
      ? informado
      : (n(item.custo_medio) > 0 ? n(item.custo_medio) : n(item.preco_ultima_compra));
    if (!(custo > 0)) custo = null;
  }
  const data = isDate(b.data) ? b.data : hojeISO();
  await query(`INSERT INTO erp_estoque_movimentos (item_id, tipo, origem, quantidade, custo_unitario, valor_total, data, notes, created_by)
    VALUES ($1,$2,'ajuste',$3,$4,$5,$6,$7,$8)`,
    [item.id, tipo, qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, data, sanitize(b.notes), req.user.id]);

  if (tipo === 'entrada' && custo != null) {
    const baseQtd = Math.max(0, (await estoqueAtualItem(item.id)) - qtd);
    const novoCusto = (baseQtd + qtd) > 0 ? ((n(item.custo_medio) * baseQtd) + qtd * custo) / (baseQtd + qtd) : custo;
    await query('UPDATE erp_estoque_itens SET custo_medio=$1 WHERE id=$2', [Number(novoCusto.toFixed(2)), item.id]);
  }
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
