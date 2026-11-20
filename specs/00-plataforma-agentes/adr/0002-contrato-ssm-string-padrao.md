# ADR 0002 · Contrato v1 em parâmetro SSM `String` da camada padrão

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-007, RNF-001, RNF-002, E4

## Contexto
O RF-007 publica o contrato em parâmetros SSM da camada padrão e deixa o tipo para o plano. O RNF-001 pede KMS nos parâmetros "quando o tipo exigir".

Fatos que decidem:
- O contrato, por desenho, não tem segredo. O TS-02 prova isso, e a credencial de alvo fora da AWS fica no AgentCore Identity (ADR-0003).
- A camada padrão é gratuita até 4 KB por parâmetro ([camadas](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)).
- Os leitores são três:
  - o Terraform do produto, pelo data source `aws_ssm_parameter`;
  - o agente do produto, em tempo de execução;
  - o produto sintético do teste no Floci.

## Decisão
- **Tipo `String`, camada `Standard`, valor JSON** validado por `plataforma/agentes/contrato/v1.schema.json`.
- **Sem `SecureString`.**
- **Controle de acesso por IAM:** a role de cada produto lê só o `comum` e o próprio parâmetro, por ARN.
- **Proteções contra segredo no contrato:**
  - o schema proíbe nomes de campo com `segredo`, `senha`, `token`, `chave_secreta` ou `password`;
  - o TS-02 procura padrões de credencial nos valores;
  - o gitleaks roda na esteira.

## Alternativas rejeitadas
- **`SecureString` com a chave do cliente:**
  - cada leitor precisaria de `kms:Decrypt` numa chave que muda a cada apply (ADR-0001);
  - o data source deixaria o valor marcado como sensível no plan, o que atrapalha os asserts;
  - o tipo daria a impressão falsa de que o contrato guarda segredo.
- **`SecureString` com a chave `aws/ssm`:** cifra sem controle de acesso adicional, porque quem lê o parâmetro já decifra. É custo cognitivo sem ganho.
- **Camada avançada:** cobrada por parâmetro e por mês; os 4 KB bastam (TS-01).
- **`terraform_remote_state`:** rejeitado na spec (E4).

## Trade-offs
- **Ganho:** o contrato é legível no console e no Floci, sem dependência de chave, e o plan mostra o valor para os testes.
- **Custo:**
  - o valor fica cifrado pelo serviço, mas não pela chave do cliente;
  - a garantia de "sem segredo" depende do schema e dos testes, não do tipo.

## Custo
US$ 0.

## Risco
- **Alguém acrescenta um campo secreto numa versão futura:** o schema e o TS-02 reprovam o PR. Mudança de sentido de campo é versão maior (RF-007).
- **O contrato passa de 4 KB com muitas tools:** o TS-01 mede; se passar, as tools vão para um parâmetro por alvo (versão menor).

## Tarefas da prova
- 2.1: interface estável e documentada entre a plataforma e o produto, como a descrição de uma tool.
- 2.2: o mapa de erros com categoria e retentável viaja no contrato.

## Curso Skilljar relacionado
Introduction to Model Context Protocol: contrato de interface entre servidor e cliente.

## Em produção, um arquiteto sênior faria
- Publicaria o contrato num registro versionado, como parâmetros com histórico ou o AWS Agent Registry quando estável.
- Teria testes de contrato no consumidor (consumer-driven) e uma política de depreciação com prazo.
- Manteria segredos sempre em serviço próprio (Secrets Manager ou AgentCore Identity), nunca no contrato.
