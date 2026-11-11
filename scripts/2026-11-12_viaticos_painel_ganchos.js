// Propósito: ganchos mínimos em public/app.js para o Painel de Viáticos do visual Novo (public/tema-viaticos.js):
//   1) cache das despesas por solicitação dentro de buildViaticosItens (o fechamento/painel busca as despesas de todas as OTs do filtro; o cache é zerado a cada renderViaticos);
//   2) a cada draw() da tela de Viáticos, expõe window.ProagroVia (solicitações, filtradas, dashboard, rótulo do período, build/pdf/excel do fechamento) e dispara o evento 'proagro:via'.
//   Sem mudança de comportamento no visual Clássico.
// Entrada: public/app.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-12_viaticos_painel_ganchos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };

troca("async function buildViaticosItens(sols) {\n  const comDespesas = await Promise.all(sols.map(async s => ({ s, despesas: await api(`/api/viaticos/solicitacoes/${s.id}/despesas`) })));",
  "const VIA_DESP_CACHE = new Map();   // despesas por solicitação (zerado a cada renderViaticos); a chave inclui status e valor comprovado\nasync function buildViaticosItens(sols) {\n  const despesasDe = s => {\n    const k = `${s.id}|${s.status}|${s.valor_comprovado}`;\n    if (!VIA_DESP_CACHE.has(k)) VIA_DESP_CACHE.set(k, api(`/api/viaticos/solicitacoes/${s.id}/despesas`).catch(e => { VIA_DESP_CACHE.delete(k); throw e; }));\n    return VIA_DESP_CACHE.get(k);\n  };\n  const comDespesas = await Promise.all(sols.map(async s => ({ s, despesas: await despesasDe(s) })));");

troca("async function renderViaticos() {\n", "async function renderViaticos() {\n  VIA_DESP_CACHE.clear();\n");

troca("    lastFiltered = filtered;\n    // COMPROVAÇÃO ÚNICA: uma linha por OT de origem",
  "    lastFiltered = filtered;\n    // visual Novo (tema-viaticos.js): painel do período e indicadores leem daqui\n    window.ProagroVia = { sols, filtrados: filtered, dash, escopoProprio, de, ate, rotulo: viaticosPeriodoRotulo(filtered, de, ate), build: buildViaticosFechamento, pdf: exportViaticosFechamentoPDF, excel: exportViaticosFechamentoExcel };\n    setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:via')), 0);\n    // COMPROVAÇÃO ÚNICA: uma linha por OT de origem");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
