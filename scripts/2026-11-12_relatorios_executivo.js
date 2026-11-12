// Propósito: Relatórios Gerenciais executivos (visual Novo): endpoint GET /api/reports/dre/:ano?regime=caixa|competencia (DRE por mês/categoria, ano anterior, orçado, posição financeira,
//   clientes e fornecedores) e ganchos mínimos para o módulo public/tema-relatorios.js (+ .css): app.js publica window.ProagroRel e dispara 'proagro:rel' ao fim de renderRelatorios; index.html carrega os dois arquivos.
//   Sem mudança no visual Clássico nem no banco (só leitura).
// Entrada: api/index.js, public/app.js, public/index.html (ou a pasta em argv[2]) e scripts/2026-11-12_relatorios_dre_api_bloco.txt. Saída: arquivos editados.
// Como executar: node scripts/2026-11-12_relatorios_executivo.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = fs.readFileSync(path.join(__dirname, '2026-11-12_relatorios_dre_api_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('api/index.js', troca => {
  troca('// Fluxo de caixa: realizado (pagos/recebidos) + projetado (pendentes por vencimento)', bloco + '// Fluxo de caixa: realizado (pagos/recebidos) + projetado (pendentes por vencimento)');
});
edita('public/app.js', troca => {
  troca("    options: chartOpts()\n  });\n}\n\n// ============================================================\n// VIÁTICOS",
    "    options: chartOpts()\n  });\n  // visual Novo (tema-relatorios.js): monta a página executiva por cima, com dados do endpoint /api/reports/dre\n  window.ProagroRel = { year };\n  setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:rel')), 0);\n}\n\n// ============================================================\n// VIÁTICOS");
});
edita('public/index.html', troca => {
  troca('  <link rel="stylesheet" href="/tema-rh.css">\n', '  <link rel="stylesheet" href="/tema-rh.css">\n  <link rel="stylesheet" href="/tema-relatorios.css">\n');
  troca('  <script src="/tema-rh.js"></script>\n', '  <script src="/tema-rh.js"></script>\n  <script src="/tema-relatorios.js"></script>\n');
});
console.log('ok');
