// Propósito: gera public/tema-escuro.css a partir de public/styles.css. O CSS atual usa variáveis (:root) mas também ~280 cores fixas (#fff, #FAFBFA, #EEF1EF,
//   textos e bordas em hex). Para o modo escuro não deixar "manchas brancas", este script varre cada regra, troca cada cor fixa por uma equivalente escura
//   conforme o PAPEL dela (fundo claro → superfície escura; texto escuro → texto claro; borda clara → borda escura; cores fortes de marca e texto branco ficam)
//   e emite regras prefixadas com html[data-tema="escuro"], que só valem com o tema escuro ligado. O visual claro (o atual) NÃO é tocado.
// Entrada: public/styles.css (ou a pasta indicada em argv[2]). Saída: public/tema-escuro.css. Rode de novo sempre que o styles.css mudar.
// Uso: node scripts/2026-11-11_gera_tema_escuro.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const css = fs.readFileSync(path.join(raiz, 'public/styles.css'), 'utf8').replace(/\r\n/g, '\n');

// ---------- cores ----------
const hexParaRgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgbParaHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s, l };
};
const hslParaHex = (h, s, l) => {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
const HUE_MARCA = 150;    // o verde da marca tinge os neutros
const mapFundo = hex => {
  const { h, s, l } = rgbParaHsl(hexParaRgb(hex));
  if (l < 0.80) return hex;                                   // fundos médios/escuros (verde da marca, badges fortes) ficam
  const neutro = s < 0.12;
  return hslParaHex(neutro ? HUE_MARCA : h, neutro ? 0.16 : Math.min(0.42, Math.max(0.18, s * 0.55)), 0.085 + (1 - l) * 0.62);
};
const mapTexto = hex => {
  const { h, s, l } = rgbParaHsl(hexParaRgb(hex));
  if (l >= 0.62) return hex;                                   // branco e tons claros (texto sobre fundo colorido) ficam
  const neutro = s < 0.12;
  return hslParaHex(neutro ? HUE_MARCA : h, neutro ? 0.12 : Math.min(s, 0.55), Math.min(0.9, 0.90 - l * 0.65));
};
const mapBorda = hex => {
  const { h, s, l } = rgbParaHsl(hexParaRgb(hex));
  if (l < 0.70) return hex;
  const neutro = s < 0.12;
  return hslParaHex(neutro ? HUE_MARCA : h, neutro ? 0.14 : Math.min(0.3, s * 0.5), 0.11 + (1 - l) * 0.9);
};

// ---------- leitura do CSS (regras simples, @media aninhado; @keyframes ignorado) ----------
function lerBlocos(src) {
  const blocos = []; let i = 0;
  const pulaEspacoEComentario = () => { for (;;) { while (/\s/.test(src[i] || '')) i++; if (src.startsWith('/*', i)) { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; } else break; } };
  while (i < src.length) {
    pulaEspacoEComentario(); if (i >= src.length) break;
    const ini = i; let prof = 0, aspas = null;
    while (i < src.length && src[i] !== '{') { if (src.startsWith('/*', i)) { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; } else i++; }
    const seletor = src.slice(ini, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(); i++;            // pula '{'
    const corpoIni = i; prof = 1;
    while (i < src.length && prof > 0) {
      const c = src[i];
      if (aspas) { if (c === aspas && src[i - 1] !== '\\') aspas = null; }
      else if (c === '"' || c === "'") aspas = c;
      else if (src.startsWith('/*', i)) { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 1; }
      else if (c === '{') prof++; else if (c === '}') prof--;
      i++;
    }
    blocos.push({ seletor, corpo: src.slice(corpoIni, i - 1) });
  }
  return blocos;
}
function declaracoes(corpo) {
  const sem = corpo.replace(/\/\*[\s\S]*?\*\//g, ''), out = []; let ini = 0, par = 0, aspas = null;
  for (let i = 0; i <= sem.length; i++) {
    const c = sem[i];
    if (aspas) { if (c === aspas) aspas = null; continue; }
    if (c === '"' || c === "'") { aspas = c; continue; }
    if (c === '(') par++; else if (c === ')') par--;
    if ((c === ';' && par === 0) || i === sem.length) { const d = sem.slice(ini, i).trim(); ini = i + 1; const p = d.indexOf(':'); if (p > 0) out.push({ prop: d.slice(0, p).trim().toLowerCase(), valor: d.slice(p + 1).trim() }); }
  }
  return out;
}
const papelDaPropriedade = p => /^background(-color|-image)?$/.test(p) ? 'fundo' : /^(color|fill|stroke|caret-color|text-decoration-color)$/.test(p) ? 'texto' : /^(border(-(top|right|bottom|left))?(-color)?|outline(-color)?|column-rule(-color)?)$/.test(p) ? 'borda' : null;
const HEX = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// hex que só aparecem como reserva dentro de var(--x, #fff) não contam: a variável já muda com o tema
const semVar = v => { let o = '', prof = 0; for (let i = 0; i < v.length; i++) { if (v.startsWith('var(', i)) { prof = 1; i += 3; continue; } if (prof) { if (v[i] === '(') prof++; else if (v[i] === ')') prof--; continue; } o += v[i]; } return o; };

let regras = 0, decls = 0;
function emite(blocos, indent = '') {
  let out = '';
  for (const b of blocos) {
    if (b.seletor.startsWith('@keyframes') || b.seletor.startsWith('@font-face')) continue;
    if (b.seletor.startsWith('@media') || b.seletor.startsWith('@supports')) {
      const dentro = emite(lerBlocos(b.corpo), indent + '  ');
      if (dentro.trim()) out += `${indent}${b.seletor} {\n${dentro}${indent}}\n`;
      continue;
    }
    if (b.seletor.startsWith('@') || /^:root\b/.test(b.seletor)) continue;
    const novas = [];
    for (const d of declaracoes(b.corpo)) {
      const papel = papelDaPropriedade(d.prop); if (!papel) continue;
      if (!HEX.test(semVar(d.valor))) { HEX.lastIndex = 0; continue; } HEX.lastIndex = 0;
      const imp = /!important\s*$/i.test(d.valor) ? ' !important' : '';
      const base = d.valor.replace(/!important\s*$/i, '').trim();
      // troca só os hex FORA de var(...)
      let troca = '', prof = 0;
      for (let i = 0; i < base.length; i++) {
        if (base.startsWith('var(', i)) { prof = 1; troca += 'var('; i += 3; continue; }
        if (prof) { troca += base[i]; if (base[i] === '(') prof++; else if (base[i] === ')') prof--; continue; }
        const m = base.slice(i).match(/^(#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/);
        if (m) { const hex = m[1].length === 9 ? m[1].slice(0, 7) : m[1]; const alfa = m[1].length === 9 ? m[1].slice(7) : '';
          troca += (papel === 'fundo' ? mapFundo(hex) : papel === 'texto' ? mapTexto(hex) : mapBorda(hex)) + alfa; i += m[1].length - 1; }
        else troca += base[i];
      }
      if (troca !== base) { novas.push(`${d.prop}: ${troca}${imp};`); decls++; }
    }
    if (!novas.length) continue;
    const sels = b.seletor.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(s => `html[data-tema="escuro"] ${s}`);
    out += `${indent}${sels.join(',\n' + indent)} { ${novas.join(' ')} }\n`; regras++;
  }
  return out;
}
const corpo = emite(lerBlocos(css));
const cab = `/* ============================================================
   TEMA ESCURO — GERADO AUTOMATICAMENTE. NÃO EDITE À MÃO.
   Origem: public/styles.css · Gerador: scripts/2026-11-11_gera_tema_escuro.js
   Troca as cores fixas (hex) do CSS por equivalentes escuras, só quando
   <html data-tema="escuro">. O tema claro (atual) não é tocado.
   ============================================================ */
`;
fs.writeFileSync(path.join(raiz, 'public/tema-escuro.css'), cab + corpo);
console.log(`ok: ${regras} regras, ${decls} declarações, ${Math.round((cab + corpo).length / 1024)} KB`);
