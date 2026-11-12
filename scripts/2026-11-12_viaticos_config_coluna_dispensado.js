// Propósito: em Configurações de Viáticos, a coluna "Dispensar CNH, CRLV e seguro" da tabela de colaboradores vira "Dispensado" (cabeçalho curto, coluna estreita e centralizada).
//   O significado continua explicado na dica do cabeçalho (passar o mouse) e no texto acima da tabela, que passa a começar por "Dispensado (CNH, CRLV e seguro)".
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_config_coluna_dispensado.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', troca => {
  troca("<th class=\"c-inc\" title=\"Para quem não usa carro a serviço: não cobra CNH, CRLV nem seguro\">Dispensar CNH, CRLV e seguro</th>",
    "<th class=\"c-inc\" title=\"Dispensar CNH, CRLV e seguro: para quem não usa carro a serviço, não cobra esses documentos\">Dispensado</th>");
  troca("<strong>Dispensar CNH, CRLV e seguro:</strong> para quem não usa carro a serviço.", "<strong>Dispensado (CNH, CRLV e seguro):</strong> marque para quem não usa carro a serviço.");
});
edita('public/styles.css', (troca, ler, grava) => {
  if (ler().includes('.tbl-colaboradores .c-inc')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + '\n/* Configurações de Viáticos: coluna "Dispensado" estreita e centralizada */\n.tbl-colaboradores th.c-inc, .tbl-colaboradores td.c-inc { text-align: center; width: 1%; white-space: nowrap; }\n');
});
console.log('ok');
