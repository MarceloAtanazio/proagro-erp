// Propósito: no pacote ZIP da tesouraria, baixar os anexos ANTES de gerar o PDF/Excel e montar as colunas só com o
//   que realmente entrou no pacote ("Boleto: Sim"/"Aprov-01" nunca apontam para arquivo que falhou ao baixar).
//   Troca a região entre "const meta = await api('/api/payables/pacote'" e "status('Montando o ZIP…'); prog(82);"
//   pelo conteúdo de scripts/2026-10-15_pagar_pacote_zip_regiao.txt, no bloco em texto e em public/app.js.
// Uso: node scripts/2026-10-15_pagar_pacote_zip_reordem.js
const fs = require('fs'), path = require('path');
const regiao = fs.readFileSync(path.join(__dirname, '2026-10-15_pagar_pacote_zip_regiao.txt'), 'utf8').replace(/\r\n/g, '\n');
const INI = "    const meta = await api('/api/payables/pacote'", FIM = "    status('Montando o ZIP…'); prog(82);\n";
function aplicar(arq) {
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (s.includes('const meta0 = await api(')) { console.log('já aplicado em ' + path.basename(arq)); return; }
  const a = s.indexOf(INI), b = a < 0 ? -1 : s.indexOf(FIM, a);
  if (a < 0 || b < 0) throw new Error('marcadores não achados em ' + path.basename(arq));
  s = s.slice(0, a) + regiao + s.slice(b + FIM.length);
  const antes = "{ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, m => prog(82 + m.percent * 0.17)";
  if (!s.includes(antes)) throw new Error('trecho do generateAsync não achado em ' + path.basename(arq));
  s = s.replace(antes, "{ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, m => prog(86 + m.percent * 0.13)");
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
}
aplicar(path.join(__dirname, '2026-10-15_pagar_pacote_zip_bloco.txt'));
aplicar(path.join(__dirname, '..', 'public/app.js'));
console.log('ok');
