// Propósito: OT complementar em Viáticos (backend). O colaborador cria, a partir de uma OT em curso, uma complementar que (a) estende o tempo no
//   local ("extensao") ou (b) parte da localização atual para um novo destino ("novo_destino"). Regras: número "<OT> - Complementar" (com 2, 3…
//   se houver mais de uma); data de saída = data final da OT de origem; ponto de partida = último destino da OT de origem (não a cidade-base);
//   no dia de saída a alimentação já foi paga pela OT de origem, então a previsão conta alimentação e hospedagem só dos dias APÓS a saída
//   (dias = noites = data final − data inicial); na extensão os destinos são os da OT de origem e o meio de transporte é opcional.
// Entrada: api/index.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado. Uso: node scripts/2026-11-04_viaticos_complementar_api.js [raiz]
// Requer a migração supabase/migrations/2026-11-04-viaticos-complementar.sql aplicada ANTES de publicar.
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80));
  s = s.replace(de, () => para);
};

troca('function viaRecalcularPrevisao(b, colab, tud) {', 'function viaRecalcularPrevisao(b, colab, tud, complementar) {');
troca(`  const ini = new Date(b.data_inicio), fim = new Date(b.data_fim);
  const dias = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
  const noitesPeriodo = Math.max(0, dias - 1);
  const hospDevida = viaHospedagemDevidaServer(b.destinos, colab.cidade_base_uf, colab.cidade_base_municipio);`,
`  const ini = new Date(b.data_inicio), fim = new Date(b.data_fim);
  // OT complementar: o dia de saída é o último dia da OT de origem, cuja alimentação já foi prevista lá. Conta-se só o que vem depois
  // (alimentação de cada dia seguinte e a hospedagem de cada noite, inclusive a do último dia da origem). Mesma regra em viaDiasNoites (app.js).
  const diff = Math.max(0, Math.round((fim - ini) / 86400000));
  const dias = complementar ? diff : Math.max(1, diff + 1);
  const noitesPeriodo = complementar ? diff : Math.max(0, dias - 1);
  const hospDevida = viaHospedagemDevidaServer(b.destinos, colab.cidade_base_uf, colab.cidade_base_municipio);`);

troca(`  const colab = colabRows[0];
  const b = req.body;
  // No autosserviço todos os campos`,
`  const colab = colabRows[0];
  const b = req.body;
  // OT complementar: parte de uma OT do próprio colaborador que ainda está de pé. O servidor impõe o número, a data de saída e (na extensão) os
  // destinos — o que vem do navegador não decide isso.
  let pai = null, complTipo = null, partida = null;
  if (b.solicitacao_pai_id != null && b.solicitacao_pai_id !== '') {
    const iso = v => (v == null ? '' : typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
    const pr = await query('SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim FROM erp_viaticos_solicitacoes WHERE id=$1', [b.solicitacao_pai_id]);
    if (!pr.length || pr[0].colaborador_id !== colab.id) return res.status(404).json({ error: 'OT de origem não encontrada.' });
    pai = pr[0];
    if (!['transferencia_agendada', 'liberado', 'em_viagem'].includes(pai.status)) {
      return res.status(400).json({ error: 'Só dá para criar complementar de uma OT em curso (liberada ou em viagem).' });
    }
    complTipo = b.complementar_tipo;
    if (!['extensao', 'novo_destino'].includes(complTipo)) return res.status(400).json({ error: 'Informe o tipo da complementar: estender no local ou novo destino.' });
    const dpai = Array.isArray(pai.destinos) ? pai.destinos : [];
    if (!dpai.length) return res.status(400).json({ error: 'A OT de origem não tem destino cadastrado.' });
    const ult = dpai[dpai.length - 1];
    partida = { uf: ult.uf, municipio: ult.municipio };
    const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - Complementar( \\d+)?$/i, '');
    const ja = await query('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2',
      [colab.id, raizOt.replace(/[\\\\%_]/g, '\\\\$&') + ' - Complementar%']);
    b.ordem_trabalho = raizOt + ' - Complementar' + (ja.length ? ' ' + (ja.length + 1) : '');
    b.data_inicio = iso(pai.data_fim);
    if (complTipo === 'extensao') b.destinos = dpai;
  }
  // No autosserviço todos os campos`);

