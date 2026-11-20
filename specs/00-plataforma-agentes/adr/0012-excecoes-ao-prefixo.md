# ADR 0012 · Exceções versionadas ao prefixo da chave (D-029)

- **Status:** aceito. É decisão técnica delegada dentro do plano aprovado (D-033, D-038) e corrige o achado A07 da análise 1.
- **Data:** 2026-11-20
- **Requisitos:** Art. VI (isolamento e prefixo), RF-006, RF-007; D-029; ADR-0006

## Contexto
O ADR-0006 lista só a exceção de regex do motor e das políticas (`p00_`, `pNN_`). Dois outros nomes também fogem do prefixo:
- **O grupo de log entregue do gateway,** `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}`. O RF-006 exige esse nome, e o padrão `/aws/vendedlogs/` é o dos logs entregues pelos serviços. Ele não começa por `00-plataforma-agentes`.
- **O parâmetro do produto,** `/00-plataforma-agentes/contrato/v1/produtos/<chave>`. Ele fica no state do produto, com a tag `project` do produto, mas leva o prefixo da plataforma, porque é a parte do produto no contrato v1 (RF-007).

Sem registro, o teste de prefixo (TT-T02, T020) reprova o grupo de log. O implementador teria de violar a spec ou afrouxar o teste em silêncio.

## Decisão
- **A lista de exceções do teste de prefixo fica num lugar só,** com o motivo de cada uma e o link para este ADR. São quatro:
  1. motor e políticas: `p00_` e `p<NN>_` (regex da API, ADR-0006);
  2. alias da chave: o prefixo é conferido no nome depois de `alias/`;
  3. grupo de log entregue: `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/` seguido do id do gateway (RF-006);
  4. parâmetro do produto: `/00-plataforma-agentes/contrato/v1/produtos/<chave>`, aceito só no módulo `registro-produto` e só com `<chave>` igual à tag `project` do provider (T037).
- **Uma exceção nova** precisa de linha nesta lista e de atualização deste ADR. Sem as duas, o teste reprova.
- **O isolamento do parâmetro do produto não depende do nome:**
  - a tag `project` é a do produto;
  - a role do agente só lê o `comum` e o próprio parâmetro, por ARN (TT-R11, T032);
  - o produto não recebe ARN de outro produto (T032).
- **O teste vermelho:** um recurso sintético com nome fora do prefixo e fora da lista reprova. Um parâmetro `produtos/<outra-chave>` no módulo também reprova.

## Alternativas rejeitadas
- **Afrouxar o teste para "contém a chave":** aceitaria `x-00-plataforma-agentes` e qualquer nome com a chave no meio. O controle por nome da D-029 perderia o valor.
- **Grupo de log com o prefixo da plataforma:** contraria o RF-006 e o padrão dos logs entregues.
- **Parâmetro do produto sob `/<chave do produto>/`:** quebra o contrato v1, que o plano e o schema publicam sob o caminho da plataforma, e exigiria uma emenda do plano.

## Trade-offs
- **Ganho:** a regra continua estrita, e cada exceção tem motivo e teste.
- **Custo:** mais uma lista para manter. Fica no mesmo arquivo do teste, então muda junto com ele no PR.

## Custo
US$ 0.

## Risco
- **A lista crescer sem critério:** cada linha nova exige ADR, e o revisor independente (T081) confere.
- **O destroy da plataforma achar parâmetro de produto:** é o caso de produto ainda no ar. O `dependentes` (T043) recusa antes, e a verificação pelo caminho (T048) reprova depois.

## Tarefas da prova
- 1.4: o gate programático continua estrito, e a exceção é explícita.
- 5.6: cada exceção tem proveniência, com o motivo e a fonte.

## Curso Skilljar relacionado
Claude Code in Action: regras do repositório verificadas por teste no CI.

## Em produção, um arquiteto sênior faria
- Imporia a nomenclatura por SCP ou permission boundary, com condição no prefixo, e não só por teste.
- Manteria um registro central de exceções com dono e prazo de revisão.
