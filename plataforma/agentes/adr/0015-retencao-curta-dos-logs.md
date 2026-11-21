# ADR 0015 · Retenção de 7 dias nos logs e exceção ao CKV_AWS_338

- **Status:** aceito. É decisão técnica delegada dentro do plano aprovado (D-033): aplica o RNF-002 e o RF-006 da spec, que já fixam os 7 dias, e não muda escopo nem custo.
- **Data:** 2026-11-21
- **Requisitos:** RF-006 (logs e traces com retenção), RNF-002 (custo), Art. IV (exceção da esteira com justificativa versionada), Art. V; T016

## Contexto
- **O checkov `CKV_AWS_338` exige no mínimo um ano de retenção em todo `aws_cloudwatch_log_group`.** A esteira roda o checkov com `soft_fail: false`, então o achado bloqueia o PR.
- **A spec e o plano fixam 7 dias** para o grupo de logs do gateway (`/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<id>`). O uso é um dia de demonstração, e os logs servem à revisão humana do relatório (T088), feita na mesma semana.
- **A chave KMS da plataforma é nova a cada demonstração** (ADR-0001). Depois do destroy, o dado cifrado fica ilegível de qualquer forma, então um ano de retenção guardaria só custo.

## Decisão
- **O grupo de logs do gateway retém 7 dias,** fixo num `local` do módulo `observabilidade` e conferido no `entrega.tftest.hcl` e no `test_observabilidade.py` (TT-O02).
- **A exceção ao `CKV_AWS_338` é por comentário `checkov:skip` no próprio recurso,** com o motivo e o link deste ADR. Não entra no `.checkov.yaml`: um grupo de log futuro de outro módulo continua sendo cobrado pela regra.
- **O grupo entra no destroy:** `skip_destroy = false` e `deletion_protection_enabled = false`, explícitos.

## Alternativas rejeitadas
- **Um ano de retenção:** contraria o RNF-002 e não traz ganho, porque a chave do ADR-0001 sai junto com o stack.
- **Desligar o `CKV_AWS_338` no `.checkov.yaml`:** a exceção passaria a valer para todo grupo de log do repositório, inclusive de produtos com outro perfil de uso.
- **Variável de retenção com padrão 7:** abriria um caminho para mudar a retenção sem passar por spec e ADR.

## Trade-offs
- **Ganho:** custo de armazenamento mínimo e nenhum dado de demonstração guardado além da semana.
- **Custo:** um incidente percebido depois de 7 dias não tem logs. Aceitável num lab de demonstração.

## Custo
Nenhum custo novo: a retenção de 7 dias já é a do plano (seção "Custo do lab"). Um ano custaria armazenamento sem leitor, porque a chave sai no destroy.

## Risco
- **A exceção ser copiada para outro grupo sem motivo:** o skip é por recurso e cita este ADR; o revisor independente (T081) confere cada novo `checkov:skip`.

## Tarefas da prova
- Gate programático com exceção explícita (1.4): o checkov continua bloqueante, e a exceção tem motivo e escopo de um recurso.
- Proveniência da decisão (5.6): o skip aponta para o requisito e para este ADR.

## Curso Skilljar relacionado
Claude Code in Action: regras do repositório verificadas por ferramenta no CI.

## Em produção, um arquiteto sênior faria
- Definiria a retenção por classe de dado (auditoria, operação, depuração), com auditoria exportada para um arquivo de longo prazo na conta de log central.
- Trocaria o skip por recurso por uma política do checkov customizada que aceite a retenção curta só com uma tag de classe de dado.
