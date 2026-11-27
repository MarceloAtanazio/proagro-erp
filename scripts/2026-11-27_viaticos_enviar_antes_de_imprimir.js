// Proposito: no assistente de solicitacao de viaticos, remove o botao "Gerar PDF" (resumo e custo extra)
//   e, depois do envio bem-sucedido, abre um dialogo perguntando se a pessoa quer imprimir o PDF.
// Entradas: public/app.js (caminho relativo a raiz do repo).
// Saidas: public/app.js alterado no lugar (preserva CRLF/LF).
// Como executar: node scripts/2026-11-27_viaticos_enviar_antes_de_imprimir.js
const fs = require('fs');
const p = 'public/app.js';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('trecho nao unico/ausente (' + n + '): ' + a.slice(0, 60));
  s = s.replace(a, () => b);
}
function cut(ini, fim) {
  const i = s.indexOf(ini), j = s.indexOf(fim);
  if (i < 0 || j < i) throw new Error('corte invalido: ' + ini.slice(0, 40));
  s = s.slice(0, i) + s.slice(j);
}
rep('Use <strong>Gerar PDF</strong> para anexar o pedido no Approvals. Pendências', 'Ao enviar, você poderá imprimir o PDF para anexar o pedido no Approvals. Pendências');
rep('<button class="btn" id="ce-pdf">Gerar PDF</button><button class="btn primary" id="ce-enviar">', '<button class="btn primary" id="ce-enviar">');
cut("  $('#ce-pdf').onclick = async (ev) => {", "  $('#ce-enviar').onclick");
rep(`      toast('Solicitação enviada! Ela segue para aprovação.');
      renderViaticos();
    } catch (e) { btn.disabled = false; toast(e.message); }`, `      toast('Solicitação enviada! Ela segue para aprovação.');
      renderViaticos();
      viaPerguntarImprimirPdf(() => viaGerarPdfCustoExtra({ colab: w.colab, ot: null, otOrigem: k.raiz, pai: k.pai, tipo: ce.tipo, descricao: ce.tipo === 'outro' ? ce.descricao : '',
        valor: Number(String(ce.valor).replace(',', '.')), justificativa: ce.justificativa, destinos: k.destinos_pai }));
    } catch (e) { btn.disabled = false; toast(e.message); }`);
rep(`          <button class="btn" id="wiz-pdf">Gerar PDF</button>
`, '');
cut("  $('#wiz-pdf').onclick = async (ev) => {", "  $('#wiz-enviar').onclick");
rep(`      toast('Solicitação enviada! Ela segue para aprovação.');
      renderViaticos();
    } catch (e) { toast(e.message); }
  };
}
`, `      toast('Solicitação enviada! Ela segue para aprovação.');
      renderViaticos();
      viaPerguntarImprimirPdf(() => viaGerarPDF(w, r));
    } catch (e) { toast(e.message); }
  };
}

// Depois de enviada a solicitação: pergunta se a pessoa quer imprimir o PDF.
// O envio já está feito; "Agora não" não desfaz nada (o PDF pode ser baixado depois, no resumo da OT).
function viaPerguntarImprimirPdf(gerar) {
  openModal('Solicitação enviada ✓',
    '<p style="margin:0 0 8px">Sua solicitação foi enviada e segue para aprovação.</p><p style="margin:0">Deseja imprimir o PDF agora, para anexar no Approvals?</p>',
    [
      { label: 'Agora não', onClick: closeModal },
      { label: '🖨 Imprimir PDF', cls: 'primary', onClick: async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Gerando PDF…';
        try { await gerar(); closeModal(); } catch (e) { btn.disabled = false; btn.textContent = '🖨 Imprimir PDF'; toast(e.message || 'Não foi possível gerar o PDF.'); }
      } }
    ]);
}
`);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s);
console.log('ok');
