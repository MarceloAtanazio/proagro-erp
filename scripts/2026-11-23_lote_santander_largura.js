// Propósito: corrige o layout do modal do Lote Santander (tabelas com min-width de 1236px estouravam o modal).
// Entradas: public/app.js, public/styles.css. Saídas: os mesmos arquivos alterados (modal xwide + classe .tbl-lote).
// Como executar: node scripts/2026-11-23_lote_santander_largura.js (na raiz do projeto).
const fs = require('fs');
let s = fs.readFileSync('public/app.js', 'utf8');
const m = /(\} \}\], \{ wide: true)( \}\);\r?\n  \$\('#lt-data'\))/;
if (!m.test(s)) throw new Error('trecho do modal do lote não encontrado');
s = s.replace(m, '$1, xwide: true$2');
fs.writeFileSync('public/app.js', s);
let c = fs.readFileSync('public/styles.css', 'utf8');
if (!c.includes('.tbl-lote')) c += "\n/* Lote Santander: tabelas do modal usam a largura disponível (tbl-fin força 1236px) */\n.tbl-lote { width: 100%; table-layout: auto; border-collapse: collapse; }\n.tbl-lote th, .tbl-lote td { padding: 8px 12px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }\n.tbl-lote th.num, .tbl-lote td.num { text-align: right; white-space: nowrap; }\n.tbl-lote thead th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }\n.tbl-lote tbody td { border-top: 1px solid var(--line, #e6e9e7); }\n";
fs.writeFileSync('public/styles.css', c);
