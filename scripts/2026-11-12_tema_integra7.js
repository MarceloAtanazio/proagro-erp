// Propósito: sétima rodada do TEMA (visual novo): gráficos "Despesas/Receitas por categoria" do Fluxo de Caixa. A lógica está em public/tema-graficos.js (prepararCategorias:
//   altura proporcional ao nº de categorias, barras de 20px arredondadas, valor e % ao fim da barra, eixo compacto, todos os nomes visíveis); este script só acrescenta o CSS que põe
//   os dois cartões de categoria um por linha (largura para os nomes) em public/tema-fluxo.css.
// Entrada: public/tema-fluxo.css (ou a pasta em argv[2]). Saída: arquivo editado (idempotente). Uso: node scripts/2026-11-12_tema_integra7.js [raiz]
const fs = require('fs'), path = require('path');
const arq = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/tema-fluxo.css');
let s = fs.readFileSync(arq, 'utf8');
if (s.includes(':has(#ch-desp)')) { console.log('já aplicado'); process.exit(0); }
s = s.replace(/\s+$/, '') + '\n\n/* categorias: um cartão por linha, com largura para os nomes e as barras respirarem */\nhtml[data-ui="novo"] .nd-fx-page .two-col:has(#ch-desp) { grid-template-columns: minmax(0, 1fr); }\n';
fs.writeFileSync(arq, s); console.log('ok');
