// Propósito: acertos de aparência no PDF do termo único depois de conferir o arquivo gerado: (1) o marcador "▸" não existe na fonte do PDF e saía como "%¸": troca por "•";
//   (2) o título da seção 4 passava da largura da faixa: o título fica "4. POLÍTICAS DE USO ACEITÁVEL" e a frase "O colaborador declara ciência e concordância com as diretrizes abaixo:" abre o quadro;
//   (3) o cabeçalho "Nº patrimonial" quebrava: vira "Patrimônio". Só aparência.
// Entrada: public/app.js e o bloco scripts/2026-11-18_termo_front.txt (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_termo_ajustes_pdf.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(p, fn) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(p + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const aplica = (troca, get) => {
  if (get().includes('O colaborador declara ciência e concordância com as diretrizes abaixo:')) throw new Error('já aplicado');
  troca("doc.text('▸', M + 4, yy);", "doc.text('•', M + 4, yy);");
  troca("'Nº patrimonial', 'Estado'", "'Patrimônio', 'Estado'");
  troca("secao('4.  POLÍTICAS DE USO ACEITÁVEL: O COLABORADOR DECLARA CIÊNCIA E CONCORDÂNCIA COM AS DIRETRIZES ABAIXO');", "secao('4.  POLÍTICAS DE USO ACEITÁVEL');");
  troca("hPol = 6 + lDecl.length * 4.1 + 3 + lPol", "hPol = 11 + lDecl.length * 4.1 + 3 + lPol");
  troca("doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6); doc.setTextColor(...TXT); doc.text(lDecl, M + 4, y + 5); yy = y + 5 + lDecl.length * 4.1 + 3;",
    "doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...VERDE); doc.text('O colaborador declara ciência e concordância com as diretrizes abaixo:', M + 4, y + 5);\n    doc.setFont('helvetica', 'italic'); doc.setTextColor(...TXT); doc.text(lDecl, M + 4, y + 10); yy = y + 10 + lDecl.length * 4.1 + 3;");
};
edita(path.join(raiz, 'public/app.js'), aplica);
edita(path.join(__dirname, '2026-11-18_termo_front.txt'), aplica);
console.log('ok');
