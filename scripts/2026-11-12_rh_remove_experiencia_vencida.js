// Propósito: tira do Quadro de RH (Compliance trabalhista) o aviso "Contrato de experiência já vencido: …". Experiência que passou da data sem ação não está "vencida":
//   a pessoa passou a ser efetiva (prazo indeterminado) — o aviso era irrelevante. Também deixa de contar essas pessoas como "pendência de compliance" (cor do bloco).
//   Continuam: o indicador "Experiência vencendo" (próximos 30 dias) e o aviso "Experiência terminando". A API segue devolvendo o campo (sem uso na tela).
// Entrada: public/app.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-12_rh_remove_experiencia_vencida.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
troca("    + cp.experiencia_vencida.length + cp.sem_vinculo;", "    + cp.sem_vinculo;");
troca("      ${cp.experiencia_vencida.length ? `<div class=\"rh-nota aviso\">\n        <strong>Contrato de experiência já vencido:</strong>\n        ${cp.experiencia_vencida.map(x => `${esc(x.nome)} (${rhData(x.ate)})`).join(' · ')}.\n        Passada a data sem rescisão, o contrato vira por prazo indeterminado.</div>` : ''}\n", "");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
