// Propósito: verifica no backend (banco simulado em memória) a Requisição de Compra de Suprimentos: permissões, validações (solicitante, justificativa, itens, tamanho da grade, orçamento), fluxo
//   em cotação -> enviada -> aprovada/reprovada -> reaberta -> comprada, escolha de orçamento com justificativa obrigatória (não é o menor valor ou é o único), congelamento depois de enviada
//   (orçamentos, edição e anexos), remover o orçamento escolhido desfaz a escolha, cancelar e excluir com justificativa e a linha do tempo.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-18_verifica_requisicao_compra.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
const ESTOQUE = { 1: { id: 1, nome: 'Camisa polo', unidade: 'un', grade_tamanhos: ['P', 'M', 'G'] }, 2: { id: 2, nome: 'Caneta', unidade: 'un', grade_tamanhos: null } };
let R = [], IT = [], O = [], EV = [], DEL = [], seq = { r: 0, o: 0 };
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
const ult = (arr, id) => arr.find(x => x.id === Number(id));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT id, name FROM erp_colaboradores WHERE id=$1')) return Number(p[0]) === 7 ? [{ id: 7, name: 'Arthur Albani' }] : [];
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [ESTOQUE[Number(p[0])]].filter(Boolean);
  if (s.startsWith('SELECT id, name FROM erp_suppliers WHERE id=$1')) return Number(p[0]) === 5 ? [{ id: 5, name: 'Distribuidora EPI' }] : [];
  if (s.startsWith('INSERT INTO erp_compra_requisicoes')) { const r = { id: ++seq.r, data_solicitacao: p[0], solicitante_id: p[1], solicitante_nome: p[2], titulo: p[3], justificativa: p[4], urgencia: p[5], status: 'em_cotacao', orcamento_escolhido_id: null, created_by: p[6] }; R.push(r); return [{ id: r.id }]; }
  if (s.startsWith('SELECT * FROM erp_compra_requisicoes WHERE id=$1')) return R.filter(r => r.id === Number(p[0]));
  if (s.startsWith('DELETE FROM erp_compra_req_itens')) { IT = IT.filter(i => i.requisicao_id !== Number(p[0])); return []; }
  if (s.startsWith('INSERT INTO erp_compra_req_itens')) { IT.push({ requisicao_id: p[0], item_id: p[1], descricao: p[2], tamanho: p[3], quantidade: p[4] }); return []; }
  if (s.startsWith('INSERT INTO erp_compra_req_eventos')) { EV.push({ requisicao_id: p[0], evento: p[1], detalhe: p[2], usuario_nome: p[4] }); return []; }
  if (s.startsWith('UPDATE erp_compra_requisicoes SET solicitante_id=$1')) { Object.assign(ult(R, p[6]), { solicitante_id: p[0], solicitante_nome: p[1], titulo: p[2], justificativa: p[3], urgencia: p[4] }); return []; }
  if (s.startsWith('UPDATE erp_compra_requisicoes SET orcamento_escolhido_id=$1')) { Object.assign(ult(R, p[3]), { orcamento_escolhido_id: p[0], justificativa_escolha: p[1], escolhido_por: p[2] }); return []; }
  if (s.startsWith('UPDATE erp_compra_requisicoes SET orcamento_escolhido_id=NULL')) { Object.assign(ult(R, p[0]), { orcamento_escolhido_id: null, justificativa_escolha: null }); return []; }
  if (s.startsWith("UPDATE erp_compra_requisicoes SET status='em_aprovacao'")) { ult(R, p[0]).status = 'em_aprovacao'; return []; }
  if (s.startsWith('UPDATE erp_compra_requisicoes SET status=$1, decidido_por=$2')) { Object.assign(ult(R, p[4]), { status: p[0], decidido_por_nome: p[2], decisao_motivo: p[3] }); return []; }
  if (s.startsWith("UPDATE erp_compra_requisicoes SET status='em_cotacao'")) { Object.assign(ult(R, p[0]), { status: 'em_cotacao', decidido_por_nome: null, decisao_motivo: null }); return []; }
  if (s.startsWith("UPDATE erp_compra_requisicoes SET status='comprada'")) { Object.assign(ult(R, p[3]), { status: 'comprada', comprada_em: p[0], compra_documento: p[1] }); return []; }
  if (s.startsWith("UPDATE erp_compra_requisicoes SET status='cancelada'")) { Object.assign(ult(R, p[1]), { status: 'cancelada', cancelada_motivo: p[0] }); return []; }
  if (s.startsWith('INSERT INTO erp_compra_req_orcamentos')) { const o = { id: ++seq.o, requisicao_id: p[0], supplier_id: p[1], fornecedor_nome: p[2], valor_total: p[3], prazo_entrega_dias: p[4] }; O.push(o); return [{ id: o.id }]; }
  if (s.startsWith('SELECT * FROM erp_compra_req_orcamentos WHERE id=$1 AND requisicao_id=$2')) return O.filter(o => o.id === Number(p[0]) && o.requisicao_id === Number(p[1]));
  if (s.startsWith('UPDATE erp_compra_req_orcamentos SET supplier_id=$1')) { Object.assign(ult(O, p[7]), { supplier_id: p[0], fornecedor_nome: p[1], valor_total: p[2] }); return []; }
  if (s.startsWith("DELETE FROM erp_attachments WHERE entity_type='rc_orcamento'")) { DEL.push(p[0]); return []; }
  if (s.startsWith('DELETE FROM erp_compra_req_orcamentos WHERE id=$1')) { O = O.filter(o => o.id !== Number(p[0])); return []; }
  if (s.startsWith('SELECT id, fornecedor_nome, valor_total FROM erp_compra_req_orcamentos WHERE requisicao_id=$1')) return O.filter(o => o.requisicao_id === Number(p[0]));
  if (s.startsWith('SELECT id FROM erp_compra_req_orcamentos WHERE requisicao_id=$1')) return O.filter(o => o.requisicao_id === Number(p[0])).map(o => ({ id: o.id }));
  if (s.startsWith('DELETE FROM erp_compra_requisicoes WHERE id=$1')) { R = R.filter(r => r.id !== Number(p[0])); return []; }
  if (s.startsWith('SELECT r.status FROM erp_compra_req_orcamentos o JOIN erp_compra_requisicoes r')) { const o = ult(O, p[0]); return o ? [{ status: ult(R, o.requisicao_id).status }] : []; }
  if (s.startsWith('SELECT * FROM erp_compra_req_itens WHERE requisicao_id=$1')) return IT.filter(i => i.requisicao_id === Number(p[0]));
  if (s.startsWith('SELECT o.*, (SELECT COUNT(*)')) return O.filter(o => o.requisicao_id === Number(p[0])).map(o => ({ ...o, anexos: 0 }));
  if (s.startsWith('SELECT * FROM erp_compra_req_eventos WHERE requisicao_id=$1')) return EV.filter(e => e.requisicao_id === Number(p[0]));
  if (s.startsWith('SELECT r.*, (SELECT COUNT(*)')) return R.map(r => ({ ...r, itens_qtd: IT.filter(i => i.requisicao_id === r.id).length, orcamentos_qtd: O.filter(o => o.requisicao_id === r.id).length }));
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 170));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const base = { solicitante_id: 7, titulo: 'Reposição de uniformes', justificativa: 'Estoque zerado e novos colaboradores', urgencia: 'alta', itens: [{ descricao: 'Bota de segurança nº 40', quantidade: 6 }] };
  const A = '/api/suprimentos/requisicoes';
  // ---- permissões e validações ----
  let r = await chama(1, 'POST', A, base); ok('quem só lê não cria (403)', r.status === 403, r);
  r = await chama(1, 'GET', A); ok('quem só lê consegue listar (200)', r.status === 200 && Array.isArray(r.body), r);
  r = await chama(2, 'POST', A, { ...base, solicitante_id: 99 }); ok('solicitante inexistente (400)', r.status === 400, r);
  r = await chama(2, 'POST', A, { ...base, solicitante_id: null, solicitante_nome: '' }); ok('sem solicitante (400)', r.status === 400, r);
  r = await chama(2, 'POST', A, { ...base, justificativa: 'ok' }); ok('justificativa curta (400)', r.status === 400 && /justificativa/i.test(r.body.error), r);
  r = await chama(2, 'POST', A, { ...base, itens: [] }); ok('sem itens (400)', r.status === 400, r);
  r = await chama(2, 'POST', A, { ...base, itens: [{ descricao: 'X', quantidade: 0 }] }); ok('quantidade zero (400)', r.status === 400, r);
  r = await chama(2, 'POST', A, { ...base, itens: [{ item_id: 1, quantidade: 3 }] }); ok('item com grade sem tamanho (400)', r.status === 400 && /tamanho/i.test(r.body.error), r);
  r = await chama(2, 'POST', A, { ...base, itens: [{ item_id: 1, quantidade: 3, tamanho: 'XG' }] }); ok('tamanho fora da grade (400)', r.status === 400, r);
  r = await chama(2, 'POST', A, { ...base, itens: [{ item_id: 1, quantidade: 3, tamanho: 'm' }, { item_id: 2, quantidade: 10 }, { descricao: 'Capa de chuva', quantidade: 2 }] });
  ok('cria com item do estoque (tamanho M), item sem grade e item livre', r.status === 200 && IT.filter(i => i.requisicao_id === r.body.id).length === 3 && IT.find(i => i.tamanho === 'M'), [r, IT]);
  r = await chama(2, 'POST', A, base); const id = r.body.id;
  ok('cria requisição e registra o evento "criada"', r.status === 200 && EV.some(e => e.requisicao_id === id && e.evento === 'criada'), [r, EV]);
  // ---- orçamentos ----
  const O1 = `${A}/${id}/orcamentos`;
  r = await chama(2, 'POST', O1, { fornecedor_nome: 'Loja A', valor_total: 0 }); ok('orçamento sem valor (400)', r.status === 400, r);
  r = await chama(2, 'POST', O1, { valor_total: 100 }); ok('orçamento sem fornecedor (400)', r.status === 400, r);
  r = await chama(2, 'POST', O1, { supplier_id: 99, valor_total: 100 }); ok('fornecedor inexistente (400)', r.status === 400, r);
  r = await chama(2, 'POST', O1, { fornecedor_nome: 'Loja A', valor_total: 1200, prazo_entrega_dias: 10 }); const oA = r.body.id;
  r = await chama(2, 'POST', O1, { supplier_id: 5, valor_total: 980.5 }); const oB = r.body.id;
  ok('fornecedor do cadastro usa o nome dele', O.find(o => o.id === oB).fornecedor_nome === 'Distribuidora EPI', O);
  r = await chama(2, 'POST', O1, { fornecedor_nome: 'Loja C', valor_total: 1500 }); const oC = r.body.id;
  r = await chama(2, 'POST', `${A}/${id}/enviar-aprovacao`); ok('enviar sem escolher orçamento (409)', r.status === 409, r);
  // ---- escolha ----
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: oA }); ok('escolher quem NÃO é o menor valor sem justificativa (400)', r.status === 400 && /menor valor/.test(r.body.error), r);
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: oA, justificativa: 'Prazo de entrega menor e fornecedor homologado' }); ok('escolher com justificativa (200)', r.status === 200 && r.body.justificativa_obrigatoria === true, r);
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: oB }); ok('escolher o menor valor dispensa a justificativa (200)', r.status === 200 && r.body.justificativa_obrigatoria === false && ult(R, id).orcamento_escolhido_id === oB, [r, R]);
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: 999 }); ok('orçamento de outra requisição/inexistente (400)', r.status === 400, r);
  // remover o escolhido desfaz a escolha
  r = await chama(2, 'DELETE', `${O1}/${oC}`); ok('remove orçamento não escolhido (200) e limpa os anexos dele', r.status === 200 && DEL.includes(oC), [r, DEL]);
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: oB });
  // ---- editar orçamento / requisição ----
  r = await chama(2, 'PUT', `${O1}/${oA}`, { fornecedor_nome: 'Loja A', valor_total: 1100 }); ok('edita orçamento em cotação (200)', r.status === 200 && ult(O, oA).valor_total === 1100, r);
  r = await chama(2, 'PUT', `${A}/${id}`, { ...base, titulo: 'Reposição de uniformes 2026' }); ok('edita a requisição em cotação (200)', r.status === 200 && ult(R, id).titulo === 'Reposição de uniformes 2026', r);
  // ---- envio e congelamento ----
  r = await chama(2, 'POST', `${A}/${id}/enviar-aprovacao`); ok('envia para aprovação (200)', r.status === 200 && ult(R, id).status === 'em_aprovacao', r);
  r = await chama(2, 'POST', O1, { fornecedor_nome: 'Loja D', valor_total: 50 }); ok('depois de enviada não aceita orçamento novo (409)', r.status === 409, r);
  r = await chama(2, 'PUT', `${A}/${id}`, base); ok('nem edição da requisição (409)', r.status === 409, r);
  r = await chama(2, 'DELETE', `${O1}/${oA}`); ok('nem remover orçamento (409)', r.status === 409, r);
  r = await chama(2, 'POST', `/api/attachments/rc_orcamento/${oA}`, { file_name: 'o.pdf', mime_type: 'application/pdf', data: 'JVBERi0x' }); ok('anexo de orçamento congelado depois de enviada (409)', r.status === 409 && /congelados/.test(r.body.error), r);
  r = await chama(2, 'POST', `${A}/${id}/escolher`, { orcamento_id: oA, justificativa: 'trocar de ideia' }); ok('nem trocar a escolha (409)', r.status === 409, r);
  // ---- decisão ----
  r = await chama(2, 'POST', `${A}/${id}/decidir`, { aprovar: false }); ok('reprovar sem motivo (400)', r.status === 400, r);
  r = await chama(2, 'POST', `${A}/${id}/decidir`, { aprovar: false, motivo: 'Orçamento acima do previsto para o trimestre' }); ok('reprova com motivo (200)', r.status === 200 && ult(R, id).status === 'reprovada', r);
  r = await chama(2, 'POST', `${A}/${id}/decidir`, { aprovar: true }); ok('decidir de novo (409)', r.status === 409, r);
  r = await chama(2, 'POST', `${A}/${id}/reabrir`, { motivo: 'x' }); ok('reabrir sem motivo (400)', r.status === 400, r);
  r = await chama(2, 'POST', `${A}/${id}/reabrir`, { motivo: 'Negociar valor com o fornecedor' }); ok('reabre para cotação (200)', r.status === 200 && ult(R, id).status === 'em_cotacao', r);
  r = await chama(2, 'POST', `${A}/${id}/comprar`, {}); ok('comprar antes de aprovar (409)', r.status === 409, r);
  r = await chama(2, 'POST', `${A}/${id}/enviar-aprovacao`); r = await chama(2, 'POST', `${A}/${id}/decidir`, { aprovar: true, motivo: 'Aprovado dentro do orçamento' });
  ok('aprova (200) e guarda quem aprovou', r.status === 200 && ult(R, id).status === 'aprovada' && ult(R, id).decidido_por_nome === 'Larissa', [r, R]);
  r = await chama(2, 'POST', `${A}/${id}/excluir`, { motivo: 'engano de lançamento' }); ok('não exclui requisição aprovada (409)', r.status === 409, r);
  r = await chama(2, 'POST', `${A}/${id}/comprar`, { data: '2026-11-20', documento: '040854' }); ok('marca como comprada (200)', r.status === 200 && ult(R, id).status === 'comprada' && ult(R, id).compra_documento === '040854', [r, R]);
  r = await chama(2, 'POST', `${A}/${id}/cancelar`, { motivo: 'cancelar depois de comprar' }); ok('não cancela requisição já comprada (409)', r.status === 409, r);
  // ---- detalhe e linha do tempo ----
  r = await chama(1, 'GET', `${A}/${id}`);
  const eventos = r.body.eventos.map(e => e.evento);
  ok('detalhe traz itens, orçamentos e a linha do tempo completa', r.status === 200 && r.body.itens.length === 1 && r.body.orcamentos.length === 2
    && ['criada', 'orcamento_adicionado', 'orcamento_escolhido', 'enviada_aprovacao', 'reprovada', 'reaberta', 'aprovada', 'comprada'].every(e => eventos.includes(e)), [r.body.orcamentos.length, eventos]);
  // ---- caso do orçamento único ----
  r = await chama(2, 'POST', A, base); const id2 = r.body.id;
  r = await chama(2, 'POST', `${A}/${id2}/orcamentos`, { fornecedor_nome: 'Única Ltda', valor_total: 300 }); const oU = r.body.id;
  r = await chama(2, 'POST', `${A}/${id2}/escolher`, { orcamento_id: oU }); ok('orçamento único exige justificativa (400)', r.status === 400 && /único|Só há um/.test(r.body.error), r);
  r = await chama(2, 'POST', `${A}/${id2}/escolher`, { orcamento_id: oU, justificativa: 'Fornecedor exclusivo da marca' });
  r = await chama(2, 'DELETE', `${A}/${id2}/orcamentos/${oU}`); ok('remover o orçamento escolhido desfaz a escolha', r.status === 200 && ult(R, id2).orcamento_escolhido_id === null, [r, R]);
  // ---- cancelar e excluir ----
  r = await chama(2, 'POST', `${A}/${id2}/cancelar`, { motivo: 'Não é mais necessário' }); ok('cancela com motivo (200)', r.status === 200 && ult(R, id2).status === 'cancelada', r);
  r = await chama(2, 'POST', `${A}/${id2}/excluir`, { motivo: 'ab' }); ok('excluir sem justificativa (400)', r.status === 400, r);
  r = await chama(2, 'POST', `${A}/${id2}/excluir`, { motivo: 'requisição lançada em duplicidade' }); ok('exclui requisição cancelada com justificativa e devolve o resumo para a auditoria', r.status === 200 && /RC \d+/.test(r.body.resumo) && !ult(R, id2), r);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
