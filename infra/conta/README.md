# Conta: limite mensal de custo, identidade do CI e state

Recursos que são da conta inteira, e não de um projeto. Este stack é aplicado pelo dono e não entra no ciclo de 24 horas das demonstrações.

## Limite mensal
Um AWS Budgets **mensal de US$ 20** soma todas as demonstrações do mês (D-022). Ele é a segunda camada de custo:
- **Primeira camada:** o teto diário de cada projeto (`teto_diario_usd`, D-021).
- **Segunda camada:** este limite, para o caso de um destroy esquecido.
- **Proteção principal:** o prazo de vida com destroy automático (`harness/infra.py`). O alerta do Budgets chega com atraso, então não segura um esquecimento sozinho.

**Alertas:** 80% e 100% do gasto real e 100% do gasto previsto, por e-mail.

## Identidade do CI e state (`identidade.tf`, ADR-0015 da D01)
- **Provedor OIDC do GitHub** (`token.actions.githubusercontent.com`, audiência `sts.amazonaws.com`): é único por conta, então fica aqui e serve a todos os projetos. Os workflows trocam o token do GitHub por credenciais temporárias, sem chave estática.
- **Bucket de state** `00-conta-tfstate-<id da conta>`, de todos os projetos, cada um na sua chave (`01-recomendacao/lab.tfstate`, por exemplo):
  - versionamento, com versões antigas expirando em 90 dias;
  - SSE-KMS com a chave do cliente `alias/00-conta-tfstate`, com rotação anual;
  - os quatro bloqueios de acesso público e ACLs desligadas;
  - política que nega qualquer acesso sem TLS (`aws:SecureTransport = false`);
  - lock nativo do backend S3 (`use_lockfile`), sem tabela DynamoDB;
  - sem `force_destroy` e com `prevent_destroy` no bucket e na chave: o state sobrevive ao destroy de qualquer stack, e um destroy deste stack por engano falha antes de apagar o state de todos;
  - a política do bucket também nega `PutObject` que peça criptografia diferente de `aws:kms`, outra chave KMS, `aws:kms` sem key-id ou SSE-C. Um PUT sem cabeçalho de criptografia recebe a criptografia padrão do bucket, que é a CMK;
  - **a confirmar:** que um PUT com `aws:kms` e sem key-id use a chave gerenciada `aws/s3` em vez da CMK padrão do bucket (relato da revisão). A negação fica de qualquer forma, como defesa em profundidade e sem custo;
  - **não aplicado:** `blocked_encryption_types = ["SSE-C"]` na regra de criptografia. O argumento não existe no provider 5.100.0, o último da série 5.x que o `~> 5.81` resolve; a negação de SSE-C na política cobre o caso;
  - **não aplicado:** negar PUT sem nenhum cabeçalho de criptografia. Não está confirmado que o backend mande o cabeçalho também na gravação do `.tflock`, e negar quebraria o lock de todos os projetos. Sem cabeçalho, vale a CMK padrão do bucket.
- **Todo backend que grava neste bucket passa `kms_key_id`** com o ARN da saída `state_kms_key_arn`, além de `encrypt = true` (modelo em `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/infra/terraform/backend.hcl.example`):
  - `encrypt = true` sem `kms_key_id` faz o cliente do backend pedir SSE-S3 (AES256), sobrepondo a criptografia padrão do bucket. A política nega esse pedido, e o init ou o apply falha com AccessDenied;
  - esse é o comportamento do cliente do backend, a confirmar no primeiro apply: a documentação do backend S3 (developer.hashicorp.com/terraform/language/backend/s3) não pôde ser consultada na sessão que escreveu este stack;
  - use o ARN da chave, não o alias: a política compara o ARN.
- **Pendência dos workflows:** ainda passam só `encrypt=true`, sem `kms_key_id`:
  - os `01-recomendacao-*.yml` da D01: o `kms_key_id` entra na T032 da D01 (workflows com a role do projeto);
  - os modelos `harness/modelos/{apply,destroy}.yml` e os `00-plataforma-agentes-{apply,destroy}.yml` da plataforma: tarefa do harness ainda sem id, que lê o ARN de `vars.TF_STATE_KMS_KEY_ARN` com fallback seguro;
  - depois que o `infra/conta` for aplicado, esses workflows falham contra este bucket com AccessDenied até receberem o `kms_key_id`;
  - **risco do `.tflock` no plan do CI:** o plan do PR também grava e apaga o `.tflock`. Se o backend mandar `encrypt=true` sem a chave também no lockfile, o plan falha no lock antes de ler o state. Ou o plan recebe o `kms_key_id`, ou roda com `-lock=false` só no PR, que não altera o state.
