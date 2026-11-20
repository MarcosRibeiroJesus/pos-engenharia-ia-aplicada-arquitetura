<!-- GERADO por harness/sincronizar_agentes.py a partir de harness/especialistas.json: não edite à mão -->

# Agentes especialistas e skills

Cada tarefa fim tem um especialista com o modelo do nível da tarefa, só as skills dela e sem poder criar subagentes. Fonte: `harness/especialistas.json`. Para saber quem faz uma tarefa: `python3 harness/agente.py proximo --tarefa <tipo>`.

| Especialista | Tarefas | Modelo | Skills do repositório | Skills de mercado |
|---|---|---|---|---|
| `especificador` | especificacao | opus | `regras-do-especialista`, `sdd-especificar`, `pesquisa-fontes`, `novo-projeto` | — |
| `arquiteto-aws` | arquitetura | opus | `regras-do-especialista`, `sdd-planejar`, `sdd-tarefas`, `plataforma-agentes`, `custo-diario`, `ciclo-demonstracao`, `modelo-de-ameacas`, `pesquisa-fontes` | `aws-core@claude-plugins-official` |
| `analista-sdd` | analise-sdd | opus | `regras-do-especialista`, `sdd-analisar` | `spec-to-code-compliance@trailofbits` |
| `engenheiro-terraform` | codigo, infra | opus | `regras-do-especialista`, `terraform-tdd`, `sdd-implementar`, `ciclo-demonstracao`, `custo-diario`, `evolucao-do-harness` | `terraform@hashicorp` (ligado) |
| `engenheiro-claude` | componente-claude | opus | `regras-do-especialista`, `componente-claude`, `sdd-implementar`, `avaliacao-llm`, `plataforma-agentes` | `claude-api@anthropic-agent-skills` |
| `engenheiro-mcp` | mcp | opus | `regras-do-especialista`, `servidor-mcp`, `sdd-implementar`, `componente-claude`, `plataforma-agentes` | `mcp-server-dev@claude-plugins-official` (ligado), `example-skills@anthropic-agent-skills` |
| `engenheiro-ml` | ml | opus | `regras-do-especialista`, `sdd-implementar`, `terraform-tdd`, `custo-diario` | `aws-core@claude-plugins-official` |
| `engenheiro-visao-web` | visao-web | opus | `regras-do-especialista`, `sdd-implementar` | `playwright@claude-plugins-official`, `example-skills@anthropic-agent-skills` |
| `avaliador-llm` | avaliacao | opus | `regras-do-especialista`, `avaliacao-llm`, `modelo-de-ameacas` | `promptfoo@promptfoo` (ligado) |
| `engenheiro-seguranca` | seguranca | opus | `regras-do-especialista`, `modelo-de-ameacas`, `terraform-tdd` | `security-guidance@claude-plugins-official` (ligado), `claude-security@claude-plugins-official`, `insecure-defaults@trailofbits`, `static-analysis@trailofbits`, `agentic-actions-auditor@trailofbits`, `supply-chain-risk-auditor@trailofbits` |
| `testador-integracao` | teste | sonnet | `regras-do-especialista`, `integracao-floci` | — |
| `finops-demonstracao` | finops | sonnet | `regras-do-especialista`, `custo-diario`, `ciclo-demonstracao` | — |
| `arquiteto-cloud-comparativa` | cloud-comparativa | sonnet | `regras-do-especialista`, `cloud-comparativa`, `pesquisa-fontes` | `azure@claude-plugins-official`, `google-cloud-developer@google-plugins` |
| `pesquisador` | pesquisa | sonnet | `regras-do-especialista`, `pesquisa-fontes` | — |
| `redator-tecnico` | post | sonnet | `regras-do-especialista`, `post-tecnico`, `pesquisa-fontes` | — |
| `desenvolvedor-site` | site | sonnet | `regras-do-especialista`, `site-projeto` | `frontend-design@claude-plugins-official`, `playwright@claude-plugins-official` |
| `revisor-independente` | revisao | opus | `regras-do-especialista`, `sdd-analisar`, `modelo-de-ameacas` | `pr-review-toolkit@claude-plugins-official` (ligado), `code-review@claude-plugins-official`, `second-opinion@trailofbits` |
| `operador-harness` | mecanica | haiku | `regras-do-especialista`, `evolucao-do-harness`, `novo-projeto` | `claude-md-management@claude-plugins-official` |

## Skills de mercado

Entram como plugins dos marketplaces dos próprios publicadores, declarados em `.claude/settings.json`; não são copiados para o repositório. Assim seguem as licenças e as atualizações de cada publicador.

| Marketplace | Publicador | Fonte |
|---|---|---|
| `claude-plugins-official` | Anthropic (terceiros fixados por SHA) | https://github.com/anthropics/claude-plugins-official |
| `anthropic-agent-skills` | Anthropic | https://github.com/anthropics/skills |
| `hashicorp` | HashiCorp | https://github.com/hashicorp/agent-skills |
| `trailofbits` | Trail of Bits | https://github.com/trailofbits/skills |
| `promptfoo` | Promptfoo | https://www.promptfoo.dev/docs/integrations/agent-skill/ |
| `google-plugins` | Google | https://github.com/google/skills |

**Ligados no projeto** (carregados em toda sessão do Claude Code): `mcp-server-dev@claude-plugins-official`, `pr-review-toolkit@claude-plugins-official`, `promptfoo@promptfoo`, `security-guidance@claude-plugins-official`, `terraform@hashicorp`.

**Os demais:** instale sob demanda quando a tarefa pedir, para não encher o contexto de toda sessão.
- Claude Code: `/plugin install <plugin>@<marketplace>`.
- Copilot CLI e Antigravity: instale pelo comando do próprio publicador, conforme a fonte de cada marketplace.

## Não recomendados aqui

- `superpowers@claude-plugins-official`: Bom conjunto (TDD, depuração sistemática), mas injeta o próprio fluxo (brainstorm, plano, execução) no início de cada sessão e compete com o SDD do harness. As práticas que interessam já estão nas skills sdd-implementar e terraform-tdd.
- `feature-dev@claude-plugins-official`: Fluxo de funcionalidade próprio que duplica as fases do SDD.
- `document-skills@anthropic-agent-skills`: Fora da tarefa fim destes projetos e com licença restrita.
