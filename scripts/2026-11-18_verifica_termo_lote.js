// Propósito: verifica no backend (banco simulado em memória) o termo único de responsabilidade de Suprimentos: estado de saída obrigatório no envio de equipamento (e nada exigido para material),
//   criar o termo com vários equipamentos do mesmo colaborador (barra mistura de colaboradores, material, envio devolvido, envio que já está em termo; pede o estado dos envios antigos), consultar o termo
//   com os dados do colaborador, "Marcar entregue" aceitando o anexo do termo do lote, desfazer o termo (motivo, sem anexo, sem entregue) e excluir o último envio do termo apagando o termo.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-18_verifica_termo_lote.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Larissa', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { suprimentos: 'edit' }, must_change_password: false } };
const ITENS = { 1: { id: 1, nome: 'Notebook Asus', tipo: 'equipamento', unidade: 'un', grade_tamanhos: null, categoria: 'TI', subcategoria: 'Notebook', marca: 'Asus' },
                2: { id: 2, nome: 'Monitor AOC', tipo: 'equipamento', unidade: 'un', grade_tamanhos: null, categoria: 'TI', subcategoria: 'Monitor', marca: 'AOC' },
                3: { id: 3, nome: 'Caneta', tipo: 'material', unidade: 'un', grade_tamanhos: null } };
