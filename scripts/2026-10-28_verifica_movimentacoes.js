// Propósito: verificar as movimentações de carreira (promoção, mérito, dissídio) — vigência passada, atual e futura, aplicação, histórico, duplicidade e permissões.
// Entrada: raiz do projeto (argv[2]); usa um banco simulado. Saída: PASS/FALHA. Uso: node scripts/2026-10-28_verifica_movimentacoes.js <raiz>
// Promoção/dissídio com vigência passada, atual e futura; aplicação, histórico, duplicidade e permissões.
const path = require('path'); const ROOT = process.argv[2]; process.env.JWT_SECRET = 'teste-local';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'RH sem remuneração', email: 'rh@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { rh: 'edit' }, must_change_password: false },
  3: { id: 3, name: 'RH com remuneração', email: 'rh2@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { rh: 'edit', rh_remuneracao: 'edit' }, must_change_password: false } };
const COLAB = { 16: { id: 16, name: 'Diego', usuario_id: null }, 6: { id: 6, name: 'Marcelo', usuario_id: null }, 40: { id: 40, name: 'Novo', usuario_id: null } };
const VINC = {
  5: { id: 5, colaborador_id: 16, admissao: '2026-03-09', cargo: 'Coordenador(a) de Subscrição', departamento: 'Subscrição', salario: 14845.41, periculosidade_pct: null, vr_dia: 31, home_office_dia: null, desligamento: null },
  2: { id: 2, colaborador_id: 6, admissao: '2026-03-09', cargo: 'Coordenador(a) Administrativo(a)', departamento: 'Administrativo', salario: 13466.1, periculosidade_pct: null, vr_dia: 31, home_office_dia: null, desligamento: null },
  9: { id: 9, colaborador_id: 40, admissao: '2026-09-15', cargo: 'Técnico(a) de Campo', departamento: 'Campo', salario: 8236.53, desligamento: null } };
const HIST = [
  { id: 1, vinculo_id: 5, vigencia_inicio: '2026-03-09', salario: 14845.41, motivo: 'Vigência inicial' },
  { id: 2, vinculo_id: 2, vigencia_inicio: '2026-03-09', salario: 13466.1, motivo: 'Vigência inicial' },
  { id: 3, vinculo_id: 9, vigencia_inicio: '2026-09-15', salario: 8236.53, motivo: 'Vigência inicial' }];
const MOV = []; let seq = 0;
const d10 = x => String(x).slice(0, 10);
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => Number(v || 0), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (s.startsWith('INSERT INTO erp_audit_log')) return [];
  if (s.startsWith('SELECT id, usuario_id FROM erp_colaboradores WHERE id')) return [COLAB[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT * FROM erp_rh_vinculos WHERE colaborador_id=$1 AND desligamento IS NULL')) return Object.values(VINC).filter(v => v.colaborador_id === p[0] && !v.desligamento);
  if (s.startsWith('SELECT v.id, v.admissao, v.salario, c.name FROM erp_rh_vinculos')) return Object.values(VINC).filter(v => v.colaborador_id === p[0] && !v.desligamento).map(v => ({ ...v, name: COLAB[v.colaborador_id].name }));
  if (s.startsWith('SELECT 1 FROM erp_rh_movimentacoes WHERE vinculo_id=$1 AND tipo=$2')) return MOV.filter(m => m.vinculo_id === p[0] && m.tipo === p[1] && d10(m.vigencia_inicio) === p[2] && m.status !== 'cancelada');
  if (s.startsWith("SELECT 1 FROM erp_rh_movimentacoes WHERE vinculo_id=$1 AND tipo='dissidio'")) return MOV.filter(m => m.vinculo_id === p[0] && m.tipo === 'dissidio' && d10(m.vigencia_inicio) === p[1] && m.status !== 'cancelada');
  if (s.startsWith('INSERT INTO erp_rh_movimentacoes')) {
    const dis = s.includes("'dissidio'");
    const m = dis
      ? { vinculo_id: p[0], colaborador_id: p[1], tipo: 'dissidio', vigencia_inicio: p[2], salario_novo: p[3], percentual: p[4], motivo: p[5], registrado_por: p[6] }
      : { vinculo_id: p[0], colaborador_id: p[1], tipo: p[2], vigencia_inicio: p[3], cargo_novo: p[4], departamento_novo: p[5], salario_novo: p[6], percentual: p[7], motivo: p[8], registrado_por: p[9] };
    MOV.push({ id: ++seq, status: 'agendada', ...m }); return [{ id: seq }];
  }
  if (s.startsWith("SELECT id FROM erp_rh_movimentacoes WHERE status='agendada' AND vigencia_inicio <= $1")) return MOV.filter(m => m.status === 'agendada' && d10(m.vigencia_inicio) <= p[0]).sort((a, b) => d10(a.vigencia_inicio).localeCompare(d10(b.vigencia_inicio)) || a.id - b.id);
  if (s.startsWith("UPDATE erp_rh_movimentacoes SET status='aplicada'")) { const m = MOV.find(x => x.id === p[0] && x.status === 'agendada'); if (!m) return []; m.status = 'aplicada'; return [m]; }
  if (s.startsWith('SELECT * FROM erp_rh_vinculos WHERE id=$1')) return [VINC[p[0]]].filter(Boolean);
  if (s.startsWith('SELECT max(vigencia_inicio) AS d FROM erp_rh_salario_hist')) { const l = HIST.filter(h => h.vinculo_id === p[0]).map(h => d10(h.vigencia_inicio)).sort(); return [{ d: l[l.length - 1] || null }]; }
  if (s.startsWith('SELECT salario FROM erp_rh_salario_hist WHERE vinculo_id=$1 AND vigencia_inicio <= $2')) { const l = HIST.filter(h => h.vinculo_id === p[0] && d10(h.vigencia_inicio) <= p[1]).sort((a, b) => d10(b.vigencia_inicio).localeCompare(d10(a.vigencia_inicio)) || b.id - a.id); return l.slice(0, 1); }
  if (s.startsWith('UPDATE erp_rh_movimentacoes SET salario_anterior=$2')) { const m = MOV.find(x => x.id === p[0]); Object.assign(m, { salario_anterior: p[1], cargo_anterior: p[2], departamento_anterior: p[3] }); return []; }
  if (s.startsWith('UPDATE erp_rh_vinculos SET cargo=COALESCE')) { const v = VINC[p[0]]; if (p[1]) v.cargo = p[1]; if (p[2]) v.departamento = p[2]; if (p[3] != null) v.salario = p[3]; return []; }
  if (s.startsWith('INSERT INTO erp_rh_salario_hist')) { HIST.push({ id: HIST.length + 1, vinculo_id: p[0], vigencia_inicio: p[1], salario: p[2], motivo: p[6] }); return []; }
  if (s.startsWith("UPDATE erp_rh_movimentacoes SET status='cancelada', obs='Cancelada")) { const m = MOV.find(x => x.id === p[0] && x.status === 'agendada'); if (!m) return []; m.status = 'cancelada'; return [{ id: m.id }]; }
  if (s.startsWith("UPDATE erp_rh_movimentacoes SET status='cancelada', obs=$2")) { MOV.find(x => x.id === p[0]).status = 'cancelada'; return []; }
  if (s.startsWith("UPDATE erp_rh_movimentacoes SET status='agendada', aplicada_em=NULL")) { MOV.find(x => x.id === p[0]).status = 'agendada'; return []; }
  if (s.includes('FROM erp_rh_movimentacoes m WHERE m.colaborador_id=$1')) return MOV.filter(m => m.colaborador_id === p[0] && m.status !== 'cancelada');
  if (s.includes('FROM erp_rh_vinculos v JOIN erp_colaboradores c ON c.id = v.colaborador_id WHERE v.desligamento IS NULL')) return Object.values(VINC).map(v => ({ colaborador_id: v.colaborador_id, vinculo_id: v.id, name: COLAB[v.colaborador_id].name, cargo: v.cargo, salario: v.salario }));
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 140));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
let QUEM = 3;
const req = async (m, rota, corpo) => {
  const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: `proagro_token=${jwt.sign({ sub: QUEM, role: U[QUEM].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r;
  QUEM = 2; r = await req('POST', '/api/rh/dissidio', { vigencia_inicio: '2026-08-01', motivo: 'Dissídio', itens: [{ colaborador_id: 16, salario_novo: 15154.19 }] });
  ok('RH sem permissão de remuneração não registra dissídio (403)', r.status === 403, r);
  r = await req('GET', '/api/rh/dissidio/base'); ok('...nem vê a base de salários (403)', r.status === 403, r);
  QUEM = 3;
  r = await req('GET', '/api/rh/dissidio/base'); ok('com remuneração vê a base', r.status === 200 && r.body.length === 3, r);
  r = await req('POST', '/api/rh/dissidio', { vigencia_inicio: '2026-08-01', motivo: 'Dissídio EAA 2025/2026', itens: [{ colaborador_id: 16, salario_novo: 15154.19, percentual: 2.08 }, { colaborador_id: 6, salario_novo: 13746.19, percentual: 2.08 }] });
  ok('dissídio desde 01/08 (retroativo) é registrado e aplicado na hora', r.status === 200 && r.body.registrados === 2 && r.body.aplicadas === 2, r);
  ok('o salário atual do vínculo passa a ser o novo', VINC[5].salario === 15154.19 && VINC[2].salario === 13746.19, [VINC[5].salario, VINC[2].salario]);
  const h5 = HIST.filter(h => h.vinculo_id === 5).sort((a, b) => d10(a.vigencia_inicio).localeCompare(d10(b.vigencia_inicio)));
  ok('grava a vigência de salário na DATA-BASE (01/08), com o motivo', h5.length === 2 && d10(h5[1].vigencia_inicio) === '2026-08-01' && h5[1].salario === 15154.19 && /Dissídio — Dissídio EAA/.test(h5[1].motivo), h5);
  ok('guarda o salário anterior na movimentação', MOV[0].salario_anterior === 14845.41, MOV[0]);
  r = await req('POST', '/api/rh/dissidio', { vigencia_inicio: '2026-08-01', motivo: 'Dissídio EAA 2025/2026', itens: [{ colaborador_id: 16, salario_novo: 15154.19 }] });
  ok('repetir o mesmo dissídio é recusado (409), sem duplicar', r.status === 409 && MOV.length === 2, r);
  r = await req('POST', '/api/rh/dissidio', { vigencia_inicio: '2026-08-01', motivo: 'x', itens: [{ colaborador_id: 40, salario_novo: 8400 }] });
  ok('quem foi admitido depois da data-base não entra (400)', r.status === 400 && /depois da data-base/.test(r.body.error), r);
  r = await req('POST', '/api/rh/dissidio', { vigencia_inicio: '2026-08-01', motivo: 'x', itens: [{ colaborador_id: 16, salario_novo: -5 }] });
  ok('salário inválido é recusado', r.status === 400, r);

  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'promocao', vigencia_inicio: '2099-11-01', cargo_novo: 'Gerente de Subscrição', salario_novo: 19045, motivo: 'Promoção' });
  ok('promoção com data futura fica agendada', r.status === 200 && r.body.aplicada === false, r);
  ok('...e o cargo/salário de hoje NÃO mudam', VINC[5].cargo === 'Coordenador(a) de Subscrição' && VINC[5].salario === 15154.19, VINC[5]);
  const idFut = r.body.id;
  r = await req('GET', '/api/rh/colaboradores/16/movimentacoes'); ok('a ficha lista a promoção agendada e o dissídio aplicado', r.status === 200 && r.body.length === 2, r);
  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'promocao', vigencia_inicio: '2099-11-01', cargo_novo: 'Gerente de Subscrição', salario_novo: 19045 });
  ok('promoção duplicada na mesma data é recusada', r.status === 409, r);
  r = await req('DELETE', '/api/rh/movimentacoes/' + idFut); ok('dá para cancelar uma agendada', r.status === 200, r);
  r = await req('DELETE', '/api/rh/movimentacoes/1'); ok('mas não uma já aplicada (409)', r.status === 409, r);

  r = await req('POST', '/api/rh/colaboradores/6/movimentacoes', { tipo: 'promocao', vigencia_inicio: '2099-11-01', cargo_novo: 'Gerente Administrativo', salario_novo: 19045, motivo: 'Promoção' });
  const idM = r.body.id; MOV.find(m => m.id === idM).vigencia_inicio = hoje;   // "chegou o dia"
  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'promocao', vigencia_inicio: hoje, cargo_novo: 'Gerente de Subscrição', salario_novo: 19045, motivo: 'Promoção' });
  ok('promoção cuja data chegou é aplicada: cargo e salário novos', VINC[2].cargo === 'Gerente Administrativo' && VINC[2].salario === 19045 && VINC[5].cargo === 'Gerente de Subscrição' && VINC[5].salario === 19045, [VINC[2], VINC[5]]);
  ok('guarda o cargo anterior (linha do tempo)', MOV.find(m => m.id === idM).cargo_anterior === 'Coordenador(a) Administrativo(a)', MOV.find(m => m.id === idM));
  ok('a vigência de 01/08 continua no histórico', HIST.some(h => h.vinculo_id === 2 && d10(h.vigencia_inicio) === '2026-08-01' && h.salario === 13746.19), HIST);

  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'ajuste', vigencia_inicio: '2026-05-01', salario_novo: 15000, motivo: 'Correção' });
  ok('movimentação anterior à vigência atual entra no histórico mas não muda o salário de hoje', VINC[5].salario === 19045 && HIST.some(h => h.vinculo_id === 5 && d10(h.vigencia_inicio) === '2026-05-01'), VINC[5]);
  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'merito', vigencia_inicio: '2026-01-01', salario_novo: 1000 });
  ok('data anterior à admissão é recusada', r.status === 400, r);
  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'merito', vigencia_inicio: hoje });
  ok('sem nada para mudar é recusado', r.status === 400, r);
  r = await req('POST', '/api/rh/colaboradores/16/movimentacoes', { tipo: 'xyz', vigencia_inicio: hoje, salario_novo: 10 });
  ok('tipo desconhecido é recusado', r.status === 400, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
