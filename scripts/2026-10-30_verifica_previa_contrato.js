// Propósito: verificar a pré-visualização da minuta (GET /api/rh/minutas/:id/previa) e do contrato preenchido (GET /api/rh/admissoes/:id/contrato/documento).
// Entrada: raiz do projeto (argv[2]) e o .docx da minuta Externa (argv[3]). Saída: PASS/FALHA. Uso: node scripts/2026-10-30_verifica_previa_contrato.js <raiz> <minuta.docx>
// Pré-visualização da minuta e do contrato: devolve os parágrafos já no padrão da emissão, sem registrar nada.
const path = require('path'), fs = require('fs');
const ROOT = process.argv[2], DOCX = process.argv[3];
process.env.JWT_SECRET = 'teste-local';
const { zipLer, acharSlots } = require(path.join(ROOT, 'src/docx-merge.js'));
const data = fs.readFileSync(DOCX);
const xml = zipLer(data).find(e => e.nome === 'word/document.xml').dados.toString('utf8');
const slots = acharSlots(xml);
const mapa = slots.map(s => ({ n: s.n, texto: s.texto, nRuns: s.nRuns, campo: /CIDADE/i.test(s.texto) ? 'assinatura_cidade' : 'fixo', valor_fixo: 'VALOR' + s.n }));
const U = {
  1: { id: 1, name: 'Admin', email: 'm.atanazio@proagroseguros.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false },
  2: { id: 2, name: 'RH sem sensíveis', email: 'rh@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { rh: 'edit' }, must_change_password: false } };
const gravacoes = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => Number(v || 0), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (s.startsWith('INSERT INTO erp_audit_log')) return [];
  if (/^(UPDATE|INSERT|DELETE)/.test(s)) { if (!/erp_users|erp_audit_log/.test(s)) gravacoes.push(s.slice(0, 60)); return []; }
  if (s.startsWith('SELECT id, nome, file_name, data FROM erp_rh_minutas WHERE id')) return p[0] === 4 ? [{ id: 4, nome: 'Contrato Externa', file_name: 'Externa.docx', data }] : [];
  if (s.startsWith('SELECT * FROM erp_rh_admissoes WHERE id')) return [{ id: 7, colaborador_id: 37, regime: 'regular', modelo_trabalho: 'externo', etapa: 'contrato', cargo_pretendido: 'Técnico', salario_previsto: 3000, admissao_prevista: '2026-11-03' }];
  if (s.startsWith('SELECT * FROM erp_colaboradores WHERE id')) return [{ id: 37, name: 'Luan dos Santos Gandine', cpf: '12345678909' }];
  if (s.startsWith('SELECT doc_tipo FROM erp_attachments')) return [];
  if (s.startsWith('SELECT id, nome, slots FROM erp_rh_minutas')) return [];
  if (s.startsWith('SELECT id, nome, file_name, slots, data FROM erp_rh_minutas WHERE ativa=true')) return p[1] === 'externo' ? [{ id: 4, nome: 'Contrato Externa', file_name: 'Externa.docx', slots: mapa, data }] : [];
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 130));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
let QUEM = 1;
const get = async rota => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { headers: { cookie: `proagro_token=${jwt.sign({ sub: QUEM, role: U[QUEM].role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` } }); return { status: r.status, body: await r.json().catch(() => null) }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  const tit = ps => ps.filter(p => /^(DO |DA |DAS |DOS |CONTRATO DE|FOLHA)/.test(p.texto) && !/^CLÁUSULA/.test(p.texto));
  let r = await get('/api/rh/minutas/4/previa');
  ok('prévia da minuta devolve os parágrafos', r.status === 200 && r.body.paragrafos.length > 50 && r.body.minuta.nome === 'Contrato Externa', r.status);
  ok('...já no padrão da emissão: títulos centralizados', tit(r.body.paragrafos).filter(p => p.titulo).length === 13 && tit(r.body.paragrafos).filter(p => p.titulo).every(p => p.alinhamento === 'center'), tit(r.body.paragrafos).map(p => [p.texto, p.alinhamento, p.titulo]));
  ok('...e sem números de desenho vazando', !r.body.paragrafos.some(p => /^\d{5,}$/.test(p.texto.trim())), null);
  r = await get('/api/rh/minutas/999/previa'); ok('minuta inexistente: 404', r.status === 404, r);

  r = await get('/api/rh/admissoes/7/contrato/documento?municipio=Campinas&uf=SP&data=2026-11-03');
  ok('prévia do contrato preenchido funciona', r.status === 200 && r.body.ok && r.body.paragrafos.length > 50, r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
  if (r.status === 200) {
    const texto = r.body.paragrafos.map(p => p.texto).join('\n');
    ok('...os campos vêm preenchidos (valores do mapa no lugar dos realces)', /VALOR1\b/.test(texto), texto.slice(0, 120));
    ok('...a cidade da assinatura informada entra no documento', /Campinas/.test(texto), texto.match(/.{0,30}CIDADE.{0,20}/));
    ok('...títulos centralizados e traços de assinatura no padrão', tit(r.body.paragrafos).filter(p => p.titulo).every(p => p.alinhamento === 'center') && r.body.paragrafos.filter(p => /^_{63}$/.test(p.texto)).length === 2, null);
  }
  ok('a prévia NÃO grava nada (não marca contrato emitido, não mexe no processo)', gravacoes.length === 0, gravacoes);
  QUEM = 2; r = await get('/api/rh/admissoes/7/contrato/documento'); ok('sem permissão de dados sensíveis: 403', r.status === 403, r);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
