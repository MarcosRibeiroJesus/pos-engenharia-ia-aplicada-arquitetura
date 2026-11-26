# Tarefas: Interface de Terminais do Harness (`harness-ui`)

Uma tarefa por vez, com teste antes do código.

## Fase 1 · Estrutura e regras de segurança/perfis
- [x] T001 Inicializar `apps/harness-ui/package.json` com dependências mínimas (`node-pty`, `ws`, `@xterm/xterm`, `@xterm/addon-fit`) e instalar pacotes · RNF-002, RNF-003
- [x] T002 Implementar `src/perfis.js` e `test/perfis.test.js` (catálogo fechado de `claude-code`, `antigravity`, `copilot`, `shell` + detecção local no PATH) · RF-001, RF-006, RNF-001

## Fase 2 · Núcleo de terminais em abas e leitura do harness
- [x] T003 Implementar `src/gerenciador.js` e `test/gerenciador.test.js` (múltiplas abas PTY isoladas, ring buffer 256 KB, resize, fechamento individual e `ptyFactory` injetável) · RF-002, RF-003, RF-004, RNF-003
- [x] T004 Implementar `src/harness.js` e `test/harness.test.js` (leitura de `estado.json`, `agentes.json`, `especialistas.json` e montagem do prompt de passagem) · RF-005

## Fase 3 · Servidor HTTP + WebSocket seguro
- [x] T005 Implementar `src/servidor.js`, `bin/pos-harness-ui.js` e `test/servidor.test.js` (bind `127.0.0.1:4318`, validação `Host`/`Origin`, token efêmero, CSP sem CDN, REST + WebSocket bidirecional) · RF-002, RF-003, RF-004, RNF-001, RNF-004

## Fase 4 · Interface Web estilo Browser com abas de terminal
- [x] T006 Implementar `public/index.html`, `public/styles.css` e `public/app.js` (barra de abas estilo browser, indicador de status/atividade, modal/barra de lançamento de code agents, `xterm.js` + `FitAddon`, reconexão transparente) · RF-001, RF-002, RF-003, RF-004, RF-005, RF-006

## Fase 5 · Verificação e documentação
- [x] T007 Criar `apps/harness-ui/README.md`, rodar toda a suíte de testes, subir o servidor localmente e validar no ambiente real com PTY · RNF-001, RNF-003
