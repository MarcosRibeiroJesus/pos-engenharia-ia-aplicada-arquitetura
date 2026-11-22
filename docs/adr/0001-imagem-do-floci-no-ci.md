# ADR 0001 · Imagem do Floci no CI

- Status: aceito, temporário
- Data: 2026-11-18

## Contexto
O smoke test usa o Floci como container de serviço. A documentação do Floci recomenda `latest` para uso local e uma tag de release fixa no CI. Ainda não fixamos a versão usada nos testes.

## Decisão
A imagem vem da variável do repositório `FLOCI_IMAGE`, com `floci/floci:latest` como valor provisório. O zizmor tem uma exceção registrada para essa linha em `.github/zizmor.yml`.

## Alternativas rejeitadas
- Deixar `latest` sem exceção: a esteira bloquearia todo PR até a fixação.
- Fixar uma tag sem conferir qual é a release atual: risco de fixar uma versão que não existe.

## Consequências e prazo
Enquanto `FLOCI_IMAGE` não tiver tag fixa, uma mudança no Floci pode quebrar o smoke test sem mudança no código. Ao definir a variável com a tag de release (de preferência com digest), remova a exceção do `.github/zizmor.yml` e marque este ADR como substituído.

## O que um arquiteto faria em produção
Fixar por digest (`imagem@sha256:...`), espelhar a imagem num registry próprio e deixar o Dependabot ou o Renovate propor as atualizações.
