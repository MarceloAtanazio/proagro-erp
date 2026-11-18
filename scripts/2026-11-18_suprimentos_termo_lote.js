// Propósito: Suprimentos > Envios: TERMO ÚNICO de responsabilidade para vários equipamentos de um mesmo colaborador, no layout do ERP unido ao modelo da TI (identificação do colaborador com dados
//   do ERP, inventário de todos os equipamentos, informações e políticas de uso, justificativa e assinaturas do colaborador e do gestor), e ESTADO do equipamento (Novo, Seminovo, Usado,
//   Recondicionado) como lista suspensa obrigatória no envio. Marque os equipamentos na aba Envios e clique em "Gerar termo único": um PDF, um número (TR-0001) e um anexo assinado que vale
//   para todos ("Marcar entregue" aceita o anexo do termo). "Gerar termo (PDF)" de um envio sem termo cria um termo de um equipamento só. Termo pode ser desfeito (sem anexo assinado).
//   REQUER a migração supabase/migrations/2026-11-18-suprimentos-termo-lote.sql (tabela erp_estoque_termos, colunas termo_id e estado_saida, tipo de anexo termo_lote) aplicada ANTES do deploy.
// Entrada: api/index.js, public/app.js (ou a pasta em argv[2]) e os blocos scripts/2026-11-18_termo_*.txt. Saída: arquivos editados.
// Uso: node scripts/2026-11-18_suprimentos_termo_lote.js [raiz]
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
  if (get().includes('estadoSaidaValido')) throw new Error('api já aplicado');
  troca("  'DELETE /api/suprimentos/itens/:id':",
    "  'POST /api/suprimentos/termos': (req, body) => `Gerou o termo único de responsabilidade TR-${body && body.id} com ${body && body.itens} equipamento(s) (envios ${(req.body && req.body.envio_ids || []).join(', ')})`,\n" +
    "  'POST /api/suprimentos/termos/:id/desfazer': req => `Desfez o termo de responsabilidade ID ${req.params.id} — motivo: \"${String(req.body && req.body.motivo || '').slice(0, 200)}\"`,\n" +
    "  'DELETE /api/suprimentos/itens/:id':");
  troca("  rc_orcamento: 'suprimentos'   // orçamento (PDF/foto) de uma requisição de compra\n};", "  rc_orcamento: 'suprimentos',   // orçamento (PDF/foto) de uma requisição de compra\n  termo_lote: 'suprimentos'   // termo único de responsabilidade assinado (vale para todos os equipamentos do termo)\n};");
  troca("    envio_termo: 'erp_estoque_movimentos', rc_orcamento: 'erp_compra_req_orcamentos'\n  }[req.params.type];", "    envio_termo: 'erp_estoque_movimentos', rc_orcamento: 'erp_compra_req_orcamentos', termo_lote: 'erp_estoque_termos'\n  }[req.params.type];");
  troca("(SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='envio_termo' AND a.entity_id = m.id) AS termos",
    "(SELECT COUNT(*)::int FROM erp_attachments a WHERE (a.entity_type='envio_termo' AND a.entity_id = m.id) OR (a.entity_type='termo_lote' AND a.entity_id = m.termo_id)) AS termos");
  // envio: estado de saída obrigatório para equipamento (validado antes de criar a unidade)
  troca("  let unidade = null;\n  if (item.tipo === 'equipamento') {\n    const r = await unidadePorSerie(item, b.numero_serie, b.patrimonio, req.user.id);",
    "  const estadoSaida = item.tipo === 'equipamento' ? estadoSaidaValido(b.estado_saida) : null;\n  if (item.tipo === 'equipamento' && !estadoSaida) return res.status(400).json({ error: 'Informe o estado do equipamento na saída (Novo, Seminovo, Usado ou Recondicionado).' });\n  let unidade = null;\n  if (item.tipo === 'equipamento') {\n    const r = await unidadePorSerie(item, b.numero_serie, b.patrimonio, req.user.id);");
  troca("     unidade_id, forma_envio, codigo_rastreio, condicao_saida, linha_telefonica, operadora, tamanho)\n    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,",
    "     unidade_id, forma_envio, codigo_rastreio, condicao_saida, linha_telefonica, operadora, estado_saida, tamanho)\n    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,");
  troca("     sanitize(b.linha_telefonica), sanitize(b.operadora), tm.tamanho]);\n  if (unidade) await query(", "     sanitize(b.linha_telefonica), sanitize(b.operadora), estadoSaida, tm.tamanho]);\n  if (unidade) await query(");
  // editar envio: estado
  troca("  await query(`UPDATE erp_estoque_movimentos SET colaborador_id=$1, data=$2, quantidade=$3, unidade_id=$4, forma_envio=$5,",
    "  let estadoNovo = null;\n  if (equip && b.estado_saida !== undefined) {\n    estadoNovo = estadoSaidaValido(b.estado_saida);\n    if (!estadoNovo) return res.status(400).json({ error: 'Informe o estado do equipamento (Novo, Seminovo, Usado ou Recondicionado).' });\n  }\n  await query(`UPDATE erp_estoque_movimentos SET colaborador_id=$1, data=$2, quantidade=$3, unidade_id=$4, forma_envio=$5,");
  troca("  if (colabId !== env.colaborador_id) await query('UPDATE erp_estoque_movimentos SET colaborador_id=$1 WHERE devolucao_de=$2', [colabId, env.id]);",
    "  if (colabId !== env.colaborador_id) await query('UPDATE erp_estoque_movimentos SET colaborador_id=$1 WHERE devolucao_de=$2', [colabId, env.id]);\n  if (estadoNovo) await query('UPDATE erp_estoque_movimentos SET estado_saida=$1 WHERE id=$2', [estadoNovo, env.id]);");
  // entregue: aceita o anexo do envio OU do termo do lote
  troca("      const termos = (await query(`SELECT COUNT(*)::int AS n FROM erp_attachments WHERE entity_type='envio_termo' AND entity_id=$1`, [env.id]))[0].n;",
    "      const termos = (await query(`SELECT COUNT(*)::int AS n FROM erp_attachments WHERE (entity_type='envio_termo' AND entity_id=$1) OR (entity_type='termo_lote' AND entity_id=$2)`, [env.id, env.termo_id]))[0].n;");
  // excluir envio: se o termo ficar vazio, ele e o anexo vão junto
  troca("  if (env.unidade_id && env.status !== 'devolvido') {\n    await query(`UPDATE erp_estoque_unidades SET estado='em_estoque' WHERE id=$1 AND estado='em_custodia'`, [env.unidade_id]);\n  }\n  res.json({ ok: true });\n}));\n\n// Dados da etiqueta de envio",
    "  if (env.unidade_id && env.status !== 'devolvido') {\n    await query(`UPDATE erp_estoque_unidades SET estado='em_estoque' WHERE id=$1 AND estado='em_custodia'`, [env.unidade_id]);\n  }\n  if (env.termo_id) {\n    const resta = (await query('SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE termo_id=$1', [env.termo_id]))[0].n;\n    if (!resta) {\n      await query(\"DELETE FROM erp_attachments WHERE entity_type='termo_lote' AND entity_id=$1\", [env.termo_id]);\n      await query('DELETE FROM erp_estoque_termos WHERE id=$1', [env.termo_id]);\n    }\n  }\n  res.json({ ok: true });\n}));\n\n// Dados da etiqueta de envio");
  troca("// Dados da etiqueta de envio: endereço do colaborador", bloco('2026-11-18_termo_api.txt') + "// Dados da etiqueta de envio: endereço do colaborador");
});

