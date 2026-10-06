// Propósito: em api/index.js, (1) grava linha telefônica/operadora no envio, (2) edição COMPLETA do envio
//   (colaborador, data, quantidade de material, série/patrimônio, forma, rastreio, linha...), (3) DELETE do envio.
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-06_envios_editar_excluir_api.js
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 70)); s = s.replace(de, () => para); };

troca('      i.marca AS item_marca, i.sku AS item_sku,', '      i.marca AS item_marca, i.sku AS item_sku, i.subcategoria AS item_subcategoria,');

troca(`     unidade_id, forma_envio, codigo_rastreio, condicao_saida)
    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10) RETURNING id\`,
    [item.id, qtd, b.colaborador_id, data, sanitize(b.notes), req.user.id,
     unidade ? unidade.id : null, sanitize(b.forma_envio), sanitize(b.codigo_rastreio), sanitize(b.condicao_saida)]);`,
`     unidade_id, forma_envio, codigo_rastreio, condicao_saida, linha_telefonica, operadora)
    VALUES ($1,'saida','envio',$2,$3,'enviado',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id\`,
    [item.id, qtd, b.colaborador_id, data, sanitize(b.notes), req.user.id,
     unidade ? unidade.id : null, sanitize(b.forma_envio), sanitize(b.codigo_rastreio), sanitize(b.condicao_saida),
     sanitize(b.linha_telefonica), sanitize(b.operadora)]);`);

