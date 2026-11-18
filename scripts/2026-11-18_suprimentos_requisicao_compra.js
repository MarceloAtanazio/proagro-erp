// Propósito: Suprimentos: nova aba "Requisições de compra". Registra o processo antes de efetivar a compra: quem solicita e por quê, os itens (do estoque, com tamanho, ou livres), os orçamentos
//   (fornecedor, valor, prazo, condição, validade, anexo em PDF/foto), a escolha de um orçamento com justificativa (obrigatória quando não é o de menor valor ou é o único), a aprovação ou
//   reprovação (quem, quando, por quê), a marcação de compra efetivada e a linha do tempo de tudo. Fluxo: em cotação -> aguardando aprovação -> aprovada | reprovada; aprovada -> comprada; cancelada.
//   Depois de enviada para aprovação, itens, orçamentos e anexos ficam congelados. Leitura: quem vê Suprimentos; escrita: quem edita.
//   REQUER a migração supabase/migrations/2026-11-18-suprimentos-requisicao-compra.sql (tabelas erp_compra_* e o tipo de anexo rc_orcamento) aplicada ANTES do deploy.
// Entrada: api/index.js, public/app.js, public/styles.css (ou a pasta em argv[2]) e os blocos scripts/2026-11-18_rc_*.txt. Saída: arquivos editados.
// Uso: node scripts/2026-11-18_suprimentos_requisicao_compra.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = nome => fs.readFileSync(path.join(__dirname, nome), 'utf8').replace(/\r\n/g, '\n');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; });
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}

