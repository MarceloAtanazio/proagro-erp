// Propósito: nome do arquivo do termo único ao extrair o PDF: "Termo de Responsabilidade - NOME DO COLABORADOR - Nº TR-0001.pdf" (antes: termo-responsabilidade-TR-0001.pdf).
//   Caracteres que o Windows não aceita em nome de arquivo (barra, dois-pontos, asterisco, interrogação, aspas, menor, maior, barra vertical) são retirados do nome do colaborador; acentos e espaços ficam.
//   Se o script já tiver sido aplicado antes (com a expressão antiga), a linha do nome é trocada pela versão atual.
// Entrada: public/app.js e o bloco scripts/2026-11-18_termo_front.txt (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_termo_nome_arquivo.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const NOVA = "    const nomeArq = Array.from(String(c.name || 'Colaborador')).filter(ch => ch.charCodeAt(0) !== 92 && !'/:*?\"<>|'.includes(ch)).join('').split(' ').filter(Boolean).join(' ') || 'Colaborador';";
for (const p of [path.join(raiz, 'public/app.js'), path.join(__dirname, '2026-11-18_termo_front.txt')]) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const antigoSave = "    doc.save(`termo-responsabilidade-${numero}.pdf`);";
  if (s.includes(antigoSave)) s = s.replace(antigoSave, () => NOVA + "\n    doc.save(`Termo de Responsabilidade - ${nomeArq} - Nº ${numero}.pdf`);");
  else {
    const ini = s.indexOf("    const nomeArq = String(c.name || 'Colaborador')");
    if (ini < 0) throw new Error(p + ': linha do nome não achada');
    const fim = s.indexOf('\n', ini);
    s = s.slice(0, ini) + NOVA + s.slice(fim);
  }
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
console.log('ok');
