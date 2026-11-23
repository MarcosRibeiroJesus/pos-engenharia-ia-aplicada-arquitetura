# TT-I01 (RNF-105 e ADR-0015 da D01, Art. IV, D-029): roles de deploy e de plan por projeto, com ABAC.
# Mock provider (Art. III) e valores sintéticos: conta 111122223333, repositório dono-sintetico/repo-sintetico.
# A lista nomeada das ações sem condição de tag fica ao lado deste teste (acoes_sem_condicao_de_tag.json)
# e é renderizada pelo auxiliar tests/lista_nomeada, sem passar pelo código do infra/conta.
mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.atual
    values = { account_id = "111122223333" }
  }
  override_resource {
    target          = aws_iam_openid_connect_provider.github
    override_during = plan
    values          = { arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" }
  }
  override_resource {
    target          = aws_kms_key.state
    override_during = plan
    values          = { arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000" }
  }
  override_resource {
    target          = aws_s3_bucket.state
    override_during = plan
    values = {
      arn    = "arn:aws:s3:::00-conta-tfstate-111122223333"
      id     = "00-conta-tfstate-111122223333"
      bucket = "00-conta-tfstate-111122223333"
    }
  }
}

variables {
  emails_alerta      = ["alerta@exemplo.com"]
  repositorio_github = "dono-sintetico/repo-sintetico"
}

# Lista revisada, renderizada com os valores sintéticos.
run "lista" {
  command = plan
  module {
    source = "./tests/lista_nomeada"
  }
  variables {
    conta           = "111122223333"
    regiao          = "us-east-1"
    chave           = "01-recomendacao"
    bucket_state    = "00-conta-tfstate-111122223333"
    chave_kms_state = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
  }
}

run "lista_nomeada_com_fonte_e_data" {
  command = plan
  assert {
    condition = alltrue([for e in run.lista.excecoes :
      can(regex("^[A-Za-z0-9]+$", e.id))
      && length(e.motivo) > 0
      && length(e.fonte) > 0
      && can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", e.data_consulta))
      && length(e.acoes) > 0 && length(e.recursos) > 0
      && length(setsubtract(e.roles, ["deploy", "plan"])) == 0
    ])
    error_message = "Todo item da lista nomeada tem id, motivo, fonte (ou 'fonte não aberta; conferir'), data da consulta, ações, recursos e roles válidas."
  }
  assert {
    condition = alltrue([for e in run.lista.excecoes :
      !contains(e.recursos, "*") || e.asterisco_justificado
    ])
    error_message = "Recurso '*' na lista só onde a referência do serviço só aceita '*' (asterisco_justificado)."
  }
  assert {
    condition = alltrue([for e in run.lista.excecoes :
      e.asterisco_justificado || alltrue([for r in e.recursos :
        strcontains(r, "01-recomendacao") || strcontains(r, "p01_recomendacao_")
        || r == "arn:aws:s3:::00-conta-tfstate-111122223333"
        || r == "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
        || r == "arn:aws:ssm:us-east-1:111122223333:parameter/00-plataforma-agentes/contrato/v1/comum"
        || r == "arn:aws:glue:us-east-1:111122223333:catalog"
      ])
    ])
    error_message = "Fora do '*' justificado, todo recurso da lista leva o prefixo da chave ou é um recurso da conta nomeado (bucket e chave do state, contrato comum, catálogo do Glue)."
  }
  assert {
    condition = alltrue([for e in run.lista.excecoes :
      alltrue([for a in e.acoes : a != "*" && !endswith(a, ":*")])
    ])
    error_message = "Nenhum item da lista libera um serviço inteiro (svc:*) nem a ação '*'."
  }
  assert {
    condition = alltrue([for e in concat(run.lista.excecoes, run.lista.documentadas) :
      length(e.fonte) > 0 && can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", e.data_consulta))
    ])
    error_message = "Os acréscimos do F3 e da A02 também trazem fonte e data."
  }
}

run "confianca_da_deploy_tem_exatamente_os_dois_ambientes" {
  command = plan
  assert {
    condition     = module.roles_projeto["01-recomendacao"].nome_deploy == "01-recomendacao-deploy" && module.roles_projeto["01-recomendacao"].nome_plan == "01-recomendacao-plan"
    error_message = "As roles se chamam 01-recomendacao-deploy e 01-recomendacao-plan (ADR-0015)."
  }
  assert {
    condition     = length(jsondecode(module.roles_projeto["01-recomendacao"].confianca_deploy).Statement) == 1
    error_message = "A confiança da deploy tem uma única declaração."
  }
  assert {
    condition = alltrue([for s in jsondecode(module.roles_projeto["01-recomendacao"].confianca_deploy).Statement :
      s.Effect == "Allow"
      && s.Action == "sts:AssumeRoleWithWebIdentity"
      && s.Principal.Federated == "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      && s.Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
      && toset(s.Condition.StringEquals["token.actions.githubusercontent.com:sub"]) == toset([
        "repo:dono-sintetico/repo-sintetico:environment:aws-lab",
        "repo:dono-sintetico/repo-sintetico:environment:aws-lab-destroy",
      ])
      && keys(s.Condition) == ["StringEquals"]
    ])
    error_message = "A deploy confia no OIDC do GitHub só com os subjects exatos dos ambientes aws-lab e aws-lab-destroy (StringEquals, sem curinga)."
  }
}

run "confianca_da_plan_so_no_pull_request" {
  command = plan
  assert {
    condition = alltrue([for s in jsondecode(module.roles_projeto["01-recomendacao"].confianca_plan).Statement :
      s.Effect == "Allow"
      && s.Action == "sts:AssumeRoleWithWebIdentity"
      && s.Principal.Federated == "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      && s.Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
      && s.Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:dono-sintetico/repo-sintetico:pull_request"
      && keys(s.Condition) == ["StringEquals"]
    ]) && length(jsondecode(module.roles_projeto["01-recomendacao"].confianca_plan).Statement) == 1
    error_message = "A plan confia só no subject de pull_request do repositório."
  }
}

run "deploy_sem_acao_ampla_fora_da_lista" {
  command = plan
  # Nenhuma declaração com ação * e recurso *; nenhuma ação * nem svc:* em Allow.
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      !(contains(flatten([s.Action]), "*") && contains(flatten([s.Resource]), "*"))
      && (s.Effect == "Deny" || alltrue([for a in flatten([s.Action]) : a != "*" && !endswith(a, ":*")]))
    ])
    error_message = "Nenhuma declaração com ação * e recurso *, e nenhum Allow de serviço inteiro."
  }
  # Toda Allow tem a condição de tag do projeto ou é um item da lista, idêntico a ele.
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      s.Effect == "Deny"
      || try(s.Condition.StringEquals["aws:RequestTag/project"], "") == "01-recomendacao"
      || try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
      || anytrue([for e in run.lista.excecoes :
        contains(e.roles, "deploy") && e.id == s.Sid
        && toset(e.acoes) == toset(flatten([s.Action]))
        && toset(e.recursos) == toset(flatten([s.Resource]))
        && jsonencode(try(e.condicao, null)) == jsonencode(try(s.Condition, null))
      ])
    ])
    error_message = "Toda declaração Allow da deploy tem aws:RequestTag/project ou aws:ResourceTag/project = 01-recomendacao, ou é um item da lista nomeada com as mesmas ações, recursos e condição."
  }
  # Todo item da lista para a deploy está na política (a lista não fica à frente do código).
  assert {
    condition = alltrue([for e in run.lista.excecoes :
      !contains(e.roles, "deploy") || anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) : s.Sid == e.id])
    ])
    error_message = "Cada item da lista nomeada da deploy vira uma declaração com o mesmo Sid."
  }
}

