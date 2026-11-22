# ADR 0003 · ZAP: conteúdo não armazenável é intencional

- Status: aceito
- Data: 2026-11-19

## Contexto
O baseline do ZAP falha com qualquer aviso. No painel de IA, ele acusou a regra 10049 (*Non-Storable Content*) em `/api/relatorio.csv` e na página 404. O motivo é o cabeçalho `Cache-Control: no-store`, que o painel manda em toda resposta.

## Decisão
O `no-store` fica. A regra 10049 vai para `IGNORE` em `.zap/rules.tsv`, que o workflow `seguranca.yml` passa ao ZAP.
- **Por quê:** o painel mostra uso de tokens e tarefas de sessões. Esses dados não devem ficar em cache de navegador nem de proxy. A regra 10049 só informa que o conteúdo não pode ser armazenado, e aqui isso é o comportamento desejado.

## Alternativas rejeitadas
- **Liberar cache (`private, max-age`):** reduz a proteção para silenciar um aviso.
- **Desligar `fail_action` no ZAP:** esconderia avisos novos e relevantes.

## Tarefas da prova
5.6 (decisão com justificativa rastreável) e 1.4 (o gate continua bloqueando avisos novos).

## O que um arquiteto faria em produção
Manter um arquivo de regras do ZAP por aplicação, com dono e data de revisão para cada exceção. Assets estáticos versionados podem ter cache longo; respostas com dados ficam com `no-store`.
