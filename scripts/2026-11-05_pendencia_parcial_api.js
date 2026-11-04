// Propósito: desconto PARCIAL de pendência em Viáticos (backend). Quando o valor da transferência não cobre toda a pendência, desconta-se só o que
//   cabe e o resto segue em aberto para a próxima transferência (antes, a diferença era perdoada). Cada desconto/dispensa fica em
//   erp_viaticos_pendencia_abatimentos (origem, OT que recebeu o desconto, valor, decisão); o que resta = valor_pendencia − abatido.
//   Ajusta: encerrarPendencias (aplica o desconto parcial), GET /colaboradores/:id/pendencia (devolve o restante), dashboard "Divergentes" (restante)
//   e o painel Transferência (o que foi abatido NESTA transferência, inclusive parcial).
// Entrada: api/index.js (ou a pasta indicada em argv[2]) e scripts/2026-11-05_pendencia_parcial_*_bloco.txt. Saída: o arquivo editado.
// Uso: node scripts/2026-11-05_pendencia_parcial_api.js [raiz]. Requer a migração supabase/migrations/2026-11-05-viaticos-pendencia-abatimentos.sql ANTES de publicar.
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const unico = m => { const i = s.indexOf(m); if (i < 0) throw new Error('trecho não achado: ' + m.slice(0, 80)); if (s.indexOf(m, i + 1) >= 0) throw new Error('trecho repetido: ' + m.slice(0, 80)); return i; };
const troca = (de, para) => { unico(de); s = s.replace(de, () => para); };

// 1) encerrarPendencias
{
  const ini = 'async function encerrarPendencias(b, colaboradorId, naSolicitacaoId) {';
  const fim = '[ids, colaboradorId, decisao, naSolicitacaoId]);\n}';
  const i = unico(ini), j = s.indexOf(fim, i); if (j < 0) throw new Error('fim de encerrarPendencias não achado');
  s = s.slice(0, i) + bloco('2026-11-05_pendencia_parcial_encerrar_bloco.txt') + s.slice(j + fim.length);
}

// 2) GET pendência: devolve o que RESTA
troca("AS reprovadas_flash\n    FROM erp_viaticos_solicitacoes\n    WHERE colaborador_id=$1 AND pendencia_resolvida=false",
      "AS reprovadas_flash,\n      (SELECT COALESCE(SUM(a.valor),0) FROM erp_viaticos_pendencia_abatimentos a WHERE a.solicitacao_origem_id = erp_viaticos_solicitacoes.id AND a.decisao='descontada') AS abatido\n    FROM erp_viaticos_solicitacoes\n    WHERE colaborador_id=$1 AND pendencia_resolvida=false");
troca("  const total = rows.reduce((s, r) => s + n(r.valor_pendencia), 0);\n  res.json({ total, solicitacoes: rows.map(r => {",
      "  // O que resta de cada uma depois dos descontos parciais já feitos; a que não tem mais nada a descontar não entra.\n  const abertas = rows.map(r => ({ ...r, restante: Math.round((n(r.valor_pendencia) - n(r.abatido)) * 100) / 100 })).filter(r => r.restante > 0.005);\n  const total = Math.round(abertas.reduce((s, r) => s + r.restante, 0) * 100) / 100;\n  res.json({ total, solicitacoes: abertas.map(r => {");
troca("valor_pendencia: n(r.valor_pendencia), valor_reprovado_flash: fl, origem };",
      "valor_pendencia: r.restante, valor_original: n(r.valor_pendencia), ja_abatido: n(r.abatido), valor_reprovado_flash: fl, origem };");

// 3) dashboard
troca("COALESCE(SUM(valor_pendencia),0) AS v FROM erp_viaticos_solicitacoes WHERE status='divergente'",
      "COALESCE(SUM(valor_pendencia - COALESCE((SELECT SUM(a.valor) FROM erp_viaticos_pendencia_abatimentos a WHERE a.solicitacao_origem_id = erp_viaticos_solicitacoes.id AND a.decisao='descontada'),0)),0) AS v FROM erp_viaticos_solicitacoes WHERE status='divergente'");

// 4) painel Transferência: o que foi abatido NESTA transferência
troca(`  const decididas = await query(
    \`SELECT id, ordem_trabalho, status, valor_pendencia, pendencia_decisao, excessos_status, excessos_valores,
            (SELECT COALESCE(SUM(r.valor),0) FROM erp_viaticos_reprovadas r WHERE r.solicitacao_id = erp_viaticos_solicitacoes.id) AS reprovadas_flash
       FROM erp_viaticos_solicitacoes WHERE pendencia_decidida_na=$1 ORDER BY data_fim, id\`, [s.id]);`,
`  const campos = \`o.id, o.ordem_trabalho, o.status, o.valor_pendencia, o.excessos_status, o.excessos_valores,
            (SELECT COALESCE(SUM(r.valor),0) FROM erp_viaticos_reprovadas r WHERE r.solicitacao_id = o.id) AS reprovadas_flash\`;
  // Descontos (inclusive parciais) registrados nesta OT + os antigos, de antes dos descontos parciais, que só têm a marca pendencia_decidida_na.
  const novas = await query(\`SELECT \${campos}, a.valor AS valor_abatido, a.decisao AS decisao_abat FROM erp_viaticos_pendencia_abatimentos a
      JOIN erp_viaticos_solicitacoes o ON o.id = a.solicitacao_origem_id WHERE a.solicitacao_destino_id=$1 ORDER BY o.data_fim, o.id\`, [s.id]);
  const antigas = await query(\`SELECT \${campos}, o.pendencia_decisao AS decisao_ant FROM erp_viaticos_solicitacoes o WHERE o.pendencia_decidida_na=$1
      AND NOT EXISTS (SELECT 1 FROM erp_viaticos_pendencia_abatimentos a WHERE a.solicitacao_origem_id = o.id AND a.solicitacao_destino_id=$1) ORDER BY o.data_fim, o.id\`, [s.id]);
  const decididas = [...novas.map(r => ({ ...r, valor_efetivo: n(r.valor_abatido), decisao: r.decisao_abat })),
                     ...antigas.map(r => ({ ...r, valor_efetivo: n(r.valor_pendencia), decisao: r.decisao_ant }))];`);
troca("id: r.id, ordem_trabalho: r.ordem_trabalho, valor: n(r.valor_pendencia), decisao: r.pendencia_decisao,",
      "id: r.id, ordem_trabalho: r.ordem_trabalho, valor: r.valor_efetivo, decisao: r.decisao,");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
