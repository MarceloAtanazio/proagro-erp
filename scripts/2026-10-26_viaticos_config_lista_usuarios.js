// Propósito: Viáticos → Configurações não abria para quem tem edição em Viáticos mas não é o administrador principal:
//   a tela buscava /api/users (só super admin) para o campo "Vincular a um usuário". Cria GET /api/viaticos/usuarios
//   (id, nome e e-mail, para quem edita Viáticos) e a tela passa a usá-lo.
// Entrada: api/index.js e public/app.js (ou a pasta indicada em argv[2]). Saída: os dois arquivos editados.
// Uso: node scripts/2026-10-26_viaticos_config_lista_usuarios.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, trocas) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [de, para] of trocas) { if (!s.includes(de)) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 60)); s = s.replace(de, () => para); }
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('api/index.js', [[
`app.post('/api/colaboradores', requireAuth, requireEdit('viaticos'),`,
`// Só o necessário para o campo "Vincular a um usuário" da ficha do colaborador. /api/users é do administrador
// principal; quem edita Viáticos não pode depender dele para abrir as Configurações.
app.get('/api/viaticos/usuarios', requireAuth, requireEdit('viaticos'), h(async (req, res) => {
  res.json(await query('SELECT id, name, email FROM erp_users ORDER BY CASE WHEN active THEN 0 ELSE 1 END, name'));
}));

app.post('/api/colaboradores', requireAuth, requireEdit('viaticos'),`]]);
edita('public/app.js', [[
`api('/api/viaticos/tud'), api('/api/users'), api('/api/viaticos/config')]);`,
`api('/api/viaticos/tud'), api('/api/viaticos/usuarios'), api('/api/viaticos/config')]);`]]);
console.log('ok');
