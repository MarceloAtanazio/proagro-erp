// Propósito: Suprimentos: GRADE DE TAMANHOS (uniformes, calçados etc.). O item pode controlar o estoque por tamanho: no cadastro, uma grade (modelos Vestuário PP–XXG, Calçado 34–46, Calça 36–56
//   ou tamanhos próprios) com o estoque MÍNIMO de cada tamanho; compra, ajuste, envio, devolução e a correção de lançamentos pedem o tamanho; o saldo é por tamanho (envio barra se o tamanho não tem
//   saldo); a tabela do estoque mostra etiquetinhas por tamanho (vermelho abaixo do mínimo), a ficha mostra a tabela por tamanho e o histórico, os envios e as compras mostram o tamanho. O CMP segue único por item.
//   Grade só vale para material de consumo. Tirar da grade um tamanho com saldo é barrado. Requer a migração supabase/migrations/2026-11-16-suprimentos-grade-tamanhos.sql (colunas
//   erp_estoque_itens.grade_tamanhos e .minimos_tamanho, erp_estoque_movimentos.tamanho) aplicada ANTES do deploy.
// Entrada: api/index.js, public/app.js, public/styles.css (ou a pasta em argv[2]) e os blocos scripts/2026-11-16_grade_*.txt. Saída: arquivos editados.
// Uso: node scripts/2026-11-16_suprimentos_grade_tamanhos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = nome => fs.readFileSync(path.join(__dirname, nome), 'utf8').replace(/\r\n/g, '\n');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; });
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}