run "deploy_cria_com_request_tag_e_altera_com_resource_tag" {
  command = plan
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      !startswith(s.Sid, "Criar") || try(s.Condition.StringEquals["aws:RequestTag/project"], "") == "01-recomendacao"
    ]) && anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) : startswith(s.Sid, "Criar")])
    error_message = "Toda declaração de criação (Sid Criar*) tem aws:RequestTag/project = 01-recomendacao."
  }
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      !(startswith(s.Sid, "Alterar") || startswith(s.Sid, "Remover")) || try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
    ]) && anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) : startswith(s.Sid, "Alterar")])
    error_message = "Toda declaração de alteração ou remoção (Sid Alterar* ou Remover*) tem aws:ResourceTag/project = 01-recomendacao."
  }
  # Pelo verbo, independente do Sid: apagar, alterar e desanexar só com ResourceTag ou pela lista.
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      s.Effect == "Deny"
      || !anytrue([for a in flatten([s.Action]) : can(regex(":(Delete|Update|Modify|Untag|Remove|Detach|Deregister|Revoke|Disassociate|Schedule|Replace|Set|Put|Attach|Associate|Authorize|Enable|Disable)", a))
      && !can(regex(":(PutMetricAlarm|PutParameter)$", a))])
      || try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
      || contains([for e in run.lista.excecoes : e.id if contains(e.roles, "deploy")], s.Sid)
    ])
    error_message = "Toda ação de alteração ou remoção está numa declaração com aws:ResourceTag/project = 01-recomendacao ou num item da lista (PutMetricAlarm e PutParameter também criam e por isso aparecem com RequestTag)."
  }
  # Etiquetas: na criação, só em recurso ainda sem project; depois, sem mexer na tag project.
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      s.Effect == "Deny"
      || contains([for e in run.lista.excecoes : e.id], s.Sid)
      || !anytrue([for a in flatten([s.Action]) : can(regex(":(TagResource|UntagResource|CreateTags|DeleteTags|AddTags|RemoveTags|AddTagsToResource|RemoveTagsFromResource|Tag[A-Z][A-Za-z]*|Untag[A-Z][A-Za-z]*)$", a))])
      || (try(s.Condition.StringEquals["aws:RequestTag/project"], "") == "01-recomendacao" && try(s.Condition.Null["aws:ResourceTag/project"], "") == "true" && !contains(flatten([s.Action]), "ec2:CreateTags"))
      || (try(s.Condition.StringEquals["aws:RequestTag/project"], "") == "01-recomendacao" && flatten([s.Action]) == ["ec2:CreateTags"] && length(flatten([try(s.Condition.StringEquals["ec2:CreateAction"], [])])) > 0)
      || (try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao" && contains(flatten([try(s.Condition["ForAllValues:StringNotEquals"]["aws:TagKeys"], [])]), "project"))
    ])
    error_message = "Tag na criação exige aws:RequestTag/project = 01-recomendacao e recurso sem a tag project (Null), e no EC2 exige ec2:CreateAction; tag depois exige aws:ResourceTag/project e proíbe a chave project em aws:TagKeys. Sem isso, a role toma recurso de outro projeto trocando a tag."
  }
  # M1: no EC2 (ARNs sem nome), tag na criação só dentro das ações de criação, para não adotar a VPC padrão.
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      flatten([s.Action]) == ["ec2:CreateTags"]
      && try(s.Condition.StringEquals["aws:RequestTag/project"], "") == "01-recomendacao"
      && toset(flatten([try(s.Condition.StringEquals["ec2:CreateAction"], [])])) == toset(["ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateRouteTable", "ec2:CreateInternetGateway", "ec2:CreateSecurityGroup", "ec2:CreateVpcEndpoint", "ec2:CreateFlowLogs"])
      && try(s.Condition.Null, null) == null
    ])
    error_message = "ec2:CreateTags na criação só com ec2:CreateAction igual às ações de criação do EC2 (M1)."
  }
}

