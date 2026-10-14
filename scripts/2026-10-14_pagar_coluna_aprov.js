// Propósito: Contas a Pagar ganha a coluna "Aprov." entre Status e Conc.: ✔ quando o título tem anexo do tipo
//   "Aprovação", ✘ quando não tem, e "—" para títulos com vencimento anterior a 14/10/2026 sem aprovação (para
//   não marcar "erro" no que veio antes de a regra existir). Clicar abre os anexos; ao anexar/excluir a célula
//   atualiza na hora. Também ajusta larguras/alinhamento da tabela (colunas de ícone centralizadas, valores com
//   algarismos de largura fixa, alinhamento vertical ao centro).
// Entrada: api/index.js, public/app.js, public/styles.css. Saída: os mesmos arquivos editados.
// Uso: node scripts/2026-10-14_pagar_coluna_aprov.js
const fs = require('fs'), path = require('path');
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); o.s = o.s.replace(de, () => para); }

// ---------------- API: quantos anexos "Aprovação" cada título tem ----------------
const A = abrir('api/index.js');
troca(A, "      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id) AS attachment_count,\n",
         "      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id) AS attachment_count,\n" +
         "      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id AND a.kind='aprovacao') AS aprovacao_count,\n");
salvar(A);

// ---------------- Front ----------------
const F = abrir('public/app.js');

// regra da célula + atualização ao vivo
troca(F, "function updateAttBadge(type, id, n) {",
`// Aprovação da diretoria em Contas a Pagar (anexo do tipo "Aprovação"). A cobrança vale a partir desta data de
// VENCIMENTO: o que vence antes aparece com "—" em vez de ✘, para não acusar erro no que veio antes da regra.
// Título antigo que tenha o anexo mostra ✔ do mesmo jeito.
const PAGAR_APROV_A_PARTIR_DE = '2026-10-14';
function pagarAprovInfo(tem, venc) {
  if (tem) return { cls: 'conc-sim', glifo: '✔', titulo: 'Aprovação da diretoria anexada — clique para ver os anexos' };
  if (String(venc || '').slice(0, 10) >= PAGAR_APROV_A_PARTIR_DE) return { cls: 'conc-nao', glifo: '✘', titulo: 'Sem anexo de Aprovação — clique para anexar' };
  return { cls: 'conc-na', glifo: '—', titulo: 'Vencimento anterior a ' + brDate(PAGAR_APROV_A_PARTIR_DE) + ': aprovação não cobrada nesta tabela' };
}
function updateAprovCell(id, tem) {
  const b = document.querySelector(\`[data-aprov="\${id}"]\`);
  if (!b) return;
  const i = pagarAprovInfo(tem, b.dataset.venc);
  b.className = 'aprov-btn ' + i.cls; b.textContent = i.glifo; b.title = i.titulo;
}

function updateAttBadge(type, id, n) {`);
troca(F, "      updateAttBadge(type, id, items.length);\n",
         "      updateAttBadge(type, id, items.length);\n      if (type === 'payable') updateAprovCell(id, items.some(a => a.kind === 'aprovacao'));\n");

// tabela de Contas a Pagar (a 1ª ocorrência é a de Pagar; Receber vem depois)
const iReceber = F.s.indexOf('async function renderReceber()');
const dentroDePagar = trecho => { const i = F.s.indexOf(trecho); if (i < 0 || i > iReceber) throw new Error('fora de Pagar: ' + trecho.slice(0, 60)); };

dentroDePagar('<div class="table-wrap"><table id="tbl" class="tbl-fin"></table></div>`;');
troca(F, '<div class="table-wrap"><table id="tbl" class="tbl-fin"></table></div>`;', '<div class="table-wrap"><table id="tbl" class="tbl-fin tbl-pagar"></table></div>`;');

dentroDePagar('<col class="c-val"><col class="c-status"><col class="c-conc"><col class="c-acoes">');
troca(F, '<col class="c-val"><col class="c-status"><col class="c-conc"><col class="c-acoes">',
         '<col class="c-val"><col class="c-status"><col class="c-aprov"><col class="c-conc"><col class="c-acoes">');

