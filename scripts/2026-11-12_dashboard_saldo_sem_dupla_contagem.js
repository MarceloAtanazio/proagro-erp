// Propósito: corrige o "Saldo de caixa" do Dashboard, que contava em dobro o dinheiro das linhas de extrato conciliadas.
//   Antes: saldo = recebido(histórico) − pago(histórico) + SOMA de TODAS as linhas de extrato com auto_generated=false. Como o extrato importado (auto_generated=false) já está conciliado
//   com os mesmos títulos pagos/recebidos, cada conciliação entrava duas vezes (≈ R$ 1,74 mi a mais em 11/2026).
//   Agora: os "ajustes bancários" são só as linhas do extrato que NÃO estão ligadas a um título a pagar/receber (matched_type diferente de payable/receivable).
//   Também renomeia, no visual Novo, "Acumulado do ano" para "Resultado do ano (com previsto)" (inclui o previsto do mês atual) e explica na dica.
// Entrada: api/index.js e public/tema-dashboard.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_dashboard_saldo_sem_dupla_contagem.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('api/index.js', troca => {
  troca("  // Saldo real = todo o histórico de recebimentos/pagamentos já realizados +\n  // ajustes bancários independentes (não gerados automaticamente por uma baixa).",
    "  // Saldo real = todo o histórico de recebimentos/pagamentos já realizados +\n  // ajustes bancários INDEPENDENTES: só as linhas do extrato que não estão ligadas a um título\n  // a pagar/receber. As conciliadas já entram pelo próprio título; somá-las de novo duplicava o\n  // dinheiro (o extrato importado tem auto_generated=false e quase tudo está conciliado).");
  troca("const ajustesBancoManuaisD = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions WHERE auto_generated=false`);",
    "const ajustesBancoManuaisD = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_bank_transactions\n    WHERE auto_generated=false AND COALESCE(matched_type,'') NOT IN ('payable','receivable')`);");
});
edita('public/tema-dashboard.js', troca => {
  troca("<span>Acumulado do ano <strong class=\"${acumMes >= 0 ? 'pos' : 'neg'}\">${brl(acumMes)}</strong></span>",
    "<span title=\"Resultado realizado do ano somado ao previsto (a pagar e a receber) do mês atual\">Resultado do ano (com previsto) <strong class=\"${acumMes >= 0 ? 'pos' : 'neg'}\">${brl(acumMes)}</strong></span>");
});
console.log('ok');
