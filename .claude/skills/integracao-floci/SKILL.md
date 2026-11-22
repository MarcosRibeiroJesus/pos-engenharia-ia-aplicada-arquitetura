---
name: integracao-floci
description: Teste de integração no Floci (emulador local da AWS) com o projeto completo. Use para terraform apply mais asserts contra http://localhost:4566, destroy sem sobras, relatório HTML em testing/reports e separação entre falha real e lacuna do emulador.
---

# Integração no Floci

## Quando
Só com o projeto 100% implementado (fase `verificar`). Antes disso, valem `terraform test` e os testes unitários.

## Como
1. **Imagem:** `${FLOCI_IMAGE:-floci/floci:latest}` nos scripts e `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}` nos workflows (D-013). Não escreva `latest` direto.
2. **Apply:** provider apontado para `http://localhost:4566`, com credenciais falsas e `skip_*` necessários documentados.
3. **Asserts de comportamento:** chamar a API, conferir o efeito no DynamoDB, ler a mensagem da fila. Conferir só se o recurso existe não basta.
4. **Destroy** e verificação de que não sobrou nada.
5. **Relatório:** HTML com data, imagem do Floci, matriz regra → teste e resultado, em `testing/reports/<data>-<chave>.html`. O último também vai para `testing/reports/latest.html`. Envie ao dono.

## Lacuna do emulador
- Marque uma falha como lacuna do emulador **só com evidência**: código ou documentação do Floci, ou o mesmo teste passando em outro emulador. Cite a evidência no relatório.
- **Nunca mude código correto para agradar o emulador.** Se não houver evidência, a falha é real.
