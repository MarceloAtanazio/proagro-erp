// Propósito: quarta rodada do TEMA (visual novo): liga ao sistema o KIT DE PÁGINAS, que moderniza todas as telas de uma vez (public/tema-paginas.css: abas, cartões,
//   indicadores do RH, listas de configuração, formulários, avisos, vazios, barras de filtro; e a correção de tinta do modo escuro) e (public/tema-paginas.js: cabeçalho de
//   página no estilo do Dashboard e reaplicação dos enfeites quando uma tela se redesenha sozinha). Só carrega os dois arquivos no index.html.
// Entrada: public/index.html (ou a pasta indicada em argv[2]). Saída: o arquivo editado.
// Uso (depois de 2026-11-12_tema_integra3.js): node scripts/2026-11-12_tema_integra4.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/index.html');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
troca('  <link rel="stylesheet" href="/tema-listas.css">\n', '  <link rel="stylesheet" href="/tema-listas.css">\n  <link rel="stylesheet" href="/tema-paginas.css">\n');
troca('  <script src="/tema-listas.js"></script>\n', '  <script src="/tema-listas.js"></script>\n  <script src="/tema-paginas.js"></script>\n');
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