edita('api/index.js', (troca, get) => {
  if (get().includes('rcCarregar')) throw new Error('api já aplicado');
  // auditoria
  troca("  'DELETE /api/suprimentos/itens/:id':",
    "  'POST /api/suprimentos/requisicoes': (req, body) => `Criou a requisição de compra ID ${body && body.id}: \"${String(req.body && req.body.titulo || '').slice(0, 120)}\"`,\n" +
    "  'PUT /api/suprimentos/requisicoes/:id': req => `Editou a requisição de compra ID ${req.params.id}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/orcamentos': req => `Adicionou orçamento (${req.body && (req.body.fornecedor_nome || 'fornecedor ' + req.body.supplier_id)}, R$ ${req.body && req.body.valor_total}) à requisição de compra ID ${req.params.id}`,\n" +
    "  'PUT /api/suprimentos/requisicoes/:id/orcamentos/:oid': req => `Alterou o orçamento ID ${req.params.oid} da requisição de compra ID ${req.params.id} (R$ ${req.body && req.body.valor_total})`,\n" +
    "  'DELETE /api/suprimentos/requisicoes/:id/orcamentos/:oid': req => `Removeu o orçamento ID ${req.params.oid} da requisição de compra ID ${req.params.id}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/escolher': req => `Escolheu o orçamento ID ${req.body && req.body.orcamento_id} na requisição de compra ID ${req.params.id} — justificativa: \"${String(req.body && req.body.justificativa || '').slice(0, 200)}\"`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/enviar-aprovacao': req => `Enviou a requisição de compra ID ${req.params.id} para aprovação`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/decidir': req => `${req.body && req.body.aprovar === true ? 'APROVOU' : 'REPROVOU'} a requisição de compra ID ${req.params.id}${req.body && req.body.motivo ? ' — ' + String(req.body.motivo).slice(0, 200) : ''}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/reabrir': req => `Reabriu para cotação a requisição de compra ID ${req.params.id} — ${String(req.body && req.body.motivo || '').slice(0, 200)}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/comprar': req => `Marcou como comprada a requisição de compra ID ${req.params.id}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/cancelar': req => `Cancelou a requisição de compra ID ${req.params.id} — ${String(req.body && req.body.motivo || '').slice(0, 200)}`,\n" +
    "  'POST /api/suprimentos/requisicoes/:id/excluir': (req, body) => `Excluiu a requisição de compra ID ${req.params.id}${body && body.resumo ? ' (' + body.resumo + ')' : ''} — justificativa: \"${String(req.body && req.body.motivo || '').slice(0, 200)}\"`,\n" +
    "  'DELETE /api/suprimentos/itens/:id':");
  // anexos de orçamento
  troca("  envio_termo: 'suprimentos'   // termo de responsabilidade assinado do envio a colaborador\n};", "  envio_termo: 'suprimentos',   // termo de responsabilidade assinado do envio a colaborador\n  rc_orcamento: 'suprimentos'   // orçamento (PDF/foto) de uma requisição de compra\n};");
  troca("    envio_termo: 'erp_estoque_movimentos'\n  }[req.params.type];", "    envio_termo: 'erp_estoque_movimentos', rc_orcamento: 'erp_compra_req_orcamentos'\n  }[req.params.type];");
  const congela = "  if (req.params.type === 'rc_orcamento') {\n    const st = (await query('SELECT r.status FROM erp_compra_req_orcamentos o JOIN erp_compra_requisicoes r ON r.id = o.requisicao_id WHERE o.id=$1', [Number(req.params.id)]))[0];\n    if (st && st.status !== 'em_cotacao') return res.status(409).json({ error: 'A requisição já saiu da cotação: os anexos dos orçamentos ficam congelados.' });\n  }\n";
  troca("      return res.status(409).json({ error: 'Este registro já foi enviado — não dá para trocar as fotos agora.' });\n    }\n  }\n", "      return res.status(409).json({ error: 'Este registro já foi enviado — não dá para trocar as fotos agora.' });\n    }\n  }\n" + congela);
  troca("      return res.status(409).json({ error: 'Este registro já foi enviado — a foto faz parte da comprovação.' });\n    }\n  }\n",
    "      return res.status(409).json({ error: 'Este registro já foi enviado — a foto faz parte da comprovação.' });\n    }\n  }\n" +
    "  if (a.entity_type === 'rc_orcamento') {\n    const st = (await query('SELECT r.status FROM erp_compra_req_orcamentos o JOIN erp_compra_requisicoes r ON r.id = o.requisicao_id WHERE o.id=$1', [a.entity_id]))[0];\n    if (st && st.status !== 'em_cotacao') return res.status(409).json({ error: 'A requisição já saiu da cotação: os anexos dos orçamentos ficam congelados.' });\n  }\n");
  // endpoints, antes do bloco "Rota não encontrada dentro de /api"
  troca("// ------------------------------------------------------------\n// Rota não encontrada dentro de /api", bloco('2026-11-18_rc_api.txt') + "// ------------------------------------------------------------\n// Rota não encontrada dentro de /api");
});

edita('public/app.js', (troca, get) => {
  if (get().includes('supRenderRequisicoes')) throw new Error('front já aplicado');
  troca("      <button class=\"sup-tab\" data-tab=\"compras\">Compras</button>", "      <button class=\"sup-tab\" data-tab=\"compras\">Compras</button>\n      <button class=\"sup-tab\" data-tab=\"requisicoes\">Requisições de compra</button>");
  troca("({ estoque: supRenderEstoque, compras: supRenderCompras, envios: supRenderEnvios }[SUP_TAB])", "({ estoque: supRenderEstoque, compras: supRenderCompras, requisicoes: supRenderRequisicoes, envios: supRenderEnvios }[SUP_TAB])");
  troca("// ---- Aba Envios a funcionários ----", bloco('2026-11-18_rc_front.txt') + "// ---- Aba Envios a funcionários ----");
  troca("  envio_termo: 'suprimentos' }[t] || 'receber');", "  envio_termo: 'suprimentos', rc_orcamento: 'suprimentos' }[t] || 'receber');");
});

edita('public/styles.css', (troca, get, set) => {
  if (get().includes('.rc-linha-tempo')) throw new Error('css já aplicado');
  set(get().replace(/\s+$/, '\n') + bloco('2026-11-18_rc_css.txt'));
});
console.log('ok');
