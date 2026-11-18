// Propósito: PDF do termo único, seção 2 (inventário): a tabela de 9 colunas estreitas quebrava palavras ("Fabricant/e", "Observaçõ/es", números de série) quando acessórios e observações eram longos.
//   Agora cada equipamento é um bloco, como no modelo da TI: faixa verde "ITEM 01" e, abaixo, uma linha com Categoria, Fabricante, Modelo, Nº de série, Patrimônio e Estado (rótulo sobre o valor)
//   e linhas de largura total para Acessórios e Observações (esta só aparece se houver conteúdo, incluindo a linha do celular). Blocos não se partem entre páginas. Só aparência.
// Entrada: public/app.js e o bloco scripts/2026-11-18_termo_front.txt (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_termo_inventario_blocos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const novo = `    itens.forEach((i, k) => {
      nova(38);
      const obs = [i.linha_telefonica ? 'Linha ' + supFone(i.linha_telefonica) + (i.operadora ? ' (' + i.operadora + ')' : '') : '', i.notes].filter(Boolean).join(' · ');
      const rot = { fillColor: VERDE_CLARO, textColor: VERDE, fontStyle: 'bold', fontSize: 7.4 };
      doc.autoTable({ startY: y, margin: { left: M, right: M, top: 14, bottom: RODAPE }, theme: 'grid', rowPageBreak: 'avoid',
        head: [[{ content: \`ITEM \${String(k + 1).padStart(2, '0')}\`, colSpan: 6, styles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 2 } } }],
          ['Categoria', 'Fabricante', 'Modelo', 'Nº de série (S/N)', 'Patrimônio', 'Estado'].map(t => ({ content: t, styles: rot }))],
        body: [[v(i.subcategoria || i.categoria), v(i.marca), v(i.item_nome), v(i.serie), v(i.patrimonio), v(i.estado_saida)],
          [{ content: 'Acessórios', styles: rot }, { content: v(i.condicao_saida), colSpan: 5 }],
          ...(obs ? [[{ content: 'Observações', styles: rot }, { content: obs, colSpan: 5 }]] : [])],
        headStyles: { lineColor: BORDA, lineWidth: 0.2 },
        styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.9, textColor: TXT, lineColor: BORDA, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 26 }, 2: { cellWidth: 50 }, 3: { cellWidth: 36 }, 4: { cellWidth: 22 }, 5: { cellWidth: 22 } } });
      y = doc.lastAutoTable.finalY + 2.5;
    });
    y -= 2.5;
`;
function edita(p) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (s.includes("ITEM ${String(k + 1)")) throw new Error(p + ': já aplicado');
  const ini = s.indexOf("    doc.autoTable({ startY: y, margin: { left: M, right: M, top: 14, bottom: RODAPE }, theme: 'grid',\n      head: [['Item'");
  const marca = "8: { cellWidth: 18 } } });\n", fim = s.indexOf(marca, ini);
  if (ini < 0 || fim < 0) throw new Error(p + ': tabela de inventário não achada');
  s = s.slice(0, ini) + novo + s.slice(fim + marca.length);
  const de = "    doc.autoTable({ startY: doc.lastAutoTable.finalY, margin: { left: M, right: M, bottom: RODAPE }, theme: 'grid',\n      body: [[`Total de itens entregues neste termo:";
  if (s.split(de).length !== 2) throw new Error(p + ': tabela de total não achada');
  s = s.replace(de, () => "    doc.autoTable({ startY: y, margin: { left: M, right: M, bottom: RODAPE }, theme: 'grid',\n      body: [[`Total de itens entregues neste termo:");
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita(path.join(raiz, 'public/app.js'));
edita(path.join(__dirname, '2026-11-18_termo_front.txt'));
console.log('ok');
