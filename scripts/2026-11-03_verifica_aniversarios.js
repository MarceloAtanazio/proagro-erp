// Propósito: verificar GET /api/rh/aniversarios (próxima ocorrência, dias que faltam, 29/02, ordem, idade só para dado sensível, 403 sem RH).
// Entrada: raiz do projeto (argv[2]); usa um banco simulado. Saída: PASS/FALHA. Uso: node scripts/2026-11-03_verifica_aniversarios.js <raiz>
// GET /api/rh/aniversarios: próxima ocorrência, dias que faltam, 29/02, ordem, idade só para dado sensível, só ativos.
const path = require('path');
const ROOT = process.argv[2];
process.env.JWT_SECRET = 'teste-local';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'RH sem sensíveis', email: 'rh@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { rh: 'view' }, must_change_password: false },
  3: { id: 3, name: 'Sem RH', email: 's@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { viaticos: 'edit' }, must_change_password: false } };
const somaDias = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const md = iso => iso.slice(5);
const P = [
  { id: 1, name: 'Hoje Silva', data_nascimento: '1990-' + md(hoje), cargo: 'Analista', departamento: 'Adm' },
  { id: 2, name: 'Amanhã Souza', data_nascimento: '1985-' + md(somaDias(hoje, 1)), cargo: 'Técnico', departamento: 'Campo' },
  { id: 3, name: 'Semana Lima', data_nascimento: '1992-' + md(somaDias(hoje, 7)), cargo: null, departamento: null },
  { id: 4, name: 'Ontem Pires', data_nascimento: '1988-' + md(somaDias(hoje, -1)), cargo: 'Gerente', departamento: 'Adm' },
  { id: 5, name: 'Bissexto Dias', data_nascimento: '2000-02-29', cargo: 'Coord', departamento: 'Adm' },
  { id: 6, name: 'Ana Zeta (mesma data de Hoje)', data_nascimento: '1979-' + md(hoje), cargo: 'X', departamento: 'Y' }
];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => Number(v || 0), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (s.startsWith('INSERT INTO erp_audit_log') || /^UPDATE erp_users/.test(s)) return [];
  if (s.startsWith('SELECT c.id, c.name, c.data_nascimento, v.cargo, v.nivel, v.departamento FROM erp_colaboradores c')) {
    if (!/c\.ativo = true AND c\.arquivado_em IS NULL AND c\.data_nascimento IS NOT NULL/.test(s)) throw new Error('consulta sem o filtro de ativos');
    return P.map(x => ({ ...x, nivel: null }));
  }
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 150));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const get = async (quem, rota) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` } }); return { status: r.status, body: await r.json().catch(() => null) }; };
// cálculo independente: percorre os dias até achar o próximo dia/mês de aniversário
const bissexto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const esperado = nasc => {
  const [, nm, nd] = nasc.split('-').map(Number);
  for (let k = 0; k < 800; k++) {
    const t = somaDias(hoje, k), [ty, tm, td] = t.split('-').map(Number);
    if ((tm === nm && td === nd) || (nm === 2 && nd === 29 && !bissexto(ty) && tm === 2 && td === 28)) return { dias: k, data: t };
  }
};
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r = await get(1, '/api/rh/aniversarios');
  ok('responde 200 com a data de hoje (Brasília) e a lista', r.status === 200 && r.body.hoje === hoje && r.body.aniversariantes.length === 6, r);
  const L = r.body.aniversariantes, por = nome => L.find(a => a.name.startsWith(nome));
  ok('quem faz aniversário hoje: dias = 0, em primeiro', por('Hoje').dias === 0 && L[0].dias === 0 && L[1].dias === 0, L.map(a => [a.name, a.dias]));
  ok('desempate por nome (mesma data): "Ana Zeta" vem antes de "Hoje Silva"', L[0].name.startsWith('Ana') && L[1].name.startsWith('Hoje'), L.map(a => a.name));
  ok('amanhã: dias = 1', por('Amanhã').dias === 1, por('Amanhã'));
  ok('daqui a 7 dias: dias = 7, sem cargo/departamento (nulos)', por('Semana').dias === 7 && por('Semana').cargo === null, por('Semana'));
  ok('aniversário de ONTEM só volta no ano que vem (dias entre 364 e 365)', por('Ontem').dias >= 364 && por('Ontem').dias <= 365, por('Ontem'));
  for (const a of L) { const e = esperado(P.find(x => x.id === a.id).data_nascimento); if (a.dias !== e.dias || a.proximo !== e.data) { ok('próxima ocorrência confere com o cálculo independente: ' + a.name, false, [a.dias, e]); } }
  ok('próxima ocorrência de TODOS confere com o cálculo independente (inclui 29/02)', true, null);
  const b = por('Bissexto'); const eb = esperado('2000-02-29');
  ok('29/02: em ano não bissexto comemora em 28/02', b.proximo === eb.data && (bissexto(Number(b.proximo.slice(0, 4))) ? b.proximo.endsWith('02-29') : b.proximo.endsWith('02-28')), b);
  ok('ordenado por dias (e nome)', L.every((a, i) => i === 0 || L[i - 1].dias < a.dias || (L[i - 1].dias === a.dias && L[i - 1].name.localeCompare(a.name, 'pt-BR') <= 0)), L.map(a => a.dias));
  ok('admin (dado sensível) recebe a idade que a pessoa faz', por('Hoje').idade === Number(hoje.slice(0, 4)) - 1990, por('Hoje'));
  ok('...e o dia/mês', por('Amanhã').dia === Number(somaDias(hoje, 1).slice(8, 10)) && por('Amanhã').mes === Number(somaDias(hoje, 1).slice(5, 7)), por('Amanhã'));
  r = await get(2, '/api/rh/aniversarios');
  ok('RH SEM dados sensíveis vê a lista, mas SEM a idade', r.status === 200 && r.body.aniversariantes.length === 6 && r.body.aniversariantes.every(a => !('idade' in a)), r.body.aniversariantes[0]);
  r = await get(3, '/api/rh/aniversarios');
  ok('quem não tem acesso a RH recebe 403', r.status === 403, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
