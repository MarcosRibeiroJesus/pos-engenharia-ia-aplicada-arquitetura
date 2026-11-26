# Matriz de Rastreabilidade: `harness-ui`

| Requisito | Tarefas | Testes |
|---|---|---|
| RF-001 (Perfis dedicados: claude, agy, copilot, shell) | T002, T006 | `apps/harness-ui/test/perfis.test.js` |
| RF-002 (Gerenciamento de abas estilo browser) | T003, T005, T006 | `apps/harness-ui/test/gerenciador.test.js`, `apps/harness-ui/test/servidor.test.js` |
| RF-003 (Streaming WebSocket + resize) | T003, T005, T006 | `apps/harness-ui/test/gerenciador.test.js`, `apps/harness-ui/test/servidor.test.js` |
| RF-004 (Reconexão com scrollback 256 KB) | T003, T005, T006 | `apps/harness-ui/test/gerenciador.test.js`, `apps/harness-ui/test/servidor.test.js` |
| RF-005 (Integração somente leitura com o harness) | T004, T006 | `apps/harness-ui/test/harness.test.js` |
| RF-006 (Detecção de CLIs disponíveis) | T002, T006 | `apps/harness-ui/test/perfis.test.js` |
| RNF-001 (Segurança local: Host, Origin, token efêmero, CSP) | T002, T005 | `apps/harness-ui/test/servidor.test.js` |
| RNF-002 (Custo zero / local) | T001 | Verificação arquitetural (sem infra de nuvem) |
| RNF-003 (Testabilidade via `ptyFactory`) | T001, T003, T007 | `apps/harness-ui/test/gerenciador.test.js`, `apps/harness-ui/test/servidor.test.js` |
| RNF-004 (Privacidade / sem segredos em disco) | T005 | `apps/harness-ui/test/servidor.test.js` |
