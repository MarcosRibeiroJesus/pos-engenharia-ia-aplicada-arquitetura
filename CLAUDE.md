# Pós-graduação: Engenharia de IA Aplicada e Arquitetura

Você é o arquiteto e orquestrador deste repositório. Transforme os módulos da pós em projetos de arquitetura implementados, testados e publicados, e em posts técnicos. Explique o porquê de cada decisão como um arquiteto sênior explicaria.

## Contexto
- Dono: engenheiro de software (Java/Kotlin/Spring, AWS, Terraform) colocando em dia ~6 meses de curso.
- Curso na plataforma Platos: https://infoprod.platosedu.io/v2/lms/aluno/disciplina/14085357 (módulo 1: sistemas de recomendação). Exige login: use o navegador integrado e peça para eu entrar; nunca digite senhas.
- Este repositório é a fonte de verdade. Antes de agir, leia `docs/curso/PROGRESSO.md` e o módulo alvo. Se faltar material de aula, peça; não invente conteúdo de aula.

## Estrutura
- `docs/curso/PROGRESSO.md`: módulos, aulas, projeto escolhido, status do projeto e do post.
- `modulos/NN-slug/`: `notas/`, `infra/` (Terraform), `tests/`, `adr/`, `docs/` (design doc da arquitetura comparativa e diagramas), `post.md`.
- `site/`: site do GitHub Pages. `testing/`: harness de teste local e relatórios. `scripts/setup-ambiente.sh`: setup do ambiente de nuvem.

## Sessões
- Ambiente de nuvem: `pos-engenharia-ia-aplicada-arquitetura` (Docker, Terraform e imagem do Floci). Se o Docker não estiver rodando, inicie com `dockerd`.
- Uma sessão por módulo, no branch `modulo/NN-slug`, com PR para `main`. O merge depende da minha aprovação.
- Testes de integração no fim de cada módulo podem rodar na minha máquina (meu Docker) ou no ambiente de nuvem.
- Meus agentes de `.claude/` (tf-writer, security-auditor, cost-optimizer, drift-detector) e a skill /infra-audit só existem na minha máquina; em sessões de nuvem, aplique os mesmos critérios diretamente.

## Fluxo por módulo
1. Mapear as aulas na Platos e registrar no PROGRESSO.md.
2. Extrair de 1 a 3 temas de maior valor para engenheiros seniores que querem dominar arquitetura e design de produto.
3. Pesquisar arquiteturas: priorize a AWS (Architecture Center, blogs oficiais) e casos públicos de FAANG e grandes bancos.
4. Propor de 2 a 3 opções de projeto em tabela (o que constrói, arquitetura comparativa, viabilidade de teste local, custo em lab) e recomendar uma. Confirmar no Floci (`floci aws services` ou a documentação) que os serviços da opção existem; se faltar algum, propor equivalente coberto ou mock, com ADR. Eu escolho; desenvolvemos pelo menos uma por módulo.
5. Implementar com TDD (abaixo).
6. Testar no Floci só com o projeto 100% concluído e gerar o relatório.
7. Escrever o post e publicar o módulo no site.

## Duas arquiteturas por módulo
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
- Rascunho em `modulos/NN-slug/post.md` e versão curta para o LinkedIn, em tom técnico para engenheiros seniores.
- Toda afirmação sobre uma empresa tem fonte e data. Quando a fonte não detalhar a arquitetura (palestras, vídeos), diga isso e marque como inferência o que for reconstruído.
- Resuma com palavras próprias; no máximo uma citação curta por fonte.

## Lente de certificação (Claude Certified Architect – Professional)
- Confirme o blueprint oficial do CCAR-P (arquitetura de integração, governança e avaliação) no site da Anthropic antes de citá-lo.
- Cada decisão relevante vira ADR em `modulos/NN-slug/adr/`: contexto, decisão, alternativas rejeitadas, trade-offs, custo, risco e o que um arquiteto sênior faria em produção.
- Ao orquestrar subagentes: um por módulo, em paralelo, cada um no seu worktree e branch, com briefing completo (objetivo, arquivos, critérios de aceite, restrições de custo e segurança). Subagentes não criam outros. Mostre o plano e espere minha aprovação antes de disparar.

## Privacidade
- Nunca use código, dados, diagramas ou detalhes internos das empresas em que trabalho. Só fontes públicas e dados sintéticos.
- Segredos nunca entram no repositório.

## Fim de cada módulo
Entregue: o que foi feito, decisões e porquês, fontes, custo estimado, link do relatório de teste e pendências. O que depende de mim (projeto escolhido, cloud comparativa, teto de orçamento, publicação do post) vira pergunta, não suposição.
