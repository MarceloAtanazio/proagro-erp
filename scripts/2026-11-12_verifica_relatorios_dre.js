// Propósito: verifica no backend (banco simulado) o endpoint GET /api/reports/dre/:ano: ano inválido, permissão, formato da resposta, regime caixa x competência (colunas de data usadas),
//   Viáticos somado ao realizado (e repasse fora), posição financeira, clientes e fornecedores.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-12_verifica_relatorios_dre.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Sem acesso', email: 's@x.com', role: 'usuario', status: 'ativo', active: true, permissions: {}, must_change_password: false },
            2: { id: 2, name: 'Leitor', email: 'l@x.com', role: 'usuario', status: 'ativo', active: true, permissions: { relatorios: 'view' }, must_change_password: false },
            9: { id: 9, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, is_super: true, permissions: {}, must_change_password: false } };
const SQLS = [];
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); SQLS.push({ s, p });
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.includes('FROM erp_viaticos_despesas d')) return [{ month: 3, total: 1000 }];
  if (s.includes('FROM erp_payables WHERE') && s.includes('GROUP BY 1, 2')) return [{ month: 3, category: 'Folha de Pagamento', total: '5000.50' }, { month: 3, category: 'Viáticos', total: '200' }];
  if (s.includes('FROM erp_receivables WHERE') && s.includes('GROUP BY 1, 2') && s.includes('EXTRACT(MONTH')) return [{ month: 3, category: 'Serviços Intercompany', total: '9000' }];
  if (s.includes('FROM erp_budgets')) return [{ month: 3, type: 'receita', category: 'Serviços Intercompany', total: '8000' }, { month: 3, type: 'despesa', category: 'Folha de Pagamento', total: '4000' }];
  if (s.includes('FROM erp_bank_transactions')) return [{ v: '10' }];
  if (s.includes('AS nome') && s.includes('erp_receivables')) return [{ nome: 'Cliente A', total: '9000' }];
  if (s.includes('AS nome') && s.includes('erp_payables')) return [{ nome: 'Fornecedor X', total: '5000.5' }];
  if (/SELECT COALESCE\(SUM\(amount\),0\) AS v FROM erp_(payables|receivables)/.test(s)) return [{ v: '100' }];
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const chama = async (quem, rota) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { headers: { cookie: `proagro_token=${jwt.sign({ sub: quem, role: U[quem].role }, process.env.JWT_SECRET)}` } }); let body = null; try { body = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, body }; };
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r = await chama(9, '/api/reports/dre/abc'); ok('ano inválido dá 400', r.status === 400, r);
  r = await chama(1, '/api/reports/dre/2026'); ok('sem permissão em Relatórios dá 403', r.status === 403, r);
  SQLS.length = 0; r = await chama(2, '/api/reports/dre/2026');
  ok('leitor com permissão em Relatórios recebe 200', r.status === 200, r);
  const b = r.body;
  ok('formato: ano, regime, mesAtual, atual/anterior/orcado com rec e desp, posição, clientes e fornecedores', b && b.ano === 2026 && b.regime === 'caixa' && typeof b.mesAtual === 'number' && ['atual', 'anterior', 'orcado'].every(k => Array.isArray(b[k].rec) && Array.isArray(b[k].desp)) && b.posicao && Array.isArray(b.clientes) && Array.isArray(b.fornecedores), b);
  ok('Viáticos entra por categoria e soma com o reembolso (200 + 1000)', b.atual.desp.find(x => x.category === 'Viáticos').total === 1200, b.atual.desp);
  ok('números vêm como número (não texto)', typeof b.atual.rec[0].total === 'number' && typeof b.orcado.desp[0].total === 'number' && typeof b.clientes[0].total === 'number', b);
  ok('caixa usa payment_date/receipt_date e exclui o repasse', SQLS.some(x => x.s.includes('payment_date') && x.s.includes('IS DISTINCT FROM')) && SQLS.some(x => x.s.includes('receipt_date')) && !SQLS.some(x => x.s.includes('FROM erp_payables') && x.s.includes('due_date) = $1')), SQLS.map(x => x.s.slice(0, 80)));
  ok('saldo de caixa = recebido − pago + ajustes independentes (100 − 100 + 10)', b.posicao.saldoCaixa === 10, b.posicao);
  ok('orçado não traz a categoria do repasse (parâmetro do filtro)', SQLS.some(x => x.s.includes('FROM erp_budgets') && x.p.includes('Repasse de Viáticos')), SQLS.filter(x => x.s.includes('erp_budgets')));
  SQLS.length = 0; r = await chama(9, '/api/reports/dre/2026?regime=competencia');
  ok('competência usa vencimento e inclui pendentes', r.status === 200 && r.body.regime === 'competencia' && SQLS.some(x => x.s.includes("status IN ('pago','pendente')") && x.s.includes('due_date')) && SQLS.some(x => x.s.includes("status IN ('recebido','pendente')")), SQLS.map(x => x.s.slice(0, 90)));
  r = await chama(9, '/api/reports/dre/2020'); ok('ano passado: mesAtual = 0 (ano completo)', r.status === 200 && r.body.mesAtual === 0, r.body && r.body.mesAtual);
  server.close(); console.log(f.length ? `\n${f.length} FALHA(S)` : '\nTudo certo.'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
