// Propósito: backend das despesas reprovadas no Flash. (1) rotas para listar/registrar/excluir (tabela erp_viaticos_reprovadas);
//   (2) o fechamento da viagem soma as reprovadas na pendência a descontar na próxima OT; (3) a consulta de pendência do
//   colaborador devolve a origem ("flash", "excesso+flash"…) e o valor reprovado no Flash.
// Entrada: api/index.js (ou a pasta indicada em argv[2]) e scripts/2026-10-30_viaticos_reprovadas_flash_api_bloco.txt. Saída: api/index.js editado.
// Uso: node scripts/2026-10-30_viaticos_reprovadas_flash_api.js [raiz]   (a migração 2026-10-30-viaticos-reprovadas-flash.sql vem antes)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const bloco = fs.readFileSync(path.join(__dirname, '2026-10-30_viaticos_reprovadas_flash_api_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const unico = m => {
  const i = s.indexOf(m);
  if (i < 0) throw new Error('trecho não achado: ' + m.slice(0, 70));
  if (s.indexOf(m, i + 1) >= 0) throw new Error('trecho repetido: ' + m.slice(0, 70));
};
const troca = (de, para) => { unico(de); s = s.replace(de, () => para); };

// 1) Rotas e helpers, antes do fechamento da viagem.
troca('// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente',
  bloco + '// Fecha a solicitação: compara valor liberado x comprovado e resolve automaticamente');

// 2) O fechamento soma as reprovadas do Flash na pendência (não reabre pendência já decidida).
troca("    if (ex > 0) { valor_pendencia = ex; pendencia_resolvida = false; }\n  }\n",
  "    if (ex > 0) { valor_pendencia = ex; pendencia_resolvida = false; }\n  }\n" +
  "  // Despesas reprovadas no Flash: o colaborador usou o valor, então se somam à pendência (com ou sem estouro).\n" +
  "  if (!s.pendencia_decisao) {\n" +
  "    const fl = await somaReprovadasFlash(s.id);\n" +
  "    if (fl > 0) { valor_pendencia = Math.round((valor_pendencia + fl) * 100) / 100; pendencia_resolvida = false; }\n" +
  "  }\n");

// 3) A consulta de pendência do colaborador diz de onde vem cada valor.
troca("  const rows = await query(`SELECT id, destino, ordem_trabalho, status, data_fim, valor_pendencia FROM erp_viaticos_solicitacoes\n    WHERE colaborador_id=$1",
  "  const rows = await query(`SELECT id, destino, ordem_trabalho, status, data_fim, valor_pendencia, excessos_status, excessos_valores,\n" +
  "      (SELECT COALESCE(SUM(r.valor),0) FROM erp_viaticos_reprovadas r WHERE r.solicitacao_id = erp_viaticos_solicitacoes.id) AS reprovadas_flash\n" +
  "    FROM erp_viaticos_solicitacoes\n    WHERE colaborador_id=$1");
troca("  res.json({ total, solicitacoes: rows.map(r => ({ ...r, valor_pendencia: n(r.valor_pendencia), origem: r.status === 'divergente' ? 'estouro' : 'excesso' })) });",
  "  res.json({ total, solicitacoes: rows.map(r => {\n" +
  "    const fl = n(r.reprovadas_flash), ex = somaExcessosReprovados(r.excessos_status, r.excessos_valores);\n" +
  "    const origem = r.status === 'divergente' ? (fl > 0 ? 'estouro+flash' : 'estouro')\n" +
  "      : fl > 0 ? (ex > 0 ? 'excesso+flash' : 'flash') : 'excesso';\n" +
  "    return { id: r.id, destino: r.destino, ordem_trabalho: r.ordem_trabalho, status: r.status, data_fim: r.data_fim,\n" +
  "      valor_pendencia: n(r.valor_pendencia), valor_reprovado_flash: fl, origem };\n" +
  "  }) });");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
