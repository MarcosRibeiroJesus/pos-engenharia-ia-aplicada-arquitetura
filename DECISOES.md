# Memória compartilhada: estado atual

Lido por toda sessão no início e sempre que muda. Ele prevalece sobre briefings e branches. O porquê de cada item está em `HISTORICO.md` (ids D-xxx). Só a conversa de orquestração escreve aqui.

## Projetos

| Disciplina | Arquitetura AWS | IA aplicada | Cloud comparativa | Teto do lab |
|---|---|---|---|---|
| D01 Fundamentos | Recomendação de e-commerce (PR #1) | Doom: detecção YOLO em TF.js num Web Worker, Doom em WASM (fiel à aula; não é aprendizado por reforço) | GCP | pendente |
| D02 APIs de IA generativa | Assistente de agendamento completo | pendente | GCP | pendente |
| D03 MCP | MCP de regras do CDB com liquidez diária; MCP 2026-07-28 com lane de compatibilidade | pendente | Azure | US$ 10/mês |
| D04 Agentes autônomos | adiada | adiada | — | — |

## Regras ativas
- **SDD obrigatório** (D-016, D-017). Todo código nasce de spec → plano → tarefas → análise aprovada, em `specs/<chave>/`; o gate nega código antes da fase implementar. Projetos em andamento fazem primeiro a spec retroativa. Comece toda sessão pela skill `retomar`.
- **Nunca assumir escolhas do Marcos.** Silêncio ou pergunta pulada não são resposta (D-004). Exceção: decisões técnicas e de processo delegadas, que seguem as boas práticas da prova, na ordem recomendada, sempre com o porquê e os ids das tarefas (D-014).
- **Um projeto de IA aplicada e uma arquitetura AWS por disciplina** (D-009).
- **Testes do componente Claude só com respostas gravadas**, sem chamadas ao Claude real (D-006).
- **Floci por tag de versão:** `floci/floci:2.5.0` recomendada. Use `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}` nos workflows e `${FLOCI_IMAGE:-floci/floci:latest}` nos scripts, nunca `latest` escrito direto (D-013).
- **Variável ou secret novo criado pelo Marcos:** troque em todo lugar que depende dele, com fallback seguro (D-012).
- **Push e PR:** só depois de receber a memória mais recente, porque o gate nega antes disso. Perguntas ao Marcos vão no PR, na seção `## Perguntas ao dono` (D-015).
- **Retomada:** se a sessão ficou parada mais de 8 horas, ou se a memória mudou com decisão que afeta o projeto, prefira uma sessão nova com resumo estruturado (D-015).
- **Modelos:** Opus para arquitetura, código e segurança; Sonnet para pesquisa, posts e site; Haiku para tarefas mecânicas (D-002).
- **Privacidade:** nada do curso nem dados do aluno; nada das empresas em que o Marcos trabalha (D-001).

## Pendências (aguardando o Marcos; não trate como decidido)
- D02: avaliações e observabilidade (gate no CI, Langfuse só local ou Langfuse na AWS), mais a 2ª pergunta aberta na sessão D02.
- Teto do lab da D01 e da D02.
- Projetos de IA aplicada da D02 e da D03.
- Revisores de IA na esteira (custo de tokens) e conta AWS com OIDC para o `terraform plan` nos PRs.
- Configurações do GitHub ainda abertas: ruleset do `main`. Já feitas pelo Marcos: variável `FLOCI_IMAGE`, secret `INFRACOST_API_KEY`, Dependency graph e proteção do branch `memoria-compartilhada`. Use `vars.FLOCI_IMAGE` e não escreva `floci/floci:latest` nos workflows (D-012, D-013).
- Merges dos PRs #9, #10, #11, #12 e #16 (harness com SDD).
