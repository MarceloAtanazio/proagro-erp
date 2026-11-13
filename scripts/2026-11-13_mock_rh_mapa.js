// Propósito: acrescenta ao simulador (scripts/2026-11-11_tema_mock_navegador.js) a lista headcount.localizacao do painel de RH, com 23 colaboradores distribuídos como na base real
//   (PR, SP, MS, DF; três só com cidade de residência e um sem localização), para avaliar o mapa do Brasil no navegador.
// Entrada: scripts/2026-11-11_tema_mock_navegador.js (ou o arquivo em argv[2]). Saída: o mesmo arquivo editado. Uso: node scripts/2026-11-13_mock_rh_mapa.js [arquivo]
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || path.join(__dirname, '2026-11-11_tema_mock_navegador.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('localizacao:')) throw new Error('já aplicado');
const ancora = "por_sexo: [";
const i = s.indexOf(ancora); if (i < 0) throw new Error('âncora não achada');
const lista = `localizacao: (() => { const L = [['PR', 'Francisco Beltrão'], ['PR', 'Pato Branco'], ['PR', 'Cascavel'], ['DF', 'Brasília'], ['MS', 'Dourados'], ['SP', 'São Paulo'], ['PR', 'Santa Mariana'], ['PR', 'Marialva'], ['PR', 'Jesuítas'], ['SP', 'São Paulo'], ['SP', 'Suzano'], ['PR', 'Marialva'], ['MS', 'Jateí'], ['SP', 'São Paulo'], ['SP', 'Santa Cruz do Rio Pardo'], ['SP', 'São Paulo'], ['PR', 'Toledo'], ['PR', 'Londrina'], ['MS', 'Ponta Porã'], ['SP', 'Jundiaí'], ['SP', 'Piracicaba'], ['PR', 'Santa Amélia'], [null, null]];
  const DEP = ['Campo', 'Subscrição', 'Comercial', 'Administrativo', 'Sinistros'], MOD = ['externo', 'presencial', 'home_office', 'hibrido'];
  return L.map((l, k) => ({ id: 300 + k, nome: ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Elaine Costa', 'Fábio Nunes', 'Gabriela Alves', 'Heitor Melo', 'Isabela Reis', 'João Pires', 'Karina Lopes', 'Lucas Prado', 'Marina Silva', 'Nelson Faria', 'Olívia Santos', 'Paulo Vieira', 'Quésia Duarte', 'Rafael Moura', 'Sabrina Teles', 'Tiago Barros', 'Ursula Cunha', 'Vitor Matos', 'Wesley Gomes'][k], uf: l[0], municipio: l[1], origem: l[0] ? (k % 7 === 6 ? 'residencia' : 'base') : null, departamento: DEP[k % 5], modelo: MOD[k % 4] })); })(),
      `;
s = s.slice(0, i) + lista + s.slice(i);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