- **Roles por projeto com ABAC** (`roles_projeto.tf` e `modules/role-projeto/`, D-029, T031 da D01), geradas pela lista `projetos_iam`:
  - `<chave>-deploy`: confiança só nos subjects `repo:<dono>/<repo>:environment:aws-lab` e `...:environment:aws-lab-destroy` (variável `repositorio_github`); criar só com `aws:RequestTag/project = <chave>`, alterar e remover só com `aws:ResourceTag/project = <chave>`; tag na criação só em recurso sem a tag `project`, e a tag `project` não muda depois;
  - `<chave>-plan`: confiança só no subject `repo:<dono>/<repo>:pull_request`; só leitura, o state da chave e o `.tflock`;
  - as duas leem o state só no prefixo `<chave>/` do bucket, com `kms:Decrypt` e `kms:GenerateDataKey` na chave do state, só pelo S3 (`kms:ViaService`);
  - as ações sem condição de tag ficam só na lista nomeada `tests/acoes_sem_condicao_de_tag.json`, com motivo, fonte e data de cada item. O módulo nega no plan qualquer outra declaração sem a tag (TT-I01, `tests/roles_projeto.tftest.hcl`);
  - as roles e as políticas são da conta (`project = 00-conta`, políticas `00-conta-<chave>-*`), e um Deny explícito impede a deploy de alterar a si mesma ou a plan;
  - **a conferir antes do primeiro apply:** as fontes da lista não puderam ser abertas na sessão que escreveu o stack. Um nome de ação ou de chave de condição errado falha fechado com AccessDenied (risco do ADR-0015);
  - **sem `iam:CreateServiceLinkedRole`:** a deploy não cria as service-linked roles do ECS, do ELB, do MemoryDB, do Lake Formation e do MWAA. Numa conta nova, o primeiro apply falha fechado com AccessDenied. Há duas saídas, e a escolha é do dono: pré-criar as service-linked roles com a credencial do dono, ou conceder a ação com a condição `iam:AWSServiceName` nesses serviços. A role não recebe a ação por padrão;
  - a saída `roles_projeto` traz o ARN da deploy para a variável `AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO` (T033 da D01, do dono).
- **Conta que já tem o provedor OIDC** (de um bootstrap antigo): importe-o antes do apply, `terraform import aws_iam_openid_connect_provider.github arn:aws:iam::<conta>:oidc-provider/token.actions.githubusercontent.com`, em vez de criar um segundo.

**Tags e nome:** `project = 00-conta` e `managed-by = terraform` em todos os recursos; `module = finops` no orçamento, `identidade` no provedor OIDC e `estado-terraform` no bucket e na chave, no padrão da política de tags do Infracost (D-031). Os nomes levam o prefixo `00-conta-` (D-029).

**Custo:** o orçamento, o IAM e o OIDC não cobram. A chave KMS custa cerca de US$ 1 por mês, mais centavos de requisições (o bucket key reduz as chamadas); o state são alguns KB. É o único custo fixo da conta e serve a todos os projetos (ADR-0015 da D01).

## Pré-requisitos
- Terraform 1.10 ou mais novo (lock nativo do backend S3).
- Credencial do dono na conta, com permissão no AWS Budgets, IAM, KMS e S3.

## Passos
1. `cp terraform.tfvars.example terraform.tfvars` e preencha os e-mails; depois `terraform init -backend=false && terraform test`.
2. **Só na primeira vez** (o bucket de state ainda não existe): crie `backend_override.tf` com `terraform { backend "local" {} }`, rode `terraform init -reconfigure`, `terraform plan` e aplique.
3. **Só na primeira vez:** guarde o bucket e a chave (`terraform output -raw state_bucket` e `terraform output -raw state_kms_key_arn`), apague o `backend_override.tf` e mova o state para ele: `terraform init -migrate-state -backend-config=bucket=<state_bucket> -backend-config=key=conta/lab.tfstate -backend-config=encrypt=true -backend-config=kms_key_id=<state_kms_key_arn>`. Crie a variável `TF_STATE_BUCKET` do repositório com esse nome.
4. Nas vezes seguintes: `terraform init -backend-config=bucket=<state_bucket> -backend-config=key=conta/lab.tfstate -backend-config=encrypt=true -backend-config=kms_key_id=<state_kms_key_arn>`.
5. `terraform plan` e aplique.

## Quem já aplicou o bootstrap antigo da D01
O antigo `infra/bootstrap` da D01 criava o bucket `recsys-tfstate-<conta>` (SSE-S3, tag `project = recsys`) e um provedor OIDC.
1. Importe o provedor OIDC antes do passo 2 (comando na seção de identidade), para não criar um segundo.
2. Depois do passo 3, mova o state de cada projeto para o bucket novo. No diretório do stack do projeto, com o `backend.hcl` já apontando para o bucket novo e a chave KMS: `terraform init -migrate-state -backend-config=backend.hcl`. O Terraform lê o state do backend antigo e grava no novo.
3. Confira com `terraform plan` (sem mudanças) e só então esvazie e apague o bucket antigo à mão. Ele ficou fora do Terraform quando o bootstrap saiu do repositório.
