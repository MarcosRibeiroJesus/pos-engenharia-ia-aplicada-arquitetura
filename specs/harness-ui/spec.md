# Spec: Interface de Terminais do Harness (`harness-ui`)

- **Projeto:** `harness-ui` · **Disciplina:** `00` (Harness) · **Tipo:** ferramenta local do harness
- **Status:** aprovada (decisões do dono registradas em 2026-11-25)
- **Artigos da constituição que se aplicam:** I (SDD), II (testes primeiro), IV (segurança por padrão), VI (operação local previsível), VII (privacidade)

## Problema e objetivo
Hoje, para alternar entre os code agents do harness (`claude`, `agy`, `copilot`) ou acompanhar tarefas paralelas em projetos diferentes, o dono precisa abrir janelas de terminal avulsas, lembrar qual projeto/branch cada janela está operando e copiar prompts de passagem manualmente.

O objetivo da `harness-ui` (`apps/harness-ui/`) é oferecer uma interface web local, em estilo navegador com abas, que:
1. Abre cada code agent sempre em um **terminal dedicado** (PTY real), mantendo múltiplos agentes em execução simultânea e isolada em abas separadas.
2. Mantém os processos vivos no servidor local mesmo ao recarregar a página ou alternar abas, preservando o histórico recente (scrollback) de cada terminal.
3. Integra-se ao estado do harness (`harness/estado.json`, `harness/agentes.json`, `harness/especialistas.json`) para lançar abas já no diretório do repositório/projeto e, opcionalmente, com o prompt de passagem pronto.
4. Permanece desacoplada do `apps/painel-ia/` (que segue somente leitura e sem dependências npm), facilitando a futura extração do núcleo do harness (D-027).

## Histórias de usuário
- **H1.** Como dono do repositório, quero abrir um code agent (`Claude Code`, `Antigravity`, `GitHub Copilot` ou `Shell livre`) em uma nova aba de terminal dedicado com um clique, para operar agentes em paralelo sem misturar sessões.
  - **Critério de aceite:** dado o servidor `harness-ui` ativo em `http://127.0.0.1:4318`, quando o usuário clica em nova aba escolhendo um perfil permitido, então o servidor cria uma sessão PTY dedicada, a aba aparece na barra superior com indicador de status `em execução` e o terminal aceita entrada interativa (teclado, Ctrl+C, redimensionamento).
- **H2.** Como dono do repositório, quero alternar entre abas de terminais em execução e até recarregar o navegador sem derrubar nenhum code agent, para continuar acompanhando tarefas longas sem perder contexto visual.
  - **Critério de aceite:** dado que há 2 abas abertas com processos ativos, quando o usuário alterna entre elas ou recarrega a página (`F5`), então ambos os processos continuam vivos no servidor, as abas são restauradas e o buffer recente (até 256 KB por aba) é reexibido no terminal.
- **H3.** Como dono do repositório, quero encerrar uma aba individualmente ou reiniciar um terminal encerrado, para gerenciar o ciclo de vida de cada agente sem afetar as demais abas.
  - **Critério de aceite:** quando o usuário fecha uma aba (`×`), o processo PTY daquela aba recebe encerramento limpo e as demais abas continuam em execução inalteradas.
- **H4.** Como dono do repositório, quero visualizar na interface o estado resumido do harness (projetos de `harness/estado.json`, branch atual e link para o Painel de IA) e escolher projeto/tarefa ao abrir um agente, para reduzir trabalho manual na troca de agente.
  - **Critério de aceite:** a barra lateral/modal de lançamento lista os projetos de `harness/estado.json` e os perfis de agente (`claude-code`, `antigravity`, `copilot`, `shell`), exibindo se o binário está disponível no PATH local.

