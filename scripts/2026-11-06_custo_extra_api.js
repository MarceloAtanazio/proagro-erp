// Propósito: "OT de custo extra" em Viáticos (backend). Terceiro tipo de complementar, ao lado de extensao e novo_destino: pede UM custo avulso
//   (remarcação de passagem, bagagem, taxa/multa, pedágio, estacionamento, outro) sem diária de hospedagem nem de alimentação.
//   O servidor impõe tudo que não é do navegador: número "<raiz> - Custo extra[ N]", período (o da OT de origem, esticado até hoje se preciso, para a
//   comprovação aceitar a data da nota), destinos da origem e a categoria da despesa (ex.: remarcacao_aviao → passagem_aviao). Aceita OT de origem
//   liberada, em viagem ou aguardando comprovação; não aceita complementar de um custo extra. A previsão é o valor informado, numa categoria só.
// Entrada: api/index.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado.
// Uso: node scripts/2026-11-06_custo_extra_api.js [raiz]. Requer a migração supabase/migrations/2026-11-06-viaticos-custo-extra.sql ANTES de publicar.
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 90));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 90));
  s = s.replace(de, () => para);
};

// 1) tabela de tipos de custo extra
troca("app.post('/api/viaticos/solicitacoes/autosservico', requireAuth, requireAutosservico, h(async (req, res) => {",
`// Tipos de custo extra → categoria da despesa que a comprovação já conhece (assim a nota entra como passagem, pedágio etc., sem categoria nova).
const CUSTO_EXTRA_TIPOS = {
  remarcacao_aviao: { label: 'Remarcação de passagem aérea', categoria: 'passagem_aviao' },
  remarcacao_onibus: { label: 'Remarcação de passagem de ônibus', categoria: 'passagem_onibus' },
  bagagem: { label: 'Bagagem extra', categoria: 'outro' },
  taxa_multa: { label: 'Taxa ou multa', categoria: 'outro' },
  pedagio: { label: 'Pedágio extra', categoria: 'pedagio' },
  estacionamento: { label: 'Estacionamento extra', categoria: 'estacionamento' },
  outro: { label: 'Outro custo', categoria: 'outro' }
};
app.post('/api/viaticos/solicitacoes/autosservico', requireAuth, requireAutosservico, h(async (req, res) => {`);

// 2) variáveis
troca("  let pai = null, complTipo = null, partida = null;", "  let pai = null, complTipo = null, partida = null, custoExtra = null;");

// 3) dados da OT de origem
troca("SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim FROM erp_viaticos_solicitacoes WHERE id=$1",
      "SELECT id, colaborador_id, ordem_trabalho, status, destinos, data_fim, data_inicio, motivo, categoria_local, complementar_tipo FROM erp_viaticos_solicitacoes WHERE id=$1");

// 4) estado da origem e tipo
troca(`    if (!['transferencia_agendada', 'liberado', 'em_viagem'].includes(pai.status)) {
      return res.status(400).json({ error: 'Só dá para criar complementar de uma OT em curso (liberada ou em viagem).' });
    }
    complTipo = b.complementar_tipo;
    if (!['extensao', 'novo_destino'].includes(complTipo)) return res.status(400).json({ error: 'Informe o tipo da complementar: estender no local ou novo destino.' });`,
`    complTipo = b.complementar_tipo;
    const ehCustoExtra = complTipo === 'custo_extra';
    if (pai.complementar_tipo === 'custo_extra') return res.status(400).json({ error: 'Uma OT de custo extra não tem complementar: peça pela OT de origem da viagem.' });
    // O custo extra também vale depois da viagem (multa e taxa às vezes só aparecem no fim): aceita OT aguardando comprovação.
    const statusOk = ehCustoExtra ? ['transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'] : ['transferencia_agendada', 'liberado', 'em_viagem'];
    if (!statusOk.includes(pai.status)) {
      return res.status(400).json({ error: ehCustoExtra ? 'Só dá para pedir custo extra de uma OT liberada, em viagem ou aguardando comprovação.' : 'Só dá para criar complementar de uma OT em curso (liberada ou em viagem).' });
    }
    if (!['extensao', 'novo_destino', 'custo_extra'].includes(complTipo)) return res.status(400).json({ error: 'Informe o tipo da complementar: estender no local, novo destino ou custo extra.' });`);

