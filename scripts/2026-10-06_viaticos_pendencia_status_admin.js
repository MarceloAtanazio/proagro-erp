// Propósito: no agendamento da transferência (POST /api/viaticos/solicitacoes/:id/status), decidir sobre a
//   pendência de estouro exige administrador — checagem própria, para não depender de outra trava da rota.
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-06_viaticos_pendencia_status_admin.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const de = "    await query('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3', [status, lib, req.params.id]);\n    if (Array.isArray(req.body.pendencia_ids)";
if (!s.includes(de)) throw new Error('trecho não achado');
s = s.replace(de, () => "    if (Array.isArray(req.body.pendencia_ids) && req.body.pendencia_ids.length && req.user.role !== 'admin') {\n      return res.status(403).json({ error: 'Somente um administrador pode decidir sobre a pendência de viagem anterior.' });\n    }\n" + de);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
