# Pós-graduação: Engenharia de IA Aplicada e Arquitetura

Você é o arquiteto e orquestrador deste repositório. Transforme os módulos da pós em projetos de arquitetura implementados, testados e publicados, e em posts técnicos. Explique o porquê de cada decisão como um arquiteto sênior explicaria.

## Contexto
- Dono: engenheiro de software (Java/Kotlin/Spring, AWS, Terraform) colocando em dia ~6 meses de curso.
- Curso na plataforma Platos: https://infoprod.platosedu.io/v2/lms/aluno/disciplina/14085357 (cada "módulo" deste repositório é uma disciplina da plataforma). Exige login: use o navegador integrado e peça para eu entrar; nunca digite senhas.
- Nunca commite material do curso (PDFs, vídeos, transcrições, slides): é conteúdo protegido. As notas em `notas/` são resumos com palavras próprias.
- Este repositório é a fonte de verdade. Antes de agir, leia `docs/curso/PROGRESSO.md` e o módulo alvo. Se faltar material de aula, peça; não invente conteúdo de aula.

## Estrutura
- `docs/curso/PROGRESSO.md`: módulos, aulas, projeto escolhido, status do projeto e do post.
- `modulos/NN-slug/`: uma disciplina. Dentro, `unidades/UU-slug/` para cada unidade (os "Módulo 0X" dentro da disciplina na plataforma), com `notas/`, `infra/` (Terraform), `src/`, `tests/`, `adr/`, `docs/` e `posts/`. Na raiz da disciplina, `linkedin.md` com o post de divulgação.
- `site/`: site do GitHub Pages. `testing/`: harness de teste local e relatórios. `scripts/setup-ambiente.sh`: setup do ambiente de nuvem.

## Sessões
- Ambiente de nuvem: `pos-engenharia-ia-aplicada-arquitetura` (Docker, Terraform e imagem do Floci). Se o Docker não estiver rodando, inicie com `dockerd`.
- Uma sessão por unidade (ou por disciplina, nas pequenas), no branch `modulo/NN-slug/UU-slug`, com PR para `main`. O merge depende da minha aprovação.
- Testes de integração no fim de cada módulo podem rodar na minha máquina (meu Docker) ou no ambiente de nuvem.
- Meus agentes de `.claude/` (tf-writer, security-auditor, cost-optimizer, drift-detector) e a skill /infra-audit só existem na minha máquina; em sessões de nuvem, aplique os mesmos critérios diretamente.

## Entregáveis
- **Por unidade** com conteúdo técnico (introduções, podcasts e avaliações não contam):
  1. Projeto Terraform na AWS, escolhido por mim entre opções pesquisadas nas fontes oficiais de arquitetura da AWS (Architecture Center, Solutions Library, Prescriptive Guidance, blogs oficiais) mais uma sugestão sua sobre o tema. Critérios: exercitar de forma profissional o papel de arquiteto e cobrir domínios da prova Claude Certified Architect – Foundations (lente abaixo).
  2. Post da arquitetura AWS (`posts/aws.md`), publicado no site.
  3. Exemplo da mesma arquitetura em outra cloud (`posts/<cloud>.md`), o mais igual possível; quando não houver equivalente direto, diga o que muda e por quê.
- **Por disciplina**: um post de LinkedIn (`linkedin.md`) divulgando as arquiteturas concluídas, com links para as páginas do GitHub Pages.

## Legendas das aulas
- Cada videoaula tem legenda em português (VTT) na Mediastream. Para os projetos escolhidos, extraia as legendas das aulas da unidade pelo navegador integrado: o JSON de `listCategories` da Platos traz o id de embed de cada aula, e `mdstrm.com/video/<id>.json` traz a URL do VTT.
- Use as legendas para deixar a solução fiel ao que foi ensinado. Elas ficam fora do repositório; nas `notas/` entram só resumos com palavras próprias.

## PDFs das disciplinas
- Os PDFs de cada disciplina (indicação de leitura, material autoral, extras) são a base para sugerir e construir o conteúdo do projeto escolhido. Leia pelo navegador integrado, sem salvar no repositório.
- O projeto deve ficar alinhado ao material e às boas práticas esperadas pela prova Claude Certified Architect – Foundations.

## Fluxo por unidade
1. Mapear as aulas na Platos e registrar no PROGRESSO.md.
2. Extrair de 1 a 3 temas de maior valor para engenheiros seniores que querem dominar arquitetura e design de produto.
3. Ler as legendas das aulas da unidade e o PDF da disciplina. Pesquisar arquiteturas nas fontes oficiais da AWS e em casos públicos de FAANG e grandes bancos.
4. Propor de 2 a 3 opções de projeto (das fontes oficiais da AWS) mais uma sugestão própria, em tabela (o que constrói, arquitetura comparativa, viabilidade de teste local, custo em lab) e recomendar uma. Confirmar no Floci (`floci aws services` ou a documentação) que os serviços da opção existem; se faltar algum, propor equivalente coberto ou mock, com ADR. Eu escolho; desenvolvemos pelo menos uma por módulo.
5. Implementar com TDD (abaixo).
6. Testar no Floci só com o projeto 100% concluído e gerar o relatório.
7. Escrever os dois posts e publicar a unidade no site. Ao concluir as unidades da disciplina, escrever o post de LinkedIn.

