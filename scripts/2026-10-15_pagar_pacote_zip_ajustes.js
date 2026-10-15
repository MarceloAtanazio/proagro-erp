// Propósito: ajustes do pacote ZIP da tesouraria depois do teste:
//   - títulos JÁ PAGOS não geram aviso de "sem aprovação"/"sem boleto" (a tesouraria só paga o que está pendente);
//     no LEIAME aparecem marcados como "YA PAGADO" para ninguém pagar de novo;
//   - RESUMEN separa o que está por pagar do que já foi pago (informativo), e a quebra por forma de pagamento
//     vale para o que está por pagar;
//   - concordância em espanhol na seção BOLETOS ("hay N pagos … que no incluyen el archivo").
// Entrada: public/app.js (o bloco já aplicado) e o bloco em texto. Saída: os dois editados.
// Uso: node scripts/2026-10-15_pagar_pacote_zip_ajustes.js
const fs = require('fs'), path = require('path');
const BT = String.fromCharCode(96);
function editar(arq, trocas) {
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [de, para] of trocas) { if (!s.includes(de)) throw new Error('não achado em ' + path.basename(arq) + ': ' + de.slice(0, 80)); s = s.replace(de, () => para); }
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const trocas = [
  // detalhe de cada pagamento: marca os já pagos
  ["  const detalle = r => " + BT + "  • ID ${r.id} · ${brDate(r.due_date)} · ${r.description} · ${r.supplier_name || 'sin proveedor'} · ${brl(r.amount)}" + BT + ";",
   "  const detalle = r => " + BT + "  • ID ${r.id} · ${brDate(r.due_date)} · ${r.description} · ${r.supplier_name || 'sin proveedor'} · ${brl(r.amount)}${r.status === 'pago' ? ' · YA PAGADO el ' + brDate(r.payment_date) : ''}" + BT + ";"],
  // resumo
  ["  lin(" + BT + "  • Pagos en este paquete: ${d.rows.length}" + BT + ");\n  lin(" + BT + "  • Monto total: ${brl(total(d.rows))}" + BT + ");\n  const porForma = {};\n  d.rows.forEach(r => {",
   "  const porPagar = d.rows.filter(r => r.status !== 'pago'), yaPagados = d.rows.filter(r => r.status === 'pago');\n" +
   "  lin(" + BT + "  • Pagos en este paquete: ${d.rows.length}" + BT + ");\n" +
   "  lin(" + BT + "  • Por pagar: ${plural(porPagar.length, 'pago', 'pagos')} · ${brl(total(porPagar))}" + BT + ");\n" +
   "  if (yaPagados.length) lin(" + BT + "  • Ya pagados (solo informativo, no hay que pagarlos de nuevo): ${plural(yaPagados.length, 'pago', 'pagos')} · ${brl(total(yaPagados))}" + BT + ");\n" +
   "  const porForma = {};\n  porPagar.forEach(r => {"],
  // seção BOLETOS
  ["  lin(" + BT + "  La carpeta Boletos trae ${plural(d.boletosIncluidos, 'archivo', 'archivos')}." + BT + ");\n  if (d.sinBoleto.length) {\n    lin(" + BT + "  ${plural(d.sinBoleto.length, 'pago tiene', 'pagos tienen')} forma de pago \"Boleto\" pero no traen el archivo adjunto:" + BT + ");",
   "  lin(" + BT + "  La carpeta Boletos trae ${d.boletosIncluidos === 1 ? '1 archivo' : d.boletosIncluidos + ' archivos'}." + BT + ");\n  if (d.sinBoleto.length) {\n    lin(" + BT + "  Hay ${plural(d.sinBoleto.length, 'pago', 'pagos')} por pagar con forma de pago \"Boleto\" que no incluye${d.sinBoleto.length === 1 ? '' : 'n'} el archivo del boleto:" + BT + ");"],
  ["    lin('  Todos los pagos con forma de pago \"Boleto\" traen su archivo.');", "    lin('  Todos los pagos por pagar con forma de pago \"Boleto\" traen su archivo.');"],
  // avisos só para o que está pendente
  ["    const exigeAprov = r => String(r.due_date || '').slice(0, 10) >= PAGAR_APROV_A_PARTIR_DE;",
   "    const exigeAprov = r => r.status !== 'pago' && String(r.due_date || '').slice(0, 10) >= PAGAR_APROV_A_PARTIR_DE;"],
  ["        boleto: (boletosDe.get(r.id) || []).length ? 'Sim' : (r.payment_method === 'boleto' ? 'Falta' : '—')",
   "        boleto: (boletosDe.get(r.id) || []).length ? 'Sim' : (r.payment_method === 'boleto' && r.status !== 'pago' ? 'Falta' : '—')"],
  ["    const sinBoleto = rows.filter(r => r.payment_method === 'boleto' && !(boletosDe.get(r.id) || []).length);",
   "    const sinBoleto = rows.filter(r => r.status !== 'pago' && r.payment_method === 'boleto' && !(boletosDe.get(r.id) || []).length);"]
];
editar(path.join(__dirname, '2026-10-15_pagar_pacote_zip_bloco.txt'), trocas);
editar(path.join(__dirname, '..', 'public/app.js'), trocas);
console.log('ok');
