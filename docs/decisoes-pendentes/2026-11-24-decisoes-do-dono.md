# Decisões do dono pendentes de gravação na memória compartilhada

Data: 2026-11-24. Origem: conversa de sessão local, id 37e6f036-2455-44bc-983b-4d2b5c3fd399.
Este arquivo é um rascunho de textos. A gravação oficial é da conversa de orquestração (CLAUDE.md, D-046).

## D-077 · DAST (ZAP) do PR #51: corrigir o job e manter o check bloqueante; falha de ferramenta não é achado · fonte: Marcos

No chat, o Marcos escolheu corrigir o job DAST e manter o check bloqueante, em vez de torná-lo informativo ou só reexecutar. Diagnóstico: o ZAP abortou com `Failed to access summary file` (exit 3) no run 45321301256, sem achado de segurança; o rerun do mesmo job passou, então a falha é intermitente. O log mostra o alvo resetando conexões logo após subir; a causa exata não foi reproduzida localmente (Docker inativo). Correção: o job só libera o ZAP após 3 respostas seguidas do alvo. Boa prática: gate programático bloqueia só por achado real, e falha da própria ferramenta é erro de pipeline a corrigir; o erro comum que ela evita é afrouxar o gate para o PR passar.

Na mesma conversa, o Marcos definiu a ordem: registrar a decisão, corrigir o DAST antes de mergear o #51, marcar o #51 como pronto e mergear, e deixar as demais pendências em aberto.

**Aplicado em:** `.github/workflows/seguranca.yml` (job `dast`, PR #53, mergeada em `07e84f2`).

Regra ativa proposta para o `DECISOES.md`:
- **DAST bloqueante, com falha de ferramenta tratada como erro de pipeline** (D-077): o job DAST (ZAP) continua bloqueante. Falha da própria ferramenta não é achado: corrige-se o job, sem afrouxar o gate. O job libera o ZAP só após 3 respostas seguidas do alvo.

## D02-P6 · Permissions boundary nas roles criadas

- Pergunta: quando aplicar a permissions boundary exigida nas roles criadas?
- Boa prática: privilégio mínimo com limite de permissão; erro comum: role de deploy que consegue se dar admin, mesmo com aprovação manual.
- Resposta do Marcos: **"Na role da conta, depois da P00-P2"** (opção recomendada).
- Tradeoff aceito: política central e fácil de auditar; o D02 segue com a brecha de escalada até a P00-P2.
- Pendente: T210 (boundary) espera a P00-P2 (primeiro consumidor da plataforma).

## D02-P7 · Troca do PowerUserAccess por política do IAM Access Analyzer

- Pergunta: quando trocar o PowerUserAccess por política gerada pelo Access Analyzer?
- Boa prática: política de privilégio mínimo medida no uso real; erro comum: manter PowerUserAccess para sempre porque funciona.
- Resposta do Marcos: **"No primeiro deploy real da demonstração"**.
- Pendente: T211 espera esse deploy, dentro do teto diário, com a política gerada a partir do CloudTrail.

## Orquestração

- Pergunta: qual conversa é a orquestração?
- Resposta do Marcos: **"Outra conversa"**. O id ainda não foi informado.
- Pendente: nenhuma gravação até o id.

## Estado das tarefas do projeto 02 (não decidido)

- Branch `modulo/02-apis-ia-generativa/assistente-agendamento-seguranca`, commit `4123694`: `tasks.md` com T201 a T206, T210 e T211. Fase `tarefas` nesse commit.
- T201 a T206: esperam revisão do `tasks.md` e análise do projeto 02 (sdd-analisar). Sem ok do dono, nada avança.
- T210 e T211: esperam D02-P6 e D02-P7 (acima).
