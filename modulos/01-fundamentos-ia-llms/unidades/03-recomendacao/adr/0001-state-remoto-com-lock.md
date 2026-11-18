# ADR-0001: state remoto em S3 com lock nativo

- Status: aceito
- Data: 2026-11-18
- Unidade: 01.03 (recomendação)

## Contexto

O stack rodava com state local. No CI, cada job começa com o diretório limpo, então o workflow de destroy rodava `terraform destroy` contra um state vazio e não removia nada: os recursos ficavam na conta, cobrando. Também não havia proteção contra dois applies simultâneos (um manual e outro do pipeline).

## Decisão

- Backend `s3` com configuração parcial (`backend "s3" {}` em `infra/terraform/versions.tf`) e valores em `backend.hcl` (modelo em `backend.hcl.example`, fora do git).
- Lock com `use_lockfile = true`: o próprio backend S3 grava um `.tflock` com escrita condicional. Exige Terraform >= 1.10, que virou o `required_version` do stack.
- Bucket criado por um stack de bootstrap separado (`infra/bootstrap/`), com state local, aplicado uma vez por conta: versionamento, SSE-S3, bloqueio de acesso público, `BucketOwnerEnforced`, política que nega acesso sem TLS e expiração de versões antigas em 90 dias.
- O bucket de state não tem `force_destroy`: ele sobrevive ao destroy do stack, porque é ele que sabe o que precisa ser removido.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| S3 + tabela DynamoDB para lock | O lock por DynamoDB está deprecado no backend S3 desde o Terraform 1.11. Seria um recurso a mais para criar, pagar e destruir. |
| HCP Terraform / Terraform Cloud | Resolve state e lock, mas tira o state da conta AWS e acrescenta outro fornecedor e outra credencial ao pipeline. |
| State local versionado no git | Vaza segredos que o provider grava no state e não tem lock. |
| Criar o bucket de state dentro do próprio stack | Problema do ovo e da galinha: o destroy apagaria o bucket que guarda o state do destroy. |

## Trade-offs

- O bootstrap é um passo manual (uma vez por conta). Em troca, o stack principal fica destrutível por completo.
- SSE-S3 em vez de KMS no bucket de state: o state deste stack não tem segredos de aplicação (o MemoryDB usa ACL `open-access` com TLS e SG, sem senha) e uma CMK só para isso custaria US$ 1/mês. Se o stack passar a guardar senhas no state, troque para SSE-KMS.

## Custo

Centavos por mês: alguns KB de state, versões antigas expiram em 90 dias. Sem custo fixo.

## Risco

- Perder o bucket de state = perder o mapa do que existe. Mitigação: versionamento e a verificação de sobras por tag no workflow de destroy (ADR-0005), que pega recursos órfãos mesmo sem state.
- `use_lockfile` depende de Terraform >= 1.10 em todo lugar que roda o stack (CI, máquina local, ambiente de nuvem).

## Tarefas da prova CCAR-F exercitadas

Nenhuma diretamente (configuração de cloud está fora do escopo da prova). Habilita a 3.6 (Claude Code em CI): o pipeline só consegue rodar plan e destroy de forma não interativa e repetível com state compartilhado.

## O que um arquiteto sênior faria em produção

Uma conta dedicada para state (ou ao menos um bucket por ambiente), SSE-KMS com chave própria, replicação entre regiões do bucket de state, acesso ao bucket só pelas roles de CI via OIDC e chaves de state separadas por stack para limitar o raio de impacto de um apply errado.
