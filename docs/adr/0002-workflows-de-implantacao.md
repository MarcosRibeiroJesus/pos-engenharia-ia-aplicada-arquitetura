# ADR 0002 · Inputs e credencial do git nos workflows de implantação

- Status: aceito
- Data: 2026-11-19

## Contexto
A esteira de segurança (checkov e zizmor) roda em todo PR. Ela acusou três padrões nos workflows de apply, destroy e prazo da infraestrutura de demonstração (D-021, D-024):
1. **`CKV_GHA_7` (checkov):** proíbe inputs em `workflow_dispatch`. A regra vem do SLSA e protege a proveniência de **builds**.
2. **`excessive-permissions` (zizmor):** `id-token: write` estava no nível do workflow.
3. **`template-injection` (zizmor):** uma expressão do GitHub era expandida dentro do script do agendador.

E um aviso médio:

4. **`artipacked` (zizmor):** checkout com credencial persistida.

## Decisão
- **Corrigido, sem exceção (2 e 3):**
  - o token OIDC fica só no job que acessa a AWS;
  - variáveis e expressões entram por `env` e são lidas como variáveis do shell.
- **Credencial do git (4):**
  - o job que fala com a AWS faz checkout sem credencial persistida;
  - só os jobs que gravam estado compartilhado mantêm a credencial: o registro de prazo no branch `infra-no-ar`, o agendador e o `harness.yml`, que lê a memória. Nenhum deles envia artefato, por isso a exceção do `artipacked` em `.github/zizmor.yml` vale só para esses arquivos.
- **Exceção ao `CKV_GHA_7` (1),** por comentário `checkov:skip` em cada arquivo, nunca global. São workflows de implantação, não de build, e os inputs são exigidos pela constituição e validados antes de qualquer ação:
  - `confirm_stack` é comparado ao nome do stack;
  - `prazo_horas` é limitado de 0 a 24 h pelo `harness/infra.py`.
- **Gate:** o `harness/test_harness.py` reprova qualquer workflow com essa exceção que não seja apply ou destroy registrado em `harness/estado.json`.

## Alternativas rejeitadas
- **Desligar o `CKV_GHA_7` no `.checkov.yaml`:** a exceção passaria a valer para workflows de build futuros.
- **Tirar os inputs:** remove a confirmação do destroy e o prazo do apply, que são regras do dono (D-021, D-024).

## Tarefas da prova
1.4 (gate programático no lugar de instrução) e 5.3 (erro com causa e correção explícitas).

## O que um arquiteto faria em produção
Separar implantação de build:
- builds sem inputs e com proveniência assinada (SLSA nível 3);
- implantações por ambiente protegido, com aprovação ou prazo, e trilha de auditoria do disparo.

Os mesmos padrões foram aplicados aqui, numa escala de laboratório.
