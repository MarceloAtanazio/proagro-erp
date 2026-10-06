// Propósito: a pendência de estouro de viagem anterior é decidida UMA vez (descontar ou dispensar) na viagem
//   seguinte; depois da decisão, nas duas opções, ela é encerrada e o aviso não reaparece.
//   Antes, escolher "Não" mantinha a pendência em aberto e o aviso voltava a cada nova solicitação.
// Entrada: api/index.js e public/app.js. Saída: os mesmos arquivos editados.
// Uso: node scripts/2026-10-06_viaticos_pendencia_decisao_unica.js
const fs = require('fs'), path = require('path');
function abrir(rel) { const arq = path.join(__dirname, '..', rel); const s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); return { arq, crlf, s: crlf ? s.replace(/\r\n/g, '\n') : s }; }
function salvar(o) { fs.writeFileSync(o.arq, o.crlf ? o.s.replace(/\n/g, '\r\n') : o.s); }
function troca(o, de, para) { if (!o.s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); o.s = o.s.replace(de, () => para); }

// ---------------- API ----------------
const A = abrir('api/index.js');

troca(A, `  // Se o colaborador optou por descontar a pendência anterior automaticamente, marca como resolvida.
  if (b.descontar_pendencia_ids && Array.isArray(b.descontar_pendencia_ids) && b.descontar_pendencia_ids.length) {
    await query(\`UPDATE erp_viaticos_solicitacoes SET pendencia_resolvida=true WHERE id = ANY($1::int[]) AND colaborador_id=$2\`,
      [b.descontar_pendencia_ids, b.colaborador_id]);
  }`,
`  // A pendência de viagem anterior é decidida UMA vez, aqui, na viagem seguinte: descontar do valor
  // liberado ou dispensar. Nas duas decisões ela é encerrada (e registrada) — não pode voltar a
  // aparecer depois, porque descontar muito tempo depois não faz sentido.
  const idsPend = (Array.isArray(b.pendencia_ids) ? b.pendencia_ids : (Array.isArray(b.descontar_pendencia_ids) ? b.descontar_pendencia_ids : []))
    .map(Number).filter(Number.isInteger);
  if (idsPend.length) {
    const decisao = b.pendencia_decisao === 'dispensar' ? 'dispensada' : 'descontada';
    await query(\`UPDATE erp_viaticos_solicitacoes
        SET pendencia_resolvida=true, pendencia_decisao=$3, pendencia_decidida_em=now(), pendencia_decidida_na=$4
      WHERE id = ANY($1::int[]) AND colaborador_id=$2 AND status='divergente' AND pendencia_resolvida=false\`,
      [idsPend, b.colaborador_id, decisao, ins[0].id]);
  }`);

troca(A, ": ` — optou por NÃO descontar a pendência de ${fmtBRL(pi.valor)} (mantida em aberto, viagem(ns) ID ${(pi.ids || []).join(', ')})`;",
         ": ` — optou por NÃO descontar a pendência de ${fmtBRL(pi.valor)} (encerrada sem desconto, não aparece mais; viagem(ns) ID ${(pi.ids || []).join(', ')})`;");
salvar(A);

// ---------------- Front ----------------
const F = abrir('public/app.js');

troca(F, `          b.pendencia_info = { valor: valorPend, decisao: aplicar ? 'descontar' : 'manter', ids };
          if (aplicar) { b.valor_liberado = Math.max(0, b.valor_liberado - valorPend); b.descontar_pendencia_ids = ids; }`,
`          b.pendencia_info = { valor: valorPend, decisao: aplicar ? 'descontar' : 'dispensar', ids };
          b.pendencia_ids = ids; b.pendencia_decisao = aplicar ? 'descontar' : 'dispensar';
          if (aplicar) b.valor_liberado = Math.max(0, b.valor_liberado - valorPend);`);

troca(F, `            <button type="button" class="btn sm" id="vs-desc-nao">Não</button>
          </div>`,
`            <button type="button" class="btn sm" id="vs-desc-nao">Não</button>
          </div>
          <div style="margin-top:6px; font-size:12.5px; color:var(--ink-2)">A decisão é tomada agora: ao salvar a solicitação, a pendência é encerrada nas duas opções e este aviso não aparece mais.</div>`);

troca(F, "`➡️ A pendência de <strong>${brl(r.total)}</strong> NÃO será descontada — continua em aberto para uma próxima solicitação. Valor liberado: <strong>${brl(digitado)}</strong>.`",
         "`➡️ A pendência de <strong>${brl(r.total)}</strong> NÃO será descontada e será encerrada — não aparecerá em próximas solicitações. Valor liberado: <strong>${brl(digitado)}</strong>.`");
salvar(F);
console.log('ok');
