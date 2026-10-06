// Propósito: botão "Etiqueta" nos envios — gera PDF 10x15 cm com DESTINATÁRIO (endereço da ficha do colaborador)
//   e REMETENTE (Configurações > Empresa). Edita api/index.js (rota GET .../envios/:id/etiqueta) e o bloco da aba
//   Envios (scripts/2026-10-06_suprimentos-envios-bloco.txt).
// Uso: node scripts/2026-10-06_envios_etiqueta.js && node scripts/2026-10-06_suprimentos-envios-aplicar.js
const fs = require('fs'), path = require('path');
function abrir(arq) { const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { s: crlf ? s.replace(/\r\n/g, '\n') : s, crlf, arq }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 80)); o.s = o.s.replace(de, () => para); }

// ---------- API ----------
const A = abrir(path.join(__dirname, '..', 'api/index.js'));
troca(A, '// ---- Unidades físicas (nº de série / patrimônio) dos equipamentos ----',
`// Dados da etiqueta de envio: endereço do colaborador (ficha do RH) + remetente (Configurações > Empresa).
// Só devolve o endereço do destinatário DESTE envio, a quem tem edição em Suprimentos.
app.get('/api/suprimentos/envios/:id/etiqueta', requireAuth, SUP_EDIT, h(async (req, res) => {
  const env = (await query(\`SELECT m.id, m.data, m.quantidade, m.forma_envio, m.codigo_rastreio, m.colaborador_id,
      i.nome AS item_nome, un.numero_serie, un.patrimonio
    FROM erp_estoque_movimentos m JOIN erp_estoque_itens i ON i.id = m.item_id
    LEFT JOIN erp_estoque_unidades un ON un.id = m.unidade_id
    WHERE m.id=$1 AND m.origem='envio'\`, [req.params.id]))[0];
  if (!env) return res.status(404).json({ error: 'Envio não encontrado.' });
  const dest = (await query(\`SELECT name, endereco, endereco_numero, endereco_complemento, bairro, municipio, uf, cep, celular
    FROM erp_colaboradores WHERE id=$1\`, [env.colaborador_id]))[0] || {};
  const rem = (await query('SELECT legal_name, trade_name, cnpj, address, phone, email FROM erp_company_settings WHERE id=1'))[0] || {};
  res.json({ envio: env, destinatario: dest, remetente: rem });
}));

// ---- Unidades físicas (nº de série / patrimônio) dos equipamentos ----`);
salvar(A);

// ---------- Front (bloco) ----------
const B = abrir(path.join(__dirname, '2026-10-06_suprimentos-envios-bloco.txt'));

// botão na tabela, logo depois de Detalhes
troca(B, '<button class="btn sm" data-det="${m.id}">Detalhes</button>',
  '<button class="btn sm" data-det="${m.id}">Detalhes</button><button class="btn sm" data-etiq="${m.id}">Etiqueta</button>');
troca(B, "    T.querySelectorAll('[data-det]').forEach(b => b.onclick = () => supDetalheEnvio(achar(b.dataset.det), colaboradores));\n",
  "    T.querySelectorAll('[data-det]').forEach(b => b.onclick = () => supDetalheEnvio(achar(b.dataset.det), colaboradores));\n" +
  "    T.querySelectorAll('[data-etiq]').forEach(b => b.onclick = () => supEtiquetaPDF(achar(b.dataset.etiq)));\n");
// botão nos Detalhes
troca(B, "  const btns = [{ label: 'Fechar', onClick: closeModal }];\n",
  "  const btns = [{ label: 'Fechar', onClick: closeModal }, { label: 'Etiqueta (PDF)', onClick: () => supEtiquetaPDF(m) }];\n");