edita('public/app.js', (troca, get, set) => {
  if (get().includes('supTermoLoteModal')) throw new Error('front já aplicado');
  // gerador antigo (um equipamento) sai; entra o novo, com o lote
  const s = get(), ini = s.indexOf('// Termo de responsabilidade do equipamento — imprime, colhe a assinatura e'), fim = s.indexOf('\n// ============================================================\n// CONCILIAÇÃO BANCÁRIA', ini);
  if (ini < 0 || fim < 0) throw new Error('gerador antigo do termo não achado');
  set(s.slice(0, ini) + bloco('2026-11-18_termo_front.txt').replace(/\s+$/, '\n') + s.slice(fim));
  troca("  envio_termo: 'suprimentos', rc_orcamento: 'suprimentos' }[t] || 'receber');", "  envio_termo: 'suprimentos', rc_orcamento: 'suprimentos', termo_lote: 'suprimentos' }[t] || 'receber');");
  // aba Envios: seleção, termo do lote e número do termo
  troca("<thead><tr><th>Data</th><th>Item</th><th class=\"num\">Qtd</th><th>Colaborador</th>", "<thead><tr>${edit ? '<th style=\"width:28px\"></th>' : ''}<th>Data</th><th>Item</th><th class=\"num\">Qtd</th><th>Colaborador</th>");
  troca("        return `<tr>\n          <td>${brDate(m.data)}</td>\n          <td>${esc(m.item_nome)}${m.tamanho",
    "        const selecionavel = equip && m.status !== 'devolvido' && !m.termo_id, attT = m.termo_id ? 'termo_lote:' + m.termo_id : 'envio_termo:' + m.id;\n        return `<tr>\n          ${edit ? `<td>${selecionavel ? `<input type=\"checkbox\" data-ensel=\"${m.id}\" ${SUP_TERMO_SEL.has(m.id) ? 'checked' : ''} title=\"Marcar para o termo único\" aria-label=\"Marcar para o termo único\">` : ''}</td>` : ''}\n          <td>${brDate(m.data)}</td>\n          <td>${esc(m.item_nome)}${m.tamanho");
  troca("data-termo=\"${m.id}\" data-att=\"envio_termo:${m.id}\" title=\"Termo assinado e anexos (${m.termos})\"", "data-termo=\"${m.id}\" data-att=\"${m.termo_id ? 'termo_lote:' + m.termo_id : 'envio_termo:' + m.id}\" title=\"Termo assinado e anexos (${m.termos})\"");
  troca("data-termo=\"${m.id}\" data-att=\"envio_termo:${m.id}\" title=\"Ainda sem termo assinado: anexar\"", "data-termo=\"${m.id}\" data-att=\"${m.termo_id ? 'termo_lote:' + m.termo_id : 'envio_termo:' + m.id}\" title=\"Ainda sem termo assinado: anexar\"");
  troca("          <td style=\"white-space:nowrap\">${termo}</td>", "          <td style=\"white-space:nowrap\">${m.termo_id ? `<span class=\"badge off\" title=\"Termo único com ${rows.filter(x => x.termo_id === m.termo_id).length} equipamento(s) listado(s)\">${supTermoNum(m.termo_id)}</span> ` : ''}${termo}</td>");
  troca("<tr><td colspan=\"8\"><div class=\"empty\">Nenhum envio encontrado.</div></td></tr>", "<tr><td colspan=\"${edit ? 9 : 8}\"><div class=\"empty\">Nenhum envio encontrado.</div></td></tr>");
  troca("      <div class=\"spacer\"></div>${edit ? '<button class=\"btn primary\" id=\"sup-new-envio\">+ Registrar envio</button>' : ''}", "      ${edit ? '<button class=\"btn\" id=\"en-termo-lote\" disabled>Gerar termo único</button>' : ''}\n      <div class=\"spacer\"></div>${edit ? '<button class=\"btn primary\" id=\"sup-new-envio\">+ Registrar envio</button>' : ''}");
  troca("    T.querySelectorAll('[data-det]').forEach(b => b.onclick = () => supDetalheEnvio(achar(b.dataset.det), colaboradores));",
    "    const atualizaSel = () => { const bt = $('#en-termo-lote'); if (!bt) return; const n = SUP_TERMO_SEL.size; bt.disabled = n === 0; bt.textContent = n ? `Gerar termo único (${n})` : 'Gerar termo único'; bt.title = n ? 'Reúne os equipamentos marcados em um só termo' : 'Marque, na primeira coluna, os equipamentos do mesmo colaborador'; };\n    T.querySelectorAll('[data-ensel]').forEach(cb => cb.onchange = () => { const id = Number(cb.dataset.ensel); if (cb.checked) SUP_TERMO_SEL.add(id); else SUP_TERMO_SEL.delete(id); atualizaSel(); });\n    if ($('#en-termo-lote')) $('#en-termo-lote').onclick = () => supTermoLoteModal(movs.filter(x => SUP_TERMO_SEL.has(x.id)));\n    atualizaSel();\n    T.querySelectorAll('[data-det]').forEach(b => b.onclick = () => supDetalheEnvio(achar(b.dataset.det), colaboradores));");
  troca("      openAttachments('envio_termo', m.id, `Termo do envio #${m.id} — ${m.item_nome}`);\n    });", "      if (m.termo_id) openAttachments('termo_lote', m.termo_id, `Termo ${supTermoNum(m.termo_id)} — ${m.colaborador_name}`); else openAttachments('envio_termo', m.id, `Termo do envio #${m.id} — ${m.item_nome}`);\n    });");
  // detalhes do envio
  troca("    btns.push({ label: 'Gerar termo (PDF)', onClick: () => supTermoPDF(m) });\n    btns.push({ label: 'Termo assinado / anexos', onClick: () => openAttachments('envio_termo', m.id, `Termo do envio #${m.id} — ${m.item_nome}`) });",
    "    btns.push({ label: m.termo_id ? `Termo ${supTermoNum(m.termo_id)} (PDF)` : 'Gerar termo (PDF)', onClick: () => supTermoDoEnvio(m) });\n    btns.push({ label: 'Termo assinado / anexos', onClick: () => (m.termo_id ? openAttachments('termo_lote', m.termo_id, `Termo ${supTermoNum(m.termo_id)} — ${m.colaborador_name}`) : openAttachments('envio_termo', m.id, `Termo do envio #${m.id} — ${m.item_nome}`)) });\n    if (edit && m.termo_id) btns.push({ label: 'Desfazer termo', cls: 'danger-ghost', onClick: () => supTermoDesfazer(m) });");
  troca("      ${linha('Condição / acessórios na saída', txt(m.condicao_saida))}", "      ${equip ? linha('Estado na saída', txt(m.estado_saida)) : ''}\n      ${linha(equip ? 'Acessórios incluídos' : 'Condição / acessórios na saída', txt(m.condicao_saida))}\n      ${m.termo_id ? linha('Termo único', supTermoNum(m.termo_id)) : ''}");
  // formulários: estado obrigatório e acessórios
  troca("      <datalist id=\"en-serie-lista\"></datalist>", "      <datalist id=\"en-serie-lista\"></datalist>\n      ${fldSel('en-estado', 'Estado do equipamento *', SUP_ESTADOS, '')}");
  troca("    ${fld('en-cond', 'Condição / acessórios na saída', 'text', '', 'placeholder=\"Ex.: novo, com carregador e capa\"')}", "    ${fld('en-cond', 'Acessórios incluídos na saída', 'text', '', 'placeholder=\"Ex.: carregador e capa\"')}");
  troca("          const equip = (itens.find(i => i.id == $('#en-item').value) || {}).tipo === 'equipamento';\n", "          const equip = (itens.find(i => i.id == $('#en-item').value) || {}).tipo === 'equipamento';\n          if (equip && !$('#en-estado').value) return modalError('Escolha o estado do equipamento (Novo, Seminovo, Usado ou Recondicionado).');\n");
  troca("codigo_rastreio: $('#en-rastreio').value, condicao_saida: $('#en-cond').value, notes: $('#en-notes').value,", "codigo_rastreio: $('#en-rastreio').value, condicao_saida: $('#en-cond').value, estado_saida: equip ? $('#en-estado').value : undefined, notes: $('#en-notes').value,");
  troca("    ${fld('ee-cond', 'Condição / acessórios na saída', 'text', m.condicao_saida || '')}", "    ${equip ? fldSel('ee-estado', 'Estado do equipamento *', SUP_ESTADOS, m.estado_saida || '') : ''}\n    ${fld('ee-cond', equip ? 'Acessórios incluídos na saída' : 'Condição / acessórios na saída', 'text', m.condicao_saida || '')}");
  troca("condicao_saida: v('ee-cond'), condicao_devolucao: v('ee-cond-dev'), notes: v('ee-notes'), tamanho: v('ee-tam') } });", "condicao_saida: v('ee-cond'), condicao_devolucao: v('ee-cond-dev'), notes: v('ee-notes'), tamanho: v('ee-tam'), estado_saida: v('ee-estado') } });");
  return get();
});
console.log('ok');