run "deploy_nao_altera_a_propria_identidade" {
  command = plan
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      s.Effect == "Deny"
      && contains(flatten([s.Action]), "iam:*")
      && contains(flatten([s.Resource]), "arn:aws:iam::111122223333:role/01-recomendacao-deploy")
      && contains(flatten([s.Resource]), "arn:aws:iam::111122223333:role/01-recomendacao-plan")
    ])
    error_message = "Deny explícito de IAM nas próprias roles de deploy e plan: o prefixo 01-recomendacao-* do PassRole e do IAM não pode alcançá-las."
  }
  assert {
    condition = alltrue([for t in [module.roles_projeto["01-recomendacao"].tags_deploy, module.roles_projeto["01-recomendacao"].tags_plan] :
      t["project"] == "00-conta" && t["module"] == "identidade" && t["managed-by"] == "terraform"
    ])
    error_message = "As roles de identidade têm project = 00-conta (recurso da conta): com project = 01-recomendacao a própria deploy as alteraria pelo ABAC."
  }
  assert {
    condition     = alltrue([for n in module.roles_projeto["01-recomendacao"].nomes_politicas : startswith(n, "00-conta-01-recomendacao-")])
    error_message = "As políticas das roles de identidade não levam o prefixo 01-recomendacao- (o AttachRolePolicy do projeto aceita iam:PolicyARN policy/01-recomendacao-*)."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      contains(flatten([s.Action]), "iam:AttachRolePolicy")
      && try(s.Condition.ArnLike["iam:PolicyARN"], "") == "arn:aws:iam::111122223333:policy/01-recomendacao-*"
      && try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
      ]) && alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      !contains(flatten([s.Action]), "iam:AttachRolePolicy") || try(s.Condition.ArnLike["iam:PolicyARN"], "") == "arn:aws:iam::111122223333:policy/01-recomendacao-*"
    ])
    error_message = "AttachRolePolicy só anexa políticas do projeto (iam:PolicyARN), nunca uma política gerenciada da AWS como AdministratorAccess."
  }
}

