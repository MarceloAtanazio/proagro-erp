// Propósito: verifica no backend (banco simulado) a troca de aluguel para carro próprio em Viáticos: só admin/quem edita, justificativa obrigatória, só em
//   "aguardando comprovação", grava troca_veiculo e carro_proprio sem mexer no valor liberado, km previsto = soma do aluguel, aviso de documento do veículo sem bloquear,
//   e depois da troca o km "alugado" é recusado (409) enquanto o km "próprio" é aceito.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-16_verifica_trocar_carro_proprio.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false },
            2: { id: 2, name: 'Editor', email: 'e@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'edit' }, must_change_password: false },
            9: { id: 9, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, is_super: true, permissions: {}, must_change_password: false } };
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const soma = (iso, d) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd) + d * 864e5).toISOString().slice(0, 10); };
const SOL = (id, status, t) => ({ id, colaborador_id: 7, status, data_inicio: soma(hoje, -8), data_fim: soma(hoje, -3), valor_liberado: 5595.96, transporte_detalhes: t });
const T_ALUG = () => ({ aluguel_carro: true, alugueis: [{ valor_diaria: '440,00', dias: 5, distancia_km: 900, combustivel_valor: 995.96 }, { valor_diaria: 0, dias: 0, distancia_km: 100 }] });
let SOLS = {}, KM_ALUG = false, UPD = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOLS[Number(p[0])]].filter(Boolean);
  if (s.startsWith("SELECT 1 FROM erp_viaticos_km WHERE solicitacao_id=$1 AND modelo='alugado'")) return KM_ALUG ? [{ '?column?': 1 }] : [];
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET transporte_detalhes=$2 WHERE id=$1')) { UPD.push(p); SOLS[Number(p[0])].transporte_detalhes = JSON.parse(p[1]); return []; }
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE id=$1')) return [{ id: 7, cnh_numero: '1', cnh_validade: '2099-01-01', veiculo_crlv_validade: null, veiculo_seguro_validade: null }];
  if (s.startsWith('SELECT colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1')) return [{ colaborador_id: 7 }];
  if (s.includes('FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOLS[Number(p[0])]].filter(Boolean);
  if (s.includes('FROM erp_colaboradores WHERE usuario_id')) return [];
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, metodo, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: metodo, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const rota = id => `/api/viaticos/solicitacoes/${id}/trocar-carro-proprio`;
  SOLS = { 180: SOL(180, 'aguardando_comprovacao', T_ALUG()), 181: SOL(181, 'comprovado', T_ALUG()), 182: SOL(182, 'aguardando_comprovacao', { carro_proprio: true }), 183: SOL(183, 'aguardando_comprovacao', T_ALUG()) };
  let r = await chama(1, 'POST', rota(180), { motivo: 'locadora sem carro' });
  ok('quem só lê é barrado (403)', r.status === 403, r);
  r = await chama(9, 'POST', rota(180), { motivo: 'ab' });
  ok('justificativa curta é recusada (400)', r.status === 400, r);
  r = await chama(9, 'POST', rota(181), { motivo: 'locadora sem carro' });
  ok('viagem já comprovada não troca (409)', r.status === 409, r);
  r = await chama(9, 'POST', rota(182), { motivo: 'locadora sem carro' });
  ok('viagem sem aluguel não troca (409)', r.status === 409, r);
  KM_ALUG = true; r = await chama(9, 'POST', rota(183), { motivo: 'locadora sem carro' });
  ok('com km de alugado já lançado não troca (409)', r.status === 409, r); KM_ALUG = false;
  r = await chama(2, 'POST', rota(180), { motivo: 'Locadora sem veículo disponível na retirada' });
  ok('editor troca com justificativa (200)', r.status === 200 && r.body.ok, r);
  ok('km previsto = soma do aluguel (1000)', r.body && r.body.km_previsto === 1000, r.body);
  ok('valor do aluguel mantido informado (2200)', r.body && r.body.aluguel_valor_mantido === 2200, r.body);
  ok('avisa documento do veículo pendente sem bloquear', r.status === 200 && Array.isArray(r.body.avisos) && r.body.avisos.length > 0, r.body);
  const t = SOLS[180].transporte_detalhes;
  ok('gravou carro_proprio e troca_veiculo, manteve aluguel', t.carro_proprio === true && t.aluguel_carro === true && t.troca_veiculo && t.troca_veiculo.por === 'Editor' && t.alugueis.length === 2, t);
  ok('rota própria sem custos duplicados', t.carro_proprio_rota.combustivel_valor === 0 && t.carro_proprio_rota.distancia_km === 1000, t.carro_proprio_rota);
  ok('valor liberado intocado (só transporte_detalhes foi atualizado)', UPD.length === 1 && SOLS[180].valor_liberado === 5595.96, UPD);
  r = await chama(9, 'POST', rota(180), { motivo: 'de novo' });
  ok('segunda troca é recusada (409)', r.status === 409, r);
  r = await chama(9, 'POST', '/api/viaticos/solicitacoes/180/km', { modelo: 'alugado', km_inicial: 1, km_final: 100 });
  ok('km "alugado" depois da troca é recusado (409)', r.status === 409 && /carro próprio/.test(r.body.error), r);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
