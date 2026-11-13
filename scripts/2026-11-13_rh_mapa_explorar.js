// Propósito: mapa de RH explorável (zoom, arrastar, grupos de cidades que se separam ao aproximar, nomes de cidade sem sobreposição). Ajusta o CSS do mapa em public/styles.css:
//   tamanhos de bolha, número e nome agora vêm em pixels do JS (public/rh-mapa.js, reescrito); aqui ficam cores, contornos, botões de zoom, cursor de arrastar e a linha de ajuda.
//   Também regenera public/br-mapa.js com a caixa envolvente de cada estado (scripts/2026-11-13_mapa_brasil_gerar.js), usada para aproximar do estado.
// Entrada: public/styles.css (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-13_rh_mapa_explorar.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/styles.css');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const linhaDe = pref => { const i = s.indexOf(pref); if (i < 0) throw new Error('linha não achada: ' + pref); const j = s.indexOf('\n', i); return [i, j + 1]; };
const troca = (pref, novo) => { const [i, j] = linhaDe(pref); s = s.slice(0, i) + novo + s.slice(j); };
troca('.rh-mapa-svg .rots text { font:', '.rh-mapa-svg .rots text { font-family: var(--font); font-weight: 600; fill: var(--muted); pointer-events: none; paint-order: stroke; stroke: var(--card); stroke-linejoin: round; }\n');
troca('.rh-mapa-svg .rots text.tem {', '.rh-mapa-svg .rots text.tem { font-weight: 700; fill: var(--ink); }\n');
troca('.rh-mapa-svg .pt circle {', '.rh-mapa-svg .pt circle { fill: color-mix(in srgb, var(--azul-700) 90%, transparent); stroke: #fff; stroke-width: 2px; vector-effect: non-scaling-stroke; transition: fill .15s; }\n.rh-mapa-svg .pt.grupo circle { fill: color-mix(in srgb, var(--verde-900) 92%, transparent); }\n');
troca('.rh-mapa-svg .pt:hover circle,', '.rh-mapa-svg .pt:hover circle, .rh-mapa-svg .pt:focus-visible circle { fill: var(--verde-700); }\n');
troca('.rh-mapa-svg .pt text {', '.rh-mapa-svg .pt text { font-family: var(--font); font-weight: 700; fill: #fff; pointer-events: none; }\n.rh-mapa-svg .lbls .nome { font-family: var(--font); font-weight: 600; fill: var(--ink); pointer-events: none; paint-order: stroke; stroke: var(--card); stroke-linejoin: round; }\n.rh-mapa-svg { touch-action: pan-y; } .rh-mapa-svg.zoomado { cursor: grab; touch-action: none; } .rh-mapa-svg.arrastando { cursor: grabbing; }\n.rh-mapa-svg .pt, .rh-mapa-svg .uf.tem { cursor: pointer; }\n');
troca('.rh-mapa-zoom { margin-left: auto;', '.rh-mapa-leg .acoes { margin-left: auto; display: inline-flex; gap: 6px; }\n.rh-mapa-zoom { border: 1px solid var(--line); background: var(--card); color: var(--ink); font: 600 12px var(--font); padding: 5px 12px; border-radius: 999px; cursor: pointer; }\n');
s = s.replace(/\s+$/, '\n') + `.rh-mapa-ctl { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 4; }
.rh-mapa-ctl button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: 600 20px/1 var(--font); cursor: pointer; box-shadow: var(--shadow); transition: border-color .15s, transform .15s; }
.rh-mapa-ctl button:hover:not(:disabled) { border-color: var(--verde-500); transform: translateY(-1px); } .rh-mapa-ctl button:disabled { opacity: .4; cursor: default; }
.rh-mapa-ajuda { margin: 8px 0 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
.rh-mapa-fig { user-select: none; -webkit-user-select: none; }
`;
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
