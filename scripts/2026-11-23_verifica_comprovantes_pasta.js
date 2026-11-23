// Propósito: verifica no Node a leitura de texto e a associação de comprovantes a despesas (public/via-comprovantes-pasta.js): valores BR, datas, categoria, pontuação, empate de despesas
//   iguais (dois pedágios de R$ 13,60 no mesmo dia), arquivo sem correspondência e comprovante repetido.
// Entrada: raiz do projeto (argv[2], caminho absoluto). Saída: PASS/FALHA; código 1 se algo falhar. Uso: node scripts/2026-11-23_verifica_comprovantes_pasta.js <raiz>
const path = require('path'); const ROOT = process.argv[2] || path.join(__dirname, '..');
const { cmpValores, cmpDatas, cmpExtrair, cmpAssociar } = require(path.join(ROOT, 'public/via-comprovantes-pasta.js'));
const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
ok('valores: R$ 1.026,78, 13,60 e 13.60', JSON.stringify(cmpValores('Total R$ 1.026,78 troco 13,60 pedagio 13.60 cnpj 12.345.678/0001-90')) === '[1026.78,13.6]', cmpValores('Total R$ 1.026,78 troco 13,60 pedagio 13.60'));
ok('não confunde CNPJ/ano com valor', cmpValores('12.345.678/0001-90 2026').length === 0, cmpValores('12.345.678/0001-90 2026'));
ok('datas: 16/11/2026, 17/11/26, 2026-11-18', JSON.stringify(cmpDatas('em 16/11/2026 e 17/11/26 ou 2026-11-18').sort()) === '["2026-11-16","2026-11-17","2026-11-18"]', cmpDatas('em 16/11/2026 e 17/11/26 ou 2026-11-18'));
ok('datas inválidas ignoradas (31/13/2026)', cmpDatas('31/13/2026').length === 0);
const desp = [
  { id: 1, data: '2026-11-16', categoria: 'alimentacao', valor: 55, descricao: 'IASNAIA MARCELINO SANTA CRUZ Refeição' },
  { id: 2, data: '2026-11-16', categoria: 'aluguel_carro', valor: 1026.78, descricao: 'LOCALIZA RAC MTZALO BELO HORIZONT Aluguel de veículo' },
  { id: 3, data: '2026-11-16', categoria: 'pedagio', valor: 13.6, descricao: 'EPR LITORAL PIONEIRO' },
  { id: 4, data: '2026-11-16', categoria: 'pedagio', valor: 13.6, descricao: 'EPR LITORAL PIONEIRO' },
  { id: 5, data: '2026-11-17', categoria: 'pedagio', valor: 13.6, descricao: 'EPR LITORAL PIONEIRO' },
  { id: 6, data: '2026-11-16', categoria: 'combustivel', valor: 3, descricao: 'DE PAULA E PAULA CAMBARA' }
];
const ex = (t, n) => cmpExtrair(t, n);
let a = cmpAssociar([ex('Restaurante Santa Cruz  Refeição  16/11/2026  Total R$ 55,00'), ex('LOCALIZA locadora aluguel de veiculo 16/11/2026 R$ 1.026,78')], desp);
ok('refeição e aluguel vão para as despesas certas, com confiança alta', a[0].despesaId === 1 && a[1].despesaId === 2 && a[0].nivel === 'alta' && a[1].nivel === 'alta', a);
a = cmpAssociar([ex('Pedágio praça 1 17/11/2026 R$ 13,60'), ex('Pedágio praça 2 16/11/2026 R$ 13,60'), ex('Pedágio praça 3 16/11/2026 R$ 13,60')], desp);
ok('pedágio de 17/11 vai para a despesa de 17/11', a[0].despesaId === 5, a);
ok('os dois pedágios de 16/11 vão para despesas diferentes (3 e 4)', new Set([a[1].despesaId, a[2].despesaId]).size === 2 && [a[1].despesaId, a[2].despesaId].every(x => x === 3 || x === 4), a);
a = cmpAssociar([ex('Mercado qualquer 10/11/2026 R$ 999,99')], desp);
ok('sem valor nem data parecidos: sem correspondência', a[0].despesaId === null && a[0].nivel === 'nenhuma', a);
a = cmpAssociar([ex('posto combustível 16/11/2026 R$ 3,00'), ex('posto combustível 16/11/2026 R$ 3,00')], desp);
ok('segundo comprovante do mesmo gasto aceita repetir a despesa (marcado como repetida)', a[0].despesaId === 6 && a[1].despesaId === 6 && a[1].repetida === true, a);
a = cmpAssociar([ex('recibo R$ 55,00')], desp);
ok('só o valor bate (sem data): confiança média', a[0].despesaId === 1 && a[0].nivel === 'media', a);
a = cmpAssociar([ex('texto sem nada', 'Pedagio_17-11-2026_13,60')], desp);
ok('nome do arquivo também conta (data e valor no nome)', a[0].despesaId === 5, a);
console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