const ini = s.indexOf('// Complementa um envio já registrado');
const fim = s.indexOf('// ---- Unidades físicas (nº de série / patrimônio) dos equipamentos ----');
if (ini < 0 || fim < 0) throw new Error('marcadores do PUT');
const novo = `// Edita um envio já registrado. O item não muda (para trocar, exclua e registre
// de novo); o resto sim — e o estoque/unidade acompanham a mudança.
app.put('/api/suprimentos/envios/:id', requireAuth, SUP_EDIT, h(async (req, res) => {
  const b = req.body;
  const env = (await query(\`SELECT m.*, i.tipo AS item_tipo FROM erp_estoque_movimentos m JOIN erp_estoque_itens i ON i.id=m.item_id
    WHERE m.id=$1 AND m.origem='envio'\`, [req.params.id]))[0];
  if (!env) return res.status(404).json({ error: 'Envio não encontrado.' });
  const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [env.item_id]))[0];
  const devolvido = env.status === 'devolvido', equip = env.item_tipo === 'equipamento';

  let colabId = env.colaborador_id;
  if (b.colaborador_id && Number(b.colaborador_id) !== env.colaborador_id) {
    const c = (await query('SELECT id FROM erp_colaboradores WHERE id=$1', [b.colaborador_id]))[0];
    if (!c) return res.status(400).json({ error: 'Colaborador inválido.' });
    colabId = c.id;
  }
  const data = isDate(b.data) ? b.data : env.data;

  let qtd = Number(env.quantidade);
  if (!equip && b.quantidade != null && b.quantidade !== '' && Number(b.quantidade) !== qtd) {
    const nova = Number(b.quantidade);
    if (!isFinite(nova) || nova <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
    const extra = nova - qtd;
    if (extra > 0) {
      const saldo = await estoqueAtualItem(env.item_id);
      if (extra > saldo) return res.status(400).json({ error: \`Estoque insuficiente: disponível \${saldo} \${item.unidade}.\` });
    }
    qtd = nova;
  }

  let unidadeId = env.unidade_id;
  if (equip) {
    const atual = env.unidade_id ? (await query('SELECT * FROM erp_estoque_unidades WHERE id=$1', [env.unidade_id]))[0] : null;
    const serieNova = sanitize(b.numero_serie) || '';
    if (serieNova && (!atual || serieNova !== atual.numero_serie)) {
      if (devolvido) return res.status(400).json({ error: 'Envio já devolvido: o nº de série não pode mais ser trocado.' });
      const r = await unidadePorSerie(item, serieNova, b.patrimonio, req.user.id);
      if (r.erro) return res.status(400).json({ error: r.erro });
      await query(\`UPDATE erp_estoque_unidades SET estado='em_custodia' WHERE id=$1\`, [r.unidade.id]);
      if (atual) await query(\`UPDATE erp_estoque_unidades SET estado='em_estoque' WHERE id=$1 AND estado='em_custodia'\`, [atual.id]);
      unidadeId = r.unidade.id;
    } else if (atual && b.patrimonio !== undefined) {
      const pat = sanitize(b.patrimonio) || '';
      if (pat !== atual.patrimonio) {
        if (pat) {
          const dup = await query('SELECT id FROM erp_estoque_unidades WHERE patrimonio=$1 AND id <> $2', [pat, atual.id]);
          if (dup.length) return res.status(400).json({ error: 'Já existe uma unidade com este patrimônio.' });
        }
        await query('UPDATE erp_estoque_unidades SET patrimonio=$1 WHERE id=$2', [pat, atual.id]);
      }
    }
  }

  await query(\`UPDATE erp_estoque_movimentos SET colaborador_id=$1, data=$2, quantidade=$3, unidade_id=$4, forma_envio=$5,
      codigo_rastreio=$6, condicao_saida=$7, condicao_devolucao=$8, linha_telefonica=$9, operadora=$10, notes=$11 WHERE id=$12\`,
    [colabId, data, qtd, unidadeId, sanitize(b.forma_envio), sanitize(b.codigo_rastreio), sanitize(b.condicao_saida),
     devolvido ? sanitize(b.condicao_devolucao) : env.condicao_devolucao,
     sanitize(b.linha_telefonica), sanitize(b.operadora), sanitize(b.notes), env.id]);
  if (colabId !== env.colaborador_id) await query('UPDATE erp_estoque_movimentos SET colaborador_id=$1 WHERE devolucao_de=$2', [colabId, env.id]);
  res.json({ ok: true });
}));

// Exclui o envio inteiro: some a saída, a devolução ligada a ela e o termo anexado;
// a unidade volta ao estoque e o saldo se recompõe (ele é a soma dos movimentos).
app.delete('/api/suprimentos/envios/:id', requireAuth, SUP_EDIT, h(async (req, res) => {
  const env = (await query(\`SELECT * FROM erp_estoque_movimentos WHERE id=$1 AND origem='envio'\`, [req.params.id]))[0];
  if (!env) return res.status(404).json({ error: 'Envio não encontrado.' });
  await query(\`DELETE FROM erp_attachments WHERE entity_type='envio_termo' AND entity_id=$1\`, [env.id]);
  await query('DELETE FROM erp_estoque_movimentos WHERE devolucao_de=$1', [env.id]);
  await query('DELETE FROM erp_estoque_movimentos WHERE id=$1', [env.id]);
  if (env.unidade_id && env.status !== 'devolvido') {
    await query(\`UPDATE erp_estoque_unidades SET estado='em_estoque' WHERE id=$1 AND estado='em_custodia'\`, [env.unidade_id]);
  }
  res.json({ ok: true });
}));

`;
s = s.slice(0, ini) + novo + s.slice(fim);

troca("'PUT /api/suprimentos/envios/:id': req => `Atualizou os dados do envio ID ${req.params.id} (unidade ${req.body.unidade_id || '—'}, rastreio \"${req.body.codigo_rastreio || ''}\")`,",
"'PUT /api/suprimentos/envios/:id': req => `Editou o envio ID ${req.params.id} (série \"${req.body.numero_serie || ''}\", rastreio \"${req.body.codigo_rastreio || ''}\")`,\n  'DELETE /api/suprimentos/envios/:id': req => `Excluiu o envio ID ${req.params.id} (item voltou ao estoque, termo anexado removido)`,");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
