// Propósito: Contas a Pagar — ao escolher "Boleto" em Forma de pagamento, libera o campo "Linha digitável"
//   (como a chave PIX faz com "PIX"). Máscara ao digitar, validação de 47/48 dígitos, gravação só com dígitos
//   (coluna erp_payables.boleto_line), log de auditoria e coluna nas exportações CSV/Excel.
// Entrada: api/index.js e public/app.js. Saída: os mesmos arquivos editados.
// Uso: node scripts/2026-10-14_pagar_linha_digitavel.js
const fs = require('fs'), path = require('path');
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); o.s = o.s.replace(de, () => para); }

// ---------------- API ----------------
const A = abrir('api/index.js');

troca(A, "const PAYMENT_METHODS = ['boleto', 'pix', 'transferencia'];\n",
`const PAYMENT_METHODS = ['boleto', 'pix', 'transferencia'];

// Linha digitável do boleto: só dígitos. 47 = boleto bancário; 48 = conta de consumo/tributo.
// Só vale para a forma "boleto"; nas outras formas o campo é descartado (como a chave PIX).
function boletoLinhaDigitos(b, pm) {
  if (pm !== 'boleto') return null;
  return String(b.boleto_line == null ? '' : b.boleto_line).replace(/\\D/g, '') || null;
}
`);

troca(A, "  if (b.payment_method === 'pix' && !sanitize(b.pix_key)) return 'Informe a chave PIX para essa forma de pagamento.';\n  return null;",
`  if (b.payment_method === 'pix' && !sanitize(b.pix_key)) return 'Informe a chave PIX para essa forma de pagamento.';
  // A linha é opcional (o boleto pode ainda não ter chegado), mas, se informada, tem de estar completa.
  const linha = boletoLinhaDigitos(b, b.payment_method);
  if (linha && linha.length !== 47 && linha.length !== 48) {
    return 'Linha digitável inválida: informe os 47 dígitos (boleto bancário) ou os 48 (conta de consumo/tributo).';
  }
  return null;`);

troca(A, "payment_method, pix_key, notes, created_by)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,",
         "payment_method, pix_key, boleto_line, notes, created_by)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,");
troca(A, "sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, sanitize(b.notes), req.user.id]);",
         "sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, boletoLinhaDigitos(b, pm), sanitize(b.notes), req.user.id]);");

troca(A, "pix_key: pm === 'pix' ? sanitize(b.pix_key) : '', notes: sanitize(b.notes) },",
         "pix_key: pm === 'pix' ? sanitize(b.pix_key) : '', boleto_line: boletoLinhaDigitos(b, pm) || '', notes: sanitize(b.notes) },");
troca(A, "['pix_key','Chave PIX'],['notes','Observações']]", "['pix_key','Chave PIX'],['boleto_line','Linha digitável'],['notes','Observações']]");
troca(A, "{ ...old, supplier_name: old.supplier_name || '', amount: fmtBRL(old.amount),", "{ ...old, supplier_name: old.supplier_name || '', boleto_line: old.boleto_line || '', amount: fmtBRL(old.amount),");

troca(A, "payment_method=$8, pix_key=$9, notes=$10 WHERE id=$11`,", "payment_method=$8, pix_key=$9, boleto_line=$10, notes=$11 WHERE id=$12`,");
troca(A, "sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, sanitize(b.notes), req.params.id]);",
         "sanitize(b.document), Number(b.amount), b.due_date, pm, pm === 'pix' ? sanitize(b.pix_key) : null, boletoLinhaDigitos(b, pm), sanitize(b.notes), req.params.id]);");
salvar(A);

// ---------------- Front ----------------
const F = abrir('public/app.js');

troca(F, "function formPagar(r, sups) {",
`// Linha digitável do boleto. 47 dígitos = boleto bancário (AAAAA.AAAAA BBBBB.BBBBBB CCCCC.CCCCCC D EEEEEEEEEEEEEE);
// 48 dígitos, começando por 8 = conta de consumo/tributo (quatro blocos "NNNNNNNNNNN-D").
function boletoFormatarLinha(v) {
  const d = String(v == null ? '' : v).replace(/\\D/g, '').slice(0, 48);
  if (d[0] === '8') return (d.match(/.{1,12}/g) || []).map(g => g.length > 11 ? g.slice(0, 11) + '-' + g.slice(11) : g).join(' ');
  const partes = [[0, 5, '.'], [5, 10, ' '], [10, 15, '.'], [15, 21, ' '], [21, 26, '.'], [26, 32, ' '], [32, 33, ' '], [33, 47, '']];
  let out = '';
  for (const [a, b, sep] of partes) {
    const t = d.slice(a, b);
    if (!t) break;
    out += t;
    if (t.length === b - a && d.length > b) out += sep;
  }
  return out;
}
const boletoLinhaValida = v => { const n = String(v == null ? '' : v).replace(/\\D/g, '').length; return n === 47 || n === 48; };

function formPagar(r, sups) {`);

