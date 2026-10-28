// Propósito: bloco de assinaturas do PDF do contrato mais bem estruturado. O traço de assinatura saía colado na linha de cima
//   (sem espaço para assinar) e podia se separar do nome na quebra de página. Agora há espaço acima de cada traço e traço + nome(s)
//   ficam juntos na mesma página. Vale para todas as minutas.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: public/app.js editado.
// Uso: node scripts/2026-10-30_contrato_pdf_espaco_assinatura.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 60)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 60)); s = s.replace(de, () => para); };
troca('  aposLinhaAssinatura: 0.05,\n',
      '  aposLinhaAssinatura: 0.05,\n  // Espaço para assinar, acima de cada traço de assinatura.\n  antesLinhaAssinatura: 2.6,\n');
troca("    const centrado = p.alinhamento === 'center';\n    // As testemunhas descem",
      "    const centrado = p.alinhamento === 'center';\n    // Traço de assinatura: abre espaço para assinar e não se separa do nome embaixo (traço + 2 linhas de nome).\n    if (ehLinhaAssinatura(p.texto)) { cabe(alturaLinha * (RH_PDF.antesLinhaAssinatura + 3.2)); y += alturaLinha * RH_PDF.antesLinhaAssinatura; }\n    // As testemunhas descem");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
