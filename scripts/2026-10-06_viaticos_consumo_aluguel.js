// Propósito: carro ALUGADO passa a usar consumo médio fixo de 10 km/L no cálculo automático de rota/combustível
//   (antes exigia o consumo do veículo do colaborador, que não vale para carro alugado).
//   Carro próprio continua usando o consumo cadastrado do colaborador.
// Entrada: public/app.js. Saída: public/app.js editado. Uso: node scripts/2026-10-06_viaticos_consumo_aluguel.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

troca('// Executa o cálculo (valida consumo/preço, chama o OSRM, desenha o mapa,',
`// Carro alugado não tem consumo cadastrado (o do colaborador é do carro dele), então o
// combustível é estimado com um consumo médio fixo. Só vale para aluguel; carro próprio
// continua usando o consumo do cadastro do colaborador.
const VIA_CONSUMO_ALUGUEL_KML = 10;

// Executa o cálculo (valida consumo/preço, chama o OSRM, desenha o mapa,`);

troca("viaExecutarCalculoRota(pontoFixo, intermediarios, w.colab, w.preco_combustivel, `al-status-${i}`",
      "viaExecutarCalculoRota(pontoFixo, intermediarios, { ...w.colab, veiculo_consumo_kml: VIA_CONSUMO_ALUGUEL_KML }, w.preco_combustivel, `al-status-${i}`");
troca('a.combustivel_valor = (km / w.colab.veiculo_consumo_kml * w.preco_combustivel).toFixed(2);',
      'a.combustivel_valor = (km / VIA_CONSUMO_ALUGUEL_KML * w.preco_combustivel).toFixed(2);');

troca('          ${viaBotaoRotasBrasil()}\n        </div>\n        <div id="al-status-${i}" style="margin-top:8px"></div>',
      '          ${viaBotaoRotasBrasil()}\n        </div>\n        <p class="hint" style="margin-top:6px">O combustível do carro alugado é estimado com consumo médio de <strong>${VIA_CONSUMO_ALUGUEL_KML} km/L</strong>.</p>\n        <div id="al-status-${i}" style="margin-top:8px"></div>');

troca('    const consumo = w.colab.veiculo_consumo_kml;\n    // O preço/litro não é gravado',
`    // Consumo efetivo: aluguel usa o médio fixo, carro próprio o do cadastro. Com os dois na
    // mesma viagem, vale a média ponderada (km total ÷ litros totais), que é o que a conta fez.
    const consumoDe = b => (t.aluguel_carro && (t.alugueis || []).includes(b)) ? VIA_CONSUMO_ALUGUEL_KML : w.colab.veiculo_consumo_kml;
    const litros = blocos.reduce((sm, b) => { const c = consumoDe(b); return sm + (c ? viaKmPonderado(b.trechos) / c : 0); }, 0);
    const consumo = litros > 0 ? Number((kmTotal / litros).toFixed(2)) : w.colab.veiculo_consumo_kml;
    // O preço/litro não é gravado`);

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
