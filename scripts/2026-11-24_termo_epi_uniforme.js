// Propósito: libera o termo de responsabilidade (Suprimentos > Envios a funcionários) para itens marcados "exige termo" (EPI, uniformes),
//   além dos equipamentos: coluna erp_estoque_itens.exige_termo, API, telas, formulário do item e variante do PDF do termo.
// Entradas: api/index.js, public/app.js. Saídas: os mesmos arquivos alterados. Requer a migração 2026-11-24-suprimentos-item-exige-termo.sql.
// Como executar: node scripts/2026-11-24_termo_epi_uniforme.js (na raiz do projeto).
const fs = require('fs');
function aplica(arq, trocas) {
  let s = fs.readFileSync(arq, 'utf8');
  const crlf = s.includes('\r\n');
  if (crlf) s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of trocas) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`${arq}: trecho aparece ${n}x: ${a.slice(0, 70)}`);
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(arq, s);
}
aplica('api/index.js', [
  ["    tipo: b.tipo === 'equipamento' ? 'equipamento' : 'material',\n", "    tipo: b.tipo === 'equipamento' ? 'equipamento' : 'material',\n    exige_termo: b.tipo === 'equipamento' ? false : !!b.exige_termo,\n"],
  ["i.unidade, i.tipo AS item_tipo,\n      s.name AS supplier_name", "i.unidade, i.tipo AS item_tipo, i.exige_termo AS item_exige_termo,\n      s.name AS supplier_name"],
  ["SELECT m.*, i.tipo AS item_tipo, i.nome AS item_nome FROM erp_estoque_movimentos m JOIN erp_estoque_itens i ON i.id = m.item_id\n    WHERE m.id = ANY($1::int[])", "SELECT m.*, i.tipo AS item_tipo, i.exige_termo AS item_exige_termo, i.nome AS item_nome FROM erp_estoque_movimentos m JOIN erp_estoque_itens i ON i.id = m.item_id\n    WHERE m.id = ANY($1::int[])"],
  ["if (envs.some(e => e.item_tipo !== 'equipamento')) return res.status(400).json({ error: 'O termo de responsabilidade é só para equipamentos.' });", "if (envs.some(e => e.item_tipo !== 'equipamento' && !e.item_exige_termo)) return res.status(400).json({ error: 'O termo de responsabilidade é só para equipamentos e itens marcados como \"exige termo\" (EPI, uniformes).' });"],
  ["SELECT m.id, m.data, m.quantidade, m.estado_saida,", "SELECT m.id, m.data, m.quantidade, m.tamanho, i.tipo AS item_tipo, m.estado_saida,"]
]);
aplica('public/app.js', [
  // lista de envios
  ["const equip = m.item_tipo === 'equipamento', st = ST[m.status] || ['off', m.status];", "const equip = m.item_tipo === 'equipamento', comTermo = equip || !!m.item_exige_termo, st = ST[m.status] || ['off', m.status];"],
  ["const termo = !equip ? '<small", "const termo = !comTermo ? '<small"],
  ["const selecionavel = equip && m.status !== 'devolvido' && !m.termo_id,", "const selecionavel = comTermo && m.status !== 'devolvido' && !m.termo_id,"],
  ["const vis = rows.filter(x => x.item_tipo === 'equipamento' && x.status !== 'devolvido' && !x.termo_id);", "const vis = rows.filter(x => (x.item_tipo === 'equipamento' || x.item_exige_termo) && x.status !== 'devolvido' && !x.termo_id);"],
  // detalhe do envio
  ["const edit = !READONLY, equip = m.item_tipo === 'equipamento';\n  const linha", "const edit = !READONLY, equip = m.item_tipo === 'equipamento', comTermo = equip || !!m.item_exige_termo;\n  const linha"],
  ["  if (equip) {\n    btns.push({ label: m.termo_id ? `Termo", "  if (comTermo) {\n    btns.push({ label: m.termo_id ? `Termo"],
  ["${equip ? linha('Termo assinado anexado',", "${comTermo ? linha('Termo assinado anexado',"],
  // modal do termo
  ["<strong>${envs.length} equipamento${envs.length > 1 ? 's' : ''}</strong> em um só termo. Depois de gerar, imprima, colha as assinaturas e anexe o termo assinado com o 📎: ele vale para todos os equipamentos do termo.", "<strong>${envs.length} ${envs.length > 1 ? 'itens' : 'item'}</strong> em um só termo. Depois de gerar, imprima, colha as assinaturas e anexe o termo assinado com o 📎: ele vale para todos os itens do termo."],
  ["<thead><tr><th>Equipamento</th><th>Nº de série</th><th>Estado na saída</th></tr></thead>", "<thead><tr><th>Item</th><th>Nº de série / tamanho</th><th>Estado na saída</th></tr></thead>"],
  ["<td>${esc(m.unidade_serie || '—')}</td><td>${m.estado_saida ? esc(m.estado_saida) : `<select class=\"tl-est\" data-id=\"${m.id}\">${SUP_ESTADOS.map(o => `<option value=\"${o.v}\">${o.t}</option>`).join('')}</select>`}</td>", "<td>${esc(m.unidade_serie || (m.tamanho ? 'Tam. ' + m.tamanho : '—'))}</td><td>${m.estado_saida ? esc(m.estado_saida) : `<select class=\"tl-est\" data-id=\"${m.id}\">${SUP_ESTADOS.map(o => `<option value=\"${o.v}\"${o.v === 'Novo' && m.item_tipo !== 'equipamento' ? ' selected' : ''}>${o.t}</option>`).join('')}</select>`}</td>"],
  ["if (!envs.length) return toast('Marque os equipamentos que vão no termo.');", "if (!envs.length) return toast('Marque os itens que vão no termo.');"],
  ["return toast('Os equipamentos do termo precisam ser do mesmo colaborador. Desmarque os de outras pessoas.');", "return toast('Os itens do termo precisam ser do mesmo colaborador. Desmarque os de outras pessoas.');"],
  ["return modalError('Escolha o estado de saída de todos os equipamentos.');", "return modalError('Escolha o estado de saída de todos os itens.');"],
  ["toast(`Termo ${supTermoNum(r.id)} gerado com ${r.itens} equipamento(s).`)", "toast(`Termo ${supTermoNum(r.id)} gerado com ${r.itens} item(ns).`)"],
  ["bt.title = n ? 'Reúne os equipamentos marcados em um só termo' : 'Marque, na primeira coluna, os equipamentos do mesmo colaborador';", "bt.title = n ? 'Reúne os itens marcados em um só termo' : 'Marque, na primeira coluna, os itens do mesmo colaborador (equipamentos, EPI e uniformes)';"],
  // formulário do item
  ["    ${fldArea('it-descricao', 'Descrição longa / técnica'", "    <label style=\"display:flex;align-items:center;gap:8px;margin:2px 0 10px\"><input type=\"checkbox\" id=\"it-exige-termo\" style=\"width:auto;margin:0\" ${i.exige_termo ? 'checked' : ''}> Exige termo de responsabilidade na entrega (EPI, uniformes). Equipamentos sempre exigem.</label>\n    ${fldArea('it-descricao', 'Descrição longa / técnica'"],
  ["nome: $('#it-nome').value, sku: $('#it-sku').value, tipo: $('#it-tipo').value,", "nome: $('#it-nome').value, sku: $('#it-sku').value, tipo: $('#it-tipo').value, exige_termo: $('#it-exige-termo').checked,"],
  // PDF: variante EPI / uniforme
  ["const c = t.colaborador || {}, itens = t.itens || [], numero = supTermoNum(t.id);", "const c = t.colaborador || {}, itens = t.itens || [], numero = supTermoNum(t.id);\n    const epi = itens.length > 0 && itens.every(i => i.item_tipo !== 'equipamento');   // termo só de EPI/uniforme: texto e inventário próprios"],
  ["doc.text('TERMO DE RESPONSABILIDADE E ENTREGA DE', M + 4, y + 22); doc.text('EQUIPAMENTO', M + 4, y + 28.5);", "doc.text('TERMO DE RESPONSABILIDADE E ENTREGA DE', M + 4, y + 22); doc.text(epi ? 'EPI E UNIFORME' : 'EQUIPAMENTO', M + 4, y + 28.5);"],
  ["doc.text('Administração de Equipamentos', M + 4, y + 33);", "doc.text(epi ? 'Administração de Suprimentos' : 'Administração de Equipamentos', M + 4, y + 33);"],
  ["secao('2.  INVENTÁRIO DE EQUIPAMENTOS ENTREGUES');", "secao(epi ? '2.  INVENTÁRIO DE ITENS ENTREGUES' : '2.  INVENTÁRIO DE EQUIPAMENTOS ENTREGUES');"],
  ["['Categoria', 'Fabricante', 'Modelo', 'Nº de série (S/N)', 'Patrimônio', 'Estado'].map(", "(epi ? ['Categoria', 'Fabricante', 'Item', 'Tamanho', 'Quantidade', 'Estado'] : ['Categoria', 'Fabricante', 'Modelo', 'Nº de série (S/N)', 'Patrimônio', 'Estado']).map("],
  ["body: [[v(i.subcategoria || i.categoria), v(i.marca), v(i.item_nome), v(i.serie), v(i.patrimonio), v(i.estado_saida)],\n          [{ content: 'Acessórios',", "body: [[v(i.subcategoria || i.categoria), v(i.marca), v(i.item_nome), epi ? v(i.tamanho) : v(i.serie), epi ? v(supNum(i.quantidade) + ' ' + (i.unidade || '')) : v(i.patrimonio), v(i.estado_saida)],\n          [{ content: epi ? 'Condição' : 'Acessórios',"],
  ["const avisos = ['O equipamento poderá", "const avisos = epi ? ['O EPI e o uniforme devem ser utilizados durante a jornada de trabalho, conforme a atividade desempenhada e as orientações da empresa.',\n      'Qualquer dano, desgaste ou perda que comprometa a proteção ou o uso deve ser comunicado imediatamente ao gestor ou à área de Suprimentos.',\n      'A substituição é feita mediante solicitação à área de Suprimentos, com a devolução do item danificado ou desgastado, quando aplicável.'] : ['O equipamento poderá"],
  ["const decl = 'Declaro ter recebido os equipamentos descritos", "const decl = epi ? 'Declaro ter recebido os itens descritos no inventário acima, nas condições indicadas, e estou ciente de que são fornecidos pela empresa para o exercício das minhas atividades profissionais.' : 'Declaro ter recebido os equipamentos descritos"],
  ["const politicas = ['O equipamento é de uso exclusivo", "const politicas = epi ? ['O EPI e o uniforme são de uso exclusivo nas atividades profissionais, sendo vedado cedê-los a terceiros ou alterá-los.',\n      'O colaborador compromete-se a usar, guardar e conservar o item conforme a orientação do fabricante e da empresa, e a comunicar qualquer alteração que o torne impróprio para uso (NR-6, no caso de EPI).',\n      'O colaborador deve solicitar a substituição quando o item estiver danificado, desgastado ou em tamanho inadequado.',\n      'O item deverá ser devolvido em caso de encerramento do vínculo empregatício, troca por novo item ou solicitação formal da organização, quando aplicável.',\n      'Danos por uso indevido ou extravio sem justificativa sujeitam o colaborador às medidas previstas no Regimento Interno e na legislação trabalhista vigente.'] : ['O equipamento é de uso exclusivo"],
  ["doc.text('Descreva a finalidade e o motivo da entrega dos equipamentos ao colaborador:'", "doc.text(epi ? 'Descreva a finalidade e o motivo da entrega dos itens ao colaborador:' : 'Descreva a finalidade e o motivo da entrega dos equipamentos ao colaborador:'"]
]);
console.log('ok');
