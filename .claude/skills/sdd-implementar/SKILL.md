---
name: sdd-implementar
description: Fase implementar do SDD. Use para executar a próxima tarefa não marcada de specs/<chave>/tasks.md com TDD, uma tarefa por vez, mantendo spec, tarefas e estado sincronizados.
---

# Implementar (uma tarefa por vez)

1. Pegue a **primeira** tarefa não marcada em `tasks.md` (`python3 harness/estado.py status` mostra qual é). Não puxe trabalho de outras tarefas.
2. **Vermelho:** escreva o teste que expressa o critério de aceite do requisito citado e veja-o falhar.
3. **Verde:** implemente o mínimo para passar. Rode a suíte inteira do projeto.
4. **Se a implementação revelar que a spec ou o plano estão errados:** pare, corrija o artefato primeiro (em commit `spec:` ou `plan:`) e só depois volte ao código. O código nunca diverge da spec em silêncio.
5. Marque a tarefa `[x]` em `tasks.md` e faça um commit por tarefa: `feat(<chave>): T0xx ...`.
6. **Depois da última tarefa de implementação:**
   - `python3 harness/estado.py avancar <chave> verificar`;
   - rode a integração no Floci, com relatório em `testing/reports/`;
   - depois os posts e o site, e então `avancar <chave> publicar`.
7. Antes de cada push, o gate de entrega confere a memória compartilhada. Atualize `harness/progresso.md` ao encerrar (skill `retomar`, passo 6).
