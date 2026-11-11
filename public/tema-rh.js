/* ============================================================
   RECURSOS HUMANOS · QUADRO — VISUAL NOVO (experimento). Por cima da tela
   original (os mesmos números e textos de rhPainel em app.js): cada
   indicador ganha ícone, faixa de cor pela situação (ok / aviso / alerta),
   número maior e, quando faz sentido, um medidor (turnover, cobertura,
   taxa de conclusão, participação, satisfação, eNPS) ou uma divisão
   proporcional (voluntário × involuntário, recusa do candidato × decisão
   da empresa). As barras de distribuição são refeitas em CSS.
   Só age com o visual "Novo" ligado; evento 'proagro:rh' vem de rhPainel.
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const svg = d => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    userplus: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
    clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    briefcase: svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>'),
    gauge: svg('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
    coin: svg('<circle cx="12" cy="12" r="10"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 1-3 2.2 0 3 6 1.8 6 4.6 0 1.3-1.3 2.2-3 2.2a3 3 0 0 1-3-1.5M12 6v2m0 8v2"/>'),
    shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    smile: svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>'),
    doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
    alert: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    archive: svg('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>'),
    cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    trend: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
    flag: svg('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>')
  };
  // rótulo → ícone (primeira regra que casar)
  const ICONES = [
    [/em admiss|processos abertos|admissões previstas|candidato/i, 'userplus'],
    [/arquivad/i, 'archive'],
    [/vagas|posições/i, 'briefcase'],
    [/tempo|permanência|idade|horas|experiência/i, 'clock'],
    [/turnover|taxa/i, 'gauge'],
    [/volunt|decisão da empresa/i, 'out'],
    [/folha|benef|custo|investimento/i, 'coin'],
    [/certifica/i, 'book'],
    [/enps|satisfa/i, 'smile'],
    [/participa|cobertura/i, 'trend'],
    [/aso|dossiê|contrato|vínculo/i, 'doc'],
    [/colaboradores|pessoa/i, 'users']
  ];
  const iconeDe = r => { const h = ICONES.find(([re]) => re.test(r)); return IC[h ? h[1] : 'flag']; };

  const numDe = txt => {
    const t = String(txt).replace(/[^\d,.\-+]/g, ''); if (!t) return null;
    const v = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
    return isFinite(v) ? v : null;
  };
  const medidor = (fill, marca, dica) => `<div class="nd-rh-m" ${dica ? `title="${dica}"` : ''}><i style="width:${Math.max(0, Math.min(100, fill)).toFixed(1)}%"></i>${marca != null ? `<u style="left:${marca.toFixed(1)}%"></u>` : ''}</div>`;
  const divisao = (a, b) => { const t = a + b; return t ? `<div class="nd-rh-m nd-rh-div" title="${a} de ${t}"><i style="width:${(a / t * 100).toFixed(1)}%"></i></div>` : ''; };

  function kpi(card, irmaos) {
    if (card.classList.contains('nd-rh-k')) return;
    const r = card.querySelector('.kpi-r'), v = card.querySelector('.kpi-v'); if (!r || !v) return;
    const rot = r.textContent.trim(), valTxt = v.textContent.trim(), val = numDe(valTxt);
    card.classList.add('nd-rh-k');
    const topo = document.createElement('div'); topo.className = 'nd-rh-top';
    topo.innerHTML = `<span class="nd-rh-ic">${iconeDe(rot)}</span>`;
    card.insertBefore(topo, card.firstChild); topo.appendChild(r);
    let extra = '';
    if (/^Turnover 12 meses/i.test(rot) && val != null) extra = medidor(val / 40 * 100, 20 / 40 * 100, 'A marca é o limite de alerta (20%)');
    else if (/^(Taxa de conclusão|Cobertura|Participação)$/i.test(rot) && val != null) extra = medidor(val);
    else if (/^Satisfação$/i.test(rot) && val != null) extra = medidor(val / 5 * 100);
    else if (/^eNPS$/i.test(rot) && val != null) extra = medidor((val + 100) / 2, 50, 'A marca é o zero');
    else {
      const par = { 'Voluntário': 'Involuntário', 'Involuntário': 'Voluntário', 'Recusa do candidato': 'Decisão da empresa', 'Decisão da empresa': 'Recusa do candidato' }[rot];
      if (par) { const o = irmaos.find(k => (k.querySelector('.kpi-r') || {}).textContent === par || ((k.querySelector('.nd-rh-top .kpi-r') || {}).textContent === par)); const ov = o && numDe((o.querySelector('.kpi-v') || {}).textContent); if (val != null && ov != null) extra = divisao(val, ov); }
    }
    if (extra) card.insertAdjacentHTML('beforeend', extra);
  }

  function aplica() {
    if (!novo()) return;
    $$('#content .rh-painel-sec').forEach(sec => {
      sec.classList.add('nd-rh-sec');
      $$('.kpis', sec).forEach(g => { const cards = [...g.querySelectorAll(':scope > .kpi')]; cards.forEach(c => kpi(c, cards)); });
    });
  }
  document.addEventListener('proagro:rh', aplica);
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { rh: aplica });
})();