edita('api/index.js', (troca, get) => {
  if (get().includes('function tamanhoDoLancamento')) throw new Error('api já aplicado');
  // saldo por tamanho no select dos itens e mínimo por tamanho no resumo
  troca("m WHERE m.item_id = i.id), 0) AS estoque_atual\n  FROM erp_estoque_itens i`;",
    "m WHERE m.item_id = i.id), 0) AS estoque_atual,\n    COALESCE((SELECT json_object_agg(x.t, x.q) FROM (SELECT COALESCE(m.tamanho, '') AS t, SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE -m.quantidade END) AS q\n              FROM erp_estoque_movimentos m WHERE m.item_id = i.id GROUP BY COALESCE(m.tamanho, '')) x WHERE x.q <> 0), '{}'::json) AS estoque_por_tamanho\n  FROM erp_estoque_itens i`;");
  troca("abaixoMinimo: itens.filter(i => n(i.estoque_atual) < n(i.estoque_minimo)).length,", "abaixoMinimo: itens.filter(itemAbaixoMinimo).length,");
  // saldo (total ou por tamanho) + helpers
  troca("async function estoqueAtualItem(itemId) {\n  const r = await query(",
    bloco('2026-11-16_grade_api_helpers.txt') + "async function estoqueAtualItem(itemId, tamanho) {\n  if (tamanho !== undefined) {   // saldo de UM tamanho (nulo = lançamentos sem tamanho)\n    const rt = await query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE -quantidade END),0) AS q\n      FROM erp_estoque_movimentos WHERE item_id=$1 AND tamanho IS NOT DISTINCT FROM $2`, [itemId, tamanho]);\n    return Number(rt[0].q);\n  }\n  const r = await query(");
  // validação e valores do cadastro
  troca("  if (sanitize(b.ncm) && String(b.ncm).replace(/\\D/g, '').length !== 8) return 'NCM deve ter 8 dígitos.';",
    "  if (b.grade_tamanhos != null && !Array.isArray(b.grade_tamanhos)) return 'Grade de tamanhos inválida.';\n  if (Array.isArray(b.grade_tamanhos) && b.grade_tamanhos.length) {\n    if (b.tipo === 'equipamento') return 'A grade de tamanhos vale só para material de consumo.';\n    if (b.grade_tamanhos.length > 40) return 'A grade aceita no máximo 40 tamanhos.';\n    const vistos = new Set();\n    for (const t of b.grade_tamanhos) {\n      const x = String(t == null ? '' : t).trim();\n      if (!x || x.length > 12) return 'Cada tamanho precisa ter de 1 a 12 caracteres.';\n      if (vistos.has(x.toLowerCase())) return `Tamanho repetido na grade: ${x}.`;\n      vistos.add(x.toLowerCase());\n    }\n    for (const k of Object.keys(b.minimos_tamanho || {})) if (!(Number((b.minimos_tamanho || {})[k]) >= 0)) return `Estoque mínimo inválido para o tamanho ${k}.`;\n  }\n  if (sanitize(b.ncm) && String(b.ncm).replace(/\\D/g, '').length !== 8) return 'NCM deve ter 8 dígitos.';");
  troca("  const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);\n  return {",
    "  const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);\n  const gr = gradeDoCorpo(b);   // com grade, o mínimo do item é a soma dos mínimos por tamanho\n  return {");
  troca("    estoque_minimo: Number(b.estoque_minimo) || 0, estoque_maximo: num(b.estoque_maximo),",
    "    estoque_minimo: gr.grade.length ? Object.values(gr.minimos).reduce((a, x) => a + x, 0) : (Number(b.estoque_minimo) || 0), estoque_maximo: num(b.estoque_maximo),\n    grade_tamanhos: gr.grade.length ? JSON.stringify(gr.grade) : null, minimos_tamanho: gr.grade.length ? JSON.stringify(gr.minimos) : null,");
  // editar item: não tirar da grade um tamanho com saldo
  troca("  const v = itemValues(b); v.ativo = b.ativo !== false;",
    "  const v = itemValues(b); v.ativo = b.ativo !== false;\n  const gradeNova = JSON.parse(v.grade_tamanhos || '[]').map(t => String(t).toLowerCase());\n  const porTam = await query(\"SELECT tamanho, SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE -quantidade END) AS q FROM erp_estoque_movimentos WHERE item_id=$1 AND tamanho IS NOT NULL GROUP BY tamanho\", [req.params.id]);\n  const preso = porTam.find(r => Number(r.q) !== 0 && !gradeNova.includes(String(r.tamanho).toLowerCase()));\n  if (preso) return res.status(409).json({ error: `O tamanho ${preso.tamanho} ainda tem ${Number(preso.q)} em estoque. Zere-o (ajuste ou envio) antes de tirá-lo da grade.` });");
  // compra
  troca("  const valorTotal = Number((qtd * custo).toFixed(2));\n\n  let payableId = null;",
    "  const valorTotal = Number((qtd * custo).toFixed(2));\n  const tm = tamanhoDoLancamento(item, b.tamanho);\n  if (tm.erro) return res.status(400).json({ error: tm.erro });\n\n  let payableId = null;");
  troca("supplier_id, documento, data, payable_id, notes, created_by)\n    VALUES ($1,'entrada','compra',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,\n    [item.id, qtd, custo, valorTotal, b.supplier_id || null, sanitize(b.documento), data, payableId, sanitize(b.notes), req.user.id]);",
    "supplier_id, documento, data, payable_id, notes, created_by, tamanho)\n    VALUES ($1,'entrada','compra',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,\n    [item.id, qtd, custo, valorTotal, b.supplier_id || null, sanitize(b.documento), data, payableId, sanitize(b.notes), req.user.id, tm.tamanho]);");
  // ajuste
  troca("  if (!sanitize(b.notes)) return res.status(400).json({ error: 'Descreva o motivo do ajuste.' });\n  if (tipo === 'saida') {\n    const saldo = await estoqueAtualItem(item.id);\n    if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente: disponível ${saldo} ${item.unidade}.` });\n  }",
    "  if (!sanitize(b.notes)) return res.status(400).json({ error: 'Descreva o motivo do ajuste.' });\n  const tm = tamanhoDoLancamento(item, b.tamanho);\n  if (tm.erro) return res.status(400).json({ error: tm.erro });\n  if (tipo === 'saida') {\n    const saldo = await estoqueAtualItem(item.id, tamQ(tm));\n    if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente${rotTam(tm)}: disponível ${saldo} ${item.unidade}.` });\n  }");
  troca("(item_id, tipo, origem, quantidade, custo_unitario, valor_total, data, notes, created_by)\n    VALUES ($1,$2,'ajuste',$3,$4,$5,$6,$7,$8)`,\n    [item.id, tipo, qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, data, sanitize(b.notes), req.user.id]);",
    "(item_id, tipo, origem, quantidade, custo_unitario, valor_total, data, notes, created_by, tamanho)\n    VALUES ($1,$2,'ajuste',$3,$4,$5,$6,$7,$8,$9)`,\n    [item.id, tipo, qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, data, sanitize(b.notes), req.user.id, tm.tamanho]);");
  // envio
  troca("  const saldo = await estoqueAtualItem(item.id);\n  if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente: disponível ${saldo} ${item.unidade}, solicitado ${qtd}.` });",
    "  const tm = tamanhoDoLancamento(item, b.tamanho);\n  if (tm.erro) return res.status(400).json({ error: tm.erro });\n  const saldo = await estoqueAtualItem(item.id, tamQ(tm));\n  if (qtd > saldo) return res.status(400).json({ error: `Estoque insuficiente${rotTam(tm)}: disponível ${saldo} ${item.unidade}, solicitado ${qtd}.` });");
  troca("     unidade_id, forma_envio, codigo_rastreio, condicao_saida, linha_telefonica, operadora)\n    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,",
    "     unidade_id, forma_envio, codigo_rastreio, condicao_saida, linha_telefonica, operadora, tamanho)\n    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,");
  troca("     sanitize(b.linha_telefonica), sanitize(b.operadora)]);\n  if (unidade) await query(", "     sanitize(b.linha_telefonica), sanitize(b.operadora), tm.tamanho]);\n  if (unidade) await query(");
  // editar envio: quantidade por tamanho e troca de tamanho
  troca("      const saldo = await estoqueAtualItem(env.item_id);\n      if (extra > saldo)", "      const saldo = await estoqueAtualItem(env.item_id, gradeDe(item).length ? (env.tamanho == null ? null : env.tamanho) : undefined);\n      if (extra > saldo)");
  troca("  let unidadeId = env.unidade_id;\n  if (equip) {",
    "  let tamanhoEnv = env.tamanho == null ? null : env.tamanho;\n  if (b.tamanho !== undefined && gradeDe(item).length) {\n    const tt = tamanhoDoLancamento(item, b.tamanho);\n    if (tt.erro) return res.status(400).json({ error: tt.erro });\n    if (tt.tamanho !== tamanhoEnv) {\n      const sd = await estoqueAtualItem(item.id, tt.tamanho);\n      if (qtd > sd) return res.status(400).json({ error: `Estoque insuficiente no tamanho ${tt.tamanho}: disponível ${sd} ${item.unidade}.` });\n      tamanhoEnv = tt.tamanho;\n    }\n  }\n\n  let unidadeId = env.unidade_id;\n  if (equip) {");
  troca("linha_telefonica=$9, operadora=$10, notes=$11 WHERE id=$12`,", "linha_telefonica=$9, operadora=$10, notes=$11, tamanho=$12 WHERE id=$13`,");
  troca("     sanitize(b.linha_telefonica), sanitize(b.operadora), sanitize(b.notes), env.id]);\n  if (colabId !== env.colaborador_id)",
    "     sanitize(b.linha_telefonica), sanitize(b.operadora), sanitize(b.notes), tamanhoEnv, env.id]);\n  if (tamanhoEnv !== (env.tamanho == null ? null : env.tamanho)) await query('UPDATE erp_estoque_movimentos SET tamanho=$1 WHERE devolucao_de=$2', [tamanhoEnv, env.id]);\n  if (colabId !== env.colaborador_id)");
  // devolução herda o tamanho do envio
  troca("devolucao_de, notes, created_by, unidade_id)\n      VALUES ($1,'entrada','devolucao',$2,$3,$4,$5,$6,$7,$8)`,\n      [env.item_id, env.quantidade, env.colaborador_id, data, env.id, sanitize(req.body.notes), req.user.id, env.unidade_id]);",
    "devolucao_de, notes, created_by, unidade_id, tamanho)\n      VALUES ($1,'entrada','devolucao',$2,$3,$4,$5,$6,$7,$8,$9)`,\n      [env.item_id, env.quantidade, env.colaborador_id, data, env.id, sanitize(req.body.notes), req.user.id, env.unidade_id, env.tamanho == null ? null : env.tamanho]);");
  // lista de movimentos devolve a grade do item
  troca("i.marca AS item_marca, i.sku AS item_sku, i.subcategoria AS item_subcategoria,", "i.marca AS item_marca, i.sku AS item_sku, i.subcategoria AS item_subcategoria, i.grade_tamanhos AS item_grade,");
  // correção de lançamentos (editar / excluir) por tamanho
  troca("const efeitoEstoque = (tipo, q) => (tipo === 'entrada' ? q : -q);",
    "const efeitoEstoque = (tipo, q) => (tipo === 'entrada' ? q : -q);\n// Estoque não pode ficar negativo ao corrigir um lançamento (item com grade: por tamanho). `tamNovo` indefinido = item sem grade. Devolve o texto do problema ou null.\nasync function saldoNegativoNaCorrecao(item, mov, qtdNova, tamNovo) {\n  const antigo = efeitoEstoque(mov.tipo, Number(mov.quantidade)), novo = efeitoEstoque(mov.tipo, qtdNova), un = item.unidade || 'un';\n  if (tamNovo === undefined) { const r = (await estoqueAtualItem(item.id)) - antigo + novo; return r < 0 ? `o estoque ficaria negativo (${r} ${un}).` : null; }\n  const tamAnt = mov.tamanho == null ? null : mov.tamanho;\n  if (tamAnt === tamNovo) { const r = (await estoqueAtualItem(item.id, tamNovo)) - antigo + novo; return r < 0 ? `o tamanho ${tamNovo || '(sem tamanho)'} ficaria negativo (${r} ${un}).` : null; }\n  const ra = (await estoqueAtualItem(item.id, tamAnt)) - antigo;\n  if (ra < 0) return `o tamanho ${tamAnt || '(sem tamanho)'} ficaria negativo (${ra} ${un}).`;\n  const rn = (await estoqueAtualItem(item.id, tamNovo)) + novo;\n  return rn < 0 ? `o tamanho ${tamNovo} ficaria negativo (${rn} ${un}).` : null;\n}");
  troca("  const saldo = await estoqueAtualItem(item.id), novoSaldo = saldo - efeitoEstoque(mov.tipo, Number(mov.quantidade)) + efeitoEstoque(mov.tipo, qtd);\n  if (novoSaldo < 0) return res.status(409).json({ error: `Com essa alteração o estoque ficaria negativo (${novoSaldo} ${item.unidade}).` });",
    "  const tm = tamanhoDoLancamento(item, b.tamanho === undefined ? mov.tamanho : b.tamanho);\n  if (tm.erro) return res.status(400).json({ error: tm.erro });\n  const neg = await saldoNegativoNaCorrecao(item, mov, qtd, tm.grade ? tm.tamanho : undefined);\n  if (neg) return res.status(409).json({ error: `Com essa alteração ${neg}` });");
  troca("custo_unitario=$2, valor_total=$3, data=COALESCE($4::date, data), notes=$5 WHERE id=$6',\n    [qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, isDate(b.data) ? b.data : null, notes, mov.id]);",
    "custo_unitario=$2, valor_total=$3, data=COALESCE($4::date, data), notes=$5, tamanho=$6 WHERE id=$7',\n    [qtd, custo, custo != null ? Number((qtd * custo).toFixed(2)) : null, isDate(b.data) ? b.data : null, notes, tm.grade ? tm.tamanho : (mov.tamanho == null ? null : mov.tamanho), mov.id]);");
  troca("  const saldo = await estoqueAtualItem(item.id), novoSaldo = saldo - efeitoEstoque(mov.tipo, Number(mov.quantidade));\n  if (novoSaldo < 0) return res.status(409).json({ error: `Excluir esta entrada deixaria o estoque negativo (${novoSaldo} ${item.unidade}). Há saídas posteriores que dependem dela.` });",
    "  const neg = await saldoNegativoNaCorrecao(item, mov, 0, gradeDe(item).length ? (mov.tamanho == null ? null : mov.tamanho) : undefined);\n  if (neg) return res.status(409).json({ error: `Excluir este lançamento: ${neg} Há saídas posteriores que dependem dele.` });");
});

