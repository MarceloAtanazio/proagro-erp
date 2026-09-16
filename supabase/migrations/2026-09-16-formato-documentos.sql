-- Um formato só para cada documento.
--
-- Os campos de documento foram gravados por caminhos diferentes ao longo do
-- tempo: pela tela com máscara, pela tela sem máscara, por importação e pela
-- API direto. O resultado foi o mesmo documento convivendo em dois formatos --
-- "391.644.438-76" e "39164443876" para a mesma pessoa. Além de feio na tela,
-- isso quebra a checagem de duplicidade, que compara texto.
--
-- A regra, aqui e no código, é a mesma: normaliza para dígitos e formata SE a
-- contagem bater. Se não bater, DEIXA COMO ESTÁ. Um documento incompleto
-- exibido com máscara de completo passa por conferido e nunca mais é olhado --
-- é preferível que continue visivelmente torto.

-- CPF: 11 dígitos -> 000.000.000-00
UPDATE erp_colaboradores SET cpf =
  regexp_replace(regexp_replace(cpf,'\D','','g'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')
 WHERE cpf IS NOT NULL AND length(regexp_replace(cpf,'\D','','g')) = 11
   AND cpf !~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$';

UPDATE erp_rh_dependentes SET cpf =
  regexp_replace(regexp_replace(cpf,'\D','','g'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')
 WHERE cpf IS NOT NULL AND length(regexp_replace(cpf,'\D','','g')) = 11
   AND cpf !~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$';

-- PIS/PASEP: 11 dígitos -> 000.00000.00-0
UPDATE erp_colaboradores SET pis =
  regexp_replace(regexp_replace(pis,'\D','','g'), '^(\d{3})(\d{5})(\d{2})(\d{1})$', '\1.\2.\3-\4')
 WHERE pis IS NOT NULL AND length(regexp_replace(pis,'\D','','g')) = 11
   AND pis !~ '^\d{3}\.\d{5}\.\d{2}-\d$';

-- CEP: 8 dígitos -> 00000-000
UPDATE erp_colaboradores SET cep =
  regexp_replace(regexp_replace(cep,'\D','','g'), '^(\d{5})(\d{3})$', '\1-\2')
 WHERE cep IS NOT NULL AND length(regexp_replace(cep,'\D','','g')) = 8
   AND cep !~ '^\d{5}-\d{3}$';

-- Título de eleitor: 12 dígitos -> 0000 0000 0000. O que tem 11 fica como está:
-- título de eleitor tem 12, e mascarar um incompleto esconderia o problema.
UPDATE erp_colaboradores SET titulo_eleitor =
  regexp_replace(regexp_replace(titulo_eleitor,'\D','','g'), '^(\d{4})(\d{4})(\d{4})$', '\1 \2 \3')
 WHERE titulo_eleitor IS NOT NULL AND length(regexp_replace(titulo_eleitor,'\D','','g')) = 12
   AND titulo_eleitor !~ '^\d{4} \d{4} \d{4}$';

-- Telefone: 11 dígitos -> (00) 00000-0000; 10 -> (00) 0000-0000.
UPDATE erp_colaboradores SET celular =
  regexp_replace(regexp_replace(celular,'\D','','g'), '^(\d{2})(\d{5})(\d{4})$', '(\1) \2-\3')
 WHERE celular IS NOT NULL AND length(regexp_replace(celular,'\D','','g')) = 11
   AND celular !~ '^\(\d{2}\) \d{5}-\d{4}$';
UPDATE erp_colaboradores SET celular =
  regexp_replace(regexp_replace(celular,'\D','','g'), '^(\d{2})(\d{4})(\d{4})$', '(\1) \2-\3')
 WHERE celular IS NOT NULL AND length(regexp_replace(celular,'\D','','g')) = 10
   AND celular !~ '^\(\d{2}\) \d{4}-\d{4}$';
UPDATE erp_colaboradores SET emergencia_telefone =
  regexp_replace(regexp_replace(emergencia_telefone,'\D','','g'), '^(\d{2})(\d{5})(\d{4})$', '(\1) \2-\3')
 WHERE emergencia_telefone IS NOT NULL AND length(regexp_replace(emergencia_telefone,'\D','','g')) = 11
   AND emergencia_telefone !~ '^\(\d{2}\) \d{5}-\d{4}$';

-- Fornecedor: o campo se chama "cnpj" mas guarda PF e PJ. Decide a contagem.
UPDATE erp_suppliers SET cnpj =
  regexp_replace(regexp_replace(cnpj,'\D','','g'), '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5')
 WHERE cnpj IS NOT NULL AND length(regexp_replace(cnpj,'\D','','g')) = 14
   AND cnpj !~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$';
UPDATE erp_suppliers SET cnpj =
  regexp_replace(regexp_replace(cnpj,'\D','','g'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')
 WHERE cnpj IS NOT NULL AND length(regexp_replace(cnpj,'\D','','g')) = 11
   AND cnpj !~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$';
UPDATE erp_suppliers SET phone =
  regexp_replace(regexp_replace(phone,'\D','','g'), '^(\d{2})(\d{5})(\d{4})$', '(\1) \2-\3')
 WHERE phone IS NOT NULL AND length(regexp_replace(phone,'\D','','g')) = 11
   AND phone !~ '^\(\d{2}\) \d{5}-\d{4}$';

-- Empresa
UPDATE erp_company_settings SET cnpj =
  regexp_replace(regexp_replace(cnpj,'\D','','g'), '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5')
 WHERE cnpj IS NOT NULL AND length(regexp_replace(cnpj,'\D','','g')) = 14
   AND cnpj !~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$';
