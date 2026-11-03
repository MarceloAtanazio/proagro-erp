// CNH no dossiê: pendência amarela (branda), não é falta; "não possui" resolve; não trava o candidato.
const path = require('path');
const ROOT = process.argv[2];
process.env.JWT_SECRET = 'teste-local';
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'RH só vê', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { rh: 'view' }, must_change_password: false } };
const SEM_CNH = ['rg', 'cpf', 'certidao', 'titulo_eleitor', 'pis', 'ctps', 'reservista', 'comprovante_endereco', 'diploma', 'aso', 'contrato_assinado'];
const colab = (extra = {}) => ({ id: 5, name: 'Fulano', nome_social: null, ativo: true, usuario_id: null, sexo: 'M', email_corporativo: null, celular: null, cpf: '1', banco_numero: '260', agencia: '1', conta: '2', nao_possui_cnh: false,
  arquivado_em: null, arquivado_motivo: null, vinculo_id: 9, tipo: 'clt', matricula: '5', admissao: '2026-03-09', desligamento: null, cargo: 'X', nivel: null, departamento: 'Y', regime: 'regular', modelo_trabalho: 'presencial',
  experiencia_fim: null, prorrogacao_fim: null, salario: 1, periculosidade_pct: null, vr_dia: 1, home_office_dia: null, docs: 11, tipos: SEM_CNH, ...extra });
let LISTA = [], UPDS = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => Number(v || 0), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT c.id, c.name, c.nome_social, c.ativo, c.usuario_id, c.sexo')) { if (!/c\.nao_possui_cnh/.test(s)) throw new Error('a lista não traz nao_possui_cnh'); return LISTA; }
  if (s.startsWith('SELECT a.*, c.name AS colaborador_nome')) { if (!/c\.nao_possui_cnh/.test(s)) throw new Error('o quadro não traz nao_possui_cnh'); return LISTA; }
  if (s.startsWith('SELECT regime, modelo_trabalho, slots FROM erp_rh_minutas')) return [];
  if (s.startsWith('SELECT situacao, count(*)::int AS n FROM erp_rh_admissoes')) return [];
  if (s.startsWith('UPDATE erp_colaboradores SET nao_possui_cnh=$1 WHERE id=$2 RETURNING id')) { UPDS.push([p[0], p[1]]); return p[1] === 404 ? [] : [{ id: p[1] }]; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const req = async (quem, m, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r, l;
  LISTA = [colab()];
  r = await req(1, 'GET', '/api/rh/colaboradores'); l = r.body[0];
  ok('sem CNH: NÃO é falta — a lista não mostra nada faltando', r.status === 200 && l.checklist_faltam.length === 0, l);
  ok('...aparece como pendente (amarelo): CNH', JSON.stringify(l.checklist_pendentes) === JSON.stringify(['CNH']), l.checklist_pendentes);
  ok('...a barra de documentos fecha (a pendência branda não derruba o total)', l.checklist_ok === l.checklist_total && l.checklist_total === 13, [l.checklist_ok, l.checklist_total]);
  LISTA = [colab({ nao_possui_cnh: true })];
  r = await req(1, 'GET', '/api/rh/colaboradores'); l = r.body[0];
  ok('declarado "não possui": nada pendente nem faltando', l.checklist_faltam.length === 0 && l.checklist_pendentes.length === 0, l);
  LISTA = [colab({ tipos: [...SEM_CNH, 'cnh'] })];
  r = await req(1, 'GET', '/api/rh/colaboradores'); l = r.body[0];
  ok('com a CNH anexada: nada pendente', l.checklist_faltam.length === 0 && l.checklist_pendentes.length === 0, l);
  LISTA = [colab({ tipos: SEM_CNH.filter(x => x !== 'rg') })];
  r = await req(1, 'GET', '/api/rh/colaboradores'); l = r.body[0];
  ok('falta de verdade (RG) continua falta, e a CNH fica à parte como pendente', JSON.stringify(l.checklist_faltam) === JSON.stringify(['RG']) && JSON.stringify(l.checklist_pendentes) === JSON.stringify(['CNH']), l);

  // candidato em admissão: sem CNH não trava a Documentação
  LISTA = [{ ...colab({ ativo: false, tipos: SEM_CNH.filter(x => x !== 'aso' && x !== 'contrato_assinado') }), id: 7, colaborador_nome: 'Candidato', etapa: 'documentacao', situacao: 'andamento', tipos_avaliacao: [], admissao_prevista: '2026-12-01', cargo_pretendido: 'X' }];
  r = await req(1, 'GET', '/api/rh/admissoes'); const card = r.body && r.body.cards && r.body.cards[0];
  ok('candidato sem CNH: a Documentação não exige a CNH', r.status === 200 && card && !(card.pendencias || []).some(p => /CNH/.test(p)), card && card.pendencias);
  ok('...e o indicador do card fica completo (11 de 11)', card && card.checklist_ok === card.checklist_total && card.checklist_total === 11, card && [card.checklist_ok, card.checklist_total]);

  // rota de declaração
  r = await req(1, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'cnh', nao_possui: true });
  ok('declara "não possui CNH"', r.status === 200 && r.body.nao_possui === true && JSON.stringify(UPDS.at(-1)) === JSON.stringify([true, 5]), [r, UPDS]);
  r = await req(1, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'cnh', nao_possui: false });
  ok('...e desfaz', r.status === 200 && r.body.nao_possui === false && UPDS.at(-1)[0] === false, r);
  r = await req(1, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'cnh', nao_possui: 'true' });
  ok('só o booleano true declara', r.body.nao_possui === false, r);
  r = await req(1, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'rg', nao_possui: true });
  ok('outros documentos não aceitam a declaração (400)', r.status === 400, r);
  r = await req(1, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'id; DROP TABLE x', nao_possui: true });
  ok('nome de documento estranho não escolhe coluna (400)', r.status === 400, r);
  r = await req(1, 'PUT', '/api/rh/colaboradores/404/declaracao-documento', { doc: 'cnh', nao_possui: true });
  ok('colaborador inexistente: 404', r.status === 404, r);
  r = await req(2, 'PUT', '/api/rh/colaboradores/5/declaracao-documento', { doc: 'cnh', nao_possui: true });
  ok('quem só visualiza RH não declara (403)', r.status === 403, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
