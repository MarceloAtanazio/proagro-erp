// Propósito: API da aprovação compartilhada em Contas a Pagar e dos dados do pacote ZIP da tesouraria:
//   - POST   /api/payables/aprovacoes/vincular        liga uma aprovação (anexo) a vários títulos
//   - DELETE /api/payables/:id/aprovacoes/:attId      desliga um título da aprovação (não apaga o arquivo)
//   - GET    /api/payables/aprovacoes/existentes      aprovações já anexadas (para "usar uma existente")
//   - POST   /api/payables/pacote                     boletos e aprovações (inclusive as compartilhadas) dos títulos
//   - GET /api/attachments/payable/:id  passa a listar também as aprovações compartilhadas com o título
//   - GET /api/payables  conta (attachment_count/aprovacao_count) também as aprovações compartilhadas
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-15_pagar_aprovacao_compartilhada_api.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

// ---- contagem na listagem de Contas a Pagar ----
troca(s.includes('') ? `      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id) AS attachment_count,
      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id AND a.kind='aprovacao') AS aprovacao_count,
` : '', `      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id)
        + (SELECT COUNT(*)::int FROM erp_payable_aprovacoes l WHERE l.payable_id=p.id) AS attachment_count,
      (SELECT COUNT(*)::int FROM erp_attachments a WHERE a.entity_type='payable' AND a.entity_id=p.id AND a.kind='aprovacao')
        + (SELECT COUNT(*)::int FROM erp_payable_aprovacoes l WHERE l.payable_id=p.id) AS aprovacao_count,
`);

// ---- lista de anexos de um título: inclui as aprovações compartilhadas ----
troca(`  const rows = await query(
    \`SELECT id, kind, doc_tipo, file_name, mime_type, byte_size, created_at
       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC\`,
    [req.params.type, Number(req.params.id)]
  );
  res.json(rows);`,
`  const rows = await query(
    \`SELECT id, kind, doc_tipo, file_name, mime_type, byte_size, created_at
       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC\`,
    [req.params.type, Number(req.params.id)]
  );
  if (req.params.type !== 'payable') return res.json(rows);
  // Contas a Pagar: uma aprovação pode valer para vários títulos. Para o dono do arquivo, informa para
  // quantos OUTROS títulos ele vale; para os demais, devolve a aprovação marcada como compartilhada.
  const donas = rows.filter(r => r.kind === 'aprovacao').map(r => r.id);
  const contagem = donas.length
    ? await query('SELECT attachment_id, COUNT(*)::int AS n FROM erp_payable_aprovacoes WHERE attachment_id = ANY($1::int[]) GROUP BY attachment_id', [donas])
    : [];
  const mapa = Object.fromEntries(contagem.map(c => [c.attachment_id, c.n]));
  const comp = await query(
    \`SELECT a.id, a.kind, a.doc_tipo, a.file_name, a.mime_type, a.byte_size, a.created_at,
            a.entity_id AS dono_id, p.description AS dono_descricao
       FROM erp_payable_aprovacoes l
       JOIN erp_attachments a ON a.id = l.attachment_id
       LEFT JOIN erp_payables p ON p.id = a.entity_id
      WHERE l.payable_id = $1\`, [Number(req.params.id)]);
  const todos = [
    ...rows.map(r => ({ ...r, vale_para_outros: mapa[r.id] || 0 })),
    ...comp.map(r => ({ ...r, compartilhada: true }))
  ];
  todos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(todos);`);