troca(B, '// Termo de responsabilidade do equipamento',
`// Etiqueta de envio 10x15 cm: destinatário (ficha do colaborador) e remetente (dados da empresa).
async function supEtiquetaPDF(m) {
  if (!window.jspdf) { toast('A biblioteca de PDF ainda está carregando. Tente novamente em instantes.'); return; }
  try {
    const d = await api(\`/api/suprimentos/envios/\${m.id}/etiqueta\`);
    const dest = d.destinatario || {}, rem = d.remetente || {}, env = d.envio || {};
    const faltam = [!dest.endereco && 'endereço', !dest.endereco_numero && 'número', !dest.municipio && 'município', !dest.uf && 'UF', !dest.cep && 'CEP'].filter(Boolean);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [100, 150] });
    const W = 100, M = 6, larg = W - M * 2;
    const txt = (t, x, y, tam, estilo = 'normal', cor = [20, 28, 24]) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor); doc.text(t, x, y); };
    const bloco = (linhas, x, y, tam, estilo, passo, cor) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...(cor || [20, 28, 24]));
      linhas.forEach(l => { const q = doc.splitTextToSize(l, larg); doc.text(q, x, y); y += q.length * passo; });
      return y;
    };
    doc.setDrawColor(40, 50, 44); doc.setLineWidth(0.5); doc.rect(3, 3, W - 6, 144);
    doc.addImage(LOGO_PROAGRO_PNG, 'PNG', M, 7, 26, 26 * (139 / 600));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 100, 94);
    doc.text(\`Envio nº \${env.id}  ·  \${brDate(env.data)}\`, W - M, 11, { align: 'right' });

    // DESTINATÁRIO
    let y = 24;
    txt('DESTINATÁRIO', M, y, 8, 'bold', [0, 120, 63]); y += 6;
    y = bloco([String(dest.name || '—').toUpperCase()], M, y, 14, 'bold', 5.6);
    const lograd = [dest.endereco, dest.endereco_numero].filter(Boolean).join(', ') + (dest.endereco_complemento ? ' - ' + dest.endereco_complemento : '');
    y = bloco([lograd || '—', dest.bairro || ''].filter(Boolean), M, y + 1, 11, 'normal', 4.8);
    y = bloco([[dest.municipio, dest.uf].filter(Boolean).join(' - ') || '—'], M, y, 11, 'normal', 4.8);
    y += 2;
    doc.setLineWidth(0.3); doc.rect(M, y, larg, 13);
    txt('CEP', M + 3, y + 8.5, 8, 'bold', [90, 100, 94]);
    txt(dest.cep ? rhMascaraCEP(rhSoDigitos(dest.cep)) : '—', M + 14, y + 9.5, 20, 'bold');
    y += 18;
    if (dest.celular) { txt(\`Tel.: \${supFone(dest.celular)}\`, M, y, 9); y += 5; }

    // REMETENTE
    y = Math.max(y + 4, 92);
    doc.setLineDashPattern([1.5, 1.5], 0); doc.setLineWidth(0.3); doc.line(M, y - 4, W - M, y - 4); doc.setLineDashPattern([], 0);
    txt('REMETENTE', M, y, 7.5, 'bold', [0, 120, 63]); y += 5;
    y = bloco([rem.legal_name || rem.trade_name || '—'], M, y, 9, 'bold', 4);
    y = bloco([rem.cnpj ? \`CNPJ \${rem.cnpj}\` : '', rem.address || '', [rem.phone && supFone(rem.phone), rem.email].filter(Boolean).join('  ·  ')].filter(Boolean), M, y + 0.5, 8, 'normal', 3.6);

    // Conteúdo
    const conteudo = [\`Conteúdo: \${env.item_nome || m.item_nome}\`, env.numero_serie ? \`Série \${env.numero_serie}\` : '', env.codigo_rastreio ? \`Rastreio \${env.codigo_rastreio}\` : ''].filter(Boolean).join('  ·  ');
    doc.line(M, 136, W - M, 136);
    bloco([conteudo], M, 140, 7, 'normal', 3, [70, 80, 74]);

    doc.save(\`etiqueta-envio-\${m.id}.pdf\`);
    toast(faltam.length ? \`Etiqueta gerada, mas falta no cadastro do colaborador: \${faltam.join(', ')}. Complete na ficha do RH.\` : 'Etiqueta gerada.');
  } catch (e) { toast('Não foi possível gerar a etiqueta: ' + e.message); }
}

// Termo de responsabilidade do equipamento`);
salvar(B);
console.log('ok');
