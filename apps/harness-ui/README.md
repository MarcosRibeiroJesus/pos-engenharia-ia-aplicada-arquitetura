# Harness UI (`apps/harness-ui`)

Interface web local em estilo navegador que executa cada code agent do harness (`Claude Code`, `Antigravity`, `GitHub Copilot` e `Shell`) em um **terminal PTY dedicado** por aba, mantendo cada sessão rodando separadamente em segundo plano.

## Recursos
- **Abas independentes estilo browser:** barra superior com indicador colorido por agente, badge de atividade não lida, renomeação com duplo clique e fechamento individual.
- **Terminais reais (PTY/ConPTY):** suporta TUIs interativas (`claude`, `agy`, `copilot`, PowerShell/Bash), cores ANSI, atalhos e redimensionamento automático (`xterm.js` + `FitAddon`).
- **Persistência ao recarregar a página:** os processos continuam vivos no servidor local e o histórico recente (buffer de 256 KB por aba) é reenviado automaticamente ao reconectar.
- **Integração com o harness:** lê `harness/estado.json`, `harness/agentes.json` e `harness/especialistas.json` para associar projetos/tarefas e gerar o prompt de passagem com um clique, além do link direto para o Painel de IA (`http://localhost:4317`).

## Como rodar

```bash
cd apps/harness-ui
npm install
npm start
# abra http://127.0.0.1:4318
```

Opções CLI:
```bash
node bin/pos-harness-ui.js --porta 4318 --host 127.0.0.1 --painel-ia http://localhost:4317
```

## Testes

```bash
cd apps/harness-ui
npm test
```

## Segurança
- Escuta somente em `127.0.0.1` por padrão.
- Valida `Host` (anti-DNS rebinding) e `Origin` (anti-CSWSH) em HTTP e WebSocket.
- Exige token efêmero de sessão gerado em memória a cada boot para rotas de mutação (`POST`, `PATCH`, `DELETE`) e WebSocket.
- Serve `xterm.js` localmente (sem CDN externa) sob CSP restrita (`default-src 'self'`).
- Só executa perfis presentes na allowlist (`claude-code`, `antigravity`, `copilot`, `shell`).
