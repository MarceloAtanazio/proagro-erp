// Propósito: na janela "Configurações de Viáticos", as tabelas de TUD dos Tiers A e B passam a ficar LADO A LADO, cada uma ocupando metade da largura (sem vão vazio à direita);
//   em telas estreitas (< 900px) voltam a empilhar. Remove o limite de 860px posto antes nas grades de TUD.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_config_tud_lado_a_lado.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', troca => {
  troca("    ${tudGrid('A')}${tudGrid('B')}\n", "    <div class=\"cfg-tud-par\"><div>${tudGrid('A')}</div><div>${tudGrid('B')}</div></div>\n");
});
edita('public/styles.css', troca => {
  troca(".modal.modal-cfg .table-wrap:not(:has(.tbl-colaboradores)) { max-width: 860px; }",
    "/* TUD dos Tiers A e B lado a lado, cada um com metade da largura */\n.cfg-tud-par { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: start; }\n.cfg-tud-par .table-wrap { margin: 0; }\n@media (max-width: 900px) { .cfg-tud-par { grid-template-columns: 1fr; gap: 0; } }");
});
console.log('ok');
