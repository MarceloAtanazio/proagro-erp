// Propósito: verifica o desconto PARCIAL de pendência (o resto segue em aberto para a próxima transferência), com o banco simulado em memória.
//   Cobre o caso do Marcelo: pendência de R$ 256,50 e transferência bruta de R$ 220,00 -> desconta 220, líquido 0, restam 36,50 para a próxima.
// Entrada: raiz do projeto (argv[2]). Saída: PASS/FALHA por verificação; código de saída 1 se algo falhar.
// Uso: node scripts/2026-11-05_verifica_pendencia_parcial.js <raiz>
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
process.env.JWT_SECRET = 'teste-local';
const U = { 1: { id: 1, name: 'Admin', email: 'a@x.com', role: 'admin', status: 'ativo', active: true, permissions: {}, must_change_password: false } };
const mk = (id, ot, extra = {}) => ({ id, colaborador_id: 7, ordem_trabalho: ot, status: 'divergente', valor_pendencia: 0, pendencia_resolvida: true, pendencia_decisao: null, pendencia_decidida_na: null,
  valor_liberado: 0, excessos_status: {}, excessos_valores: {}, flash: 0, data_fim: '2026-10-01', ...extra });
let SOL, ABAT;
const reset = () => {
  SOL = { 38: mk(38, '38', { valor_pendencia: 256.5, pendencia_resolvida: false, flash: 256.5, data_fim: '2026-10-05' }),
          39: mk(39, '39', { valor_pendencia: 100, pendencia_resolvida: false, data_fim: '2026-10-10' }),
          100: mk(100, '40', { status: 'em_approvals' }), 101: mk(101, '41', { status: 'em_approvals' }), 102: mk(102, '42', { status: 'em_approvals' }), 103: mk(103, '43', { status: 'em_approvals' }) };
  ABAT = [];
};
reset();
const abatido = id => ABAT.filter(a => a.o === id && a.dec === 'descontada').reduce((t, a) => t + a.v, 0);
const dbPath = require.resolve(path.join(ROOT, 'src/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { n: v => (v == null ? 0 : Number(v)), pool: {}, query: async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('FROM erp_users WHERE id')) return [U[p[0]]].filter(Boolean);
  if (/^(INSERT INTO erp_audit_log|UPDATE erp_users)/.test(s)) return [];
  if (s.includes('FROM erp_rh_movimentacoes')) return [];
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET status=$1, status_manual=true, valor_liberado=$2 WHERE id=$3')) { Object.assign(SOL[p[2]], { status: p[0], valor_liberado: p[1] }); return []; }
  if (s.startsWith('SELECT colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL[p[0]] ? [{ colaborador_id: SOL[p[0]].colaborador_id }] : [];
  // encerrarPendencias
  if (s.startsWith('SELECT id, valor_pendencia, (SELECT COALESCE(SUM(a.valor),0) FROM erp_viaticos_pendencia_abatimentos a')) {
    return Object.values(SOL).filter(x => p[0].includes(x.id) && x.colaborador_id === p[1] && (x.status === 'divergente' || x.valor_pendencia > 0) && !x.pendencia_resolvida)
      .sort((a, b) => a.data_fim.localeCompare(b.data_fim) || a.id - b.id).map(x => ({ id: x.id, valor_pendencia: x.valor_pendencia, abatido: abatido(x.id) }));
  }
  if (s.startsWith('INSERT INTO erp_viaticos_pendencia_abatimentos')) { ABAT.push({ o: p[0], d: p[1], v: p[2], dec: p[3] }); return []; }
  if (s.startsWith('UPDATE erp_viaticos_solicitacoes SET pendencia_resolvida=true, pendencia_decisao=$2, pendencia_decidida_em=now(), pendencia_decidida_na=$3 WHERE id=$1')) {
    Object.assign(SOL[p[0]], { pendencia_resolvida: true, pendencia_decisao: p[1], pendencia_decidida_na: p[2] }); return [];
  }
  // GET pendência
  if (s.startsWith('SELECT id, destino, ordem_trabalho, status, data_fim, valor_pendencia, excessos_status, excessos_valores,')) {
    return Object.values(SOL).filter(x => x.colaborador_id === Number(p[0]) && !x.pendencia_resolvida && (x.status === 'divergente' || x.valor_pendencia > 0))
      .map(x => ({ ...x, reprovadas_flash: x.flash, abatido: abatido(x.id) }));
  }
  // painel Transferência
  if (s.startsWith('SELECT id, colaborador_id FROM erp_viaticos_solicitacoes WHERE id=$1')) return SOL[p[0]] ? [{ id: Number(p[0]), colaborador_id: SOL[p[0]].colaborador_id }] : [];
  if (s.includes('FROM erp_viaticos_pendencia_abatimentos a JOIN erp_viaticos_solicitacoes o ON o.id = a.solicitacao_origem_id WHERE a.solicitacao_destino_id=$1'))
    return ABAT.filter(a => a.d === p[0]).map(a => ({ ...SOL[a.o], reprovadas_flash: SOL[a.o].flash, valor_abatido: a.v, decisao_abat: a.dec }));
  if (s.includes('FROM erp_viaticos_solicitacoes o WHERE o.pendencia_decidida_na=$1 AND NOT EXISTS'))
    return Object.values(SOL).filter(x => x.pendencia_decidida_na === p[0] && !ABAT.some(a => a.o === x.id && a.d === p[0])).map(x => ({ ...x, reprovadas_flash: x.flash, decisao_ant: x.pendencia_decisao }));
  if (s.startsWith('SELECT id, ordem_trabalho, status, valor_liberado, data_inicio, data_fim FROM erp_viaticos_solicitacoes')) return [];
  throw new Error('SQL não previsto no stub: ' + s.slice(0, 160));
} } };
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken')); const app = require(path.join(ROOT, 'api/index.js')); const server = app.listen(0);
const call = async (m, rota, corpo) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${rota}`, { method: m, headers: { cookie: `proagro_token=${jwt.sign({ sub: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const transferir = (id, liquido, corpo) => call('POST', `/api/viaticos/solicitacoes/${id}/status`, { status: 'transferencia_agendada', valor_liberado: liquido, ...corpo });
(async () => {
  const f = []; const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) f.push(n); };
  let r;
  // o caso do Marcelo: só a OT 38 (R$ 256,50), transferência bruta de 220
  delete SOL[39];
  r = await transferir(100, 0, { pendencia_ids: [38], pendencia_decisao: 'descontar', pendencia_desconto: 220 });
  ok('transferência de R$ 220 com pendência de R$ 256,50: aceita', r.status === 200, r);
  ok('...desconta R$ 220 (e só isso) e registra o abatimento na OT 40', ABAT.length === 1 && ABAT[0].v === 220 && ABAT[0].d === 100 && ABAT[0].dec === 'descontada', ABAT);
  ok('...a pendência da OT 38 NÃO é encerrada (continua em aberto)', SOL[38].pendencia_resolvida === false && SOL[38].pendencia_decidida_na === null, SOL[38]);
  r = await call('GET', '/api/viaticos/colaboradores/7/pendencia');
  ok('...o aviso da próxima transferência mostra R$ 36,50 (o restante, não os 256,50 originais)', r.body.total === 36.5 && r.body.solicitacoes[0].valor_pendencia === 36.5 && r.body.solicitacoes[0].valor_original === 256.5 && r.body.solicitacoes[0].ja_abatido === 220, r.body);
  r = await call('GET', '/api/viaticos/solicitacoes/100/transferencia');
  ok('...o painel da OT 40 mostra os R$ 220 descontados da OT 38', r.body.descontadas.length === 1 && r.body.descontadas[0].valor === 220 && r.body.descontadas[0].decisao === 'descontada' && r.body.descontadas[0].origem === 'estouro+flash', r.body);
  // próxima transferência: desconta o restante e encerra
  r = await transferir(101, 963.5, { pendencia_ids: [38], pendencia_decisao: 'descontar', pendencia_desconto: 36.5 });
  ok('próxima transferência (bruto 1.000): desconta os R$ 36,50 restantes', ABAT.length === 2 && ABAT[1].v === 36.5 && ABAT[1].d === 101, ABAT);
  ok('...e agora a OT 38 é encerrada, decidida na OT 41', SOL[38].pendencia_resolvida === true && SOL[38].pendencia_decidida_na === 101, SOL[38]);
  r = await call('GET', '/api/viaticos/colaboradores/7/pendencia'); ok('...nada mais em aberto', r.body.total === 0 && r.body.solicitacoes.length === 0, r.body);

  // duas pendências, transferência cobre a primeira inteira e parte da segunda (ordem: a mais antiga primeiro)
  reset();
  r = await transferir(100, 0, { pendencia_ids: [39, 38], pendencia_decisao: 'descontar', pendencia_desconto: 300 });
  ok('duas pendências (R$ 256,50 e R$ 100) com R$ 300: a mais antiga (OT 38) é quitada inteira', SOL[38].pendencia_resolvida === true && ABAT.find(a => a.o === 38).v === 256.5, [SOL[38], ABAT]);
  ok('...a segunda (OT 39) leva os R$ 43,50 que sobram e segue com R$ 56,50 em aberto', SOL[39].pendencia_resolvida === false && ABAT.find(a => a.o === 39).v === 43.5, [SOL[39], ABAT]);
  r = await call('GET', '/api/viaticos/colaboradores/7/pendencia'); ok('...o restante total é R$ 56,50', r.body.total === 56.5 && r.body.solicitacoes.length === 1 && r.body.solicitacoes[0].id === 39, r.body);

  // valor que cobre tudo e valor zero
  reset();
  r = await transferir(100, 643.5, { pendencia_ids: [38, 39], pendencia_decisao: 'descontar', pendencia_desconto: 356.5 });
  ok('valor que cobre tudo: as duas são encerradas', SOL[38].pendencia_resolvida && SOL[39].pendencia_resolvida && ABAT.length === 2, [SOL[38], SOL[39], ABAT]);
  reset();
  r = await transferir(100, 500, { pendencia_ids: [38], pendencia_decisao: 'descontar', pendencia_desconto: 0 });
  ok('desconto zero: nada é abatido e a pendência segue em aberto', ABAT.length === 0 && SOL[38].pendencia_resolvida === false, [ABAT, SOL[38]]);

  // dispensar encerra o que resta, mesmo depois de desconto parcial
  reset();
  await transferir(100, 0, { pendencia_ids: [38], pendencia_decisao: 'descontar', pendencia_desconto: 220 });
  r = await transferir(101, 1000, { pendencia_ids: [38], pendencia_decisao: 'dispensar' });
  ok('dispensar o restante: encerra e registra R$ 36,50 como dispensados', SOL[38].pendencia_resolvida === true && SOL[38].pendencia_decisao === 'dispensada' && ABAT.at(-1).v === 36.5 && ABAT.at(-1).dec === 'dispensada', [SOL[38], ABAT]);
  r = await call('GET', '/api/viaticos/solicitacoes/101/transferencia');
  ok('...e o painel da OT 41 mostra a dispensa de R$ 36,50', r.body.descontadas.length === 1 && r.body.descontadas[0].valor === 36.5 && r.body.descontadas[0].decisao === 'dispensada', r.body);

  // compatibilidade: sem pendencia_desconto (chamadas antigas) desconta tudo, como antes
  reset();
  r = await transferir(100, 743.5, { pendencia_ids: [38, 39], pendencia_decisao: 'descontar' });
  ok('sem pendencia_desconto: desconta tudo e encerra (comportamento anterior)', SOL[38].pendencia_resolvida && SOL[39].pendencia_resolvida && ABAT.reduce((t, a) => t + a.v, 0) === 356.5, [ABAT]);
  // legado: pendência já encerrada antes desta mudança continua aparecendo no painel (sem abatimento registrado)
  reset(); SOL[38].pendencia_resolvida = true; SOL[38].pendencia_decisao = 'descontada'; SOL[38].pendencia_decidida_na = 102;
  r = await call('GET', '/api/viaticos/solicitacoes/102/transferencia');
  ok('pendência encerrada antes da mudança (sem abatimento): continua no painel com o valor cheio', r.body.descontadas.length === 1 && r.body.descontadas[0].valor === 256.5, r.body);
  console.log(f.length ? 'FALHAS: ' + f.join(' | ') : 'Todas as verificações passaram.'); server.close(); process.exit(f.length ? 1 : 0);
})();