run "deploy_le_e_grava_o_state_com_a_cmk" {
  command = plan
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      s.Sid == "BucketsDoProjeto"
      && try(s.Condition.StringEquals["s3:ResourceAccount"], "") == "111122223333"
      && !anytrue([for a in flatten([s.Action]) : endswith(a, "*") && startswith(a, "s3:Put")])
    ])
    error_message = "Os buckets do projeto ficam na própria conta (s3:ResourceAccount), com as ações de escrita explícitas, sem s3:PutBucket*."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      contains(flatten([s.Action]), "kms:Decrypt") && contains(flatten([s.Action]), "kms:GenerateDataKey")
      && flatten([s.Resource]) == ["arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"]
    ])
    error_message = "A deploy tem kms:Decrypt e kms:GenerateDataKey na chave do state (saída state_kms_key_arn, achado da T030)."
  }
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      alltrue([for r in flatten([s.Resource]) : !startswith(r, "arn:aws:s3:::00-conta-tfstate-111122223333/") || startswith(r, "arn:aws:s3:::00-conta-tfstate-111122223333/01-recomendacao/")])
    ])
    error_message = "No bucket de state, a deploy só alcança objetos sob 01-recomendacao/."
  }
}

run "acrescimos_do_roteiro_f3_e_a02" {
  command = plan
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      toset(flatten([s.Action])) == toset(["airflow:InvokeRestApi", "airflow:CreateWebLoginToken"])
      && flatten([s.Resource]) == ["arn:aws:airflow:us-east-1:111122223333:role/p01-recomendacao-lab-mwaa/*"]
    ])
    error_message = "F3: InvokeRestApi e CreateWebLoginToken só na role do Airflow do ambiente p01-recomendacao-lab-mwaa."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      flatten([s.Action]) == ["ecs:RunTask"]
      && flatten([s.Resource]) == ["arn:aws:ecs:us-east-1:111122223333:task-definition/01-recomendacao-*:*"]
      && try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
      && try(s.Condition.ArnLike["ecs:cluster"], "") == "arn:aws:ecs:us-east-1:111122223333:cluster/01-recomendacao-*"
    ])
    error_message = "F3: ecs:RunTask só no task definition 01-recomendacao-*, com a condição de tag e o cluster do projeto."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      flatten([s.Action]) == ["cloudwatch:GetMetricData"] && flatten([s.Resource]) == ["*"]
    ])
    error_message = "F3: cloudwatch:GetMetricData sozinho na declaração (não aceita recurso)."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      flatten([s.Action]) == ["ecs:DescribeTasks"]
      && flatten([s.Resource]) == ["arn:aws:ecs:us-east-1:111122223333:task/01-recomendacao-*/*"]
      && try(s.Condition.ArnLike["ecs:cluster"], "") == "arn:aws:ecs:us-east-1:111122223333:cluster/01-recomendacao-*"
      ]) && alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      !anytrue([for a in flatten([s.Action]) : a == "ecs:DescribeTasks" || a == "ecs:Describe*"]) || try(s.Condition.ArnLike["ecs:cluster"], "") != ""
    ])
    error_message = "A02: ecs:DescribeTasks só em task/01-recomendacao-*/* com ecs:cluster, e em nenhuma outra declaração sem o cluster."
  }
  # A19: o padrão do GetLogEvents casa com o log group do serviço fixado na T012
  # (modules/ecs_service, "${project_name}-${environment}-servico").
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_deploy) : jsondecode(p).Statement]) :
      flatten([s.Action]) == ["logs:GetLogEvents"]
      && length(flatten([s.Resource])) == 1
      && can(regex(
        "^${replace(replace(flatten([s.Resource])[0], ".", "\\."), "*", ".*")}$",
        "arn:aws:logs:us-east-1:111122223333:log-group:01-recomendacao-lab-servico:log-stream:01-recomendacao/recommendation-service/0123456789abcdef"
      ))
      && !can(regex(
        "^${replace(replace(flatten([s.Resource])[0], ".", "\\."), "*", ".*")}$",
        "arn:aws:logs:us-east-1:111122223333:log-group:02-outro-projeto-servico:log-stream:x"
      ))
    ])
    error_message = "A19: logs:GetLogEvents em log-group:01-recomendacao-*:log-stream:*, que casa com 01-recomendacao-lab-servico e não com o log group de outro projeto."
  }
}

