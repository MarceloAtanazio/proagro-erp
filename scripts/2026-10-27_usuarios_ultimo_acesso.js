// Propósito: Usuários passa a mostrar o último acesso (data e hora) de cada pessoa. Grava em erp_users.ultimo_acesso_em
//   (nunca zerado, ao contrário de last_seen_at que o logout limpa) no login e no heartbeat; GET /api/users devolve o campo.
// Entrada: api/index.js e public/app.js (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso: node scripts/2026-10-27_usuarios_ultimo_acesso.js [raiz]   (a migração supabase/migrations/2026-10-27-usuarios-ultimo-acesso.sql vem antes)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, trocas) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [de, para] of trocas) { if (!s.includes(de)) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 60)); s = s.replace(de, () => para); }
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('api/index.js', [
  ["query(`UPDATE erp_users SET last_seen_at = now()\n           WHERE id = $1 AND (last_seen_at IS NULL",
   "query(`UPDATE erp_users SET last_seen_at = now(), ultimo_acesso_em = now()\n           WHERE id = $1 AND (last_seen_at IS NULL"],
  ["query('UPDATE erp_users SET last_seen_at = now() WHERE id = $1', [user.id])",
   "query('UPDATE erp_users SET last_seen_at = now(), ultimo_acesso_em = now() WHERE id = $1', [user.id])"],
  ["      last_seen_at,\n      (last_seen_at IS NOT NULL", "      last_seen_at, ultimo_acesso_em,\n      (last_seen_at IS NOT NULL"]]);
edita('public/app.js', [[
  "<div class=\"user-mail\">${esc(u.email)} · cadastro: ${brDate(u.created_at.slice(0, 10))}</div>",
  "<div class=\"user-mail\">${esc(u.email)} · cadastro: ${brDate(u.created_at.slice(0, 10))}</div>\n" +
  "              <div class=\"user-mail\">Último acesso: ${u.ultimo_acesso_em ? esc(new Date(u.ultimo_acesso_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')) : 'nunca acessou'}</div>"]]);
console.log('ok');
