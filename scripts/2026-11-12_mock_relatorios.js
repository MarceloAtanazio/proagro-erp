// Propósito: acrescenta ao simulador (scripts/2026-11-11_tema_mock_navegador.js) a rota /api/reports/dre/:ano com dados de exemplo parecidos com os reais (receita intercompany,
//   folha como maior despesa, orçado, ano anterior, clientes e fornecedores), para avaliar no navegador a página executiva de Relatórios Gerenciais.
// Entrada: scripts/2026-11-11_tema_mock_navegador.js (ou o arquivo em argv[2]). Saída: o mesmo arquivo editado. Uso: node scripts/2026-11-12_mock_relatorios.js [arquivo]
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || path.join(__dirname, '2026-11-11_tema_mock_navegador.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
if (s.includes('/api/reports/dre/')) throw new Error('já aplicado');
const ancora = "    if (u.endsWith('/api/viaticos/solicitacoes') && m === 'GET')";
const i = s.indexOf(ancora); if (i < 0) throw new Error('âncora não achada');
const rota = `    if (u.includes('/api/reports/dre/')) {
      const y = Number(u.split('/dre/')[1].split('?')[0]), comp = u.includes('regime=competencia'), mesAtual = y === 2026 ? 11 : 0, ate = mesAtual && !comp ? mesAtual : 12;
      const ruido = (i, k) => 1 + (((i * 37 + k * 11) % 17) - 8) / 60;
      const DESP = { 'Folha de Pagamento': 215000, 'RH / Benefícios': 12500, 'Compras / Fornecedores': 12000, 'Serviços de Terceiros': 11800, 'Contabilidade': 6800, 'Aluguel': 6000, 'Jurídico': 4000, 'Cursos / Capacitações': 3800,
        'Condomínio': 3300, 'Seguros': 2700, 'Uniformes / EPIs': 2600, 'Viáticos': 18000, 'Tarifas Bancárias': 2000, 'Comodato': 1900, 'Marketing e Vendas': 1750, 'Reembolso de Despesas': 1500, 'Telefone': 320, 'Tecnologia': 280, 'Internet': 100, 'Energia': 95, 'Impostos e Taxas': 700 };
      const gera = (esc, ano) => { const rec = [], desp = []; for (let mes = 1; mes <= 12; mes++) { if (mes > ate && ano === y) { if (!comp) continue; }
          if (mes >= 3 && !(ano === y && !comp && mes > ate)) { rec.push({ month: mes, category: 'Serviços Intercompany', total: Math.round(560000 * esc * ruido(mes, 1)) }); rec.push({ month: mes, category: 'Outros', total: Math.round(520 * ruido(mes, 2)) }); if (mes % 3 === 0) rec.push({ month: mes, category: 'Receitas Financeiras', total: 1400 }); }
          Object.keys(DESP).forEach((c, k) => { if (mes >= 3 || ano === y) desp.push({ month: mes, category: c, total: Math.round(DESP[c] * esc * ruido(mes, k) * (c === 'Folha de Pagamento' && mes === 11 ? 1.9 : 1)) }); }); }
        return { rec, desp }; };
      const orc = { rec: [], desp: [] }; for (let mes = 1; mes <= 12; mes++) { orc.rec.push({ month: mes, category: 'Serviços Intercompany', total: 210000 }); Object.keys(DESP).forEach(c => { if (c !== 'Impostos e Taxas') orc.desp.push({ month: mes, category: c, total: Math.round(DESP[c] * 1.05) }); }); }
      return json({ ano: y, regime: comp ? 'competencia' : 'caixa', hoje: '2026-11-12', mesAtual, atual: gera(1, y), anterior: gera(0.78, y - 1), orcado: orc,
        posicao: { saldoCaixa: 1733401.54, receberAberto: 84000, receberVencido: 12000, receber30: 40000, pagarAberto: 1633936, pagarVencido: 18400, pagar30: 402000 },
        clientes: [{ nome: 'Proteccion Agropecuaria, Servicios Tecnicos de Seguros S.A de C.V', total: 4580823 }, { nome: 'SALDO INICIAL', total: 4318 }, { nome: 'Rendimento', total: 285 }],
        fornecedores: [{ nome: 'Receita Federal do Brasil', total: 689937 }, { nome: 'Fabricio Camargo de Lima', total: 257291 }, { nome: 'Alcenir de Amorim Fernandes Júnior', total: 108831 }, { nome: 'Ministerio do Trabalho e Emprego (FGTS)', total: 103821 }, { nome: 'Flash Tecnologia e Intituição de Pagamento LTDA', total: 88179 }] });
    }
`;
s = s.slice(0, i) + rota + s.slice(i);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
