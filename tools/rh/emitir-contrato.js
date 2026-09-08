// Emite o Contrato de Trabalho a partir da minuta real, com uma ficha de EXEMPLO.
// Prova o caminho inteiro: ficha -> derivações -> 18 slots realçados -> .docx.
const fs = require('fs'), path = require('path');
const SP = __dirname;
const { zipLer, zipEscrever, acharSlots, mesclar, reaisEmTexto, brl, destag } = require(path.join(SP, 'docx-merge.js'));

// ---------------------------------------------------------------------------
// A ficha. Em produção isto vem de erp_colaboradores + erp_rh_vinculos.
// Dados FICTÍCIOS, só para o teste.
// ---------------------------------------------------------------------------
const ficha = {
  nome: 'Ana Carolina Pereira dos Santos',
  sexo: 'F',
  estado_civil: 'solteiro',            // guardado no masculino; concordado na emissão
  rg: '12.345.678-9',
  cpf: '123.456.789-01',
  endereco: 'Rua das Palmeiras, 145, apto. 32, Vila Mariana',
  municipio: 'São Paulo', uf: 'SP', cep: '04116-000',
  ctps_numero: '1234567', ctps_serie: '001-SP',
  cargo: 'Analista de Subscrição', nivel: 'Pleno',
  admissao: '2026-09-08',
  salario: 7450.00,
  // local e data da assinatura
  assinatura_municipio: 'São Paulo', assinatura_uf: 'SP', assinatura_data: '2026-09-08'
};

// ------------------------------------------------------------- derivações ---
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Concordância de gênero: é isto que impede o "brasileira, solteiro" de voltar.
const gen = (m, f) => (ficha.sexo === 'F' ? f : m);
const feminiza = p => p.replace(/o$/, 'a');
const dias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return String(dt.getUTCDate()).padStart(2, '0') + '/' +
         String(dt.getUTCMonth() + 1).padStart(2, '0') + '/' + dt.getUTCFullYear();
};
const enderecoCompleto = `${ficha.endereco}, ${ficha.municipio}/${ficha.uf}, CEP ${ficha.cep}`;
const cargoCompleto = (ficha.cargo + (ficha.nivel ? ' ' + ficha.nivel : '')).toUpperCase();
const [anoAss, mesAss, diaAss] = ficha.assinatura_data.split('-').map(Number);

// -------------------------------------------- mapa: slot realçado -> valor ---
// A ORDEM é o identificador. Dois slots têm o mesmo texto na minuta (os dois
// DD/MM/AAAA e os dois XXXXXXXXX) e só a posição os distingue.
const MAPA = [
  { n: 1,  campo: 'nome (qualificação)',        valor: ficha.nome.toUpperCase() },
  { n: 2,  campo: 'nacionalidade',              valor: gen('brasileiro', 'brasileira') },
  { n: 3,  campo: 'estado civil',               valor: gen(ficha.estado_civil, feminiza(ficha.estado_civil)) },
  { n: 4,  campo: 'RG',                         valor: ficha.rg },
  { n: 5,  campo: 'CPF',                        valor: ficha.cpf },
  { n: 6,  campo: 'endereço completo',          valor: enderecoCompleto },
  { n: 7,  campo: 'CTPS nº',                    valor: ficha.ctps_numero },
  { n: 8,  campo: 'CTPS série',                 valor: ficha.ctps_serie },
  { n: 9,  campo: 'cargo',                      valor: cargoCompleto },
  { n: 10, campo: 'fim da experiência (+45d)',  valor: dias(ficha.admissao, 45) },
  { n: 11, campo: 'fim da prorrogação (+90d)',  valor: dias(ficha.admissao, 90) },
  { n: 12, campo: 'salário',                    valor: brl(ficha.salario) },
  { n: 13, campo: 'salário por extenso',        valor: reaisEmTexto(ficha.salario) },
  { n: 14, campo: 'cidade da assinatura',       valor: ficha.assinatura_municipio },
  { n: 15, campo: 'UF + dia da assinatura',     valor: `${ficha.assinatura_uf}, ${String(diaAss).padStart(2, '0')}` },
  { n: 16, campo: 'mês da assinatura',          valor: MESES[mesAss - 1] },
  { n: 17, campo: 'ano da assinatura',          valor: `${anoAss}.` },
  { n: 18, campo: 'nome (folha de assinaturas)', valor: ficha.nome.toUpperCase() }
];

// ------------------------------------------------------------------ emitir ---
const modelo = process.argv[2];
const saida = process.argv[3];
const entradas = zipLer(fs.readFileSync(modelo));
const doc = entradas.find(e => e.nome === 'word/document.xml');
const xml = doc.dados.toString('utf8');
const slots = acharSlots(xml);

if (slots.length !== MAPA.length) {
  console.error(`ABORTADO: a minuta tem ${slots.length} slots realçados, o mapa tem ${MAPA.length}.`);
  console.error('Um realce a mais ou a menos desalinha TODO o mapa — por isso isto é um erro, não um aviso.');
  process.exit(1);
}

console.log('MAPEAMENTO (slot realçado → valor da ficha)\n');
slots.forEach((s, i) => {
  const m = MAPA[i];
  console.log(String(m.n).padStart(2) + '. ' + m.campo.padEnd(28) +
    '"' + s.texto + '"'.padEnd(18) + ' → "' + m.valor + '"' + (s.nRuns > 1 ? '   [' + s.nRuns + ' runs colapsados]' : ''));
});

const novo = mesclar(xml, slots, MAPA.map(m => m.valor));
doc.dados = Buffer.from(novo, 'utf8');
fs.writeFileSync(saida, zipEscrever(entradas));
// (o mapa fica no topo deste arquivo; nada de despejo em disco ao lado do codigo)
console.log('\ngerado: ' + path.basename(saida) + '  (' + (fs.statSync(saida).size / 1024).toFixed(1) + ' KB)');
