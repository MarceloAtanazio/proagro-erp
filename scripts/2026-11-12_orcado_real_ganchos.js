// Propósito: ganchos mínimos em public/app.js para a repaginada de Orçado x Realizado do visual Novo (public/tema-orcado.js e plugin em tema-graficos.js):
//   1) logo depois de montar receitas/despesas, publica window.ProagroOvr (ano, escopo, mês-limite, linhas, orçamentos e uma função analise() que reaproveita orcadoRealAnalise — a mesma do relatório);
//   2) ao fim de renderOrcadoReal dispara o evento 'proagro:ovr'. Sem mudança de comportamento no visual Clássico.
// Entrada: public/app.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-12_orcado_real_ganchos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
troca("  const desp = build('despesa', actuals.despesas);\n\n  // ---- KPIs corporativos (Despesas) ----",
  "  const desp = build('despesa', actuals.despesas);\n  // visual Novo (tema-orcado.js / tema-graficos.js): os gráficos e o painel leem daqui\n  window.ProagroOvr = { year, scope, maxM, rec, desp, budgets, actuals, analise: () => orcadoRealAnalise(year, scope, maxM, budgets, actuals) };\n\n  // ---- KPIs corporativos (Despesas) ----");
troca("        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }\n    }\n  });\n}\n\n// ============================================================\n// RELATÓRIOS GERENCIAIS",
  "        y: { ticks: { font: { family: 'DM Sans' } }, grid: { display: false } } }\n    }\n  });\n  setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:ovr')), 0);\n}\n\n// ============================================================\n// RELATÓRIOS GERENCIAIS");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