let MOVS, TERMOS, ANEXOS, UNIDS, INS, seq;
const reset = () => {
  MOVS = [
    { id: 10, item_id: 1, item_tipo: 'equipamento', item_nome: 'Notebook Asus', origem: 'envio', tipo: 'saida', colaborador_id: 5, status: 'enviado', termo_id: null, estado_saida: 'Novo', data: '2026-11-17', unidade_id: 1 },
    { id: 11, item_id: 2, item_tipo: 'equipamento', item_nome: 'Monitor AOC', origem: 'envio', tipo: 'saida', colaborador_id: 5, status: 'enviado', termo_id: null, estado_saida: null, data: '2026-11-17', unidade_id: 2 },
    { id: 12, item_id: 1, item_tipo: 'equipamento', item_nome: 'Notebook Asus', origem: 'envio', tipo: 'saida', colaborador_id: 6, status: 'enviado', termo_id: null, estado_saida: 'Usado', data: '2026-11-17', unidade_id: 3 },
    { id: 13, item_id: 3, item_tipo: 'material', item_nome: 'Caneta', origem: 'envio', tipo: 'saida', colaborador_id: 5, status: 'enviado', termo_id: null, estado_saida: null, data: '2026-11-17', unidade_id: null },
    { id: 14, item_id: 1, item_tipo: 'equipamento', item_nome: 'Notebook Asus', origem: 'envio', tipo: 'saida', colaborador_id: 5, status: 'devolvido', termo_id: null, estado_saida: 'Novo', data: '2026-11-01', unidade_id: 4 }
  ];
  TERMOS = []; ANEXOS = []; UNIDS = []; INS = []; seq = { t: 0 };
};
reset();
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  // ---- envio (POST /envios) ----
  if (s.startsWith('SELECT * FROM erp_estoque_itens WHERE id=$1')) return [ITENS[Number(p[0])]].filter(Boolean);
  if (s.startsWith('SELECT id FROM erp_colaboradores WHERE id=$1')) return [{ id: Number(p[0]) }];
  if (s.startsWith('SELECT * FROM erp_estoque_unidades WHERE item_id=$1 AND numero_serie=$2')) return [];
  if (s.startsWith('INSERT INTO erp_estoque_unidades')) { UNIDS.push(p); return [{ id: 90 }]; }
  if (s.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) return [{ q: 10 }];
  if (s.startsWith("INSERT INTO erp_estoque_movimentos")) { INS.push(p); return [{ id: 99 }]; }
  if (s.startsWith("UPDATE erp_estoque_unidades SET estado='em_custodia'")) return [];
  // ---- termos ----
  if (s.startsWith('SELECT m.*, i.tipo AS item_tipo, i.nome AS item_nome FROM erp_estoque_movimentos m JOIN erp_estoque_itens i')) return MOVS.filter(m => p[0].includes(m.id));
  if (s.startsWith('UPDATE erp_estoque_movimentos SET estado_saida=$1 WHERE id=$2')) { MOVS.find(m => m.id === p[1]).estado_saida = p[0]; return []; }
  if (s.startsWith('INSERT INTO erp_estoque_termos')) { const t = { id: ++seq.t, colaborador_id: p[0], justificativa: p[1], observacoes: p[2], emitido_por_nome: p[4] }; TERMOS.push(t); return [{ id: t.id }]; }
  if (s.startsWith('UPDATE erp_estoque_movimentos SET termo_id=$1 WHERE id = ANY')) { MOVS.filter(m => p[1].includes(m.id)).forEach(m => { m.termo_id = p[0]; }); return []; }
  if (s.startsWith('SELECT * FROM erp_estoque_termos WHERE id=$1')) return TERMOS.filter(t => t.id === Number(p[0]));
  if (s.startsWith('SELECT c.id, c.name, c.cpf')) return [{ id: 5, name: 'Alcenir de Amorim Fernandes Júnior', cpf: '055.621.389-05', cargo: 'Gerente de Campo', departamento: 'Campo', gestor: 'Fabricio Camargo de Lima', email_corporativo: 'a.fernandes@x.com' }];
  if (s.startsWith('SELECT m.id, m.data, m.quantidade, m.estado_saida')) return MOVS.filter(m => m.termo_id === Number(p[0])).map(m => ({ id: m.id, item_nome: m.item_nome, estado_saida: m.estado_saida, serie: 'S' + m.id }));
  if (s.startsWith("SELECT COUNT(*)::int AS n FROM erp_attachments WHERE entity_type='termo_lote' AND entity_id=$1")) return [{ n: ANEXOS.filter(a => a.termo === Number(p[0])).length }];
  if (s.startsWith("SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE termo_id=$1 AND status='entregue'")) return [{ n: MOVS.filter(m => m.termo_id === Number(p[0]) && m.status === 'entregue').length }];
  if (s.startsWith('UPDATE erp_estoque_movimentos SET termo_id=NULL WHERE termo_id=$1')) { MOVS.filter(m => m.termo_id === Number(p[0])).forEach(m => { m.termo_id = null; }); return []; }
  if (s.startsWith('DELETE FROM erp_estoque_termos WHERE id=$1')) { TERMOS = TERMOS.filter(t => t.id !== Number(p[0])); return []; }
  // ---- entregue ----
  if (s.startsWith("SELECT * FROM erp_estoque_movimentos WHERE id=$1 AND origem='envio'")) return MOVS.filter(m => m.id === Number(p[0]));
  if (s.startsWith('SELECT tipo FROM erp_estoque_itens WHERE id=$1')) return [{ tipo: 'equipamento' }];
  if (s.includes("FROM erp_attachments WHERE (entity_type='envio_termo' AND entity_id=$1) OR (entity_type='termo_lote' AND entity_id=$2)")) return [{ n: ANEXOS.filter(a => a.termo === p[1] || a.envio === p[0]).length }];
  if (s.startsWith("UPDATE erp_estoque_movimentos SET status='entregue'")) { MOVS.find(m => m.id === p[1]).status = 'entregue'; return []; }
  // ---- excluir envio ----
  if (s.startsWith("DELETE FROM erp_attachments WHERE entity_type='envio_termo'")) return [];
  if (s.startsWith('DELETE FROM erp_estoque_movimentos WHERE devolucao_de=$1')) return [];
  if (s.startsWith('DELETE FROM erp_estoque_movimentos WHERE id=$1')) { MOVS = MOVS.filter(m => m.id !== Number(p[0])); return []; }
  if (s.startsWith("UPDATE erp_estoque_unidades SET estado='em_estoque'")) return [];
  if (s.startsWith('SELECT COUNT(*)::int AS n FROM erp_estoque_movimentos WHERE termo_id=$1')) return [{ n: MOVS.filter(m => m.termo_id === Number(p[0])).length }];
  if (s.startsWith("DELETE FROM erp_attachments WHERE entity_type='termo_lote'")) { ANEXOS = ANEXOS.filter(a => a.termo !== Number(p[0])); return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 170));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const T = '/api/suprimentos/termos';
  // ---- estado de saída no envio ----
  let r = await chama(2, 'POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 5, numero_serie: 'SN1', data: '2026-11-18' });
  ok('envio de equipamento sem estado é recusado (400) antes de criar a unidade', r.status === 400 && /estado/i.test(r.body.error) && UNIDS.length === 0, [r, UNIDS]);
  r = await chama(2, 'POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 5, numero_serie: 'SN1', estado_saida: 'Quebrado' });
  ok('estado fora da lista é recusado (400)', r.status === 400, r);
  r = await chama(2, 'POST', '/api/suprimentos/envios', { item_id: 1, colaborador_id: 5, numero_serie: 'SN1', estado_saida: 'Seminovo', condicao_saida: 'carregador' });
  ok('envio com estado grava o estado antes do tamanho (200)', r.status === 200 && INS[0].includes('Seminovo') && INS[0].indexOf('Seminovo') === INS[0].length - 2, [r, INS]);
  r = await chama(2, 'POST', '/api/suprimentos/envios', { item_id: 3, colaborador_id: 5, quantidade: 2 });
  ok('material não exige estado (200)', r.status === 200, r);
  // ---- criar termo ----
  r = await chama(1, 'POST', T, { envio_ids: [10] }); ok('quem só lê não cria termo (403)', r.status === 403, r);
  r = await chama(2, 'POST', T, { envio_ids: [] }); ok('sem envios (400)', r.status === 400, r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 999] }); ok('envio inexistente (404)', r.status === 404, r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 13] }); ok('material no termo é recusado (400)', r.status === 400 && /equipamentos/.test(r.body.error), r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 14] }); ok('envio já devolvido é recusado (400)', r.status === 400 && /devolvido/.test(r.body.error), r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 12] }); ok('colaboradores diferentes no mesmo termo (400)', r.status === 400 && /mesmo colaborador/.test(r.body.error), r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 11] }); ok('envio antigo sem estado exige o estado (400)', r.status === 400 && /Monitor AOC/.test(r.body.error) && !MOVS.find(m => m.id === 10).termo_id, r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 11], estados: { 11: 'Quebrado' } }); ok('estado inválido no mapa (400)', r.status === 400, r);
  r = await chama(2, 'POST', T, { envio_ids: [10, 11], estados: { 11: 'Novo' }, justificativa: 'Equipamentos de campo', observacoes: 'Lote de abril' });
  ok('cria o termo com 2 equipamentos, preenche o estado que faltava e liga os envios', r.status === 200 && r.body.id === 1 && r.body.itens === 2 && MOVS.find(m => m.id === 11).estado_saida === 'Novo' && MOVS.filter(m => m.termo_id === 1).length === 2, [r, MOVS]);
  r = await chama(2, 'POST', T, { envio_ids: [10] }); ok('envio que já está em um termo (409) cita o número', r.status === 409 && /TR-0001/.test(r.body.error), r);
  // ---- consultar ----
  r = await chama(1, 'GET', `${T}/1`); ok('quem só lê não vê o termo (dados pessoais) (403)', r.status === 403, r);
  r = await chama(2, 'GET', `${T}/1`); ok('termo traz o colaborador (CPF, cargo, gestor) e os 2 equipamentos', r.status === 200 && r.body.colaborador.cpf === '055.621.389-05' && r.body.colaborador.gestor === 'Fabricio Camargo de Lima' && r.body.itens.length === 2 && r.body.justificativa === 'Equipamentos de campo', r);
  r = await chama(2, 'GET', `${T}/99`); ok('termo inexistente (404)', r.status === 404, r);
  // ---- marcar entregue com o anexo do termo ----
  r = await chama(2, 'POST', '/api/suprimentos/envios/10/status', { status: 'entregue' }); ok('entregue sem termo assinado anexado (400)', r.status === 400 && /termo/i.test(r.body.error), r);
  ANEXOS.push({ termo: 1 });
  r = await chama(2, 'POST', '/api/suprimentos/envios/10/status', { status: 'entregue' }); ok('com o anexo do termo do lote, entregue vale (200)', r.status === 200 && MOVS.find(m => m.id === 10).status === 'entregue', r);
  r = await chama(2, 'POST', '/api/suprimentos/envios/11/status', { status: 'entregue' }); ok('e o mesmo anexo vale para o outro equipamento do termo (200)', r.status === 200, r);
  // ---- desfazer ----
  r = await chama(2, 'POST', `${T}/1/desfazer`, { motivo: 'ab' }); ok('desfazer sem motivo (400)', r.status === 400, r);
  r = await chama(2, 'POST', `${T}/1/desfazer`, { motivo: 'Agrupados por engano' }); ok('com termo assinado anexado não desfaz (409)', r.status === 409 && /anexo/i.test(r.body.error), r);
  ANEXOS.length = 0;
  r = await chama(2, 'POST', `${T}/1/desfazer`, { motivo: 'Agrupados por engano' }); ok('com envio já entregue não desfaz (409)', r.status === 409 && /entregue/.test(r.body.error), r);
  MOVS.find(m => m.id === 10).status = 'enviado'; MOVS.find(m => m.id === 11).status = 'enviado';
  r = await chama(2, 'POST', `${T}/1/desfazer`, { motivo: 'Agrupados por engano' }); ok('desfaz o termo (200): envios soltos e termo apagado', r.status === 200 && MOVS.every(m => !m.termo_id) && TERMOS.length === 0, [r, MOVS, TERMOS]);
  // ---- excluir o último envio do termo apaga o termo ----
  r = await chama(2, 'POST', T, { envio_ids: [10] }); const id2 = r.body.id; ANEXOS.push({ termo: id2 });
  r = await chama(2, 'DELETE', '/api/suprimentos/envios/10'); ok('excluir o último envio do termo apaga o termo e o anexo dele', r.status === 200 && TERMOS.length === 0 && ANEXOS.length === 0, [r, TERMOS, ANEXOS]);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
