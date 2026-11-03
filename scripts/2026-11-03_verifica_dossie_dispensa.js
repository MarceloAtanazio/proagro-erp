// (1) ASO e contrato assinado obrigatórios no dossiê, sem travar o candidato; (2) dispensa de CNH/CRLV/seguro em Viáticos.
const path = require('path'), fs = require('fs');
const ROOT = process.argv[2];
process.env.JWT_SECRET = 'teste-local';
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'Leitor viáticos', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'view' }, must_change_password: false } };
const ONZE = ['rg', 'cpf', 'certidao', 'cnh', 'titulo_eleitor', 'pis', 'ctps', 'reservista', 'comprovante_endereco', 'diploma'];  // + dados bancários por campos
const colab = (extra = {}) => ({ id: 5, name: 'Fulano', nome_social: null, ativo: true, usuario_id: null, sexo: 'M', email_corporativo: null, celular: null, cpf: '1', banco_numero: '260', agencia: '1', conta: '2',
  arquivado_em: null, arquivado_motivo: null, vinculo_id: 9, tipo: 'clt', matricula: '5', admissao: '2026-03-09', desligamento: null, cargo: 'X', nivel: null, departamento: 'Y', regime: 'regular', modelo_trabalho: 'presencial',
  experiencia_fim: null, prorrogacao_fim: null, salario: 1, periculosidade_pct: null, vr_dia: 1, home_office_dia: null, docs: 10, tipos: ONZE, ...extra });
