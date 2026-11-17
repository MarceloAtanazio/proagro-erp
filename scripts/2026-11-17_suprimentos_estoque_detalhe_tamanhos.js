// Propósito: Suprimentos > Estoque: a coluna Estoque mostra só o total do item. Nos itens com grade de tamanhos aparece um botão "▾ Ver por tamanho" (em vermelho "· N abaixo do mínimo" quando
//   algum tamanho está abaixo do mínimo) que abre, logo abaixo da linha, os cartões de cada tamanho (estoque e mínimo; vermelho abaixo do mínimo, apagado se zerado, "Sem tam." a classificar).
//   O estado aberto/fechado de cada item é lembrado ao filtrar ou buscar. A coluna Mínimo mostra só o total dos mínimos (o detalhe está nos cartões). Só aparência.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-17_suprimentos_estoque_detalhe_tamanhos.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/app.js', (troca, get) => {
  if (get().includes('SUP_TAM_ABERTOS')) throw new Error('js já aplicado');
  troca("function supTabelaTamanhos(i) {", `// Itens com a lista de tamanhos aberta na tabela do estoque (lembrado ao filtrar/buscar).
const SUP_TAM_ABERTOS = new Set();
const supQtdAbaixo = i => { const mn = i.minimos_tamanho || {}, st = supPorTam(i); return supGradeDe(i).filter(t => Number(mn[t]) > 0 && Number(st[t] || 0) < Number(mn[t])).length; };
// Cartões por tamanho (estoque e mínimo), mostrados abaixo da linha do item quando a pessoa pede o detalhe.
function supCardsTam(i) {
  const g = supGradeDe(i), st = supPorTam(i), mn = i.minimos_tamanho || {}, sem = Number(st['']) || 0;
  const card = (t, q, m) => \`<div class="sup-tam-c\${m > 0 && q < m ? ' baixo' : ''}\${q === 0 ? ' zero' : ''}"><b>\${esc(t)}</b><span>\${supNum(q)} <small>\${esc(i.unidade || 'un')}</small></span><em>\${m > 0 ? 'mín. ' + supNum(m) : 'sem mínimo'}</em></div>\`;
  return \`<div class="sup-tam-cards"><span class="sup-tam-tit">Estoque por tamanho</span>\${g.map(t => card(t, Number(st[t]) || 0, Number(mn[t]) || 0)).join('')}\${sem ? \`<div class="sup-tam-c sem" title="Saldo sem tamanho definido: classifique os lançamentos no histórico do item (editar)"><b>Sem tam.</b><span>\${supNum(sem)}</span><em>classificar</em></div>\` : ''}</div>\`;
}
function supTabelaTamanhos(i) {`);
  troca("${supGradeDe(i).length ? `<div class=\"sup-tams\">${supChipsTam(i)}</div>` : ''}</td>",
    "${supGradeDe(i).length ? `<div><button type=\"button\" class=\"sup-tam-tog${SUP_TAM_ABERTOS.has(i.id) ? ' on' : ''}\" data-tamtog=\"${i.id}\" aria-expanded=\"${SUP_TAM_ABERTOS.has(i.id)}\" title=\"Mostrar ou ocultar o estoque de cada tamanho\">${SUP_TAM_ABERTOS.has(i.id) ? '▴ Ocultar tamanhos' : '▾ Ver por tamanho'}${supQtdAbaixo(i) ? ` <b>· ${supQtdAbaixo(i)} abaixo do mínimo</b>` : ''}</button></div>` : ''}</td>");
  troca("<td class=\"num\">${supNum(min)}${supGradeDe(i).length ? '<div><small style=\"color:var(--muted)\">por tamanho</small></div>' : ''}</td>",
    "<td class=\"num\"${supGradeDe(i).length ? ' title=\"Soma dos mínimos de cada tamanho\"' : ''}>${supNum(min)}</td>");
  troca("        </tr>`;\n      }).join('') || `<tr><td colspan=\"9\"><div class=\"empty\">Nenhum item cadastrado ainda.",
    "        </tr>${supGradeDe(i).length && SUP_TAM_ABERTOS.has(i.id) ? `<tr class=\"sup-tam-det\"><td colspan=\"9\">${supCardsTam(i)}</td></tr>` : ''}`;\n      }).join('') || `<tr><td colspan=\"9\"><div class=\"empty\">Nenhum item cadastrado ainda.");
  troca("    $('#sup-tbl').querySelectorAll('[data-ficha]')",
    "    $('#sup-tbl').querySelectorAll('[data-tamtog]').forEach(b => b.onclick = () => { const id = Number(b.dataset.tamtog); if (SUP_TAM_ABERTOS.has(id)) SUP_TAM_ABERTOS.delete(id); else SUP_TAM_ABERTOS.add(id); draw(); });\n    $('#sup-tbl').querySelectorAll('[data-ficha]')");
  return get();
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.sup-tam-tog')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `
/* Suprimentos > Estoque: botão "Ver por tamanho" e cartões por tamanho abaixo da linha do item. */
.sup-tam-tog { display: inline-flex; align-items: center; gap: 4px; margin-top: 5px; padding: 3px 9px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); color: var(--ink-2); font: 600 11px var(--font); cursor: pointer; white-space: nowrap; transition: border-color .15s, background .15s; }
.sup-tam-tog:hover { border-color: var(--verde-500); color: var(--ink); } .sup-tam-tog.on { background: color-mix(in srgb, var(--verde-500) 12%, var(--card)); border-color: var(--verde-500); }
.sup-tam-tog b { color: var(--danger); font-weight: 700; }
tr.sup-tam-det > td { padding: 0 16px 14px !important; background: color-mix(in srgb, var(--verde-500) 4%, var(--card)); }
.sup-tam-cards { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; padding-top: 10px; }
.sup-tam-tit { flex-basis: 100%; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.sup-tam-c { min-width: 76px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); display: flex; flex-direction: column; gap: 2px; text-align: center; }
.sup-tam-c b { font-size: 13px; } .sup-tam-c span { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; } .sup-tam-c small { font-size: 11px; color: var(--muted); font-weight: 500; }
.sup-tam-c em { font-style: normal; font-size: 10.5px; color: var(--muted); }
.sup-tam-c.zero { opacity: .6; } .sup-tam-c.baixo { border-color: var(--danger); background: var(--danger-050); } .sup-tam-c.baixo span, .sup-tam-c.baixo em { color: var(--danger); }
.sup-tam-c.sem { border-color: var(--warn); background: var(--warn-050); }
`;
});
console.log('ok');
