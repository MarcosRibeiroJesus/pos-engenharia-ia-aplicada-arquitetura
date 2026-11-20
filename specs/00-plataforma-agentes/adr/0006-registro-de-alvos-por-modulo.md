# ADR 0006 · Registro de alvos e políticas por módulo da plataforma no state do produto

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-001 (segundo aceite: mecanismo decidido no plano), RF-004, RF-005, RF-007, RF-009, RF-012; critério de sucesso 3

## Contexto
O RF-001 pede que um produto não crie, altere nem remova alvo de outro, e que o alvo e a política do produto sejam revisados no mesmo PR. Quatro fatos limitam o desenho:

1. **Política só depois da tool.** A política Cedar é validada contra o schema das tools dos gateways associados ao motor. Uma ação que ainda não existe deixa a política em `CREATE_FAILED` ([validação](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-create-update-validation.html)).
2. **Descoberta na criação.** O alvo servidor MCP faz a descoberta de capacidades na criação, então o servidor da D03 precisa estar no ar ([alvos MCP](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html)).
3. **Tag do perfil.** O perfil de inferência do produto leva `project=<chave do produto>` (RF-005). Se ficasse no state da plataforma, a verificação de sobras do destroy do produto o encontraria ainda vivo e falharia.
4. **Uma role de deploy só.** A conta usa uma única role de deploy (D-029), então o IAM não separa quem registra o quê. A separação precisa ser estrutural e testada.

## Decisão
**Módulo `plataforma/agentes/infra/terraform/modules/registro-produto`:**
- o código é da plataforma, mas a instância roda no state de cada produto;
- o produto o chama com o catálogo dele (alvos, tools com classes, agentes, aprovação, modelo, tópicos negados), declarado no próprio Terraform e revisado no PR do produto;
- o módulo lê o contrato `comum` do SSM.

**O módulo cria, nesta ordem:**
1. roles;
2. guardrail e versão;
3. perfil de inferência;
4. alvos com schema estático das tools e a política de recurso que libera o gateway;
5. depois dos alvos (`depends_on`), as políticas Cedar geradas;
6. o alarme de intervenção;
7. o parâmetro `produtos/<chave>`.

**Validações de plan:**
- a chave é igual à tag `project` do provider (`data.aws_default_tags`);
- os alvos usam o prefixo da chave;
- toda tool tem classe;
- a tríade letal é recusada por principal (RF-009);
- nenhum `permit` de tool `sensivel` vai para role de agente (RF-012).

**Gate do harness (TH-04):** nenhum `.tf` fora de `plataforma/agentes/infra/terraform/` declara `aws_bedrockagentcore_gateway`, `aws_bedrockagentcore_gateway_target`, `aws_bedrockagentcore_policy_engine` ou `aws_bedrockagentcore_policy`.

**Schema estático das tools (descrições revisadas no PR):**
- o alvo servidor MCP usa o `mcpToolSchema` estático quando o provider expuser;
- senão, usa a descoberta, com comparação do `tools/list` contra o catálogo na demonstração (R5).

**Nomes:**
- o padrão é o prefixo da chave (D-029);
- exceção: o motor e as políticas exigem `^[A-Za-z][A-Za-z0-9_]*$`, então usam `p00_plataforma_agentes` e `p<NN>_<slug>_<regra>`;
- a lista completa de exceções ao prefixo, com o grupo de log entregue e o parâmetro do produto, está no [ADR-0012](0012-excecoes-ao-prefixo.md) (análise 1, A07).

## Alternativas rejeitadas
- **Catálogo central com alvos e políticas no state da plataforma:**
  - a política seria criada antes de a tool existir (fato 1);
  - o alvo MCP pediria o servidor no ar antes do apply da plataforma (fato 2);
  - recursos com a tag do produto ficariam no state da plataforma (fato 3);
  - a ordem do dia viraria plataforma, produto, plataforma de novo.
- **Terceiro stack de registro por produto:** resolve a ordem, mas cria mais um state, mais um workflow e mais uma etapa de destroy por produto.
- **Recursos brutos no Terraform do produto:** cada produto escreveria o próprio Cedar. A tríade letal e a regra de ação sensível dependeriam de disciplina, não de validação.

## Trade-offs
- **Ganho:**
  - a ordem natural de apply e destroy;
  - a tag certa em cada recurso;
  - a validação concentrada num lugar;
  - o produto revisa alvo e política juntos;
  - o destroy do produto limpa tudo o que ele registrou.
- **Custo:**
  - o código da plataforma roda com as credenciais do produto;
  - a separação entre produtos depende do gate e da validação, não de IAM;
  - risco residual R7: com a role de deploy única, alguém poderia contornar o módulo, mas o gate do harness e a revisão no PR barram.

## Custo
US$ 0 de estrutura. O custo de uso do guardrail e do perfil vai para o teto do produto.

## Risco
- **R5:** provider sem schema estático para servidor MCP.
- **R7:** role de deploy única.
- **R8:** `CREATE_FAILED` na política. O módulo espera o estado final.

## Tarefas da prova
- 1.4: validação programática antes do apply e negação por padrão.
- 2.1: tools com descrição revisada e classes explícitas.
- 2.3: cada agente recebe só as tools que precisa (poucas tools por agente, filtradas no `tools/list`).
- 2.4: registro do servidor MCP no gateway com credencial fora do prompt.

## Curso Skilljar relacionado
Introduction to Model Context Protocol (registro de servidores e tools) e Claude Code in Action (gates programáticos e hooks no fluxo de trabalho).

## Em produção, um arquiteto sênior faria
- Conta ou role de deploy por produto, com permission boundary que só aceita o módulo assinado.
- Registro de tools no AWS Agent Registry, quando estável no provider.
- Revisão obrigatória do time de plataforma (CODEOWNERS) no catálogo de classes.
- Testes de política com casos gerados a partir das classes.
