# Versão do harness

**Versão atual: 0.6.2** (pré-estável). O pacote npx só será criado depois da versão estável e testada (D-027), e publicar é decisão do dono.

## Critérios para a 1.0 (estável e testada)
| # | Critério | Como se prova | Situação |
|---|---|---|---|
| 1 | Fluxo SDD completo em uso real | 1 arquitetura e 1 IA aplicada indo de `especificar` a `publicar` | pendente |
| 2 | Gates estáveis | 3 PRs seguidos de projeto sem correção manual no harness | pendente |
| 3 | Troca de agente exercitada | uma tarefa iniciada no Claude Code e terminada no Antigravity ou no Copilot, registrada em `harness/progresso.md` | pendente |
| 4 | Ciclo de demonstração exercitado | apply → aviso → destroy automático → verificação sem sobras, no Floci e numa conta real | pendente |
| 5 | Caminho padrão exercitado | um projeto novo criado por `harness/novo_projeto.py` chegando a `implementar` | em andamento (`00-plataforma-agentes`) |
| 6 | Núcleo separado da pós | lista dos arquivos do núcleo sem nenhuma referência à pós; o resto é configuração do projeto | pendente |
| 7 | Testes | todo comando dos scripts do harness com teste; estado compartilhado testado em repositório temporário | em andamento (76 testes) |
| 8 | Documentação | README do harness com instalação em no máximo 5 passos | pendente |

## Histórico
- **0.6.2:**
  - rtk em todas as sessões por um wrapper que não amplia permissões e headroom só local, com telemetria desligada (D-067, ADR 0004).
- **0.5.1:**
  - padrão de tags (D-031);
  - trava de branch mergeado (D-032);
  - correções da esteira nos workflows (ADR 0002 e 0003);
  - actions com um único SHA em workflows e modelos, com teste.
- **0.5.0:**
  - caminho padrão (`novo_projeto.py`);
  - plataforma de agentes compartilhada como projeto SDD;
  - decisões D-027 a D-030 aplicadas.
- **0.4.0:**
  - 18 especialistas por tarefa fim;
  - 14 skills próprias e as skills de mercado como plugins;
  - D-025 com auditoria no CI.
- **0.3.0:**
  - teto de um dia;
  - limite mensal da conta;
  - destroy obrigatório e automático em até 24 h (D-021, D-022, D-024).
- **0.2.0:**
  - troca de agentes (Claude Code, Antigravity, Copilot);
  - memória para qualquer agente;
  - gates no git e no CI.
- **0.1.0:**
  - constituição e SDD obrigatório;
  - estado em arquivos;
  - ritual `retomar` e uso de tokens.
