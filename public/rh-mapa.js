/* ============================================================
   MAPA DO BRASIL — Recursos Humanos > Painel > "Onde estamos".
   Mostra onde cada colaborador ativo está alocado: estados coloridos pela quantidade de pessoas, uma bolha por cidade (tamanho = pessoas; coordenada do município
   em BR_LOCALIDADES.coords) e, ao lado, a lista por estado com as pessoas de cada cidade. Passar o mouse (ou tocar) mostra os detalhes.
   Local = cidade-base do colaborador (a mesma de Viáticos); quando ela não está preenchida, vale a cidade de residência do cadastro de RH.
   Dados: pessoas = headcount.localizacao de /api/rh/painel. Geometria: BR_MAPA (br-mapa.js, malha do IBGE). Usa esc() e BR_LOCALIDADES de app.js/br-localidades.js.
   ============================================================ */
function rhMapaRender(el, pessoas) {
  if (!el || typeof BR_MAPA === 'undefined') return;
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const NOME_UF = {};
  ((typeof BR_LOCALIDADES !== 'undefined' && BR_LOCALIDADES.estados) || []).forEach(e => { NOME_UF[e.uf] = e.nome; });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const coordsDe = (uf, mun) => {
    const t = typeof BR_LOCALIDADES !== 'undefined' && BR_LOCALIDADES.coords && BR_LOCALIDADES.coords[uf];
    if (!t || !mun) return null;
    if (t[mun]) return t[mun];
    const k = Object.keys(t).find(n => norm(n) === norm(mun));
    return k ? t[k] : null;
  };
  const MODELO = { presencial: 'Presencial', externo: 'Jornada externa', home_office: 'Home office', hibrido: 'Híbrido' };
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p);

  // agrupa por estado e cidade
  const porUF = {}, semLocal = [];
  (pessoas || []).forEach(p => {
    if (!p.uf || !BR_MAPA.ufs[p.uf]) { semLocal.push(p); return; }
    const u = porUF[p.uf] || (porUF[p.uf] = { uf: p.uf, n: 0, cidades: new Map() });
    u.n++;
    const chave = p.municipio || '— cidade não informada —';
    let c = u.cidades.get(chave); if (!c) { const xy = coordsDe(p.uf, p.municipio); c = { nome: chave, n: 0, pessoas: [], lat: xy ? xy[0] : BR_MAPA.ufs[p.uf].c.lat, lon: xy ? xy[1] : BR_MAPA.ufs[p.uf].c.lon, aprox: !xy }; u.cidades.set(chave, c); }
    c.n++; c.pessoas.push(p);
  });
  const estados = Object.values(porUF).sort((a, b) => b.n - a.n || a.uf.localeCompare(b.uf));
  const total = (pessoas || []).length, comLocal = total - semLocal.length;
  if (!comLocal) { el.innerHTML = '<p class="rh-nota">Nenhum colaborador ativo tem cidade-base ou cidade de residência preenchida.</p>'; return; }
  const maxN = Math.max(1, ...estados.map(u => u.n)), nivel = n => (n ? Math.min(4, Math.max(1, Math.ceil((4 * n) / maxN))) : 0);
  const nCidades = estados.reduce((t, u) => t + u.cidades.size, 0), top = estados[0];
  const deResidencia = (pessoas || []).filter(p => p.origem === 'residencia').length;

  // SVG: estados (grupo escalado) + rótulos + bolhas (em graus: x = lon, y = −lat)
  const paths = Object.entries(BR_MAPA.ufs).map(([uf, g]) => `<path class="uf n${nivel((porUF[uf] || {}).n || 0)}${porUF[uf] ? ' tem' : ''}" data-uf="${uf}" d="${g.d}"><title>${E(NOME_UF[uf] || uf)}</title></path>`).join('');
  const rotulos = Object.entries(BR_MAPA.ufs).map(([uf, g]) => `<text class="rot${porUF[uf] ? ' tem' : ''}" x="${g.c.lon}" y="${-g.c.lat - (porUF[uf] ? 1.6 : 0)}" text-anchor="middle">${uf}</text>`).join('');
  const bolhas = estados.flatMap(u => [...u.cidades.values()].map(c => ({ uf: u.uf, ...c }))).sort((a, b) => b.n - a.n).map(c => {
    const r = (0.38 + 0.24 * Math.sqrt(c.n)).toFixed(2);
    return `<g class="pt${c.aprox ? ' aprox' : ''}" data-uf="${c.uf}" data-cidade="${E(c.nome)}" tabindex="0"><circle cx="${c.lon}" cy="${-c.lat}" r="${r}" data-r="${r}"/>${c.n > 1 ? `<text x="${c.lon}" y="${-c.lat}" dy=".35em" text-anchor="middle">${c.n}</text>` : ''}</g>`;
  }).join('');

  const detalhePessoas = lista => lista.map(p => `<li><b>${E(p.nome)}</b><span>${E([p.departamento, MODELO[p.modelo] || p.modelo].filter(Boolean).join(' · ') || '—')}</span></li>`).join('');
  const linhas = estados.map(u => {
    const cid = [...u.cidades.values()].sort((a, b) => b.n - a.n);
    return `<li class="rh-mapa-uf" data-uf="${u.uf}">
      <button type="button" class="rh-mapa-uf-cab" aria-expanded="false">
        <span class="sg">${u.uf}</span><span class="nm">${E(NOME_UF[u.uf] || u.uf)}</span>
        <span class="bar"><i style="width:${(u.n / maxN * 100).toFixed(1)}%"></i></span><b>${u.n}</b><span class="pc">${Math.round(u.n / comLocal * 100)}%</span><span class="seta" aria-hidden="true">▸</span></button>
      <div class="rh-mapa-uf-det" hidden>${cid.map(c => `<div class="cid"><h6>${E(c.nome)} <em>${plural(c.n, 'pessoa', 'pessoas')}${c.aprox ? ' · posição aproximada' : ''}</em></h6><ul>${detalhePessoas(c.pessoas)}</ul></div>`).join('')}</div></li>`;
  }).join('');

  el.innerHTML = `<div class="rh-mapa">
      <div class="rh-mapa-fig">
        <svg class="rh-mapa-svg" viewBox="${BR_MAPA.viewBox}" role="img" aria-label="Mapa do Brasil com a distribuição dos colaboradores por estado e cidade"><g transform="scale(0.0001,-0.0001)">${paths}</g><g class="rots">${rotulos}</g><g class="pts">${bolhas}</g></svg>
        <div class="rh-mapa-dica" hidden></div>
        <div class="rh-mapa-leg"><span>menos</span><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>mais pessoas</span><span class="b"><i></i> cidade (tamanho = pessoas)</span><button type="button" class="rh-mapa-zoom" aria-pressed="false">Ampliar na equipe</button></div>
      </div>
      <div class="rh-mapa-lado">
        <div class="rh-mapa-resumo">
          <div><b>${estados.length}</b><span>${estados.length === 1 ? 'estado' : 'estados'} com equipe</span></div>
          <div><b>${nCidades}</b><span>${nCidades === 1 ? 'cidade' : 'cidades'}</span></div>
          <div><b>${top.uf} · ${Math.round(top.n / comLocal * 100)}%</b><span>maior concentração (${plural(top.n, 'pessoa', 'pessoas')})</span></div>
        </div>
        <ul class="rh-mapa-lista">${linhas}</ul>
        ${semLocal.length ? `<p class="rh-mapa-alerta"><b>${plural(semLocal.length, 'colaborador sem localização', 'colaboradores sem localização')}:</b> ${E(semLocal.map(p => p.nome).join(' · '))}. Preencha a cidade-base (Viáticos > Configurações) ou o endereço na ficha.</p>` : ''}
        <p class="rh-nota">Local = cidade-base do colaborador (a mesma de Viáticos)${deResidencia ? `; para ${plural(deResidencia, 'pessoa', 'pessoas')} sem cidade-base, vale a cidade de residência` : ''}. Considera os ${total} colaboradores ativos.</p>
      </div></div>`;

  // interações: destaque cruzado mapa × lista, dica ao passar o mouse e abrir/fechar a lista
  const fig = el.querySelector('.rh-mapa-fig'), dica = el.querySelector('.rh-mapa-dica');
  const marca = (uf, on) => { const p = el.querySelector(`.uf[data-uf="${uf}"]`); if (p) p.classList.toggle('hl', on); const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (li) li.classList.toggle('hl', on); };
  const textoDica = (uf, cidade) => {
    const u = porUF[uf];
    if (!u) return `<b>${E(NOME_UF[uf] || uf)}</b><span>nenhum colaborador</span>`;
    if (cidade) { const c = u.cidades.get(cidade); return `<b>${E(c.nome)}/${uf}</b><span>${plural(c.n, 'colaborador', 'colaboradores')}</span><ul>${c.pessoas.map(p => `<li>${E(p.nome)}</li>`).join('')}</ul>`; }
    return `<b>${E(NOME_UF[uf] || uf)}</b><span>${plural(u.n, 'colaborador', 'colaboradores')} · ${plural(u.cidades.size, 'cidade', 'cidades')}</span><ul>${[...u.cidades.values()].sort((a, b) => b.n - a.n).map(c => `<li>${E(c.nome)} <em>${c.n}</em></li>`).join('')}</ul>`;
  };
  const mostra = (ev, uf, cidade) => {
    dica.innerHTML = textoDica(uf, cidade); dica.hidden = false;
    const r = fig.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    dica.style.left = Math.min(Math.max(8, x + 14), Math.max(8, r.width - dica.offsetWidth - 8)) + 'px';
    dica.style.top = Math.min(Math.max(8, y + 14), Math.max(8, r.height - dica.offsetHeight - 8)) + 'px';
  };
  const abre = (uf, aberto) => {
    const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (!li) return;
    const cab = li.querySelector('.rh-mapa-uf-cab'), det = li.querySelector('.rh-mapa-uf-det');
    const abrir = aberto == null ? det.hidden : aberto;
    det.hidden = !abrir; cab.setAttribute('aria-expanded', String(abrir)); li.classList.toggle('aberto', abrir);
  };
  el.querySelectorAll('.uf, .pt').forEach(n => {
    const uf = n.dataset.uf, cidade = n.dataset.cidade || null;
    n.addEventListener('mousemove', ev => { marca(uf, true); mostra(ev, uf, cidade); });
    n.addEventListener('mouseleave', () => { marca(uf, false); dica.hidden = true; });
    n.addEventListener('focus', () => { const r = n.getBoundingClientRect(), f = fig.getBoundingClientRect(); mostra({ clientX: r.left + r.width / 2, clientY: r.top }, uf, cidade); marca(uf, true); });
    n.addEventListener('blur', () => { marca(uf, false); dica.hidden = true; });
    if (porUF[uf]) n.addEventListener('click', () => { abre(uf, true); const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  });
  // zoom: enquadra as cidades da equipe (quadrado com folga) e reescala bolhas, números e siglas junto
  const svg = el.querySelector('.rh-mapa-svg'), vbCheio = BR_MAPA.viewBox.split(' ').map(Number), btnZoom = el.querySelector('.rh-mapa-zoom');
  const pts = estados.flatMap(u => [...u.cidades.values()]), lons = pts.map(c => c.lon), lats = pts.map(c => c.lat);
  const lado = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) + 7, cx = (Math.max(...lons) + Math.min(...lons)) / 2, cy = -(Math.max(...lats) + Math.min(...lats)) / 2;
  const aplicaZoom = on => {
    const vb = on ? [cx - lado / 2, cy - lado / 2, lado, lado] : vbCheio, k = on ? Math.min(1, lado / vbCheio[2]) : 1;
    svg.setAttribute('viewBox', vb.join(' '));
    svg.querySelectorAll('.pt circle').forEach(ci => ci.setAttribute('r', (Number(ci.dataset.r) * k).toFixed(3)));
    svg.querySelectorAll('.pt text').forEach(t => { t.style.fontSize = (0.95 * k) + 'px'; });
    svg.querySelectorAll('.rots text').forEach(t => { t.style.fontSize = ((t.classList.contains('tem') ? 0.8 : 0.72) * k) + 'px'; t.style.strokeWidth = (0.18 * k) + 'px'; });
    btnZoom.textContent = on ? 'Brasil inteiro' : 'Ampliar na equipe'; btnZoom.setAttribute('aria-pressed', String(on));
  };
  btnZoom.addEventListener('click', () => aplicaZoom(btnZoom.getAttribute('aria-pressed') !== 'true'));
  el.querySelectorAll('.rh-mapa-uf').forEach(li => {
    const uf = li.dataset.uf;
    li.querySelector('.rh-mapa-uf-cab').addEventListener('click', () => abre(uf));
    li.addEventListener('mouseenter', () => marca(uf, true)); li.addEventListener('mouseleave', () => marca(uf, false));
  });
}
