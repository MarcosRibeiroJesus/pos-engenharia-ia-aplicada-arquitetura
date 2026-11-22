# ADR-0006: Avaliação no CI com respostas gravadas, rodada real única e tracing no Langfuse Cloud

- **Status:** proposto; aplica a D-048 (escolha do dono). As chaves do Langfuse são a pergunta D02-P2
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
A D-048 escolheu gate de avaliação no CI e traces no Langfuse Cloud, plano Hobby, só com dados sintéticos; as chaves são do dono e, sem elas, o tracing fica desligado. O código tem o gate (`src/lib/avaliacao/avaliador.ts`, 10 casos), a bateria red team (24 ataques e 6 controles) e um rastreador Langfuse por variáveis de ambiente, mas o comentário e o `lab/langfuse/` tratam o Langfuse como só local (DV-08), e não existe workflow de CI do D02 (DV-09).

## Decisão
1. **Workflow de CI do D02** (`02-assistente-agendamento-ci.yml`), em todo PR que toque a pasta do projeto: `npm ci`, `tsc --noEmit`, vitest (unitários, red team e gate de avaliação), `terraform fmt`, `validate`, `tflint`, `checkov` e `terraform test`. Sem Bedrock e sem segredo (D-006); actions fixadas por SHA e `permissions` mínimas.
2. **Rodada real única** na demonstração: o mesmo gate e a mesma bateria em `modo_llm = bedrock`, dentro do teto por execução de US$ 20 (D-068) e da cota diária de tokens do gateway, com relatório revisado pelo dono antes de publicar.
3. **Tracing:** o rastreador continua nulo por padrão. Na demonstração, se as chaves existirem (D02-P2), as Lambdas leem `LANGFUSE_HOST` (padrão da nuvem do Langfuse), a chave pública e a secreta de um parâmetro `SecureString` do SSM sob o prefixo do projeto, criado fora do Terraform pelo dono; sem o parâmetro, o tracing fica desligado. A entrada das gerações continua mascarada por padrão. O `lab/langfuse/` local fica como opção de laboratório. O parâmetro usa a chave gerenciada `aws/ssm` (não a CMK do stack, para o `kms:ViaService` continuar sem `ssm`) e **não** leva a tag `project=02-assistente-agendamento`: ele é do dono, vive fora do ciclo de apply e destroy e não pode contar como sobra na verificação pela tag. A role de cada Lambda ganha só `ssm:GetParameter` nesse ARN e `kms:Decrypt` com `kms:ViaService = ssm`.
4. **Na AWS:** métricas EMF, alarmes e X-Ray continuam a observabilidade operacional.

## Alternativas rejeitadas
- **Langfuse na AWS.** Rejeitada pelo dono por custo (D-048).
- **Chave do Langfuse em variável de ambiente do Terraform.** Rejeitada: o segredo apareceria no state e no plan.
- **Rodar o gate com o modelo real em todo PR.** Rejeitada: custo e não determinismo; contraria a D-006.

## Trade-offs
O CI prova o pipeline (schema, validação, retentativa, gate, templates), não o modelo. A qualidade real do modelo é medida uma vez por demonstração.

## Custo
CI sem custo de AWS. Langfuse Hobby sem custo. Leitura do SSM `SecureString` com a chave padrão: sem custo relevante.

## Risco
Dado real colado por engano iria para um serviço externo. Mitigação: só dados sintéticos versionados, mascaramento da entrada por padrão, e o roteiro da demonstração lê só fixtures.

## Tarefas da prova exercitadas
3.6 (CI), 4.4 (validação e retentativa medidas), 4.6 (avaliação separada do autor), 5.5 (revisão humana do relatório).

## Curso Skilljar relacionado
*Building with the Claude API* (avaliação) e *Claude Code in Action* (CI).

## O que um arquiteto sênior faria em produção
Rodaria o gate com modelo real em ambiente de homologação a cada mudança de prompt, modelo ou cadeia, com amostragem de produção para avaliação contínua e alarme de deriva nas métricas do gate.
