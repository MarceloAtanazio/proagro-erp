// Propósito: Requisições de compra > detalhe: o "Por que comprar" saía numa coluna estreita ao lado dos dados e quebrava as linhas. Agora Solicitante, Data da solicitação e Registrada por ficam
//   numa faixa de três colunas (cartão suave) e o motivo ganha um bloco próprio, em largura total, com barra verde à esquerda e texto confortável. Só aparência.
// Entrada: public/app.js, public/styles.css e o bloco scripts/2026-11-18_rc_front.txt (ou a pasta em argv[2]). Saída: arquivos editados.
// Uso: node scripts/2026-11-18_rc_detalhe_cabecalho.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn, base) {
  const p = path.join(base || raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
const de = "    <div class=\"rc-infos\">${info('Solicitante', esc(r.solicitante_nome))}${info('Data da solicitação', rcDia(r.data_solicitacao))}${info('Registrada por', esc(r.created_by_nome || '—'))}${info('Por que comprar', `<span style=\"white-space:pre-wrap\">${esc(r.justificativa)}</span>`)}</div>";
const para = "    <div class=\"rc-infos rc-infos-3\">${info('Solicitante', esc(r.solicitante_nome))}${info('Data da solicitação', rcDia(r.data_solicitacao))}${info('Registrada por', esc(r.created_by_nome || '—'))}</div>\n    <div class=\"rc-motivo\"><span>Por que comprar</span><p>${esc(r.justificativa)}</p></div>";
edita('public/app.js', (troca, get) => { if (get().includes('rc-motivo')) throw new Error('js já aplicado'); troca(de, para); return get(); });
edita('2026-11-18_rc_front.txt', (troca, get) => { if (get().includes('rc-motivo')) throw new Error('bloco já aplicado'); troca(de, para); return get(); }, __dirname);
edita('public/styles.css', (troca, get) => {
  if (get().includes('.rc-motivo')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `.rc-infos-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--muted) 5%, var(--card)); }
.rc-motivo { margin-top: 12px; padding: 12px 16px 13px; border-left: 3px solid var(--verde-500); border-radius: 0 12px 12px 0; background: color-mix(in srgb, var(--verde-500) 6%, var(--card)); }
.rc-motivo > span { display: block; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.rc-motivo p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; }
@media (max-width: 640px) { .rc-infos-3 { grid-template-columns: 1fr; } }
`;
});
console.log('ok');