run "plan_so_le_e_so_acessa_o_state_da_chave" {
  command = plan
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_plan) : jsondecode(p).Statement]) :
      s.Effect == "Deny" || contains(["EstadoTravaDaChave", "EstadoChaveKms"], s.Sid)
      || alltrue([for a in flatten([s.Action]) : can(regex("^[a-z0-9-]+:(Describe|Get|List|BatchGet|View)", a))])
    ])
    error_message = "A plan só tem leituras, fora o .tflock do state e a chave do state."
  }
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_plan) : jsondecode(p).Statement]) :
      !contains(["EstadoTravaDaChave"], s.Sid) || alltrue([for r in flatten([s.Resource]) : endswith(r, ".tflock")])
    ])
    error_message = "A única escrita da plan é o .tflock."
  }
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_plan) : jsondecode(p).Statement]) :
      alltrue([for r in flatten([s.Resource]) : !startswith(r, "arn:aws:s3:::00-conta-tfstate-111122223333/") || startswith(r, "arn:aws:s3:::00-conta-tfstate-111122223333/01-recomendacao/")])
    ])
    error_message = "No bucket de state, a plan só alcança objetos sob 01-recomendacao/."
  }
  assert {
    condition = alltrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_plan) : jsondecode(p).Statement]) :
      !(contains(flatten([s.Action]), "*") && contains(flatten([s.Resource]), "*"))
      && (s.Effect == "Deny" || try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == "01-recomendacao"
        || anytrue([for e in run.lista.excecoes :
          contains(e.roles, "plan") && e.id == s.Sid
          && toset(e.acoes) == toset(flatten([s.Action]))
          && toset(e.recursos) == toset(flatten([s.Resource]))
          && jsonencode(try(e.condicao, null)) == jsonencode(try(s.Condition, null))
      ]))
    ])
    error_message = "Toda Allow da plan tem aws:ResourceTag/project = 01-recomendacao ou é um item da lista com as mesmas ações e recursos; nenhuma com * e *."
  }
  assert {
    condition = anytrue([for s in flatten([for p in values(module.roles_projeto["01-recomendacao"].politicas_plan) : jsondecode(p).Statement]) :
      contains(flatten([s.Action]), "kms:Decrypt")
      && flatten([s.Resource]) == ["arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"]
    ])
    error_message = "A plan decifra o state com a CMK da conta."
  }
}

