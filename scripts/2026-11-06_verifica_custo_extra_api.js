// Propósito: verifica a OT de custo extra no backend (POST /api/viaticos/solicitacoes/autosservico com complementar_tipo='custo_extra'), com o banco simulado.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-06_verifica_custo_extra_api.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const U = { 1: { id: 1, name: 'Fulano', email: 'f@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false },
            2: { id: 2, name: 'Outro', email: 'o@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false } };
const COLAB = { 1: { id: 7, usuario_id: 1, tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande' },
                2: { id: 8, usuario_id: 2, tier: 'A', ativo: true, cidade_base_uf: 'MS', cidade_base_municipio: 'Campo Grande' } };
const D = [{ uf: 'MT', municipio: 'Sorriso' }, { uf: 'MT', municipio: 'Sinop' }];
const sol = (id, colab, ot, status, extra = {}) => ({ id, colaborador_id: colab, ordem_trabalho: ot, status, destinos: D, data_inicio: '2026-11-02', data_fim: '2026-11-10', motivo: 'Sinistro', categoria_local: 'interior', complementar_tipo: null, ...extra });
const SOL = { 41: sol(41, 7, '41', 'em_viagem'), 42: sol(42, 7, '42', 'comprovado'), 43: sol(43, 8, '43', 'em_viagem'), 45: sol(45, 7, '45', 'aguardando_comprovacao'),
              46: sol(46, 7, '41 - Custo extra', 'em_viagem', { complementar_tipo: 'custo_extra' }), 47: sol(47, 7, '47', 'liberado', { data_inicio: '2099-01-01', data_fim: '2099-01-05', motivo: null }) };
let INS = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE usuario_id=$1')) return [COLAB[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT tier, categoria_local, tipo_despesa, valor_diaria FROM erp_viaticos_tud')) return [];
  if (s.startsWith('SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim, data_inicio, motivo, categoria_local, complementar_tipo FROM erp_viaticos_solicitacoes WHERE id=$1')) return [SOL[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2')) return INS.filter(i => i.colab === p[0] && i.ot.startsWith(p[1].replace(/\\([\\%_])/g, '$1').replace(/%$/, ''))).map(i => ({ id: i.id }));
  if (s.startsWith('INSERT INTO erp_viaticos_solicitacoes')) {
    const r = { id: 500 + INS.length, colab: p[0], cat_local: p[2], ot: p[3], destinos: JSON.parse(p[4]), motivo: p[5], objetivo: p[6], ini: p[7], fim: p[8], total: p[9], cat: JSON.parse(p[10]), transp: JSON.parse(p[11]), pai: p[14], tipo: p[15], ce: p[18] };
    INS.push(r); return [{ id: r.id }];
  }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const post = async (quem, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/viaticos/solicitacoes/autosservico`, { method: 'POST', headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const base = { complementar_tipo: 'custo_extra', custo_extra_tipo: 'remarcacao_aviao', custo_extra_valor: 450, custo_extra_justificativa: 'Passagem comprada com a data errada', ordem_trabalho: 'LIXO', data_inicio: '2000-01-01', data_fim: '2000-01-02', motivo: 'Comercial', objetivo: 'x', destinos: [{ uf: 'SP', municipio: 'São Paulo' }], transporte_detalhes: { aviao: true } };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r; const ult = () => INS[INS.length - 1];

  // uma complementar comum primeiro: não pode consumir a numeração do custo extra
  r = await post(1, { complementar_tipo: 'extensao', solicitacao_pai_id: 41, ordem_trabalho: 'x', motivo: 'Sinistro', objetivo: 'x', data_inicio: '2000-01-01', data_fim: '2026-11-12', destinos: [], transporte_detalhes: {} });
  ok('(controle) complementar comum continua funcionando', r.status === 200 && ult().ot === '41 - Complementar', r);

  r = await post(1, { ...base, solicitacao_pai_id: 41, previsao_por_categoria: { hospedagem: 9999 } });
  ok('remarcação de passagem aérea: aceita, sem exigir transporte nem destino', r.status === 200 && r.body.ok, r);
  ok('...número "41 - Custo extra" (a numeração da complementar comum não interfere)', ult().ot === '41 - Custo extra', ult());
  ok('...previsão = só o valor informado, na categoria passagem_aviao (o que o navegador mandou em previsao_por_categoria é ignorado)', JSON.stringify(ult().cat) === '{"passagem_aviao":450}' && ult().total === 450, ult());
  ok('...grava a origem, o tipo complementar e o tipo do custo', ult().pai === 41 && ult().tipo === 'custo_extra' && ult().ce === 'remarcacao_aviao', ult());
  ok('...destinos e categoria de local = os da OT de origem (imposto pelo servidor)', JSON.stringify(ult().destinos) === JSON.stringify(D) && ult().cat_local === 'interior', ult());
  ok('...período = o da OT de origem (02/11 a 10/11), esticado até hoje só se preciso', ult().ini === (hoje < '2026-11-02' ? hoje : '2026-11-02') && ult().fim === (hoje > '2026-11-10' ? hoje : '2026-11-10'), ult());
  ok('...sem transporte gravado e objetivo descreve o custo', JSON.stringify(ult().transp) === '{}' && ult().objetivo === 'Custo extra — Remarcação de passagem aérea: Passagem comprada com a data errada', ult());
  ok('...motivo herdado da OT de origem', ult().motivo === 'Sinistro', ult());

  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_valor: '450.5' });
  ok('segunda do mesmo tipo: "41 - Custo extra 2" e valor em texto numérico é aceito (R$ 450,50)', r.status === 200 && ult().ot === '41 - Custo extra 2' && ult().total === 450.5, [r, ult()]);

  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'bagagem', custo_extra_valor: 80 });
  ok('bagagem extra entra na categoria "outro"', r.status === 200 && JSON.stringify(ult().cat) === '{"outro":80}', [r, ult()]);
  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'pedagio', custo_extra_valor: 30 });
  ok('pedágio extra entra em "pedagio"', r.status === 200 && JSON.stringify(ult().cat) === '{"pedagio":30}', [r, ult()]);
  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'remarcacao_onibus', custo_extra_valor: 60 });
  ok('remarcação de ônibus entra em "passagem_onibus"', r.status === 200 && JSON.stringify(ult().cat) === '{"passagem_onibus":60}', [r, ult()]);

  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'outro', custo_extra_valor: 25 });
  ok('"Outro custo" sem descrição é recusado', r.status === 400 && /Descreva/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'outro', custo_extra_descricao: 'troca de nome no bilhete', custo_extra_valor: 25 });
  ok('"Outro custo" com descrição: aceito e a descrição vai para o objetivo', r.status === 200 && /\(troca de nome no bilhete\)/.test(ult().objetivo) && ult().ce === 'outro', [r, ult()]);

  for (const [rot, v] of [['zero', 0], ['negativo', -10], ['texto', 'abc'], ['vazio', ''], ['acima do limite (R$ 50.001)', 50001]]) {
    r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_valor: v });
    ok('valor ' + rot + ' é recusado', r.status === 400 && /valor/i.test(r.body.error), r);
  }
  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_justificativa: '  ' });
  ok('sem justificativa é recusado', r.status === 400 && /Explique/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 41, custo_extra_tipo: 'viagem_a_lua' });
  ok('tipo de custo inválido é recusado', r.status === 400 && /tipo do custo/.test(r.body.error), r);

  r = await post(1, { ...base, solicitacao_pai_id: 45 });
  ok('OT de origem aguardando comprovação: o custo extra vale (multa/taxa chegam depois)', r.status === 200 && ult().pai === 45, r);
  r = await post(1, { ...base, solicitacao_pai_id: 45, complementar_tipo: 'extensao', data_fim: '2026-11-20', destinos: [], transporte_detalhes: {} });
  ok('...mas estender ou novo destino numa OT já encerrada continua recusado', r.status === 400 && /em curso/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 42 });
  ok('OT de origem já comprovada: recusada', r.status === 400 && /liberada, em viagem ou aguardando/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 46 });
  ok('não se pede custo extra a partir de outra OT de custo extra', r.status === 400 && /não tem complementar/.test(r.body.error), r);
  r = await post(1, { ...base, solicitacao_pai_id: 43 });
  ok('OT de OUTRO colaborador: 404', r.status === 404, r);
  r = await post(1, { ...base, solicitacao_pai_id: 999 });
  ok('OT inexistente: 404', r.status === 404, r);

  r = await post(1, { ...base, solicitacao_pai_id: 47 });
  ok('OT de origem futura (liberada, ainda não começou) e motivo vazio nela: aceita; período começa hoje e vai ao fim da origem', r.status === 200 && ult().ini === hoje && ult().fim === '2099-01-05' && ult().motivo === 'Comercial', [r, ult()]);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
