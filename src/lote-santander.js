// Lote de pagamento Santander (Contas a Pagar): monta os dois arquivos de importação que o banco fornece
// (planilhaPix.csv e planilhaBarra.csv) a partir dos títulos selecionados. Funções puras, sem banco.
// Layout (idêntico ao modelo do banco): UTF-8 com BOM, separador ";", quebra CRLF, valor "9.498,50", data dd/mm/aaaa.
//   PIX:    Forma de iniciação; Número do pagamento; Chave Pix; ISPB; Banco; Agência; Conta; Tipo de conta; Nome do fornecedor; Tipo documento; Documento; Valor a pagar; Data de pagamento; QR code (copia e cola); Informação ao recebedor
//   Boleto: Codigo de barra; Numero do pagamento; Data de pagamento; Valor a pagar; Tipo documento do fornecedor; Documento do fornecedor; Nome do Fornecedor
// "Número do pagamento" = ID do título em Contas a Pagar. Entrada: linhas {id, amount, due_date, payment_method, pix_key, pix_key_tipo,
// boleto_line, description, supplier_name, supplier_doc, supplier_pix_key, supplier_pix_key_tipo, enviado_tesouraria_em}. Saída: { pix, boleto, problemas, ignorados }.

const TIPOS_CHAVE = ['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'];
// Forma de iniciação (1 caractere, especificação do banco): 1 Telefone, 2 E-mail, 3 CPF ou CNPJ, 4 Chave aleatória.
const ROTULO_INICIACAO = { cpf: '3', cnpj: '3', telefone: '1', email: '2', aleatoria: '4' };
const soDigitos = v => String(v == null ? '' : v).replace(/\D/g, '');

function fmtCpf(d) { return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); }
function fmtCnpj(d) { return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); }
function fmtMoeda(v) { return Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function fmtDataBR(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }

// Tipo da chave a partir do formato. Devolve null quando é ambíguo (11 dígitos sem pontuação pode ser CPF ou telefone):
// nesse caso só vale se for igual ao documento da pessoa (então é o CPF dela).
function pixTipoDeduzir(chave, docDigitos) {
  const c = String(chave == null ? '' : chave).trim();
  if (!c) return null;
  if (c.includes('@')) return 'email';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return 'aleatoria';
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(c)) return 'cpf';
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(c)) return 'cnpj';
  const d = soDigitos(c);
  if (/^\+/.test(c) || /[()\s]/.test(c)) return (d.length >= 10 && d.length <= 13) ? 'telefone' : null;
  if (d.length === 14) return 'cnpj';
  if (d.length === 11) return docDigitos && d === docDigitos ? 'cpf' : null;
  if (d.length === 10) return 'telefone';
  return null;
}

// Chave no formato que o banco espera, ou { erro }.
function pixChaveFormatar(chave, tipo) {
  const c = String(chave == null ? '' : chave).trim(), d = soDigitos(c);
  if (tipo === 'cpf') return d.length === 11 ? { v: fmtCpf(d) } : { erro: 'chave CPF precisa ter 11 dígitos' };
  if (tipo === 'cnpj') return d.length === 14 ? { v: fmtCnpj(d) } : { erro: 'chave CNPJ precisa ter 14 dígitos' };
  if (tipo === 'telefone') {
    let t = d; if ((t.length === 12 || t.length === 13) && t.startsWith('55')) t = t.slice(2);
    return t.length === 10 || t.length === 11 ? { v: t } : { erro: 'telefone precisa ter DDD e 10 ou 11 dígitos' };
  }
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? { v: c.toLowerCase() } : { erro: 'e-mail da chave inválido' };
  if (tipo === 'aleatoria') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? { v: c.toLowerCase() } : { erro: 'chave aleatória inválida (esperado o formato com hífens)' };
  return { erro: 'tipo da chave PIX não informado' };
}

// Mesma formatação do formulário de título: 47 dígitos (boleto) ou 4 blocos de 11+1 (conta de consumo, 48).
function boletoLinhaFormatar(v) {
  const d = soDigitos(v);
  if (d.length === 48) return (d.match(/.{12}/g) || []).map(g => g.slice(0, 11) + '-' + g.slice(11)).join(' ');
  if (d.length === 47) return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
  return '';
}

// Campo CSV: o separador é ";", então o texto livre perde ";" e quebras de linha.
const campo = v => String(v == null ? '' : v).replace(/[;\r\n]+/g, ' ').trim();
const linhaCsv = cols => cols.map(campo).join(';');
const arquivoCsv = (cab, linhas) => '﻿' + [cab, ...linhas].join('\r\n') + '\r\n';

