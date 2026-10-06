// Propósito: troca, em api/index.js, a escolha de unidade pré-cadastrada por nº de série DIGITADO
//   no envio (a unidade é criada na hora se não existir). Entrada: api/index.js. Saída: api/index.js editado.
// Uso: node scripts/2026-10-06_envio_por_serie_digitado.js
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
function troca(de, para) { if (!s.includes(de)) throw new Error('trecho não achado: ' + de.slice(0, 60)); s = s.replace(de, () => para); }

troca(`// Envio a colaborador: saída do estoque`, `// Acha a unidade pelo nº de série digitado no envio; se for a primeira vez que
// esse aparelho aparece, cria. Devolve { unidade } ou { erro }.
async function unidadePorSerie(item, serie, patrimonio, userId, soExistente) {
  serie = sanitize(serie) || ''; patrimonio = sanitize(patrimonio) || '';
  if (!serie) return { erro: 'Informe o número de série do equipamento enviado.' };
  let u = (await query('SELECT * FROM erp_estoque_unidades WHERE item_id=$1 AND numero_serie=$2', [item.id, serie]))[0];
  if (u) {
    if (u.estado === 'baixado') return { erro: 'Esta unidade foi baixada do estoque e não pode ser enviada.' };
    if (u.estado !== 'em_estoque') return { erro: 'Este nº de série já está em custódia com outro colaborador. Registre a devolução antes de enviar de novo.' };
    return { unidade: u };
  }
  if (soExistente) return { erro: 'Unidade não encontrada.' };
  if (patrimonio) {
    const dup = await query('SELECT id FROM erp_estoque_unidades WHERE patrimonio=$1', [patrimonio]);
    if (dup.length) return { erro: 'Já existe uma unidade com este patrimônio.' };
  }
  const r = await query(\`INSERT INTO erp_estoque_unidades (item_id, numero_serie, patrimonio, created_by)
    VALUES ($1,$2,$3,$4) RETURNING id\`, [item.id, serie, patrimonio, userId]);
  return { unidade: { id: r[0].id, item_id: item.id, numero_serie: serie, patrimonio, estado: 'em_estoque' } };
}

// Envio a colaborador: saída do estoque`);

troca(`    if (!b.unidade_id) return res.status(400).json({ error: 'Selecione a unidade (nº de série) do equipamento. Cadastre as unidades em Estoque > Unidades.' });
    unidade = (await query('SELECT * FROM erp_estoque_unidades WHERE id=$1', [b.unidade_id]))[0];
    if (!unidade || unidade.item_id !== item.id) return res.status(400).json({ error: 'Unidade inválida para este item.' });
    if (unidade.estado !== 'em_estoque') return res.status(400).json({ error: 'Esta unidade não está disponível em estoque (já em custódia ou baixada).' });
    qtd = 1;`, `    const r = await unidadePorSerie(item, b.numero_serie, b.patrimonio, req.user.id);
    if (r.erro) return res.status(400).json({ error: r.erro });
    unidade = r.unidade;
    qtd = 1;`);

troca(`  if (b.unidade_id && Number(b.unidade_id) !== env.unidade_id) {
    if (env.unidade_id) return res.status(400).json({ error: 'Este envio já tem uma unidade vinculada.' });
    if (env.status === 'devolvido') return res.status(400).json({ error: 'Envio já devolvido.' });
    const u = (await query('SELECT * FROM erp_estoque_unidades WHERE id=$1', [b.unidade_id]))[0];
    if (!u || u.item_id !== env.item_id) return res.status(400).json({ error: 'Unidade inválida para este item.' });
    if (u.estado !== 'em_estoque') return res.status(400).json({ error: 'Esta unidade não está disponível em estoque.' });
    await query(\`UPDATE erp_estoque_unidades SET estado='em_custodia' WHERE id=$1\`, [u.id]);
    unidadeId = u.id;
  }`, `  if (sanitize(b.numero_serie) && !env.unidade_id) {
    if (env.status === 'devolvido') return res.status(400).json({ error: 'Envio já devolvido.' });
    const item = (await query('SELECT * FROM erp_estoque_itens WHERE id=$1', [env.item_id]))[0];
    const r = await unidadePorSerie(item, b.numero_serie, b.patrimonio, req.user.id);
    if (r.erro) return res.status(400).json({ error: r.erro });
    await query(\`UPDATE erp_estoque_unidades SET estado='em_custodia' WHERE id=$1\`, [r.unidade.id]);
    unidadeId = r.unidade.id;
  }`);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
