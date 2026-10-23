-- Propósito: reparar a admissão 7 (Larissa Dantas Pessoa, colaborador 37), concluída sem vínculo por causa do
--   erro do INSERT de vínculo ("inconsistent types deduced for parameter $1"). Cria o vínculo CLT a partir da
--   admissão, ativa o colaborador e cria o fornecedor da folha. Idempotente: não faz nada se já houver vínculo.
-- Entrada: banco de produção (Supabase proagro-erp). Saída: 1 linha com vinculo / ativou / fornecedor.
-- Uso: executar no SQL Editor do Supabase.
with v as (
  insert into erp_rh_vinculos (colaborador_id, matricula, tipo, admissao, cargo, nivel, departamento, centro_custo, gestor_id, regime, modelo_trabalho, controle_ponto, experiencia_fim, prorrogacao_fim, salario, vr_dia, home_office_dia, created_by)
  select a.colaborador_id, a.colaborador_id::text, 'clt', a.admissao_prevista, a.cargo_pretendido, a.nivel_pretendido, a.departamento, a.centro_custo, a.gestor_id, a.regime, a.modelo_trabalho,
         (a.modelo_trabalho <> 'externo' and a.regime <> 'confianca'), a.admissao_prevista + 45, a.admissao_prevista + 90, a.salario_previsto, a.vr_dia, a.home_office_dia, 1
  from erp_rh_admissoes a where a.id=7 and a.vinculo_id is null
    and not exists (select 1 from erp_rh_vinculos x where x.colaborador_id=a.colaborador_id and x.desligamento is null)
  returning id),
u as (update erp_rh_admissoes set vinculo_id=(select id from v) where id=7 and exists (select 1 from v) returning id),
c as (update erp_colaboradores set ativo=true where id=37 and exists (select 1 from v) returning id),
s as (insert into erp_suppliers (name, cnpj, category, status, pix_key, colaborador_id, notes)
  select c.name, c.cpf, 'Folha de Pagamento','ativo', coalesce(c.pix_chave,c.cpf), c.id, 'Criado junto com o cadastro do colaborador, para a folha poder ser lançada em Contas a Pagar.'
  from erp_colaboradores c where c.id=37 and exists (select 1 from v) and not exists (select 1 from erp_suppliers where colaborador_id=37) returning id)
select (select id from v) vinculo, (select count(*) from c) ativou, (select count(*) from s) fornecedor;