troca(F, `      <div id="p-pix-wrap" style="display:\${r.payment_method === 'pix' ? 'block' : 'none'}">`, `      <div id="p-pix-wrap" style="display:\${r.payment_method === 'pix' ? 'block' : 'none'}">`);
troca(F, `        <small style="color:var(--muted); display:block; margin-top:-8px">Preenchida automaticamente com a chave cadastrada no fornecedor — pode editar se for diferente.</small>
      </div>
    </div>`,
`        <small style="color:var(--muted); display:block; margin-top:-8px">Preenchida automaticamente com a chave cadastrada no fornecedor — pode editar se for diferente.</small>
      </div>
    </div>
    <div id="p-boleto-wrap" style="display:\${r.payment_method === 'boleto' ? 'block' : 'none'}">
      \${fld('p-boleto', 'Linha digitável do boleto', 'text', boletoFormatarLinha(r.boleto_line), 'inputmode="numeric" autocomplete="off" placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"')}
      <small style="color:var(--muted); display:block; margin:-8px 0 12px">Cole ou digite os 47 dígitos do boleto (48 nas contas de consumo). Opcional — pode ser preenchida depois.</small>
    </div>`);

troca(F, "due_date: $('#p-due').value, payment_method: $('#p-pm').value, pix_key: $('#p-pix').value, notes: $('#p-notes').value\n        };",
         "due_date: $('#p-due').value, payment_method: $('#p-pm').value, pix_key: $('#p-pix').value, boleto_line: $('#p-boleto').value, notes: $('#p-notes').value\n        };");

troca(F, "  $('#p-pm').onchange = () => {\n    $('#p-pix-wrap').style.display = $('#p-pm').value === 'pix' ? 'block' : 'none';",
         "  rhLigarCampo('p-boleto', boletoFormatarLinha, boletoLinhaValida, 'Linha digitável incompleta: informe 47 dígitos (boleto) ou 48 (conta de consumo).');\n  $('#p-pm').onchange = () => {\n    $('#p-pix-wrap').style.display = $('#p-pm').value === 'pix' ? 'block' : 'none';\n    $('#p-boleto-wrap').style.display = $('#p-pm').value === 'boleto' ? 'block' : 'none';");

// exportações (a coluna entra depois da Chave PIX; o formato de moeda do Excel passa de J para K)
troca(F, "['ID','Vencimento','Descricao','Fornecedor','Categoria','CentroCusto','Documento','FormaPagamento','ChavePix','Valor','Status','Pagamento'],",
         "['ID','Vencimento','Descricao','Fornecedor','Categoria','CentroCusto','Documento','FormaPagamento','ChavePix','LinhaDigitavel','Valor','Status','Pagamento'],");
troca(F, "      r.payment_method || '', r.payment_method === 'pix' ? (r.pix_key || '') : '', String(r.amount).replace('.', ','), r.status, r.payment_date || '']));",
         "      r.payment_method || '', r.payment_method === 'pix' ? (r.pix_key || '') : '', r.payment_method === 'boleto' ? boletoFormatarLinha(r.boleto_line) : '', String(r.amount).replace('.', ','), r.status, r.payment_date || '']));");
troca(F, "'Forma de Pagamento', 'Chave PIX', 'Valor', 'Status', 'Pagamento'],", "'Forma de Pagamento', 'Chave PIX', 'Linha digitável', 'Valor', 'Status', 'Pagamento'],");
troca(F, "        r.payment_method ? (PM_LABELS_XL[r.payment_method] || r.payment_method) : '', r.payment_method === 'pix' ? (r.pix_key || '') : '',\n        Number(r.amount),",
         "        r.payment_method ? (PM_LABELS_XL[r.payment_method] || r.payment_method) : '', r.payment_method === 'pix' ? (r.pix_key || '') : '',\n        r.payment_method === 'boleto' ? boletoFormatarLinha(r.boleto_line) : '',\n        Number(r.amount),");
troca(F, "const cell = ws['J' + (i + 1)]; if (cell) cell.z = '\"R$\" #,##0.00';", "const cell = ws['K' + (i + 1)]; if (cell) cell.z = '\"R$\" #,##0.00';");
salvar(F);
console.log('ok');
