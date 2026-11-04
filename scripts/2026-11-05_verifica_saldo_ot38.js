// Propósito: validar com o extrato real da OT 38 (Leonardo) o parse do Flash (finalizadas, reprovadas, estorno, categorias) e a conta do saldo.
// Entrada: caminho do .xlsx do Flash (argumento 1) e do public/app.js (argumento 2). Saída: resultados no stdout; sai com código 1 se algo divergir.
// Executar: node scripts/2026-11-05_verifica_saldo_ot38.js "<extrato.xlsx>" public/app.js
const fs = require('fs'); const vm = require('vm'); const XLSX = require('xlsx');
const src = fs.readFileSync(process.argv[3], 'utf8');
const ini = src.indexOf('const FLASH_CONCEITO_MAP'), fim = src.indexOf('async function importarFlashModal');
// pega só o bloco de parse (FLASH_CONCEITO_MAP ... parseFlashXLSX), sem as funções de tela
const bloco = src.slice(ini, fim).replace(/async function hashArquivo[\s\S]*?\n}\n/, '').replace(/function flashDiagnosticoHtml[\s\S]*?\n}\n/, '');
const ctx = { XLSX, window: { XLSX }, esc: s => s, brl: v => v, brDate: v => v, console };
vm.createContext(ctx);
vm.runInContext(bloco + '\nthis.parseFlashXLSX = parseFlashXLSX;', ctx);
const buf = fs.readFileSync(process.argv[2]);
const file = { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
const soma = a => Math.round(a.reduce((x, y) => x + y.valor, 0) * 100) / 100;
let falhas = 0;
const ok = (nome, obtido, esperado) => { const b = obtido === esperado; if (!b) falhas++; console.log((b ? 'OK   ' : 'FALHA'), nome, '=', obtido, b ? '' : '(esperado ' + esperado + ')'); };
ctx.parseFlashXLSX(file).then(r => {
  const comprovado = soma(r.linhas), repr = soma(r.reprovadas);
  ok('linhas finalizadas', r.linhas.length, 15);
  ok('comprovado', comprovado, 5400.74);
  ok('reprovadas', repr, 256.5);
  ok('estorno', r.estorno, 344.33);
  const cat = r.linhas.filter(l => !l.categoria).length;
  ok('linhas sem categoria (antes: Uber, passagem e aluguel)', cat, 0);
  const liberado = 6120.96;
  const devolvido = Math.max(0, Math.round((liberado - comprovado - repr) * 100) / 100);
  ok('devolvido (sem reprovadas)', devolvido, 463.72);
  ok('a conferir (devolvido − estorno)', Math.round((devolvido - r.estorno) * 100) / 100, 119.39);
  process.exit(falhas ? 1 : 0);
});