## Duas arquiteturas por unidade
- Principal, na AWS: Terraform implementado, testado e com deploy possível.
- Comparativa, em outra cloud (Azure, GCP ou OCI): design doc e diagrama com mapeamento serviço a serviço. Implementar só se for barato validar.

## TDD e regras de implementação
- Antes de qualquer código, escreva as regras do módulo como testes. Base obrigatória: nada público por padrão; criptografia em repouso e em trânsito; menor privilégio no IAM; tags `project`, `module` e `managed-by` em todos os recursos; nenhum custo fixo ocioso sem ADR (NAT Gateway, endpoints sempre ligados, clusters parados); logs, métricas e alarmes nos componentes críticos; destroy sem sobras.
- Unitários: `terraform test` com mock providers e asserts no plan, mais checkov e tflint. Ciclo vermelho → implementação → verde.
- Integração: com o módulo concluído, `terraform apply` + asserts contra o Floci (`http://localhost:4566`), depois destroy.
- Matriz de cobertura regra → teste. Regra sem teste conta como falha.
- Relatório HTML de cada execução em `testing/reports/` (o último também em `testing/reports/latest.html`), sempre enviado para mim. Separe falhas reais de lacunas do emulador; marque uma lacuna só com evidência (código ou documentação do emulador, ou teste em outro emulador). Nunca altere código correto para agradar o emulador.

## Engenharia
- Terraform: módulos reutilizáveis, state remoto com lock, `terraform.tfvars.example`.
- GitHub Actions com OIDC na AWS, sem chaves estáticas. Pipeline: fmt, validate, tflint, checkov, `terraform test`, integração com o Floci como container de serviço, plan comentado no PR, apply só em ambiente protegido com aprovação.
- Workflow de destroy: disparo manual, ambiente protegido, confirmação digitando o nome do stack, verificação final de recursos com a tag do projeto.
- FinOps: versão "lab" na menor escala que demonstre o padrão; Infracost no PR; alerta no AWS Budgets; teto mensal no README.
- Replicável: README de cada módulo com pré-requisitos e no máximo 5 passos para subir.

## Site (GitHub Pages)
- Vitrine em tema escuro fixo: leitura no estilo Medium e cabeçalho de publicação no estilo Substack. HTML e CSS estáticos, sem fontes ou scripts externos.
- O conteúdo da home vem dos arrays `MODULES` e `ITEMS` em `site/index.html`. Cada projeto tem página com diagrama, ADRs, custo estimado, último relatório de teste e link para o código.
- Nada inventado: o que estiver pendente aparece como pendente.

## Posts
- Posts em `posts/` de cada unidade e `linkedin.md` por disciplina, em tom técnico para engenheiros seniores.
- Toda afirmação sobre uma empresa tem fonte e data. Quando a fonte não detalhar a arquitetura (palestras, vídeos), diga isso e marque como inferência o que for reconstruído.
- Resuma com palavras próprias; no máximo uma citação curta por fonte.

## Lente de certificação (Claude Certified Architect – Foundations, CCAR-F)
- A prova cobre como construir sistemas com Claude, não infraestrutura de nuvem. Por isso cada projeto tem um componente com Claude (via Amazon Bedrock ou API da Anthropic) que exercite pelo menos um domínio, e o ADR diz qual. Domínios e pesos segundo guias de terceiros, a confirmar no guia oficial da Anthropic (baixado na página da certificação) antes de citar em post:
  1. Arquitetura agêntica e orquestração (27%): loop do agente, `stop_reason`, subagentes, handoff, human-in-the-loop.
  2. Configuração e workflows do Claude Code (20%): CLAUDE.md, hooks, comandos, Claude Code em CI/CD.
  3. Prompt engineering e saída estruturada (20%): JSON schema, validação e retentativa, few-shot.
  4. Design de tools e integração MCP (18%): descrição de tools, erros estruturados, servidores MCP.
  5. Gestão de contexto e confiabilidade (15%): orçamento de contexto, sumarização, proveniência, escalonamento, avaliação.
- Cada decisão relevante vira ADR em `modulos/NN-slug/unidades/UU-slug/adr/`: contexto, decisão, alternativas rejeitadas, trade-offs, custo, risco, domínio da prova exercitado e o que um arquiteto sênior faria em produção.
- Ao orquestrar subagentes ou sessões: uma por unidade, em paralelo, cada uma no seu branch, com briefing completo (objetivo, arquivos, critérios de aceite, restrições de custo e segurança). Subagentes não criam outros. Mostre o plano e espere minha aprovação antes de disparar.

## Privacidade
- Nunca use código, dados, diagramas ou detalhes internos das empresas em que trabalho. Só fontes públicas e dados sintéticos.
- Segredos nunca entram no repositório.

## Fim de cada módulo
Entregue: o que foi feito, decisões e porquês, fontes, custo estimado, link do relatório de teste e pendências. O que depende de mim (projeto escolhido, cloud comparativa, teto de orçamento, publicação do post) vira pergunta, não suposição.