troca(`  if (b.data_fim < b.data_inicio) return res.status(400).json({ error: 'Data final não pode ser antes da inicial.' });
  if (!Array.isArray(b.destinos) || !b.destinos.length) return res.status(400).json({ error: 'Informe ao menos um destino.' });
  for (const d of b.destinos) {
    if (!d || typeof d.uf !== 'string' || d.uf.length !== 2 || !sanitize(d.municipio)) return res.status(400).json({ error: 'Lista de destinos inválida.' });
  }
  // Ao menos um meio de transporte, senão a previsão sai só com diárias.
  const tp = (b.transporte_detalhes && typeof b.transporte_detalhes === 'object') ? b.transporte_detalhes : {};
  if (!['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].some(k => tp[k])) {`,
`  if (b.data_fim < b.data_inicio) return res.status(400).json({ error: 'Data final não pode ser antes da inicial.' });
  if (pai && b.data_fim <= b.data_inicio) return res.status(400).json({ error: 'A complementar precisa terminar depois da data final da OT de origem (' + b.data_inicio.split('-').reverse().join('/') + ').' });
  if (!Array.isArray(b.destinos) || !b.destinos.length) return res.status(400).json({ error: 'Informe ao menos um destino.' });
  for (const d of b.destinos) {
    if (!d || typeof d.uf !== 'string' || d.uf.length !== 2 || !sanitize(d.municipio)) return res.status(400).json({ error: 'Lista de destinos inválida.' });
  }
  // Ao menos um meio de transporte, senão a previsão sai só com diárias. Na extensão no local a pessoa já está lá: o transporte é opcional.
  const tp = (b.transporte_detalhes && typeof b.transporte_detalhes === 'object') ? b.transporte_detalhes : {};
  if (complTipo !== 'extensao' && !['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].some(k => tp[k])) {`);

troca('  const { categoriaLocal, cat } = viaRecalcularPrevisao(b, colab, tud);\n  // O total da previsão é o `valor_solicitado`',
      '  const { categoriaLocal, cat } = viaRecalcularPrevisao(b, colab, tud, !!pai);\n  // O total da previsão é o `valor_solicitado`');

troca(`     valor_solicitado, valor_liberado, previsao_por_categoria, transporte_detalhes, notes, created_by, origem)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,'colaborador') RETURNING id\`,
    [colab.id, colab.tier, categoriaLocal, sanitize(b.ordem_trabalho), JSON.stringify(b.destinos || []), sanitize(b.motivo),
     sanitize(b.objetivo), b.data_inicio, b.data_fim, totalSolicitado, JSON.stringify(cat), JSON.stringify(b.transporte_detalhes || {}),
     sanitize(b.notes), req.user.id]);`,
`     valor_solicitado, valor_liberado, previsao_por_categoria, transporte_detalhes, notes, created_by, origem,
     solicitacao_pai_id, complementar_tipo, partida_uf, partida_municipio)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,'colaborador',$15,$16,$17,$18) RETURNING id\`,
    [colab.id, colab.tier, categoriaLocal, sanitize(b.ordem_trabalho), JSON.stringify(b.destinos || []), sanitize(b.motivo),
     sanitize(b.objetivo), b.data_inicio, b.data_fim, totalSolicitado, JSON.stringify(cat), JSON.stringify(b.transporte_detalhes || {}),
     sanitize(b.notes), req.user.id, pai ? pai.id : null, complTipo, partida ? partida.uf : null, partida ? partida.municipio : null]);`);

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
