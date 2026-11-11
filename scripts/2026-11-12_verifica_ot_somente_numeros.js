// Propósito: verifica no backend (banco simulado) a regra "Nº da OT de Viáticos só aceita números": autosserviço (OT digitada x complementar com nome gerado)
//   e administrador (criar, e editar com OT antiga contendo letras: só passa se o valor não mudou).
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-12_verifica_ot_somente_numeros.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Fulano', email: 'f@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false },
            9: { id: 9, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, is_super: true, permissions: {}, must_change_password: false } };
const COLAB = { 1: { id: 7, usuario_id: 1, tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande' } };
const D = [{ uf: 'MT', municipio: 'Sorriso' }];
const SOL = { 41: { id: 41, colaborador_id: 7, ordem_trabalho: 'OT - 181', status: 'em_viagem', destinos: D, data_inicio: '2026-11-02', data_fim: '2026-11-10', motivo: 'Sinistro', categoria_local: 'interior', complementar_tipo: null } };
let INS = [], UPD = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE usuario_id=$1')) return [COLAB[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT tier, categoria_local, tipo_despesa, valor_diaria FROM erp_viaticos_tud')) return [];
  if (s.startsWith('SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim, data_inicio, motivo, categoria_local, complementar_tipo FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOL[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT ordem_trabalho FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOL[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2')) return INS.filter(i => i.ot.startsWith(p[1].replace(/\\([\\%_])/g, '$1').replace(/%$/, ''))).map(i => ({ id: i.id }));
  if (s.startsWith('INSERT INTO erp_viaticos_solicitacoes')) { INS.push({ id: 500 + INS.length, ot: p[3] }); return [{ id: 500 + INS.length - 1 }]; }
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET colaborador_id=$1')) { UPD.push({ ot: p[3] }); return []; }
  if (/erp_viaticos_solicitacoes/.test(s) && /^SELECT/.test(s)) return [];   // encerrarPendencias etc.
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const auto = { motivo: 'Comercial', objetivo: 'x', data_inicio: '2026-11-20', data_fim: '2026-11-22', destinos: [{ uf: 'SP', municipio: 'São Paulo' }], transporte_detalhes: { aviao: true }, previsao_por_categoria: { hospedagem: 100 } };
const adm = { colaborador_id: 7, tier: 'A', categoria_local: 'interior', destinos: D, motivo: 'Sinistro', data_inicio: '2026-11-20', data_fim: '2026-11-22', valor_liberado: 0 };
const MSG = /somente números/;
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r;
  for (const ot of ['12A', 'OT-123', '12 34', '12.5', '１２３abc']) { r = await chama(1, 'POST', '/api/viaticos/solicitacoes/autosservico', { ...auto, ordem_trabalho: ot }); ok(`autosserviço recusa OT "${ot}"`, r.status === 400 && MSG.test(r.body.error), r); }
  r = await chama(1, 'POST', '/api/viaticos/solicitacoes/autosservico', { ...auto, ordem_trabalho: '1234' });
  ok('autosserviço aceita OT "1234"', r.status === 200 && INS[INS.length - 1].ot === '1234', r);
  r = await chama(1, 'POST', '/api/viaticos/solicitacoes/autosservico', { ...auto, ordem_trabalho: 'lixo', complementar_tipo: 'extensao', solicitacao_pai_id: 41 });
  ok('complementar de OT antiga ("OT - 181"): o nome sai automático e NÃO é barrado pela regra numérica', r.status === 200 && INS[INS.length - 1].ot === 'OT - 181 - Complementar', [r, INS[INS.length - 1]]);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes', { ...adm, ordem_trabalho: 'AB12' });
  ok('administrador: criar com letras é recusado', r.status === 400 && MSG.test(r.body.error), r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes', { ...adm, ordem_trabalho: '77' });
  ok('administrador: criar com "77" passa', r.status === 200, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes', { ...adm, ordem_trabalho: '' });
  ok('administrador: OT em branco continua permitida (campo opcional ali)', r.status === 200, r);
  r = await chama(9, 'PUT', '/api/viaticos/solicitacoes/41', { ...adm, ordem_trabalho: 'OT - 181' });
  ok('administrador: editar OT antiga SEM mexer no nº ("OT - 181") continua funcionando', r.status === 200 && UPD[UPD.length - 1].ot === 'OT - 181', r);
  r = await chama(9, 'PUT', '/api/viaticos/solicitacoes/41', { ...adm, ordem_trabalho: 'OT - 182' });
  ok('administrador: trocar o nº por outro com letras é recusado', r.status === 400 && MSG.test(r.body.error), r);
  r = await chama(9, 'PUT', '/api/viaticos/solicitacoes/41', { ...adm, ordem_trabalho: '181' });
  ok('administrador: corrigir a OT antiga para só números ("181") passa', r.status === 200 && UPD[UPD.length - 1].ot === '181', r);
  r = await chama(9, 'PUT', '/api/viaticos/solicitacoes/41', { ...adm, ordem_trabalho: '42 - Complementar 2' });
  ok('administrador: nome de complementar gerado pelo sistema ("42 - Complementar 2") é aceito', r.status === 200, r);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
