// Propósito: servidor: novo tipo de anexo 'viatico_cotacao' (evidência da cotação/indisponibilidade de carro locado anexada à SOLICITAÇÃO de viagem pelo Direcionador de mobilidade).
//   Regras iguais às das fotos de quilometragem: quem edita Viáticos anexa e vê tudo; o colaborador com só leitura (o de campo que faz a própria solicitação) anexa e vê SÓ as evidências das
//   próprias solicitações (anexoSolicitacaoNoEscopo); excluir fica com quem edita. REQUER a migração supabase/migrations/2026-11-19-viaticos-evidencia-cotacao.sql aplicada.
// Entrada: api/index.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-19_viaticos_evidencia_cotacao_api.js [raiz]
const fs = require('fs'), path = require('path');
const p = path.join(process.argv[2] || path.join(__dirname, '..'), 'api/index.js');
let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
if (s.includes('anexoSolicitacaoNoEscopo')) throw new Error('já aplicado');

troca("  viatico_km: 'viaticos',   // fotos do odômetro; qual é qual vai em doc_tipo\n", "  viatico_km: 'viaticos',   // fotos do odômetro; qual é qual vai em doc_tipo\n  viatico_cotacao: 'viaticos',   // evidência da cotação do carro locado (ou da indisponibilidade), anexada à solicitação\n");
troca("// IMPORTANTE: rotas com segmento literal (\"file\", \"count\")",
  "// A evidência da cotação pertence a uma SOLICITAÇÃO de viagem: quem só tem leitura em Viáticos (o colaborador de campo) vê e anexa só as das próprias solicitações.\nasync function anexoSolicitacaoNoEscopo(user, solicitacaoId) {\n  const escopo = await viaticosEscopo(user);\n  if (!escopo) return true;\n  const r = await query('SELECT 1 FROM erp_viaticos_solicitacoes WHERE id = $1 AND colaborador_id = ANY($2)', [Number(solicitacaoId), escopo]);\n  return r.length > 0;\n}\n\n// IMPORTANTE: rotas com segmento literal (\"file\", \"count\")");
// download
troca("  if (a.entity_type === 'viatico_km' && !(await anexoKmNoEscopo(req.user, a.entity_id))) {\n    return res.status(403).json({ error: 'Esta foto pertence à viagem de outro colaborador.' });\n  }\n  res.json({ file_name: a.file_name,",
  "  if (a.entity_type === 'viatico_km' && !(await anexoKmNoEscopo(req.user, a.entity_id))) {\n    return res.status(403).json({ error: 'Esta foto pertence à viagem de outro colaborador.' });\n  }\n  if (a.entity_type === 'viatico_cotacao' && !(await anexoSolicitacaoNoEscopo(req.user, a.entity_id))) {\n    return res.status(403).json({ error: 'Esta evidência pertence à solicitação de outro colaborador.' });\n  }\n  res.json({ file_name: a.file_name,");
// lista
troca("  const rows = await query(\n    `SELECT id, kind, doc_tipo, file_name, mime_type, byte_size, created_at\n       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC`,",
  "  if (req.params.type === 'viatico_cotacao' && !(await anexoSolicitacaoNoEscopo(req.user, req.params.id))) {\n    return res.status(403).json({ error: 'Esta solicitação pertence a outro colaborador.' });\n  }\n  const rows = await query(\n    `SELECT id, kind, doc_tipo, file_name, mime_type, byte_size, created_at\n       FROM erp_attachments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC`,");
// upload
troca("  if (req.user.role !== 'admin' && !canEdit(req.user, page) && !ehFotoKmPropria) {\n    return res.status(403).json({ error: 'Sem permissão para anexar nesta seção.' });\n  }",
  "  const ehEvidenciaPropria = req.params.type === 'viatico_cotacao' && await anexoSolicitacaoNoEscopo(req.user, req.params.id);\n  if (req.user.role !== 'admin' && !canEdit(req.user, page) && !ehFotoKmPropria && !ehEvidenciaPropria) {\n    return res.status(403).json({ error: 'Sem permissão para anexar nesta seção.' });\n  }");
troca("    viatico_km: 'erp_viaticos_km',\n", "    viatico_km: 'erp_viaticos_km', viatico_cotacao: 'erp_viaticos_solicitacoes',\n");
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
