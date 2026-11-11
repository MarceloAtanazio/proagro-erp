-- Propósito: conferir (SOMENTE LEITURA) o "Saldo de caixa" do Dashboard antes e depois da correção da dupla contagem do extrato.
-- Entradas: nenhuma (usa as tabelas erp_receivables, erp_payables e erp_bank_transactions). Saídas: uma linha com os componentes e os dois saldos.
-- Como executar: no SQL do Supabase (projeto do ERP) — nada é alterado.
-- Esperado em 12/11/2026: saldo_antigo = 3.477.025,02 · saldo_novo = 1.733.401,54 · recebido_menos_pago = 1.740.900,95 · extrato_total = 1.736.124,07.
select
  round(rec.v, 2)  as recebido_hist,
  round(pag.v, 2)  as pago_hist,
  round(adj_todos.v, 2) as ajustes_antigo_todas_as_linhas,
  round(adj_indep.v, 2) as ajustes_novo_so_sem_titulo,
  round(rec.v - pag.v + adj_todos.v, 2) as saldo_antigo,
  round(rec.v - pag.v + adj_indep.v, 2) as saldo_novo,
  round(rec.v - pag.v, 2) as recebido_menos_pago,
  round(ext.v, 2) as extrato_total
from
  (select coalesce(sum(amount),0) v from erp_receivables where status='recebido') rec,
  (select coalesce(sum(amount),0) v from erp_payables where status='pago') pag,
  (select coalesce(sum(amount),0) v from erp_bank_transactions where auto_generated=false) adj_todos,
  (select coalesce(sum(amount),0) v from erp_bank_transactions where auto_generated=false and coalesce(matched_type,'') not in ('payable','receivable')) adj_indep,
  (select coalesce(sum(amount),0) v from erp_bank_transactions) ext;
