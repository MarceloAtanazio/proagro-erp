// Propósito: acrescenta ao simulador (scripts/2026-11-11_tema_mock_navegador.js) os campos de prazo de comprovação que o servidor calcula (comprov_*) e a rota de liberação,
//   para avaliar no navegador a mensagem na lista, o bloqueio, o botão de liberar e a seção "Prazo de comprovação" do Painel.
// Entrada: scripts/2026-11-11_tema_mock_navegador.js (ou o arquivo em argv[2]). Saída: o mesmo arquivo editado. Uso: node scripts/2026-11-12_mock_prazo_comprovacao.js [arquivo]
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || path.join(__dirname, '2026-11-11_tema_mock_navegador.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('withPrazo')) throw new Error('já aplicado');
const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
troca("  const CATS = ['hospedagem'", `  // prazo de comprovação (mesma conta do servidor: 3 dias úteis após o fim da última OT da família)
  const LIB = new Set();
  const iso = d => d.toISOString().slice(0, 10), parse = v => { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const uteis = (v, n) => { const d = parse(v); for (let c = 0; c < n;) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6) c++; } return iso(d); };
  const dif = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const HOJE = iso(new Date());
  const withPrazo = rows => rows.map(r => {
    const fam = rows.filter(x => (x.familia_raiz_id || x.id) === (r.familia_raiz_id || r.id) && !['cancelada', 'em_approvals'].includes(x.status)), fim = fam.map(x => x.data_fim).sort().pop() || r.data_fim, prazo = uteis(fim, 3);
    const lib = LIB.has(r.familia_raiz_id || r.id);
    if (r.status === 'aguardando_comprovacao') { const dias = dif(HOJE, prazo); return { ...r, comprov_prazo: prazo, comprov_dias: dias, comprov_atraso: dias < 0 ? -dias : 0, comprov_bloqueada: dias < 0 && !lib, comprov_liberada: lib, comprov_liberada_por: lib ? 'Fulano de Tal' : null, comprov_liberada_motivo: lib ? 'Atestado médico' : null }; }
    if (['comprovado', 'devolvido', 'divergente'].includes(r.status) && r.id >= 200 && r.id % 5 !== 0) { const ent = iso(new Date(parse(fim).getTime() + (1 + (r.id * 7) % 9) * 864e5)); return { ...r, comprov_prazo: prazo, comprov_entrega: ent, comprov_tempo: dif(fim, ent), comprov_atraso: Math.max(0, dif(prazo, ent)), comprov_bloqueada: false }; }
    return { ...r, comprov_bloqueada: false };
  });
  const CATS = ['hospedagem'`);
troca("    if (u.endsWith('/api/viaticos/solicitacoes') && m === 'GET') return json(SOLS);", `    if (u.includes('/liberar-comprovacao') && m === 'POST') { LIB.add(Number(u.split('/solicitacoes/')[1].split('/')[0])); return json({ ok: true }); }
    if (u.endsWith('/api/viaticos/solicitacoes') && m === 'GET') return json(withPrazo(SOLS));`);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