let LISTA = [], PUTS = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => Number(v || 0), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('SELECT c.id, c.name, c.nome_social, c.ativo, c.usuario_id, c.sexo')) return LISTA;
  if (s.startsWith('SELECT a.*, c.name AS colaborador_nome')) return LISTA;
  if (s.startsWith('SELECT regime, modelo_trabalho, slots FROM erp_rh_minutas')) return [];
  if (s.startsWith('SELECT situacao, count(*)::int AS n FROM erp_rh_admissoes')) return [];
  if (s.startsWith('UPDATE erp_colaboradores SET dispensa_cnh_veiculo=$1 WHERE id=$2 RETURNING id')) { PUTS.push([p[0], p[1]]); return String(p[1]) === '404' ? [] : [{ id: Number(p[1]) }]; }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const req = async (quem, m, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

// regra de direção, extraída do código real (api/index.js)
const fonte = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
const ini = fonte.indexOf('function viaBloqueiosDirecao(colab) {'); const fim = fonte.indexOf('function viaRecalcularPrevisao', ini);
const viaBloqueiosDirecao = new Function('hojeISO', fonte.slice(ini, fim) + '\nreturn viaBloqueiosDirecao;')(() => '2026-11-03');

(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r;
  // ---------- 1. dossiê ----------
  LISTA = [colab()];
  r = await req(1, 'GET', '/api/rh/colaboradores');
  ok('colaborador com os documentos de antes mas SEM ASO e contrato: faltam exatamente esses dois', r.status === 200 && JSON.stringify(r.body[0].checklist_faltam) === JSON.stringify(['ASO (saúde ocupacional)', 'Contrato de trabalho assinado']), r.body && r.body[0]);
  ok('...o total do checklist passou de 11 para 13', r.body[0].checklist_total === 13 && r.body[0].checklist_ok === 11, r.body[0]);
  LISTA = [colab({ tipos: [...ONZE, 'aso'] })];
  r = await req(1, 'GET', '/api/rh/colaboradores');
  ok('com o ASO anexado, falta só o contrato assinado', JSON.stringify(r.body[0].checklist_faltam) === JSON.stringify(['Contrato de trabalho assinado']), r.body[0].checklist_faltam);
  LISTA = [colab({ tipos: [...ONZE, 'aso', 'contrato_assinado'] })];
  r = await req(1, 'GET', '/api/rh/colaboradores');
  ok('com os dois anexados, o dossiê fica completo', r.body[0].checklist_faltam.length === 0 && r.body[0].checklist_ok === 13, r.body[0]);
  LISTA = [colab({ sexo: 'F', tipos: ONZE.filter(x => x !== 'reservista') })];
  r = await req(1, 'GET', '/api/rh/colaboradores');
  ok('mulher não precisa de reservista: 12 itens e faltam só ASO e contrato', r.body[0].checklist_total === 12 && r.body[0].checklist_faltam.length === 2, r.body[0]);

  // candidato em admissão: NÃO é cobrado do que ainda não existe
  LISTA = [{ ...colab({ ativo: false }), id: 7, colaborador_nome: 'Candidato', etapa: 'documentacao', situacao: 'andamento', regime: 'regular', modelo_trabalho: 'presencial', tipos_avaliacao: [], admissao_prevista: '2026-12-01', cargo_pretendido: 'X', cpf: '1' }];
  r = await req(1, 'GET', '/api/rh/admissoes');
  const card = r.body && r.body.cards && r.body.cards[0];
  ok('quadro de admissão: o checklist do candidato continua com 11 itens (sem ASO e contrato)', r.status === 200 && card && card.checklist_total === 11 && card.checklist_ok === 11, card && [card.checklist_total, card.checklist_ok]);
  ok('...e a etapa Documentação NÃO exige ASO nem contrato assinado', card && !(card.pendencias || []).some(p => /ASO|Contrato de trabalho assinado/.test(p)), card && card.pendencias);

  // ---------- 2. dispensa ----------
  r = await req(1, 'PUT', '/api/colaboradores/5/dispensa-cnh-veiculo', { dispensa: true });
  ok('admin dispensa o cadastro de CNH/CRLV/seguro', r.status === 200 && r.body.dispensa === true && PUTS.at(-1)[0] === true && PUTS.at(-1)[1] === '5', [r, PUTS]);
  r = await req(1, 'PUT', '/api/colaboradores/5/dispensa-cnh-veiculo', { dispensa: false });
  ok('...e reativa', r.status === 200 && r.body.dispensa === false && PUTS.at(-1)[0] === false, r);
  r = await req(1, 'PUT', '/api/colaboradores/5/dispensa-cnh-veiculo', { dispensa: 'true' });
  ok('só o booleano true dispensa (texto "true" não liga a dispensa)', r.body.dispensa === false, r);
  r = await req(1, 'PUT', '/api/colaboradores/404/dispensa-cnh-veiculo', { dispensa: true });
  ok('colaborador inexistente: 404', r.status === 404, r);
  r = await req(2, 'PUT', '/api/colaboradores/5/dispensa-cnh-veiculo', { dispensa: true });
  ok('quem só visualiza Viáticos não altera (403)', r.status === 403, r);

  const completo = { cnh_numero: '12345678900', cnh_validade: '2027-05-05', motorista_apto: true, veiculo_placa: 'ABC1D23', veiculo_modelo: 'Gol', veiculo_consumo_kml: 12, veiculo_crlv_validade: '2027-05-05',
    veiculo_possui_seguro: true, veiculo_seguradora: 'X', veiculo_apolice: '1', veiculo_seguro_validade: '2027-05-05', veiculo_apto: true };
  let h = viaBloqueiosDirecao(completo);
  ok('regra de direção: cadastro completo continua liberado (carro próprio e aluguel)', h.podeAlugar && h.podeCarroProprio, h);
  h = viaBloqueiosDirecao({});
  ok('...cadastro vazio continua bloqueado como antes', !h.podeAlugar && !h.podeCarroProprio && h.cnh.length > 0, h);
  h = viaBloqueiosDirecao({ ...completo, dispensa_cnh_veiculo: true });
  ok('DISPENSADO: carro próprio e aluguel indisponíveis, mesmo com o cadastro completo guardado', !h.podeAlugar && !h.podeCarroProprio && /desativado/.test(h.cnh[0]) && /desativado/.test(h.proprio[0]), h);
  h = viaBloqueiosDirecao({ dispensa_cnh_veiculo: true });
  ok('DISPENSADO sem nenhum dado: mensagem de cadastro desativado (e não a lista de campos faltando)', h.cnh.length === 1 && /desativado/.test(h.cnh[0]), h);
  h = viaBloqueiosDirecao({ ...completo, dispensa_cnh_veiculo: false });
  ok('dispensa DESLIGADA volta a valer a regra normal', h.podeAlugar && h.podeCarroProprio, h);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