edita('public/app.js', (troca, get) => {
  if (get().includes('function supLigarGrade')) throw new Error('front já aplicado');
  // catálogo: categoria Uniformes
  troca("    'Limpeza e Copa':", "    'Uniformes': ['Camisa', 'Camiseta', 'Calça / bermuda', 'Jaqueta / agasalho', 'Boné / chapéu', 'Calçado / bota', 'Outros'],\n    'Limpeza e Copa':");
  // helpers + cadastro
  troca("function supFormItem(i) {\n  const isEdit = !!i; i = i || {};\n  const num = v => (v == null ? '' : v);",
    bloco('2026-11-16_grade_front_helpers.txt') + "function supFormItem(i) {\n  const isEdit = !!i; i = i || {};\n  const num = v => (v == null ? '' : v);\n  let gradeCtl = null;");
  troca("    <div class=\"form-row\">\n      ${fld('it-min', 'Estoque mínimo (ressuprimento)'", bloco('2026-11-16_grade_front_form_box.txt') + "    <div class=\"form-row\">\n      ${fld('it-min', 'Estoque mínimo (ressuprimento)'");
  troca("numero_serie: $('#it-serie').value, notes: $('#it-notes').value\n        };", "numero_serie: $('#it-serie').value, notes: $('#it-notes').value,\n          ...(gradeCtl ? gradeCtl.corpo() : {})\n        };");
  troca("  supLigarClassificacao(i);\n}\n\n// Ficha completa do item", "  supLigarClassificacao(i);\n  gradeCtl = supLigarGrade(i);\n}\n\n// Ficha completa do item");
  // tabela do estoque
  troca("baixo = atual < min, zero = atual <= 0;", "baixo = supAbaixoMin(i), zero = atual <= 0;");
  troca("          <td class=\"num\"><strong>${supNum(atual)}</strong> <small style=\"color:var(--muted)\">${esc(i.unidade)}</small></td>\n          <td class=\"num\">${supNum(min)}</td>",
    "          <td class=\"num\"><strong>${supNum(atual)}</strong> <small style=\"color:var(--muted)\">${esc(i.unidade)}</small>${supGradeDe(i).length ? `<div class=\"sup-tams\">${supChipsTam(i)}</div>` : ''}</td>\n          <td class=\"num\">${supNum(min)}${supGradeDe(i).length ? '<div><small style=\"color:var(--muted)\">por tamanho</small></div>' : ''}</td>");
  // ficha
  troca("    ${supSecTitle('Financeiro')}\n    <table class=\"via-resumo-tbl\">\n      ${linha('Preço da última compra'", "    ${supGradeDe(i).length ? supSecTitle('Estoque por tamanho') + supTabelaTamanhos(i) : ''}\n    ${supSecTitle('Financeiro')}\n    <table class=\"via-resumo-tbl\">\n      ${linha('Preço da última compra'");
  // ajuste
  troca("    ${fld('aj-notes', 'Motivo do ajuste *', 'text', '', 'placeholder=\"Ex.: contagem física, perda, correção\"')}`,",
    "    ${supGradeDe(i).length ? fldSel('aj-tam', 'Tamanho *', supOpcoesTam(i, 'em estoque'), '') : ''}\n    ${fld('aj-notes', 'Motivo do ajuste *', 'text', '', 'placeholder=\"Ex.: contagem física, perda, correção\"')}`,");
  troca("notes: $('#aj-notes').value } });", "notes: $('#aj-notes').value, tamanho: $('#aj-tam') ? $('#aj-tam').value : undefined } });");
  // compra
  troca("    ${fldSel('co-item', 'Item *', ativos.map(i => ({ v: i.id, t: `${i.nome}${i.sku ? ' (' + i.sku + ')' : ''}` })), ativos[0].id)}\n",
    "    ${fldSel('co-item', 'Item *', ativos.map(i => ({ v: i.id, t: `${i.nome}${i.sku ? ' (' + i.sku + ')' : ''}` })), ativos[0].id)}\n    <div id=\"co-tam-wrap\" style=\"display:none\">${fldSel('co-tam', 'Tamanho *', [{ v: '', t: '— escolha —' }], '')}</div>\n");
  troca("lancar_pagar: $('#co-pagar').checked, due_date: $('#co-venc').value, categoria_pagar: $('#co-catpag').value, notes: $('#co-notes').value } });",
    "lancar_pagar: $('#co-pagar').checked, due_date: $('#co-venc').value, categoria_pagar: $('#co-catpag').value, notes: $('#co-notes').value,\n            tamanho: $('#co-tam-wrap').style.display === 'none' ? undefined : $('#co-tam').value } });");
  troca("  $('#co-pagar').onchange = e => { $('#co-pagar-fields').style.display = e.target.checked ? '' : 'none'; };",
    "  $('#co-pagar').onchange = e => { $('#co-pagar-fields').style.display = e.target.checked ? '' : 'none'; };\n  const ajustaTam = () => {\n    const it = ativos.find(x => x.id == $('#co-item').value) || {}, g = supGradeDe(it);\n    $('#co-tam-wrap').style.display = g.length ? '' : 'none';\n    $('#co-tam').innerHTML = supOpcoesTam(it, 'em estoque').map(o => `<option value=\"${esc(o.v)}\">${esc(o.t)}</option>`).join('');\n  };\n  $('#co-item').onchange = ajustaTam; ajustaTam();");
  troca("<td>${brDate(m.data)}</td><td>${esc(m.item_nome)}</td>", "<td>${brDate(m.data)}</td><td>${esc(m.item_nome)}${m.tamanho ? ` <span class=\"badge off\">Tam. ${esc(m.tamanho)}</span>` : ''}</td>");
  // envio
  troca("    ${fldSel('en-item', 'Item *', disp.map(i => ({ v: i.id, t: `${i.nome} — ${supNum(i.estoque_atual)} ${i.unidade} disp.` })), disp[0].id)}\n",
    "    ${fldSel('en-item', 'Item *', disp.map(i => ({ v: i.id, t: `${i.nome} — ${supNum(i.estoque_atual)} ${i.unidade} disp.` })), disp[0].id)}\n    <div id=\"en-tam-wrap\" style=\"display:none\">${fldSel('en-tam', 'Tamanho *', [{ v: '', t: '— escolha —' }], '')}</div>\n");
  troca("codigo_rastreio: $('#en-rastreio').value, condicao_saida: $('#en-cond').value, notes: $('#en-notes').value } });",
    "codigo_rastreio: $('#en-rastreio').value, condicao_saida: $('#en-cond').value, notes: $('#en-notes').value,\n            tamanho: $('#en-tam-wrap').style.display === 'none' ? undefined : $('#en-tam').value } });");
  troca("    $('#en-qtd').disabled = equip;\n", "    $('#en-qtd').disabled = equip;\n    $('#en-tam-wrap').style.display = supGradeDe(item).length ? '' : 'none';\n    $('#en-tam').innerHTML = supOpcoesTam(item, 'disp.').map(o => `<option value=\"${esc(o.v)}\">${esc(o.t)}</option>`).join('');\n");
  // envios: lista, detalhe, edição
  troca("<td>${esc(m.item_nome)}${ident ?", "<td>${esc(m.item_nome)}${m.tamanho ? ` <span class=\"badge off\">Tam. ${esc(m.tamanho)}</span>` : ''}${ident ?");
  troca("      ${linha('Quantidade', supNum(m.quantidade) + ' ' + esc(m.unidade))}\n      <tr><td colspan=\"2\">${supSecTitle('Destinatário e envio')}</td></tr>",
    "      ${linha('Quantidade', supNum(m.quantidade) + ' ' + esc(m.unidade))}\n      ${m.tamanho ? linha('Tamanho', esc(m.tamanho)) : ''}\n      <tr><td colspan=\"2\">${supSecTitle('Destinatário e envio')}</td></tr>");
  troca("para trocar o item, exclua este envio e registre outro.</p>\n", "para trocar o item, exclua este envio e registre outro.</p>\n    ${(m.item_grade || []).length ? fldSel('ee-tam', 'Tamanho', [{ v: '', t: '— escolha —' }, ...m.item_grade.map(t => ({ v: t, t }))], m.tamanho || '') : ''}\n");
  troca("condicao_saida: v('ee-cond'), condicao_devolucao: v('ee-cond-dev'), notes: v('ee-notes') } });", "condicao_saida: v('ee-cond'), condicao_devolucao: v('ee-cond-dev'), notes: v('ee-notes'), tamanho: v('ee-tam') } });");
  // histórico, detalhe e edição do lançamento
  troca("<th>Movimento</th><th class=\"num\">Qtd</th><th class=\"num\">Custo un.</th>", "<th>Movimento</th>${comTam ? '<th>Tam.</th>' : ''}<th class=\"num\">Qtd</th><th class=\"num\">Custo un.</th>");
  troca("  const ORIG = { compra: 'Compra', envio: 'Envio', ajuste: 'Ajuste', devolucao: 'Devolução' };\n  openModal(`Histórico — ${esc(i.nome)}`, `", "  const ORIG = { compra: 'Compra', envio: 'Envio', ajuste: 'Ajuste', devolucao: 'Devolução' };\n  const comTam = supGradeDe(i).length > 0 || movs.some(m => m.tamanho);\n  openModal(`Histórico — ${esc(i.nome)}`, `");
  troca("          <td class=\"num\">${supNum(m.quantidade)} ${esc(i.unidade)}</td>\n          <td class=\"num\">${m.custo_unitario != null", "          ${comTam ? `<td>${m.tamanho ? esc(m.tamanho) : '—'}</td>` : ''}\n          <td class=\"num\">${supNum(m.quantidade)} ${esc(i.unidade)}</td>\n          <td class=\"num\">${m.custo_unitario != null");
  troca("<tr><td colspan=\"6\"><div class=\"empty\">Sem movimentações.</div></td></tr>`}</tbody>", "<tr><td colspan=\"${comTam ? 7 : 6}\"><div class=\"empty\">Sem movimentações.</div></td></tr>`}</tbody>");
  troca("      ${linha('Quantidade', `<strong>${supNum(m.quantidade)} ${esc(i.unidade)}</strong>`)}", "      ${linha('Quantidade', `<strong>${supNum(m.quantidade)} ${esc(i.unidade)}</strong>`)}\n      ${linha('Tamanho', esc(m.tamanho || ''))}");
  troca("    <div class=\"form-row\">\n      ${fld('lc-qtd'", "    ${supGradeDe(i).length ? fldSel('lc-tam', 'Tamanho *', supOpcoesTam(i), m.tamanho || '') : ''}\n    <div class=\"form-row\">\n      ${fld('lc-qtd'");
  troca("data: $('#lc-data').value, notes: $('#lc-notes').value, motivo } });", "data: $('#lc-data').value, notes: $('#lc-notes').value, motivo, tamanho: $('#lc-tam') ? $('#lc-tam').value : undefined } });");
});

edita('public/styles.css', (troca, get, set) => {
  if (get().includes('.sup-tam-card')) throw new Error('css já aplicado');
  set(get().replace(/\s+$/, '\n') + bloco('2026-11-16_grade_css.txt'));
});
console.log('ok');
