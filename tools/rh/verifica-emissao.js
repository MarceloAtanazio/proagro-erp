// Verifica o .docx EMITIDO — não o script que o emitiu.
// Se o zip fosse inválido, o próprio zipLer estouraria na primeira linha.
const fs = require('fs'), path = require('path');
const SP = __dirname;
const { zipLer, acharSlots, destag } = require(path.join(SP, 'docx-merge.js'));

const [, , caminhoModelo, caminhoGerado] = process.argv;
const orig = zipLer(fs.readFileSync(caminhoModelo));
const novo = zipLer(fs.readFileSync(caminhoGerado));

const falhas = [];
const ok = (n, c, x) => {
  console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x)));
  if (!c) falhas.push(n);
};

ok('o .docx gerado abre como zip válido (CRC e diretório central conferem)', true);
ok(`todas as ${orig.length} entradas do modelo foram preservadas`,
   novo.length === orig.length && orig.every(e => novo.some(x => x.nome === e.nome)),
   { orig: orig.length, novo: novo.length });

const mudaram = orig.filter(e => !novo.find(x => x.nome === e.nome).dados.equals(e.dados)).map(e => e.nome);
ok('só word/document.xml mudou', mudaram.length === 1 && mudaram[0] === 'word/document.xml', mudaram);
ok('estilos, numeração, tema e fontes intactos (a formatação do modelo)',
   orig.filter(e => /styles|numbering|theme|fontTable|settings/.test(e.nome))
       .every(e => novo.find(x => x.nome === e.nome).dados.equals(e.dados)));

const xml = novo.find(e => e.nome === 'word/document.xml').dados.toString('utf8');
const linhas = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(m => destag(m[1]));
const texto = linhas.join('\n');

ok('não sobrou nenhum trecho realçado no documento', acharSlots(xml).length === 0, acharSlots(xml).length);

const marcadores = /XX\.XXX|XXX\.XXX|XXXXXXXXX|DD\/MM\/AAAA|202X|NOME DO CARGO|NOME DO\(A\) EMPREGADO|nacionalidade\]|estado civil\]|endereço completo\]|valor por extenso|CIDADE\/UF/;
ok('nenhum marcador do modelo escapou para o contrato', !marcadores.test(texto),
   (texto.match(marcadores) || []).slice(0, 5));

const esperados = [
  'ANA CAROLINA PEREIRA DOS SANTOS', 'brasileira', 'solteira', '12.345.678-9', '123.456.789-01',
  'Vila Mariana', 'CEP 04116-000', '1234567', '001-SP', 'ANALISTA DE SUBSCRIÇÃO PLENO',
  '23/10/2026', '07/12/2026', 'R$ 7.450,00', 'sete mil quatrocentos e cinquenta reais',
  'São Paulo/SP, 08 de setembro de 2026.'
];
esperados.forEach(v => ok('consta no documento: ' + v, texto.includes(v)));

ok('o nome aparece 2× (qualificação e folha de assinaturas)',
   (texto.match(/ANA CAROLINA PEREIRA DOS SANTOS/g) || []).length === 2,
   (texto.match(/ANA CAROLINA PEREIRA DOS SANTOS/g) || []).length);
ok('as 16 cláusulas do texto fixo ficaram intactas',
   (texto.match(/CLÁUSULA \d+ª/g) || []).length === 16, (texto.match(/CLÁUSULA \d+ª/g) || []).length);

const ERRO_ANTIGO = 'seguro de ' + 'vista';
ok('"seguro de vida" correto, e o erro antigo não reapareceu',
   texto.includes('seguro de vida') && !texto.includes(ERRO_ANTIGO));
ok('concordância de gênero coerente: brasileira + solteira, nunca cruzadas',
   texto.includes('brasileira, solteira') && !texto.includes('brasileira, solteiro')
     && !texto.includes('brasileiro, solteira'));
const AB = String.fromCharCode(91), FE = String.fromCharCode(93);   // [ e ]
const envolvidos = ['ANA CAROLINA', 'brasileira', 'solteira', 'Rua das Palmeiras', 'ANALISTA DE'];
ok('os colchetes que envolviam os campos NÃO sobraram no contrato',
   envolvidos.every(v => !texto.includes(AB + v)),
   envolvidos.filter(v => texto.includes(AB + v)));
ok('nenhum colchete solto ficou no documento',
   !texto.includes(AB) && !texto.includes(FE),
   texto.split('\n').filter(l => l.includes(AB) || l.includes(FE)).slice(0, 3));
ok('os parênteses do valor por extenso FICARAM (ali eles são do texto)',
   texto.includes('(sete mil quatrocentos e cinquenta reais)'));

console.log('\n--- a qualificação das partes, como saiu ---');
const q = linhas.find(l => l.includes('ANA CAROLINA')) || '';
console.log(q.slice(q.indexOf('e de outro')).slice(0, 340));
console.log('\n--- a cláusula do salário ---');
console.log((linhas.find(l => l.includes('R$ 7.450,00')) || '').slice(0, 250));
console.log('\n--- a cláusula do prazo ---');
console.log((linhas.find(l => l.includes('23/10/2026')) || '').slice(0, 250));
console.log('\n--- local e data ---');
console.log((linhas.find(l => l.includes('de setembro de 2026')) || '').trim());

console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join(' | ')}`
                          : '\nTodas as verificações passaram.');
process.exitCode = falhas.length ? 1 : 0;
