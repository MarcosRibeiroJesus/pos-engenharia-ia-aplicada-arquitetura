# ADR 0008 · Alarmes da plataforma para os e-mails do `infra/conta`

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RNF-003 (alarmes no SNS), D-034 (resposta à P00-P5: mesmos e-mails de `emails_alerta`, sem variável nova)

## Contexto
O dono decidiu que os alarmes vão para os mesmos e-mails de `emails_alerta` do `infra/conta`, sem variável nova (D-034). O mecanismo é decisão técnica.

Hoje o `infra/conta`:
- não tem tópico SNS;
- usa os e-mails só como assinantes diretos do Budgets mensal;
- guarda os e-mails no `terraform.tfvars` local do dono, fora do repositório.

O alarme do CloudWatch precisa de um tópico SNS. Se o tópico for cifrado, ele precisa de uma chave do cliente (ADR-0001).

## Decisão
- **No `infra/conta`, aplicado pelo dono (D-034):**
  - um parâmetro SSM `String` `/00-conta/alertas/emails`;
  - o valor é `join(",", var.emails_alerta)`, a mesma variável de hoje;
  - custo zero, persistente.
- **Na plataforma:**
  - o tópico `00-plataforma-agentes-alarmes` é cifrado com a chave da plataforma;
  - a política do tópico nega quem não usa TLS e só aceita publicação do CloudWatch da conta;
  - uma assinatura `email` por endereço lido do parâmetro (`data "aws_ssm_parameter"`).
- **O tópico vai no contrato** (`topico_alarmes_arn`), então o alarme de intervenção do produto (ADR-0006) publica no mesmo lugar.
- **No destroy,** o tópico some com as assinaturas.

## Alternativas rejeitadas
- **Tópico persistente no `infra/conta` com chave do cliente:** custo fixo de US$ 1 por mês, ocioso fora das demonstrações (Art. V).
- **Tópico persistente no `infra/conta` sem criptografia:** exceção ao Art. IV e ao checkov só para economizar a confirmação de e-mail.
- **Variável de e-mails no stack da plataforma:** é variável nova, contra a D-034, e duplica a lista.
- **Ler o state do `infra/conta`:** rejeitado na spec (E4).

## Trade-offs
- **Ganho:** zero custo fixo, criptografia completa e uma única lista de e-mails.
- **Custo:**
  - a cada demonstração, o SNS manda um e-mail de confirmação de assinatura, e o alarme só chega depois do clique;
  - o README da plataforma inclui isso no passo do apply;
  - o dono está presente na demonstração, então o atraso é de minutos.

## Custo
Parâmetro SSM padrão, US$ 0. SNS por requisição, menos de US$ 0,01 por dia no volume do lab ([preços do SNS](https://aws.amazon.com/sns/pricing/); valor unitário confirmado pelo Infracost no PR).

## Risco
- **Confirmação esquecida:** os alarmes continuam visíveis no console e no relatório da demonstração.
- **E-mails num parâmetro da conta:** é dado de contato do dono, na conta dele, sem segredo. O parâmetro não entra no repositório nem em log.
  - **O log também é público** (análise 1, A06). O repositório é público, então os logs do Actions também são. Se o valor vier de `insecure_value` ou de `nonsensitive()` sobre a lista, o `terraform apply` imprime os e-mails.
  - **Correção (T011 e T012):** o valor vem do atributo sensível `value`, e só a quantidade sai do sensível: `count = nonsensitive(length(split(",", ...)))`. O `endpoint` de cada assinatura e os destinatários do Budgets continuam sensíveis.
    - O `nonsensitive()` fica em volta do `length`, e não da lista. Do contrário, a lista inteira deixaria de ser sensível.
    - O `for_each` sobre o valor sensível foi rejeitado, porque o Terraform não aceita.
  - **Prova:** o TT-S06 lê o plan em JSON e reprova se `after_sensitive.endpoint` ou `subscriber_email_addresses` não estiver marcado como sensível. Assim, a promessa deste ADR passa a ter teste.

## Tarefas da prova
5.2: escalonamento para humano quando o sistema detecta anomalia (negações em série, intervenções, erros).

## Curso Skilljar relacionado
Claude with Amazon Bedrock: operação e monitoramento de aplicações na conta.

## Em produção, um arquiteto sênior faria
- Um tópico de alertas persistente por ambiente, com chave dedicada.
- Roteamento por severidade para o sistema de plantão, em vez de e-mail.
- Inscrições gerenciadas fora do ciclo de vida das cargas.
