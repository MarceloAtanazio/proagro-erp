// Propósito: na lista de Viáticos, a coluna "Local" não pode mais crescer com OTs de muitos destinos e desconfigurar as outras colunas: os destinos ficam em UMA linha,
//   truncados com "…" e o texto completo aparece ao passar o mouse (title). Vale para o Clássico e para o Novo (a classe .via-destinos é estilizada em public/styles.css).
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_local_reticencias.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', troca => {
  troca("s.destinos.map(d => `${esc(d.municipio)}/${esc(d.uf)}`).join(', ') : '';\n      const cor = 'style=\"color:var(--muted)\"';",
        "s.destinos.map(d => `${esc(d.municipio)}/${esc(d.uf)}`).join(', ') : '';\n      const destinosAttr = destinosTxt ? `class=\"via-destinos\" title=\"${destinosTxt.replace(/\"/g, '&quot;')}\"` : '';   // uma linha com \"…\"; o texto inteiro no mouse\n      const cor = 'style=\"color:var(--muted)\"';");
  troca("<td><small ${cor}>${destinosTxt}</small></td>", "<td><small ${cor} ${destinosAttr}>${destinosTxt}</small></td>");
  troca("${destinosTxt ? `<br><small ${cor}>${destinosTxt}</small>` : ''}", "${destinosTxt ? `<br><small ${cor} ${destinosAttr}>${destinosTxt}</small>` : ''}");
});
edita('public/styles.css', (troca, ler, grava) => {
  if (ler().includes('.via-destinos')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + '\n/* Viáticos: destinos numa linha só, com reticências (texto completo no title) */\n.via-destinos { display: block; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n');
});
console.log('ok');
