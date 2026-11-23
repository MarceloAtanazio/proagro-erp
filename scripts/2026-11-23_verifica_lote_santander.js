// Propósito: verificar src/lote-santander.js reproduzindo as linhas dos modelos do Santander (planilhaPix.csv e planilhaBarra.csv) e as regras de validação.
// Entrada: nenhuma (dados de teste embutidos, tirados dos modelos). Saída: PASS/FAIL no console; código 1 se algo falhar.
// Uso: node scripts/2026-11-23_verifica_lote_santander.js
const assert = require('assert'); const L = require('../src/lote-santander');
let ok = 0, fail = 0; const t = (n, f) => { try { f(); ok++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '-', e.message); } };
const base = { status: 'pendente', due_date: '2026-10-05', description: 'x' };
const r = (o) => Object.assign({}, base, o);
const q = res => res.pix.csv.split('\r\n');
t('PIX CPF igual ao modelo', () => {
  const x = L.montarLote([r({ id: 'ReembKM', amount: 287.7, payment_method: 'pix', pix_key: '10303558946', pix_key_tipo: 'cpf', supplier_name: 'Gustavo Fonseca', supplier_doc: '103.035.589-46', description: 'Reembolso km - OT 157' })], { hoje: '2026-10-01' });
  assert.strictEqual(q(x)[1], '3;ReembKM;103.035.589-46;;;;;;Gustavo Fonseca;PF;103.035.589-46;287,70;05/10/2026;;Reembolso km - OT 157');
});
t('PIX telefone com documento CPF separado', () => {
  const x = L.montarLote([r({ id: 9, amount: 177.8, payment_method: 'pix', pix_key: '(14) 99651-6296', pix_key_tipo: 'telefone', supplier_name: 'Luiz Henrique Santos Suzuki', supplier_doc: '33570455831', description: 'Reembolso km - OT 157' })], { hoje: '2026-10-01' });
  assert.strictEqual(q(x)[1], '1;9;14996516296;;;;;;Luiz Henrique Santos Suzuki;PF;335.704.558-31;177,80;05/10/2026;;Reembolso km - OT 157');
});
t('milhar com ponto', () => { assert.strictEqual(L.fmtMoeda(4254.49), '4.254,49'); assert.strictEqual(L.fmtMoeda(9498.5), '9.498,50'); assert.strictEqual(L.fmtMoeda(720.24), '720,24'); });
t('boleto igual ao modelo (PJ)', () => {
  const x = L.montarLote([r({ id: 'Pagamento2', amount: 9498.5, payment_method: 'boleto', boleto_line: '46191110000000000004293930193011515900000949850', supplier_name: 'CASA DA MALHA E RETALHO IND E COM LTDA', supplier_doc: '82129552000169' })], { hoje: '2026-10-01' });
  assert.strictEqual(x.boleto.csv.split('\r\n')[1], '46191.11000 00000.000042 93930.193011 5 15900000949850;Pagamento2;05/10/2026;9.498,50;PJ;82.129.552/0001-69;CASA DA MALHA E RETALHO IND E COM LTDA');
});
t('arquivo: BOM, CRLF, cabeçalho e linha final', () => {
  const x = L.montarLote([], {}); assert.ok(x.pix.csv.startsWith('\uFEFFForma de iniciação;Número do pagamento;')); assert.ok(x.pix.csv.endsWith('\r\n')); assert.ok(x.boleto.csv.startsWith('\uFEFFCodigo de barra;'));
});
t('tipo da chave: deduz o inequívoco, recusa o ambíguo', () => {
  assert.strictEqual(L.pixTipoDeduzir('a@b.com', ''), 'email'); assert.strictEqual(L.pixTipoDeduzir('123e4567-e89b-12d3-a456-426614174000', ''), 'aleatoria');
  assert.strictEqual(L.pixTipoDeduzir('103.035.589-46', ''), 'cpf'); assert.strictEqual(L.pixTipoDeduzir('54.443.394/0001-81', ''), 'cnpj');
  assert.strictEqual(L.pixTipoDeduzir('(14) 99651-6296', ''), 'telefone'); assert.strictEqual(L.pixTipoDeduzir('14996516296', '10303558946'), null);
  assert.strictEqual(L.pixTipoDeduzir('10303558946', '10303558946'), 'cpf');
});
t('problemas: sem tipo, sem documento, sem chave, sem linha, já enviado, data passada', () => {
  const x = L.montarLote([
    r({ id: 1, amount: 10, payment_method: 'pix', pix_key: '14996516296', supplier_name: 'A', supplier_doc: '33570455831' }),
    r({ id: 2, amount: 10, payment_method: 'pix', pix_key: 'a@b.com', supplier_name: 'B', supplier_doc: '' }),
    r({ id: 3, amount: 10, payment_method: 'pix', pix_key: '', supplier_name: 'C', supplier_doc: '33570455831' }),
    r({ id: 4, amount: 10, payment_method: 'boleto', boleto_line: '', supplier_name: 'D', supplier_doc: '33570455831' }),
    r({ id: 5, amount: 10, payment_method: 'pix', pix_key: 'a@b.com', supplier_name: 'E', supplier_doc: '33570455831', enviado_tesouraria_em: '2026-10-02T10:00:00Z' }),
    r({ id: 6, amount: 10, payment_method: 'pix', pix_key: 'a@b.com', supplier_name: 'F', supplier_doc: '33570455831', due_date: '2026-09-01' }),
    r({ id: 7, amount: 10, payment_method: 'transferencia', supplier_name: 'G', supplier_doc: '33570455831' })
  ], { hoje: '2026-10-01' });
  const m = Object.fromEntries(x.problemas.map(p => [p.id, p.motivo]));
  assert.ok(/tipo da chave/.test(m[1])); assert.ok(/sem CPF/.test(m[2])); assert.ok(/sem chave/.test(m[3])); assert.ok(/linha digitável/.test(m[4]));
  assert.ok(/já enviado/.test(m[5])); assert.ok(/já passou/.test(m[6])); assert.strictEqual(m[7], undefined); assert.strictEqual(x.ignorados, 1); assert.strictEqual(x.pix.qtd, 0);
});
t('data única sobrepõe o vencimento; reenviar libera', () => {
  const x = L.montarLote([r({ id: 5, amount: 10, payment_method: 'pix', pix_key: 'a@b.com', supplier_name: 'E', supplier_doc: '33570455831', enviado_tesouraria_em: '2026-10-02T10:00:00Z' })], { hoje: '2026-10-01', dataPagamento: '2026-10-20', reenviar: true });
  assert.strictEqual(x.pix.qtd, 1); assert.ok(q(x)[1].includes(';20/10/2026;'));
});
t('tipo do fornecedor vale quando a chave é a mesma do cadastro', () => {
  const x = L.montarLote([r({ id: 8, amount: 10, payment_method: 'pix', pix_key: '14996516296', supplier_pix_key: '14996516296', supplier_pix_key_tipo: 'telefone', supplier_name: 'A', supplier_doc: '33570455831' })], { hoje: '2026-10-01' });
  assert.strictEqual(x.pix.qtd, 1); assert.ok(q(x)[1].startsWith('1;8;14996516296;'));
});
t('texto livre não quebra o CSV', () => {
  const x = L.montarLote([r({ id: 1, amount: 10, payment_method: 'pix', pix_key: 'a@b.com', supplier_name: 'A;B', supplier_doc: '33570455831', description: 'l1\nl2;x' })], { hoje: '2026-10-01' });
  assert.strictEqual(q(x)[1].split(';').length, 15);
});
console.log(`\n${ok} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