// ---- rotas novas (antes do DELETE do título, para nenhuma rota genérica engolir os caminhos) ----
troca(`app.delete('/api/payables/:id', requireAuth, requireEdit('pagar'), h(async (req, res) => {`,
`// ---- Aprovação compartilhada: um mesmo anexo "Aprovação" vale para vários títulos ----
// O arquivo fica guardado uma vez só (no título onde foi anexado); estes vínculos ligam os outros títulos a ele.
app.post('/api/payables/aprovacoes/vincular', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const attId = Number(req.body.attachment_id);
  const ids = [...new Set((Array.isArray(req.body.payable_ids) ? req.body.payable_ids : []).map(Number).filter(Number.isInteger))];
  if (!Number.isInteger(attId)) return res.status(400).json({ error: 'Aprovação inválida.' });
  if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um título.' });
  if (ids.length > 500) return res.status(400).json({ error: 'Selecione no máximo 500 títulos por vez.' });
  const att = (await query(\`SELECT id, entity_id FROM erp_attachments WHERE id=$1 AND entity_type='payable' AND kind='aprovacao'\`, [attId]))[0];
  if (!att) return res.status(404).json({ error: 'Aprovação não encontrada. Só anexos do tipo Aprovação podem ser compartilhados.' });
  const validos = (await query('SELECT id FROM erp_payables WHERE id = ANY($1::int[])', [ids]))
    .map(r => r.id).filter(id => id !== att.entity_id);
  if (validos.length) {
    await query(\`INSERT INTO erp_payable_aprovacoes (payable_id, attachment_id, created_by)
      SELECT unnest($1::int[]), $2, $3 ON CONFLICT DO NOTHING\`, [validos, attId, req.user.id]);
  }
  res.json({ ok: true, vinculados: validos.length });
}));

app.delete('/api/payables/:id/aprovacoes/:attId', requireAuth, requireEdit('pagar'), h(async (req, res) => {
  const r = await query('DELETE FROM erp_payable_aprovacoes WHERE payable_id=$1 AND attachment_id=$2 RETURNING payable_id',
    [Number(req.params.id), Number(req.params.attId)]);
  if (!r.length) return res.status(404).json({ error: 'Este título não está vinculado a essa aprovação.' });
  res.json({ ok: true });
}));

app.get('/api/payables/aprovacoes/existentes', requireAuth, requireViewAny(['pagar']), h(async (req, res) => {
  res.json(await query(\`
    SELECT a.id, a.file_name, a.created_at, a.entity_id AS dono_id, p.description AS dono_descricao,
           (SELECT COUNT(*)::int FROM erp_payable_aprovacoes l WHERE l.attachment_id = a.id) + 1 AS titulos
      FROM erp_attachments a LEFT JOIN erp_payables p ON p.id = a.entity_id
     WHERE a.entity_type='payable' AND a.kind='aprovacao'
     ORDER BY a.created_at DESC LIMIT 200\`));
}));

// Pacote da tesouraria: boletos e aprovações (inclusive as compartilhadas) dos títulos informados. Só metadados;
// os arquivos são baixados um a um por /api/attachments/file/:id (que já confere a permissão).
app.post('/api/payables/pacote', requireAuth, requireViewAny(['pagar']), h(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ error: 'Nenhum título informado.' });
  if (ids.length > 1000) return res.status(400).json({ error: 'Filtre menos títulos (máximo 1000 por pacote).' });
  res.json(await query(\`
    SELECT a.entity_id AS payable_id, a.id, a.kind, a.file_name, a.mime_type, a.byte_size, a.created_at
      FROM erp_attachments a
     WHERE a.entity_type='payable' AND a.kind IN ('boleto','aprovacao') AND a.entity_id = ANY($1::int[])
    UNION ALL
    SELECT l.payable_id, a.id, a.kind, a.file_name, a.mime_type, a.byte_size, a.created_at
      FROM erp_payable_aprovacoes l JOIN erp_attachments a ON a.id = l.attachment_id
     WHERE l.payable_id = ANY($1::int[])
    ORDER BY payable_id, created_at, id\`, [ids]));
}));

app.delete('/api/payables/:id', requireAuth, requireEdit('pagar'), h(async (req, res) => {`);

// ---- auditoria ----
troca("  'DELETE /api/payables/:id': req => `Excluiu o título a pagar ID ${req.params.id}`,",
"  'DELETE /api/payables/:id': req => `Excluiu o título a pagar ID ${req.params.id}`,\n" +
"  'POST /api/payables/aprovacoes/vincular': (req, body) => `Vinculou a aprovação (anexo ID ${req.body.attachment_id}) a ${body && body.vinculados} título(s) a pagar (IDs ${(req.body.payable_ids || []).join(', ')})`,\n" +
"  'DELETE /api/payables/:id/aprovacoes/:attId': req => `Desvinculou o título a pagar ID ${req.params.id} da aprovação (anexo ID ${req.params.attId})`,");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
