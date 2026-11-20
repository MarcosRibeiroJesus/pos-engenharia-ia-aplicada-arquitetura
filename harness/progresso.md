# Progresso das sessões

Uma entrada por sessão, a mais nova no fim. Registre o que foi feito, o que foi testado, o que ficou pendente e a próxima tarefa. A próxima sessão começa lendo isto (`harness/init.sh` mostra as últimas linhas).

Formato: `- AAAA-MM-DD · projeto · sessão · feito · testes · próxima`

- 2026-11-19 · plataforma · orquestração · harness fase 1: constituição, templates SDD, estado.json, init.sh, gates SDD e registro de uso automático · 23 testes de hooks e estado verdes · projetos D01, D02 e D03 fazem a spec retroativa antes de seguir
- 2026-11-19 · plataforma/harness · claude-code (Claude Opus 5.5) · troca de agentes, AGENTS.md, memória para qualquer agente, gates no git e no CI · 19 testes do harness + 21 dos hooks verdes · próxima: merge do #16 pelo dono
- 2026-11-19 · plataforma/harness · claude-code (Claude Opus 5.5) · teto de um dia, destroy obrigatório e prazo de vida com destroy automático (D-021, D-022) · 38 testes do harness + 21 dos hooks verdes · próxima: gate diário no PR #9 e Budget mensal da conta
- 2026-11-19 · plataforma/agentes-especializados · claude-code (Claude Opus 5.5) · 18 especialistas, 14 skills novas, plugins de mercado declarados, regra D-025 e auditoria · 49 testes do harness + 21 dos hooks verdes · próxima: merge do #16 e deste PR pelo dono
- 2026-11-19 · 00-plataforma-agentes · claude-code (Claude Opus 5.5) · caminho padrão (novo_projeto.py), D-027 a D-030 aplicadas, spec da plataforma em rascunho · 53 testes do harness + 21 dos hooks verdes · próxima: plano pelo arquiteto-aws (aguarda P00-P1)
- 2026-11-19 · plataforma/harness · claude-code (Claude Opus 5.5) · padrão de tags da política do Infracost (D-031): constituição, CLAUDE.md, terraform-tdd, modelo tags.tftest.hcl; infra/conta ajustado no #9 · 54 testes do harness verdes · próxima: merge do #17
- 2026-11-19 · plataforma/harness · claude-code (Claude Opus 5.5) · D-031 levado ao main (commits que ficaram fora do #17 e do #9) e trava D-032 no pre-push · 57 testes do harness verdes · próxima: merge deste PR e do #12
- 2026-11-19 · plataforma/harness · claude-code (Claude Opus 5.5) · modelos alinhados às actions do Dependabot e teste de um SHA por action · 59 testes do harness verdes · próxima: P00-P1 (delegação aos especialistas)
- 2026-11-19 · 00-plataforma-agentes · claude-code (Claude Opus 5.5, especificador) · spec esclarecida: RF-001 a RF-012 e RNF-001 a RNF-008 com aceite verificável, 14 esclarecimentos, proveniência com fontes oficiais; P00-P2 respondida; perguntas novas P00-P3 a P00-P5 (não bloqueiam o plano); fase planejar · estado.py validar ok + 61 testes do harness verdes · próxima: plano pelo arquiteto-aws (disparo aprovado pelo dono em 2026-11-19 23:09 BRT)
