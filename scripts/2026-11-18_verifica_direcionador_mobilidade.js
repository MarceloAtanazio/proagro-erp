// Propósito: verifica no Node o cálculo do Direcionador de Mobilidade (public/via-direcionador.js): dias com início e fim inclusos, ajuste manual de diárias, valor cotado no lugar de diária x dias,
//   custo do carro próprio (reembolso por km + combustível) e do locado (diárias + extras + combustível), opção indicada, economia, quilometragem de equilíbrio, "sem carro disponível" forçando o
//   próprio, estados "aguardando dados" e o texto do resumo para a coordenação.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-18_verifica_direcionador_mobilidade.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
const { viaDirecionadorCalc: calc, viaDirecionadorResumo: resumo } = require(path.join(ROOT, 'public/via-direcionador.js'));
const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
const perto = (a, b, t = 0.01) => Math.abs(a - b) <= t;
const base = { ini: '2026-11-09', fim: '2026-11-14', km: '1286', diaria: '440,00', cotado: '', semcarro: false, taxa: 0.7, consProp: 10, consLoc: 10, preco: 6.2, extras: '', diasManual: '' };

let r = calc(base);
ok('conta início e fim inclusos (09 a 14/11 = 6 dias)', r.dias === 6, r);
ok('carro próprio = 1286 km x R$ 0,70 + combustível 1286/10 x 6,20 = 1.697,52', perto(r.proprio.reembolso, 900.2) && perto(r.proprio.combustivel, 797.32) && perto(r.proprio.total, 1697.52), r.proprio);
ok('carro locado = 6 x 440 + combustível = 3.437,32', perto(r.locado.diarias, 2640) && perto(r.locado.total, 3437.32), r.locado);
ok('indica o carro próprio e a economia é a diferença (1.739,80)', r.indicada === 'proprio' && perto(r.economia, 1739.8), r);
ok('quilometragem de equilíbrio = 2640 / 0,70 = 3.771 km (próprio R$ 1,32/km x locado R$ 0,62/km)', perto(r.kmEq, 3771.43, 0.5), r.kmEq);
ok('média de km por dia = 1286/6', perto(r.kmDia, 214.33, 0.01), r.kmDia);
ok('economia em % sobre a opção mais cara', perto(r.economiaPct, 50.6, 0.1), r.economiaPct);

r = calc({ ...base, km: '4000' });
ok('acima do km de equilíbrio o locado compensa (4000 km)', r.indicada === 'locado' && r.locado.total < r.proprio.total, r);

r = calc({ ...base, cotado: '1000' });
ok('valor cotado substitui diária x dias', r.locBase === 1000 && r.locado.porCotacao === true && perto(r.locado.total, 1000 + 797.32), r.locado);
r = calc({ ...base, diasManual: '3' });
ok('ajuste manual das diárias (3) vale no lugar da contagem', r.dias === 3 && perto(r.locado.diarias, 1320), r);
r = calc({ ...base, extras: '350,50' });
ok('extras da locação entram no total do locado e no equilíbrio', perto(r.locado.total, 3437.32 + 350.5) && perto(r.kmEq, (2640 + 350.5) / 0.7, 0.5), r);

r = calc({ ...base, semcarro: true, diaria: '', km: '1286' });
ok('sem carro disponível: indica o próprio, sem exigir diária, sem economia', r.pronto && r.indicada === 'proprio' && r.economia === null && r.kmEq === null, r);
ok('sem km não está pronto (aguardando dados)', calc({ ...base, km: '' }).pronto === false, calc({ ...base, km: '' }));
ok('sem diária nem valor cotado (e com carro disponível) não está pronto', calc({ ...base, diaria: '' }).pronto === false, calc({ ...base, diaria: '' }));
r = calc({ ...base, fim: '2026-11-01' });
ok('data final antes da inicial: 0 dias e não está pronto', r.dias === 0 && r.pronto === false, r);
r = calc({ ...base, fim: '2026-11-01', cotado: '900' });
ok('com valor cotado e datas invertidas ainda calcula (a cotação já é o total)', r.pronto === true && perto(r.locado.total, 900 + 797.32), r);
r = calc({ ...base, consLoc: 4 });
ok('se o locado gasta mais por km que o próprio, não existe km de equilíbrio', r.kmEq === null, r);
r = calc({ ...base, preco: '', consProp: '', consLoc: '' });
ok('sem preço do combustível calcula só reembolso e diárias', perto(r.proprio.total, 900.2) && perto(r.locado.total, 2640), r);
ok('aceita vírgula decimal e ponto de milhar (R$ 1.234,50)', perto(calc({ ...base, diaria: '1.234,50' }).locado.diarias, 7407), calc({ ...base, diaria: '1.234,50' }).locado);

const txt = resumo(calc(base), base);
ok('resumo para a coordenação traz período, km, os dois custos, a indicada e o equilíbrio', /09\/11\/2026 a 14\/11\/2026 \(6 dias\)/.test(txt) && /1\.286 km/.test(txt) && /Carro próprio: R\$ 1\.697,52/.test(txt) && /Carro locado: R\$ 3\.437,32/.test(txt) && /carro próprio, com economia de R\$ 1\.739,80/.test(txt) && /equilíbrio: 3\.771/.test(txt), txt);
ok('resumo sem carro para locação explica o motivo', /indisponível/.test(resumo(calc({ ...base, semcarro: true }), { ...base, semcarro: true })) && /por não haver carro disponível/.test(resumo(calc({ ...base, semcarro: true }), { ...base, semcarro: true })), resumo(calc({ ...base, semcarro: true }), { ...base, semcarro: true }));
ok('resumo sem dados pede o preenchimento', /Preencha/.test(resumo(calc({ ...base, km: '' }), base)), resumo(calc({ ...base, km: '' }), base));
console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
