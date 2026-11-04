// Propósito: desconto PARCIAL de pendência em Viáticos (tela). Quando o valor da transferência é menor que a pendência, desconta-se só o que cabe
//   e o aviso passa a dizer quanto RESTA em aberto para a próxima transferência (antes dizia que a diferença "não será cobrada depois"). O
//   resolvedor devolve `desconto` e `restante`; os três pontos que decidem a pendência (nova/edição de solicitação, painel Transferência e mudança
//   de status com valor liberado) enviam `pendencia_desconto` ao servidor.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado. Uso: node scripts/2026-11-05_pendencia_parcial_front.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 90));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 90));
  s = s.replace(de, () => para);
};

// resolvedor
troca("    if (est.aplicar) return { ...base, decisao: 'descontar', liquido: Math.max(0, digitado - est.total) };",
      "    if (est.aplicar) {\n      // Desconta só o que cabe no valor da transferência; o resto da pendência continua em aberto para a próxima.\n      const desconto = Math.round(Math.min(est.total, digitado) * 100) / 100;\n      return { ...base, decisao: 'descontar', desconto, restante: Math.round((est.total - desconto) * 100) / 100, liquido: Math.round((digitado - desconto) * 100) / 100 };\n    }");

// textos do aviso
troca("A decisão é tomada agora: ao salvar, a pendência é encerrada nas duas opções e este aviso não aparece mais.",
      "A decisão é tomada agora. Se o valor liberado cobrir a pendência, ela é encerrada; se não cobrir, desconta-se o que couber e o <strong>restante segue em aberto</strong> para a próxima transferência.");
troca("          : `✅ Será descontado <strong>${brl(est.total)}</strong> no envio. Valor líquido a liberar: <strong>${brl(Math.max(0, digitado - est.total))}</strong> (digitado: ${brl(digitado)}).` +\n            (digitado < est.total ? ` <span style=\"color:#B23A2F\">O valor liberado é menor que a pendência: a diferença de ${brl(est.total - digitado)} não será cobrada depois.</span>` : '');",
      "          : `✅ Será descontado <strong>${brl(Math.min(est.total, digitado))}</strong> no envio. Valor líquido a liberar: <strong>${brl(Math.max(0, digitado - est.total))}</strong> (digitado: ${brl(digitado)}).` +\n            (digitado < est.total ? ` <span style=\"color:#B23A2F\">O valor liberado é menor que a pendência: restam <strong>${brl(est.total - digitado)}</strong> em aberto, que serão descontados da próxima transferência.</span>` : '');");

// chamadores
troca("            b.pendencia_info = { valor: dec.total, decisao: dec.decisao, ids: dec.ids };\n            b.pendencia_ids = dec.ids; b.pendencia_decisao = dec.decisao;",
      "            b.pendencia_info = { valor: dec.desconto !== undefined ? dec.desconto : dec.total, decisao: dec.decisao, ids: dec.ids, restante: dec.restante || 0 };\n            b.pendencia_ids = dec.ids; b.pendencia_decisao = dec.decisao;\n            if (dec.desconto !== undefined) b.pendencia_desconto = dec.desconto;");
troca("        if (dec.decisao) { body.pendencia_ids = dec.ids; body.pendencia_decisao = dec.decisao; }",
      "        if (dec.decisao) { body.pendencia_ids = dec.ids; body.pendencia_decisao = dec.decisao; if (dec.desconto !== undefined) body.pendencia_desconto = dec.desconto; }");
troca("`\\nIncluindo o desconto de ${brl(dec.total)} de ocorrências anteriores.`",
      "`\\nIncluindo o desconto de ${brl(dec.desconto)} de ocorrências anteriores.${dec.restante > 0 ? `\\nRestam ${brl(dec.restante)} em aberto para a próxima transferência.` : ''}`");
troca("               aplicarStatus(novo, dec.liquido, { pendencia_ids: dec.ids, pendencia_decisao: dec.decisao,\n                 pendencia_info: { valor: dec.total, decisao: dec.decisao, ids: dec.ids } });",
      "               aplicarStatus(novo, dec.liquido, { pendencia_ids: dec.ids, pendencia_decisao: dec.decisao, pendencia_desconto: dec.desconto,\n                 pendencia_info: { valor: dec.desconto !== undefined ? dec.desconto : dec.total, decisao: dec.decisao, ids: dec.ids, restante: dec.restante || 0 } });");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
