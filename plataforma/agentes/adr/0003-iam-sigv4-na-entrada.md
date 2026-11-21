# ADR 0003 · IAM (SigV4) como autenticação de entrada do gateway

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-002, RF-003, RNF-001, E5

## Contexto
O gateway aceita quatro autorizadores de entrada ([documentação](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html)):
- `CUSTOM_JWT`;
- `AWS_IAM`;
- `AUTHENTICATE_ONLY`;
- `NONE`, desaconselhado em produção.

O motor de política reconhece o principal IAM como `AgentCore::IamEntity`, pelo ARN da role ([conceitos](https://docs.aws.amazon.com/de_de/bedrock-agentcore/latest/devguide/policy-core-concepts.html)). Os agentes dos produtos rodam na própria conta, com roles por produto (D-029).

## Decisão
- **Autorizador de entrada `AWS_IAM`:**
  - a variável aceita só esse valor, e `NONE` e `AUTHENTICATE_ONLY` reprovam (TT-G01);
  - o agente assina com SigV4 usando a role `<chave>-agente-<nome>`;
  - a role só tem `bedrock-agentcore:InvokeGateway` no ARN do gateway.
- **Identidade no Cedar:** o principal é o ARN dessa role, e cada `permit` cita o ARN exato.
- **Saída do gateway:**
  - para alvo Lambda, a role de execução do gateway, liberada pela política de recurso da função do produto;
  - para servidor MCP na AWS, SigV4 com a role do gateway;
  - fora da AWS, provedor de credencial do AgentCore Identity (OAuth ou chave de API), sem segredo no Terraform, no prompt ou em variável de ambiente.

## Alternativas rejeitadas
- **`CUSTOM_JWT` com Cognito ou outro IdP:**
  - acrescenta um provedor, um cliente OAuth e um segredo de cliente por produto;
  - o principal do Cedar viraria uma claim, que depende da configuração do IdP;
  - fica fora de escopo na spec.
- **`AUTHENTICATE_ONLY`:** autentica, mas não autoriza por identidade; o Cedar perde o principal confiável.
- **`NONE`:** porta aberta, contra o Art. IV.

## Trade-offs
- **Ganho:**
  - nenhum segredo criado;
  - o ABAC por tag (D-029) vale também para quem chama o gateway;
  - o CloudTrail registra o principal.
- **Custo:**
  - o cliente MCP precisa assinar com SigV4, então nem todo cliente MCP de prateleira serve; o agente de exemplo mostra como;
  - um agente fora da AWS precisaria de credencial AWS e, nesse caso, JWT seria melhor.

## Custo
US$ 0. O IAM não cobra, e o Identity usado pelo Gateway também não ([preços](https://aws.amazon.com/bedrock/agentcore/pricing/)).

## Risco
- **Role de agente com permissão a mais:** mitigado pelo TT-S03 e pelo checkov.
- **Floci não emula a invocação MCP:** a recusa de uma role sem `InvokeGateway` é provada na demonstração (DM-03, ADR-0009).

## Tarefas da prova
- 1.4: a identidade é o insumo do gate programático da política.
- 2.2: a falha de autenticação vira a categoria `autenticacao`, não retentável.
- 2.4: credenciais ficam na configuração do servidor ou do gateway, nunca no prompt.

## Curso Skilljar relacionado
Claude with Amazon Bedrock (acesso por IAM, sem chave estática) e Introduction to Model Context Protocol (autenticação do transporte).

## Em produção, um arquiteto sênior faria
- IAM para agentes internos na AWS e JWT para agentes de parceiros ou de usuário final, com propagação da identidade do usuário (on-behalf-of) até o alvo.
- Roles de agente emitidas por um módulo único.
- Revisão periódica pelo IAM Access Analyzer.