const CAB_PIX = 'Forma de iniciação;Número do pagamento;Chave Pix;ISPB;Banco;Agência;Conta;Tipo de conta;Nome do fornecedor;Tipo documento;Documento;Valor a pagar;Data de pagamento;QR code (copia e cola);Informação ao recebedor';
const CAB_BARRA = 'Codigo de barra;Numero do pagamento;Data de pagamento;Valor a pagar;Tipo documento do fornecedor;Documento do fornecedor;Nome do Fornecedor';

// opts: { dataPagamento: 'AAAA-MM-DD' (opcional: vale para todos; senão cada título usa o vencimento), hoje: 'AAAA-MM-DD', reenviar: bool }
function montarLote(rows, opts) {
  opts = opts || {};
  const hoje = opts.hoje, problemas = [], pix = [], barra = [];
  let ignorados = 0;
  const ordenadas = (rows || []).slice().sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || a.id - b.id);
  for (const r of ordenadas) {
    const fm = r.payment_method;
    if (fm !== 'pix' && fm !== 'boleto') { ignorados++; continue; }
    const prob = motivo => problemas.push({ id: r.id, descricao: r.description || '', fornecedor: r.supplier_name || '', forma: fm, motivo });
    if (r.status === 'pago') { ignorados++; continue; }
    if (r.enviado_tesouraria_em && !opts.reenviar) { prob('já enviado à tesouraria em ' + fmtDataBR(String(r.enviado_tesouraria_em).slice(0, 10))); continue; }
    const doc = soDigitos(r.supplier_doc);
    if (!r.supplier_name) { prob('título sem fornecedor'); continue; }
    if (doc.length !== 11 && doc.length !== 14) { prob(doc ? 'CPF/CNPJ do fornecedor inválido' : 'fornecedor sem CPF/CNPJ'); continue; }
    const valor = Number(r.amount);
    if (!(valor > 0)) { prob('valor inválido'); continue; }
    const data = opts.dataPagamento || String(r.due_date).slice(0, 10);
    if (hoje && data < hoje) { prob('data de pagamento ' + fmtDataBR(data) + ' já passou'); continue; }
    const tipoDoc = doc.length === 11 ? 'PF' : 'PJ', docFmt = doc.length === 11 ? fmtCpf(doc) : fmtCnpj(doc);
    if (fm === 'pix') {
      if (!campo(r.pix_key)) { prob('sem chave PIX'); continue; }
      let tipo = TIPOS_CHAVE.includes(r.pix_key_tipo) ? r.pix_key_tipo : null;
      if (!tipo && r.supplier_pix_key && String(r.supplier_pix_key).trim().toLowerCase() === String(r.pix_key).trim().toLowerCase() && TIPOS_CHAVE.includes(r.supplier_pix_key_tipo)) tipo = r.supplier_pix_key_tipo;
      if (!tipo) tipo = pixTipoDeduzir(r.pix_key, doc);
      if (!tipo) { prob('tipo da chave PIX não informado (cadastre no fornecedor ou no título)'); continue; }
      const k = pixChaveFormatar(r.pix_key, tipo);
      if (k.erro) { prob(k.erro); continue; }
      pix.push({ id: r.id, valor, linha: linhaCsv([ROTULO_INICIACAO[tipo], r.id, k.v, '', '', '', '', '', r.supplier_name, tipoDoc, docFmt, fmtMoeda(valor), fmtDataBR(data), '', r.description]) });
    } else {
      const d = soDigitos(r.boleto_line);
      if (!d) { prob('sem linha digitável do boleto'); continue; }
      if (d.length !== 47 && d.length !== 48) { prob('linha digitável incompleta'); continue; }
      barra.push({ id: r.id, valor, linha: linhaCsv([boletoLinhaFormatar(d), r.id, fmtDataBR(data), fmtMoeda(valor), tipoDoc, docFmt, r.supplier_name]) });
    }
  }
  const soma = l => Math.round(l.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  return {
    pix: { qtd: pix.length, total: soma(pix), ids: pix.map(x => x.id), csv: arquivoCsv(CAB_PIX, pix.map(x => x.linha)) },
    boleto: { qtd: barra.length, total: soma(barra), ids: barra.map(x => x.id), csv: arquivoCsv(CAB_BARRA, barra.map(x => x.linha)) },
    problemas, ignorados
  };
}

module.exports = { TIPOS_CHAVE, pixTipoDeduzir, pixChaveFormatar, boletoLinhaFormatar, montarLote, fmtMoeda, fmtDataBR };