## Requisitos funcionais
- **RF-001 (Perfis de terminais dedicados):** o sistema DEVE suportar a criação de abas PTY dedicadas para os perfis `claude-code` (`claude`), `antigravity` (`agy`), `copilot` (`copilot`, com fallback para `gh copilot`) e `shell` (`powershell.exe` no Windows; `$SHELL` ou `bash` em POSIX).
- **RF-002 (Gerenciamento de abas estilo browser):** o sistema DEVE manter múltiplas sessões simultâneas identificadas por `id`, com título editável/descritivo (agente + projeto), status (`running` / `exited`), código de saída, contador de atividade não lida em abas em segundo plano, troca de aba, fechamento individual e criação de nova aba (`+`).
- **RF-003 (Streaming bidirecional em tempo real e resize):** o sistema DEVE transmitir entrada/saída do terminal via WebSocket com suporte a redimensionamento (`cols`, `rows`) sincronizado com o PTY.
- **RF-004 (Reconexão com scrollback):** o sistema DEVE manter em memória um buffer circular (padrão 256 KB por aba) e reenviar o conteúdo acumulado quando o navegador se reconectar ou alternar de aba, sem matar o processo em execução.
- **RF-005 (Integração somente leitura com o harness):** o sistema DEVE ler `harness/estado.json`, `harness/agentes.json` e `harness/especialistas.json` para expor projetos, fases SDD, tarefas e recomendação de agente, além de link rápido para o Painel de IA (`http://localhost:4317`).
- **RF-006 (Detecção de CLIs disponíveis):** o sistema DEVE informar na API quais perfis têm executável encontrado no ambiente local, exibindo aviso claro se algum CLI não estiver instalado sem derrubar o servidor.

## Requisitos não funcionais
- **RNF-001 (Segurança local e anti-CSWSH, Art. IV):** o servidor DEVE escutar apenas em `127.0.0.1` por padrão (porta `4318`), validar cabeçalhos `Host` e `Origin` em HTTP e WebSocket (bloqueando DNS rebinding e Cross-Site WebSocket Hijacking), exigir token efêmero de sessão gerado a cada inicialização para rotas de mutação (`POST`/`DELETE`) e conexão WebSocket, e servir ativos estáticos apenas a partir de uma lista fixa (sem path traversal e sem CDN externa).
- **RNF-002 (Custo zero de nuvem, Art. V):** aplicação 100% local, sem recursos de nuvem nem custos adicionais.
- **RNF-003 (Testabilidade e isolamento, Art. II):** o gerenciador de sessões PTY DEVE aceitar uma fábrica injetável (`ptyFactory`), permitindo testar criação, I/O, resize, scrollback, encerramento e segurança sem depender de processos reais externos nos testes unitários.
- **RNF-004 (Privacidade, Art. VII):** nenhum segredo, token de usuário ou link de sessão de chat pode ser gravado em disco ou exposto em logs/repositório. O token efêmero de sessão vive somente em memória.

## Fora de escopo
- Acesso remoto pela rede / autenticação multiusuário (uso estritamente `localhost`).
- Edição de arquivos do repositório ou execução automática de `apply`/`destroy` na AWS.
- Substituição do `apps/painel-ia/` (que continua independente para métricas e telemetria).

## Decisões do dono que esta spec usa
- **D-027:** evolução do harness preparada para extração futura em pacote próprio.
- **D-028:** suporte aos 3 code agents (`claude-code`, `antigravity`, `copilot`) por equivalência de nível.
- **Decisões no chat (2026-11-25):**
  1. App separado em `apps/harness-ui/`.
  2. Interface Web local estilo browser com terminais PTY reais em abas (Node.js + WebSocket + xterm.js + ConPTY/PTY).
  3. Perfis iniciais: Claude Code (`claude`), Antigravity (`agy`), GitHub Copilot (`copilot` / `gh copilot`) e Shell livre.
  4. Fluxo SDD em branch dedicado `harness/interface-terminais` a partir de `main`.

## Perguntas ao dono
Nenhuma pendência bloqueante em aberto (todas as decisões de escopo foram respondidas em 2026-11-25).