run "politicas_cabem_no_limite_do_iam" {
  command = plan
  assert {
    condition = alltrue([for p in concat(values(module.roles_projeto["01-recomendacao"].politicas_deploy), values(module.roles_projeto["01-recomendacao"].politicas_plan)) :
      length(p) <= 6144
    ]) && length(module.roles_projeto["01-recomendacao"].politicas_deploy) <= 10 && length(module.roles_projeto["01-recomendacao"].politicas_plan) <= 10
    error_message = "Cada política gerenciada cabe em 6.144 caracteres e cada role fica no limite de 10 políticas anexadas."
  }
  assert {
    condition     = output.roles_projeto["01-recomendacao"].deploy == "arn:aws:iam::111122223333:role/01-recomendacao-deploy"
    error_message = "A saída roles_projeto traz o ARN da deploy para a variável AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO (T033)."
  }
}

# ---- Fixtures vermelhas: o gate está no módulo (precondition e validation), não só no teste ----

run "fixture_acao_ampla_sem_condicao_reprova" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = run.lista.bruta
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
    declaracoes_extras_deploy = [
      { Sid = "AmploSemCondicao", Effect = "Allow", Action = ["ec2:*"], Resource = ["*"] },
    ]
  }
  expect_failures = [aws_iam_role.deploy]
}

run "fixture_acao_fora_da_lista_reprova" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = run.lista.bruta
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
    declaracoes_extras_deploy = [
      { Sid = "LerSegredos", Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = ["arn:aws:secretsmanager:us-east-1:111122223333:secret:01-recomendacao-*"] },
    ]
  }
  expect_failures = [aws_iam_role.deploy]
}

run "fixture_extra_com_condicao_de_tag_passa" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = run.lista.bruta
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
    declaracoes_extras_deploy = [
      { Sid = "AlterarSegredoDoProjeto", Effect = "Allow", Action = ["secretsmanager:DescribeSecret"], Resource = ["arn:aws:secretsmanager:us-east-1:111122223333:secret:01-recomendacao-*"], Condition = { StringEquals = { "aws:ResourceTag/project" = "01-recomendacao" } } },
    ]
  }
  assert {
    condition     = anytrue([for p in values(output.politicas_deploy) : strcontains(p, "AlterarSegredoDoProjeto")])
    error_message = "Uma declaração extra com aws:ResourceTag/project passa pelo gate e entra na política."
  }
}

run "fixture_tag_ec2_sem_create_action_reprova" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = run.lista.bruta
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
    declaracoes_extras_deploy = [
      {
        Sid      = "EtiquetarAdotandoVpc", Effect = "Allow", Action = ["ec2:CreateTags"],
        Resource = ["arn:aws:ec2:us-east-1:111122223333:vpc/*"],
        Condition = {
          StringEquals = { "aws:RequestTag/project" = "01-recomendacao" }
          Null         = { "aws:ResourceTag/project" = "true" }
        }
      },
    ]
  }
  expect_failures = [aws_iam_role.deploy]
}

run "fixture_terceiro_subject_reprova" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = run.lista.bruta
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
    ambientes_deploy  = ["aws-lab", "aws-lab-destroy", "producao"]
  }
  expect_failures = [var.ambientes_deploy]
}

run "fixture_item_da_lista_sem_fonte_reprova" {
  command = plan
  module {
    source = "./modules/role-projeto"
  }
  variables {
    chave             = "01-recomendacao"
    conta             = "111122223333"
    regiao            = "us-east-1"
    repositorio       = "dono-sintetico/repo-sintetico"
    oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    state_bucket      = "00-conta-tfstate-111122223333"
    state_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    lista_sem_tag     = jsonencode({ excecoes = [{ id = "SemFonte", roles = ["deploy"], acoes = ["s3:ListAllMyBuckets"], recursos = ["*"], asterisco_justificado = true, motivo = "teste", fonte = "", data_consulta = "2026-11-23" }] })
    tags              = { project = "00-conta", module = "identidade", "managed-by" = "terraform" }
  }
  expect_failures = [var.lista_sem_tag]
}
