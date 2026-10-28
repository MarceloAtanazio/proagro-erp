// Propósito: backend das movimentações de carreira (promoção, mérito, dissídio, ajuste) com vigência futura ou retroativa.
//   Insere em api/index.js: os rótulos de auditoria, o aplicador automático (middleware em /api/rh) e as rotas
//   GET/POST /api/rh/colaboradores/:id/movimentacoes, DELETE /api/rh/movimentacoes/:id, GET /api/rh/dissidio/base e POST /api/rh/dissidio.
// Entrada: api/index.js (ou a pasta indicada em argv[2]) e os três scripts/2026-10-28_rh_movimentacoes_*_bloco.txt. Saída: api/index.js editado.
// Uso: node scripts/2026-10-28_rh_movimentacoes_api.js [raiz]   (a migração 2026-10-28-rh-movimentacoes.sql vem antes)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, '2026-10-28_rh_movimentacoes_' + n + '_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const antes = (marca, texto) => { const i = s.indexOf(marca); if (i < 0) throw new Error('trecho não achado: ' + marca.slice(0, 60)); if (s.indexOf(marca, i + 1) >= 0) throw new Error('trecho repetido: ' + marca.slice(0, 60)); s = s.slice(0, i) + texto + s.slice(i); };
antes("  'PUT /api/rh/vinculos/:id': req =>", bloco('audit'));
antes('// ---- Lista de colaboradores (tela de RH) ----', bloco('middleware'));
antes("app.put('/api/rh/vinculos/:id', requireAuth, requireEdit('rh'),", bloco('api'));
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
