// Propósito: custo médio (CMP) de Suprimentos sem diluição por estoque sem custo. Antes, se o item tinha saldo e CMP zero (unidades que entraram sem custo), a próxima compra
//   com custo era ponderada com essas unidades a R$ 0 e o CMP saía pela metade (ex.: 6 un sem custo + 6 un a R$ 2.951,74 -> R$ 1.477,99). Agora, com CMP zero o saldo existente não
//   entra na média: o novo CMP é o custo da entrada. Vale para compra e para ajuste de entrada com custo. Com CMP > 0 a fórmula é a mesma de antes.
// Entrada: api/index.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-16_suprimentos_cmp_sem_diluicao.js [raiz]
const fs = require('fs'), path = require('path');
const p = path.join(process.argv[2] || path.join(__dirname, '..'), 'api/index.js');
let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 70)); s = s.replace(de, () => para); };
if (s.includes('function cmpNovo(')) throw new Error('já aplicado');
troca(`async function estoqueAtualItem(itemId) {`, `// Custo médio ponderado após uma entrada. Com CMP zero (estoque sem custo) o saldo anterior NÃO entra na média: senão diluiria o custo real da compra.
function cmpNovo(cmpAtual, baseQtd, qtd, valorEntrada) {
  const base = Number(cmpAtual) > 0 ? baseQtd : 0;
  return (base + qtd) > 0 ? ((Number(cmpAtual) * base) + valorEntrada) / (base + qtd) : valorEntrada / (qtd || 1);
}
async function estoqueAtualItem(itemId) {`);
troca("  const novoCusto = (baseQtd + qtd) > 0 ? ((Number(item.custo_medio) * baseQtd) + valorTotal) / (baseQtd + qtd) : custo;", "  const novoCusto = cmpNovo(item.custo_medio, baseQtd, qtd, valorTotal);");
troca("    const novoCusto = (baseQtd + qtd) > 0 ? ((n(item.custo_medio) * baseQtd) + qtd * custo) / (baseQtd + qtd) : custo;", "    const novoCusto = cmpNovo(item.custo_medio, baseQtd, qtd, qtd * custo);");
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
