// Propósito: filtro Todos / Ativos / Inativos (com contagem) na tela de Usuários. A escolha vale também para a
//   recarga automática de 60s e depois de ativar/desativar alguém, para a lista não voltar para "Todos" sozinha.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: public/app.js editado.
// Uso: node scripts/2026-10-28_usuarios_filtro_ativos_inativos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('trecho não achado: ' + de.slice(0, 60)); s = s.replace(de, () => para); };
troca(`async function renderUsuarios() {
  const rows = await api('/api/users');
  const byId = id => rows.find(u => String(u.id) === String(id));
`, `let USERS_FILTRO = 'todos';   // todos | ativos | inativos
async function renderUsuarios() {
  const todos = await api('/api/users');
  const nAtivos = todos.filter(u => u.active).length, nInativos = todos.length - nAtivos;
  const rows = USERS_FILTRO === 'ativos' ? todos.filter(u => u.active)
    : USERS_FILTRO === 'inativos' ? todos.filter(u => !u.active) : todos;
  const byId = id => todos.find(u => String(u.id) === String(id));
`);
troca(`    <div class="user-list">
      \${rows.map(u => {`, `    <div class="toolbar">
      <label>Mostrar
        <select id="users-filtro">
          <option value="todos"\${USERS_FILTRO === 'todos' ? ' selected' : ''}>Todos (\${todos.length})</option>
          <option value="ativos"\${USERS_FILTRO === 'ativos' ? ' selected' : ''}>Ativos (\${nAtivos})</option>
          <option value="inativos"\${USERS_FILTRO === 'inativos' ? ' selected' : ''}>Inativos (\${nInativos})</option>
        </select>
      </label>
    </div>

    <div class="user-list">
      \${rows.length ? '' : '<div class="empty">Nenhum usuário nesta situação.</div>'}
      \${rows.map(u => {`);
troca(`  $('#btn-new-user').onclick = openCreateUser;`, `  $('#users-filtro').onchange = e => { USERS_FILTRO = e.target.value; renderUsuarios(); };
  $('#btn-new-user').onclick = openCreateUser;`);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
