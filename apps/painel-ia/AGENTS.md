# AGENTS.md · Painel de IA (`apps/painel-ia`)

Manual deste componente. Vale para qualquer agente. As regras do repositório estão no `AGENTS.md` da raiz e se aplicam aqui também.

## O que é
Painel local do consumo de tokens das sessões do Claude Code. Lê os transcripts, guarda o histórico em SQLite e mostra abas: visão geral, sessão, atribuição, subagentes, economia, comparativo A x B e modelos (custo, latência, vazão).

## Como rodar e testar
- Testes: `npm test` (executa `node --test "test/**/*.test.js"`). Só Node 22.13 ou mais novo; sem dependências npm.
- Iniciar: `npm start` ou `node bin/pos-painel-ia.js`, porta 4317.
- Coleta do GitHub para o comparativo: `node bin/coderabbit-ab.js`, manual, grava fora do repositório.

## Regras deste componente
- **Nunca commitar** o banco (`~/.pos-painel-ia/painel.db`), os transcripts nem arquivos gerados fora do repositório.
- **Página sem recurso externo.** A CSP é `default-src 'none'`. Não adicione script, fonte ou imagem de terceiros.
- **Texto de terceiros entra com `textContent`,** nunca com `innerHTML`.
- **Preços em `src/precos.json`** têm `status: "conferir"` até o dono confirmar na página oficial. Não remova esse rótulo sem essa confirmação.
- **Mudança de esquema** de banco é só por acréscimo, com versão em `meta` e migração testada num banco antigo.
- Métricas novas: documente no `README.md` com a limitação, como já é feito para latência e vazão.
- Medir, não estimar: dado ausente vira `nao-medido` com o motivo.

## Onde olhar
- `src/consumo.js`: regras de economia e atribuição.
- `src/persistencia.js`: esquema e migrações.
- `src/comparativo.js`: grupos A e B, corte em `CORTE_AB`, `AMOSTRA_MINIMA`.
- `src/modelos.js` e `src/precos.json`: custo, faixa do Haiku, percentis.
- `test/`: um arquivo por assunto.

## Fora de escopo
Dados de cliente, segredos e chaves. Estimativas de tokens de ferramentas que não expõem o consumo (CodeRabbit, por exemplo).
