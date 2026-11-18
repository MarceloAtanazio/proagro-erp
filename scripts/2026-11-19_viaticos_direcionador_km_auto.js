// Propósito: Direcionador de mobilidade (Viáticos): (1) a quilometragem vem sozinha pela rota dos municípios da solicitação (viaCalcularRota); (2) o consumo do carro próprio vem do cadastro do colaborador
//   e os parâmetros (reembolso por km, preço do combustível, consumo do locado, extras, período) ficam fixos e escondidos; (3) a pessoa informa só a diária, com a EVIDÊNCIA anexada ao lado (print ou
//   cotação). A evidência é enviada como anexo da solicitação (tipo viatico_cotacao) logo depois que ela é criada, e o resumo do cálculo vai em transporte_detalhes.direcionador; na tela da OT aparece o
//   botão "🧭 Direcionador" com o resumo e a evidência. Este script liga o app.js (antes/depois do envio e o botão na OT) e acrescenta o CSS; a tela e o cálculo estão em public/via-direcionador.js.
//   REQUER a migração supabase/migrations/2026-11-19-viaticos-evidencia-cotacao.sql (tipo de anexo) para a evidência ser aceita; sem ela a solicitação sai normalmente e avisa que a evidência não foi anexada.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-19_viaticos_direcionador_km_auto.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/app.js', (troca, get) => {
  if (get().includes('viaDirecionadorPreEnvio')) throw new Error('js já aplicado');
  troca("    try {\n      await api('/api/viaticos/solicitacoes/autosservico', { method: 'POST', body: {\n        // categoria_local e previsao_por_categoria vão só como referência —",
    "    try {\n      if (typeof viaDirecionadorPreEnvio === 'function') viaDirecionadorPreEnvio(w);\n      const respSol = await api('/api/viaticos/solicitacoes/autosservico', { method: 'POST', body: {\n        // categoria_local e previsao_por_categoria vão só como referência —");
  troca("      }});\n      toast('Solicitação enviada! Ela segue para aprovação.');\n      renderViaticos();\n    } catch (e) { toast(e.message); }\n  };\n}\n\n// \"Tem PDF\" = solicitação criada",
    "      }});\n      if (typeof viaDirecionadorPosEnvio === 'function') await viaDirecionadorPosEnvio(w, respSol && respSol.id);\n      toast('Solicitação enviada! Ela segue para aprovação.');\n      renderViaticos();\n    } catch (e) { toast(e.message); }\n  };\n}\n\n// \"Tem PDF\" = solicitação criada");
  troca("  botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });",
    "  botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });\n  if (s.transporte_detalhes && s.transporte_detalhes.direcionador && typeof viaDirecionadorVer === 'function') botoes.push({ label: '🧭 Direcionador', onClick: () => viaDirecionadorVer(s) });");
  return get();
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.dm-kmbox')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `.dm-info { font-size: 13px; color: var(--ink-2); padding: 9px 12px; border-radius: 10px; background: color-mix(in srgb, var(--muted) 7%, var(--card)); margin-bottom: 10px; }
.dm-km { padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; border: 1px solid var(--line); background: var(--card); margin-bottom: 10px; }
.dm-km.ok { border-color: color-mix(in srgb, var(--verde-500) 45%, var(--line)); background: color-mix(in srgb, var(--verde-500) 8%, var(--card)); } .dm-km.calc { color: var(--muted); }
.dm-km.erro { border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); background: var(--danger-050); }
.dm-km-acoes { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.dm-diaria-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.dm-anexo { display: flex; align-items: center; gap: 8px; min-height: 38px; flex-wrap: wrap; } .dm-sem { font-size: 12px; color: var(--muted); }
.dm-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 6px 4px 10px; border-radius: 999px; font-size: 12px; background: color-mix(in srgb, var(--verde-500) 14%, var(--card)); border: 1px solid color-mix(in srgb, var(--verde-500) 40%, var(--line)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-chip button { border: 0; background: transparent; cursor: pointer; color: var(--muted); font-size: 12px; padding: 0 4px; } .dm-chip button:hover { color: var(--danger); }
@media (max-width: 560px) { .dm-diaria-row { grid-template-columns: 1fr; } }
`;
});
console.log('ok');
// Ajuste manual adicional (já aplicado): em public/app.js, pageForType passou a mapear viatico_cotacao e viatico_km para 'viaticos'.
