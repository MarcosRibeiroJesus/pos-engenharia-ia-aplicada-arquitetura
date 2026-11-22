# ADR 0014 · Sem Principal curinga

- **Status:** aceito (**D-044**). O dono aprovou o endurecimento no chat em 2026-11-20 ("2 aprovo"). A mudança altera uma linha do `plan.md`, e a nova aprovação do plano foi registrada com `estado.py aprovar-plano`.
- **Data:** 2026-11-20
- **Requisitos:** RNF-001 (nada público), Art. IV; regra TT-S01 (T003)

## Contexto
- **A regra TT-S01 entregue na T003 aceitava `Principal "*"` com condição de conta.** Bastava que `aws:SourceAccount`, `aws:SourceArn`, `aws:PrincipalAccount` ou outra chave de conta aparecesse num operador `StringEquals`, `StringLike`, `ArnEquals` ou `ArnLike`.
- **Ela conferia só se a chave estava presente, não o valor dela.** Por isso passavam:
  - `StringLike` com `aws:SourceAccount` igual a `*`, que casa com qualquer conta;
  - `ArnLike` com `aws:SourceArn` igual a `arn:aws:cloudwatch:us-east-1:*:alarm:*`, que casa com o alarme de qualquer conta.
  
  Nos dois casos, a política continua pública, e o teste fica verde.
- **Mesmo com um valor concreto,** `Principal "*"` com condição depende de cada declaração acertar a chave e o operador. Um `*IfExists`, uma chave que o serviço não envia ou uma cópia sem a condição bastam para abrir o recurso. O plano não precisa desse padrão: todo acesso previsto é da própria conta ou de um serviço da AWS com principal de serviço.

## Decisão
- **`Principal "*"`, `{"AWS": "*"}` e `NotPrincipal` em declaração `Allow` reprovam sempre,** com ou sem condição. O acesso da própria conta usa o principal explícito, a raiz da conta por referência de `aws_caller_identity` (`arn:aws:iam::<conta>:root`), e o acesso de serviço usa o principal de serviço.
- **Valor de chave de conta com curinga reprova,** em qualquer operador e qualquer que seja o principal.
  - As chaves são `aws:SourceAccount`, `aws:SourceOwner`, `aws:PrincipalAccount`, `aws:ResourceAccount`, `aws:SourceArn` e `aws:PrincipalArn`, sem diferença entre maiúsculas e minúsculas.
  - Curinga é `*` ou `?`, no valor ou em qualquer item da lista.
- **`aws_lambda_permission` segue a mesma regra:** `principal = "*"` reprova mesmo com `source_account` ou `source_arn`, e `source_account` ou `source_arn` com curinga reprova.
- **Declarações `Deny` ficam fora da regra.** A negação de `aws:SecureTransport = false` com `Principal "*"` (TT-S04) continua obrigatória.
- **O controle positivo (`conforme.json`)** troca o `{"AWS": "*"}` da declaração `DaConta` pela raiz da conta e mantém a condição `aws:PrincipalAccount` com valor concreto. O sentido não muda: só a própria conta publica no tópico.
- **Testes:**
  - fixtures novas, geradas do plan com mock de roots sintéticos: `principal_publico_com_conta`, `condicao_conta_curinga` e `condicao_arn_curinga`;
  - casos unitários para `?`, lista, chave em minúsculas, `aws:PrincipalArn`, `aws:ResourceAccount`, `*IfExists` e `aws_lambda_permission`.

## Alternativas rejeitadas
- **Manter a condição de conta como exceção:** é a regra antiga. Exige conferir chave, operador e valor de cada declaração, e um erro em qualquer dos três abre o recurso sem o teste perceber.
- **Permitir `*` só com `aws:PrincipalAccount`:** é a chave mais segura das seis para principais IAM, mas o principal explícito chega ao mesmo efeito sem depender da condição. Manter a exceção deixaria a regra mais complexa para um caso que o plano não usa.

## Trade-offs
- **Ganho:** a regra fica simples e falha fechada. O curinga em `Principal` ou no valor da conta reprova sem depender de interpretar a condição.
- **Custo:**
  - padrões comuns da AWS com curinga no `aws:SourceArn` também reprovam. Exemplos: `arn:aws:cloudwatch:<região>:<conta>:alarm:*` na política da chave KMS (T010) e `source_arn` de API Gateway com `/*/*`. As tarefas que precisarem deles usam o ARN exato do recurso criado no stack, ou só `aws:SourceAccount` com a conta concreta;
  - um caso legítimo que precise de curinga entra só por nova decisão do dono e ADR, e não por exceção silenciosa no teste.

## Custo
US$ 0. A regra roda só no plan com mock.

## Risco
- **O teste roda com mock provider, então a conta é um valor fictício** (`111111111111`). Ele confere a estrutura da política e a ausência de curinga, não que a conta seja a conta real. A conta real é provada no ensaio contra a AWS (T084) e pelo checkov.
- **Uma política montada fora do plan** (desconhecida no plan) não é lida. Ela reprova pela regra que já existia de política desconhecida (fixture `politica_desconhecida`).
- **Uma tarefa futura travar no curinga do `aws:SourceArn`:** a correção é o ARN exato. Se não houver ARN exato possível, a tarefa para e leva a pergunta ao dono.

## Tarefas da prova
- TT-S01 (regra do plano endurecida).
- 1.4 · gate programático em vez de instrução: a regra reprova no CI, sem depender de revisão.
- 4.1 · critério explícito: "nenhum `*` no principal nem no valor da conta" é verificável, ao contrário de "tem condição de conta".
- 5.6 · incerteza declarada: o limite do mock (conta fictícia) está registrado no risco.

## Curso Skilljar relacionado
Claude Code in Action: regras do repositório verificadas por teste no CI.

## Em produção, um arquiteto sênior faria
- Somaria uma SCP ou um controle do IAM Access Analyzer que alerta qualquer política de recurso com acesso externo à conta ou à organização.
- Rodaria o Access Analyzer no PR (`check-no-public-access`) sobre as políticas do plan, além do teste estrutural.