dentroDePagar('<th>Status</th><th class="c-conc-cell" title="Conciliado com o extrato bancário?">Conc.</th>');
troca(F, '<th>Status</th><th class="c-conc-cell" title="Conciliado com o extrato bancário?">Conc.</th>',
         '<th>Status</th><th class="c-aprov-cell" title="Aprovação da diretoria: anexo do tipo Aprovação neste título">Aprov.</th><th class="c-conc-cell" title="Conciliado com o extrato bancário?">Conc.</th>');

dentroDePagar("          <td class=\"c-conc-cell\">${r.status !== 'pago'");
troca(F, "          <td class=\"c-conc-cell\">${r.status !== 'pago'",
`          <td class="c-aprov-cell">\${(() => { const i = pagarAprovInfo(r.aprovacao_count > 0, r.due_date);
            return \`<button type="button" class="aprov-btn \${i.cls}" data-aprov="\${r.id}" data-venc="\${esc(r.due_date)}" title="\${esc(i.titulo)}" aria-label="Aprovação">\${i.glifo}</button>\`; })()}</td>
          <td class="c-conc-cell">\${r.status !== 'pago'`);

dentroDePagar("<tr><td colspan=\"9\"><div class=\"empty\">Nenhum título encontrado.</div></td></tr>");
troca(F, "<tr><td colspan=\"9\"><div class=\"empty\">Nenhum título encontrado.</div></td></tr>", "<tr><td colspan=\"10\"><div class=\"empty\">Nenhum título encontrado.</div></td></tr>");
dentroDePagar('<td class="num">${brl(total)}</td><td colspan="3"></td></tr></tfoot>`;');
troca(F, '<td class="num">${brl(total)}</td><td colspan="3"></td></tr></tfoot>`;', '<td class="num">${brl(total)}</td><td colspan="4"></td></tr></tfoot>`;');

dentroDePagar("    $('#tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.att.split(':')[1]);");
troca(F, "    $('#tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.att.split(':')[1]);",
         "    $('#tbl').querySelectorAll('[data-aprov]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.aprov); openAttachments('payable', r.id, r.description); });\n" +
         "    $('#tbl').querySelectorAll('[data-att]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id == b.dataset.att.split(':')[1]);");
salvar(F);

// ---------------- CSS ----------------
const C = abrir('public/styles.css');
troca(C, ".tbl-fin .conc-na  { color: var(--muted); cursor: default; }",
`.tbl-fin .conc-na  { color: var(--muted); cursor: default; }

/* ===== Contas a Pagar: coluna "Aprov." e ajustes de leitura =====
   Aprov. e Conc. são colunas de SÍMBOLO: mesma largura, cabeçalho e conteúdo centralizados, para os dois
   símbolos ficarem alinhados na vertical. Aprov. é botão (abre os anexos), com a mesma aparência de Conc.
   A tabela fica 66px mais larga que a de Contas a Receber por causa dela. */
.tbl-fin.tbl-pagar { min-width: 1302px; }
.tbl-fin col.c-aprov { width: 66px; }
.tbl-fin .c-aprov-cell { text-align: center; padding-left: 8px; padding-right: 8px; }
.tbl-fin .aprov-btn { background: none; border: 0; border-radius: 6px; padding: 4px 8px; font: inherit;
  font-size: 15px; font-weight: 700; line-height: 1; cursor: pointer; }
.tbl-fin .aprov-btn:hover { background: #F0F4F1; }
.tbl-fin .aprov-btn:focus-visible { outline: 2px solid var(--verde-500); outline-offset: 1px; }
/* Linha com ícones e texto: centralizar na vertical evita o ícone "caído" em relação ao texto. */
.tbl-fin.tbl-pagar td { vertical-align: middle; }
.tbl-fin.tbl-pagar td.num { font-variant-numeric: tabular-nums; }`);
salvar(C);
console.log('ok');