// 5) número e dados do custo extra
troca(`    const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - Complementar( \\d+)?$/i, '');
    const ja = await query('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2',
      [colab.id, raizOt.replace(/[\\\\%_]/g, '\\\\$&') + ' - Complementar%']);
    b.ordem_trabalho = raizOt + ' - Complementar' + (ja.length ? ' ' + (ja.length + 1) : '');
    b.data_inicio = iso(pai.data_fim);
    if (complTipo === 'extensao') b.destinos = dpai;`,
`    const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - (Complementar|Custo extra)( \\d+)?$/i, '');
    const rotuloOt = ehCustoExtra ? ' - Custo extra' : ' - Complementar';
    const ja = await query('SELECT id FROM erp_viaticos_solicitacoes WHERE colaborador_id=$1 AND ordem_trabalho LIKE $2',
      [colab.id, raizOt.replace(/[\\\\%_]/g, '\\\\$&') + rotuloOt + '%']);
    b.ordem_trabalho = raizOt + rotuloOt + (ja.length ? ' ' + (ja.length + 1) : '');
    if (ehCustoExtra) {
      // Custo avulso: sem diárias, sem transporte, sem rota. Só o tipo, o valor e a justificativa; o resto o servidor define.
      const ce = CUSTO_EXTRA_TIPOS[b.custo_extra_tipo];
      if (!ce) return res.status(400).json({ error: 'Escolha o tipo do custo extra.' });
      const valor = Math.round(Number(b.custo_extra_valor) * 100) / 100;
      if (!isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe o valor do custo extra.' });
      if (valor > 50000) return res.status(400).json({ error: 'Valor acima de R$ 50.000,00 para um custo extra: fale com o administrador.' });
      const desc = sanitize(b.custo_extra_descricao) || '', just = sanitize(b.custo_extra_justificativa) || '';
      if (b.custo_extra_tipo === 'outro' && desc.length < 3) return res.status(400).json({ error: 'Descreva qual é o custo extra.' });
      if (just.length < 5) return res.status(400).json({ error: 'Explique por que o custo extra é necessário.' });
      // Período = o da OT de origem, esticado até hoje se preciso: a comprovação só aceita nota com data dentro do período da OT.
      const hoje = hojeISO(), ini0 = iso(pai.data_inicio), fim0 = iso(pai.data_fim);
      b.data_inicio = hoje < ini0 ? hoje : ini0;
      b.data_fim = hoje > fim0 ? hoje : fim0;
      b.destinos = dpai; b.transporte_detalhes = {};
      b.motivo = MOTIVO_OPTIONS.includes(pai.motivo) ? pai.motivo : MOTIVO_OPTIONS[0];
      b.objetivo = ('Custo extra — ' + ce.label + (desc ? ' (' + desc + ')' : '') + ': ' + just).slice(0, 600);
      custoExtra = { tipo: b.custo_extra_tipo, categoria: ce.categoria, valor };
    } else {
      b.data_inicio = iso(pai.data_fim);
      if (complTipo === 'extensao') b.destinos = dpai;
    }`);

// 6) validações que não se aplicam ao custo extra
troca("  if (pai && b.data_fim <= b.data_inicio) return res.status(400)", "  if (pai && !custoExtra && b.data_fim <= b.data_inicio) return res.status(400)");
troca("  if (complTipo !== 'extensao' && !['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].some(k => tp[k])) {",
      "  if (complTipo !== 'extensao' && complTipo !== 'custo_extra' && !['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].some(k => tp[k])) {");

// 7) previsão: o valor informado, numa categoria só
troca("  const { categoriaLocal, cat } = viaRecalcularPrevisao(b, colab, tud, !!pai);",
      "  const { categoriaLocal, cat } = custoExtra\n    ? { categoriaLocal: pai.categoria_local || 'interior', cat: { [custoExtra.categoria]: custoExtra.valor } }\n    : viaRecalcularPrevisao(b, colab, tud, !!pai);");

// 8) gravação
troca("     solicitacao_pai_id, complementar_tipo, partida_uf, partida_municipio)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,'colaborador',$15,$16,$17,$18) RETURNING id`,",
      "     solicitacao_pai_id, complementar_tipo, partida_uf, partida_municipio, custo_extra_tipo)\n    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,'colaborador',$15,$16,$17,$18,$19) RETURNING id`,");
troca("pai ? pai.id : null, complTipo, partida ? partida.uf : null, partida ? partida.municipio : null]);",
      "pai ? pai.id : null, complTipo, partida ? partida.uf : null, partida ? partida.municipio : null, custoExtra ? custoExtra.tipo : null]);");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
