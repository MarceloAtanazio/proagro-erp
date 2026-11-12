// Propósito: verifica no backend (banco simulado) o prazo de comprovação de Viáticos: cálculo de 3 dias úteis (com fim de semana e família de OTs), campos comprov_* da lista,
//   a comprovação nunca trava; o colaborador com comprovação vencida fica sem nova solicitação e sem novo repasse (423); liberação só por administrador com justificativa.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-12_verifica_prazo_comprovacao.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Fulano', email: 'f@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'edit' }, must_change_password: false },
            9: { id: 9, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, is_super: true, permissions: {}, must_change_password: false } };
const TZ = 'America/Sao_Paulo', hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const soma = (iso, d) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd) + d * 864e5).toISOString().slice(0, 10); };
const uteis = (iso, n) => { let c = 0, x = iso; while (c < n) { x = soma(x, 1); const w = new Date(x + 'T12:00:00Z').getUTCDay(); if (w !== 0 && w !== 6) c++; } return x; };
const dif = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const base = o => ({ colaborador_id: 7, colaborador_name: 'Fulano', colaborador_cargo: 'X', valor_solicitado: 100, valor_liberado: 100, valor_devolvido: 0, valor_pendencia: 0, valor_comprovado: 0, tier: 'A', categoria_local: 'interior', destinos: [], previsao_por_categoria: {}, transporte_detalhes: {}, ...o });
const ROWS = [
  base({ id: 1, familia_raiz_id: 1, status: 'aguardando_comprovacao', data_inicio: soma(hoje, -22), data_fim: soma(hoje, -20) }),                                   // vencida há muito
  base({ id: 2, familia_raiz_id: 2, status: 'aguardando_comprovacao', data_inicio: soma(hoje, -3), data_fim: soma(hoje, -1) }),                                    // fim ontem
  base({ id: 3, familia_raiz_id: 3, status: 'aguardando_comprovacao', data_inicio: soma(hoje, -22), data_fim: soma(hoje, -20), comprovacao_liberada_em: '2026-11-10T10:00:00Z', comprovacao_liberada_por: 'Admin', comprovacao_liberada_motivo: 'Atestado' }),
  base({ id: 4, familia_raiz_id: 4, status: 'aguardando_comprovacao', data_inicio: soma(hoje, -30), data_fim: soma(hoje, -25) }),                                  // raiz da família
  base({ id: 5, familia_raiz_id: 4, status: 'aguardando_comprovacao', data_inicio: soma(hoje, -2), data_fim: hoje, solicitacao_pai_id: 4 }),                       // complementar termina hoje: estica o prazo da família
  base({ id: 6, familia_raiz_id: 6, status: 'comprovado', data_inicio: soma(hoje, -22), data_fim: soma(hoje, -20), comprov_fechada_dia: soma(hoje, -1) }),          // fechada com atraso
  base({ id: 7, familia_raiz_id: 7, status: 'comprovado', data_inicio: soma(hoje, -22), data_fim: soma(hoje, -20), comprov_fechada_dia: uteis(soma(hoje, -20), 2) }), // fechada no prazo
  base({ id: 8, familia_raiz_id: 8, status: 'comprovado', data_inicio: soma(hoje, -22), data_fim: soma(hoje, -20), comprov_fechada_dia: null }),                    // antiga, sem data
  base({ id: 9, familia_raiz_id: 9, status: 'em_viagem', data_inicio: soma(hoje, -1), data_fim: soma(hoje, 2) }),
];
let ESTADO = { liberada: false }, INSD = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE usuario_id=$1')) return [{ id: 7, usuario_id: 1 }];
  if (s.includes('UPDATE erp_viaticos_solicitacoes s SET status = a.novo')) return [];
  if (s.includes('AS comprov_fechada_dia')) return ROWS;
  if (s.includes('SELECT raiz_id FROM fam WHERE id=$1')) { const r = ROWS.find(x => x.id === Number(p[0])); return r ? [{ raiz_id: r.familia_raiz_id }] : []; }
  if (s.includes('SELECT id FROM fam WHERE raiz_id=$1')) return ROWS.filter(x => x.familia_raiz_id === Number(p[0])).map(x => ({ id: x.id }));
  if (s.includes('AS lib, (SELECT MAX(m.data_fim)')) {   // comprovacaoBloqueada
    const raiz = ROWS.find(x => x.id === Number(p[0])), fam = ROWS.filter(x => x.familia_raiz_id === raiz.id), fim = fam.map(x => x.data_fim).sort().pop();
    return [{ status: raiz.status, lib: ESTADO.liberada || raiz.comprovacao_liberada_em || null, fim }];
  }
  if (s.startsWith('SELECT solicitacao_id FROM erp_viaticos_despesas WHERE id=$1')) return [{ solicitacao_id: 1 }];
  if (s.startsWith('INSERT INTO erp_viaticos_despesas')) { INSD.push(p); return [{ id: 900 }]; }
  if (s.startsWith('UPDATE erp_viaticos_despesas')) return [];
  if (s.startsWith('DELETE FROM erp_viaticos_despesas WHERE id=$1')) return [];
  if (s.startsWith('DELETE FROM erp_viaticos_despesas WHERE solicitacao_id')) return [];
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET comprovacao_liberada_em=NOW()')) { ESTADO.liberada = true; ESTADO.motivo = p[2]; ESTADO.por = p[1]; return [{ id: p[0] }]; }
  if (s.includes('FROM erp_viaticos_solicitacoes WHERE id=$1') && s.startsWith('SELECT *')) return [ROWS.find(x => x.id === Number(p[0]))].filter(Boolean);
  if (s.includes('r.comprovacao_liberada_em IS NULL')) return ROWS.filter(x => x.familia_raiz_id === x.id && x.status === 'aguardando_comprovacao' && !x.comprovacao_liberada_em && !(x.id === 1 && ESTADO.liberada)).map(x => ({ id: x.id, ordem_trabalho: String(x.id), fim: ROWS.filter(m => m.familia_raiz_id === x.id).map(m => m.data_fim).sort().pop() }));
  if (s.startsWith('SELECT colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1')) return [{ colaborador_id: 7 }];
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true')) { if (p.length === 3) ESTADO.repasse = p[1]; return []; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r = await chama(9, 'GET', '/api/viaticos/solicitacoes');
  ok('lista responde 200', r.status === 200 && Array.isArray(r.body), r);
  const L = id => r.body.find(x => x.id === id);
  const prazo1 = uteis(soma(hoje, -20), 3);
  ok('OT 1 (fim há 20 dias): prazo = 3 dias úteis depois do fim; em atraso e bloqueada', L(1).comprov_prazo === prazo1 && L(1).comprov_dias === dif(hoje, prazo1) && L(1).comprov_atraso === dif(prazo1, hoje) && L(1).comprov_bloqueada === true, L(1));
  const prazo2 = uteis(soma(hoje, -1), 3), d2 = dif(hoje, prazo2);
  ok('OT 2 (fim ontem): prazo correto, ' + d2 + ' dia(s) restantes, não bloqueada', L(2).comprov_prazo === prazo2 && L(2).comprov_dias === d2 && L(2).comprov_bloqueada === false && L(2).comprov_atraso === 0, L(2));
  ok('OT 3 liberada: continua em atraso mas NÃO bloqueada, com quem liberou e o motivo', L(3).comprov_atraso > 0 && L(3).comprov_bloqueada === false && L(3).comprov_liberada === true && L(3).comprov_liberada_por === 'Admin' && L(3).comprov_liberada_motivo === 'Atestado', L(3));
  const prazoFam = uteis(hoje, 3);
  ok('família: o prazo conta do fim da ÚLTIMA OT (complementar termina hoje) — raiz e complementar iguais, sem bloqueio', L(4).comprov_prazo === prazoFam && L(5).comprov_prazo === prazoFam && !L(4).comprov_bloqueada && !L(5).comprov_bloqueada, [L(4), L(5)]);
  const prazo6 = uteis(soma(hoje, -20), 3);
  ok('OT 6 fechada ontem: atraso = entrega − prazo; tempo = entrega − fim', L(6).comprov_atraso === dif(prazo6, soma(hoje, -1)) && L(6).comprov_tempo === 19 && L(6).comprov_bloqueada === false, L(6));
  ok('OT 7 fechada no prazo: atraso 0', L(7).comprov_atraso === 0 && L(7).comprov_tempo === dif(soma(hoje, -20), uteis(soma(hoje, -20), 2)), L(7));
  ok('OT 8 antiga sem data de fechamento: sem entrega/atraso (fica fora das médias)', L(8).comprov_entrega === undefined && L(8).comprov_atraso === undefined, L(8));
  ok('OT 9 em viagem: sem prazo', L(9).comprov_prazo === null && L(9).comprov_bloqueada === false, L(9));
  const desp = { categoria: 'alimentacao', data: soma(hoje, -21), valor: 50, descricao: 'x' };
  const MSG = /comprovação em atraso/i;
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/1/despesas', desp);
  ok('comprovação vencida NÃO trava: lançar despesa passa', r.status === 200 && INSD.length === 1, r);
  r = await chama(9, 'PUT', '/api/viaticos/despesas/55', desp); ok('comprovação vencida: editar despesa passa', r.status === 200, r);
  r = await chama(9, 'DELETE', '/api/viaticos/despesas/55'); ok('comprovação vencida: apagar despesa passa', r.status === 200, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/1/reprovadas', { data: hoje, valor: 10, descricao: 'x', categoria: 'outro' }); ok('comprovação vencida: lançar reprovada não é barrado por atraso', r.status !== 423, r);
  const auto = { motivo: 'Comercial', objetivo: 'x', data_inicio: soma(hoje, 10), data_fim: soma(hoje, 12), destinos: [{ uf: 'SP', municipio: 'São Paulo' }], transporte_detalhes: { aviao: true }, previsao_por_categoria: { hospedagem: 100 } };
  r = await chama(1, 'POST', '/api/viaticos/solicitacoes/autosservico', { ...auto, ordem_trabalho: '321' });
  ok('colaborador com comprovação vencida NÃO consegue fazer nova solicitação (423 + mensagem)', r.status === 423 && MSG.test(r.body.error), r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/2/status', { status: 'transferencia_agendada', valor_liberado: 500 });
  ok('repasse (valor liberado) bloqueado para colaborador com comprovação vencida (423)', r.status === 423 && /repasse/.test(r.body.error) && !ESTADO.repasse, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/2/status', { status: 'em_viagem' });
  ok('mudar status sem repasse não é barrado', r.status === 200, r);
  r = await chama(1, 'POST', '/api/viaticos/solicitacoes/1/liberar-comprovacao', { motivo: 'Atestado médico' }); ok('usuário comum NÃO consegue liberar (403)', r.status === 403 && !ESTADO.liberada, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/1/liberar-comprovacao', { motivo: '  ' }); ok('liberar exige justificativa (400)', r.status === 400 && !ESTADO.liberada, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/1/liberar-comprovacao', { motivo: 'Atestado médico do colaborador' }); ok('administrador libera com justificativa (200) e o nome fica gravado', r.status === 200 && ESTADO.liberada && ESTADO.por === 'Admin' && /Atestado/.test(ESTADO.motivo), [r, ESTADO]);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/2/status', { status: 'transferencia_agendada', valor_liberado: 500 });
  ok('depois de liberado: o repasse passa', r.status === 200 && ESTADO.repasse === 500, [r, ESTADO]);
  r = await chama(1, 'POST', '/api/viaticos/solicitacoes/autosservico', { ...auto, ordem_trabalho: '321' });
  ok('depois de liberado: nova solicitação não é mais barrada por atraso', r.status !== 423, r);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
