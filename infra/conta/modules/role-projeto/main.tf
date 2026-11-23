# Roles de deploy e de plan de um projeto, com ABAC (RNF-105 e ADR-0015 da D01, D-029, Art. IV).
#
# Regras que o próprio módulo impõe (gate no plan, além do teste TT-I01):
# - toda declaração Allow tem aws:RequestTag/project (criar) ou aws:ResourceTag/project (alterar e
#   remover) igual à chave, ou é um item da lista nomeada, com as mesmas ações, recursos e condição;
# - nenhuma declaração com ação * e recurso *, e nenhum Allow de um serviço inteiro (svc:*);
# - tag na criação só em recurso ainda sem a tag project, e tag depois sem mexer na chave project,
#   para a role não tomar recurso de outro projeto trocando a tag;
# - as roles e as políticas de identidade são da conta (project = 00-conta, nomes 00-conta-*), e um
#   Deny explícito impede a própria deploy de alterá-las.
#
# Os nomes das ações e das chaves de condição seguem a referência de autorização de cada serviço,
# que não pôde ser aberta na sessão da T031 (docs.aws.amazon.com bloqueado pela rede): um item errado
# falha fechado com AccessDenied no primeiro apply, o risco já aceito no ADR-0015.
locals {
  r  = var.regiao
  a  = var.conta
  k  = var.chave
  pk = "p${var.chave}" # exceções de nome do ADR-0014 (MemoryDB e MWAA começam por letra)

  tag_criar   = { StringEquals = { "aws:RequestTag/project" = var.chave } }
  tag_recurso = { StringEquals = { "aws:ResourceTag/project" = var.chave } }

  # Catálogo por serviço: recursos (ARN com o prefixo da chave sempre que o serviço o tem no nome),
  # ações de criação (com aws:RequestTag), de alteração, remoção e leitura (com aws:ResourceTag) e
  # as de etiqueta. O grupo diz em qual política gerenciada a declaração entra (limite de 6.144 caracteres por
  # política e 10 políticas por role, cotas padrão do IAM).
  catalogo = {
    ec2 = {
      grupo = "rede"
      recursos = [for t in ["vpc", "subnet", "route-table", "internet-gateway", "security-group", "security-group-rule", "vpc-endpoint", "vpc-flow-log"] :
      "arn:aws:ec2:${local.r}:${local.a}:${t}/*"]
      recursos_criar = []
      criar = ["ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateRouteTable", "ec2:CreateInternetGateway",
      "ec2:CreateSecurityGroup", "ec2:CreateVpcEndpoint", "ec2:CreateFlowLogs"]
      alterar = ["ec2:DeleteVpc", "ec2:ModifyVpcAttribute", "ec2:DeleteSubnet", "ec2:ModifySubnetAttribute",
        "ec2:DeleteRouteTable", "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable", "ec2:CreateRoute",
        "ec2:ReplaceRoute", "ec2:DeleteRoute", "ec2:DeleteInternetGateway", "ec2:AttachInternetGateway",
        "ec2:DetachInternetGateway", "ec2:DeleteSecurityGroup", "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
        "ec2:ModifySecurityGroupRules", "ec2:UpdateSecurityGroupRuleDescriptionsIngress",
      "ec2:UpdateSecurityGroupRuleDescriptionsEgress", "ec2:ModifyVpcEndpoint", "ec2:DeleteVpcEndpoints", "ec2:DeleteFlowLogs"]
      etiquetar    = ["ec2:CreateTags"]
      desetiquetar = ["ec2:DeleteTags"]
    }
    elasticloadbalancing = {
      grupo = "rede"
      recursos = [
        "arn:aws:elasticloadbalancing:${local.r}:${local.a}:loadbalancer/app/${local.k}-*/*",
        "arn:aws:elasticloadbalancing:${local.r}:${local.a}:targetgroup/${local.k}-*/*",
        "arn:aws:elasticloadbalancing:${local.r}:${local.a}:listener/app/${local.k}-*/*/*",
        "arn:aws:elasticloadbalancing:${local.r}:${local.a}:listener-rule/app/${local.k}-*/*/*/*",
      ]
      recursos_criar = []
      criar = ["elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:CreateTargetGroup",
      "elasticloadbalancing:CreateListener"]
      alterar = ["elasticloadbalancing:DeleteLoadBalancer", "elasticloadbalancing:ModifyLoadBalancerAttributes",
        "elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets",
        "elasticloadbalancing:DeleteTargetGroup", "elasticloadbalancing:ModifyTargetGroup",
        "elasticloadbalancing:ModifyTargetGroupAttributes", "elasticloadbalancing:DeleteListener",
      "elasticloadbalancing:ModifyListener"]
      etiquetar    = ["elasticloadbalancing:AddTags"]
      desetiquetar = ["elasticloadbalancing:RemoveTags"]
    }
    dynamodb = {
      grupo          = "dados"
      recursos       = ["arn:aws:dynamodb:${local.r}:${local.a}:table/${local.k}-*"]
      recursos_criar = []
      criar          = ["dynamodb:CreateTable"]
      alterar = ["dynamodb:DescribeTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable",
        "dynamodb:DescribeTimeToLive", "dynamodb:UpdateTimeToLive", "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups", "dynamodb:ListTagsOfResource"]
      etiquetar    = ["dynamodb:TagResource"]
      desetiquetar = ["dynamodb:UntagResource"]
    }
    memorydb = {
      grupo = "dados"
      recursos = [
        "arn:aws:memorydb:${local.r}:${local.a}:cluster/${local.pk}-*",
        "arn:aws:memorydb:${local.r}:${local.a}:subnetgroup/${local.pk}-*",
        "arn:aws:memorydb:${local.r}:${local.a}:parametergroup/${local.pk}-*",
      ]
      # O cluster referencia a ACL padrão open-access, que é da conta e não tem tag.
      recursos_criar = ["arn:aws:memorydb:${local.r}:${local.a}:acl/open-access"]
      criar          = ["memorydb:CreateCluster", "memorydb:CreateSubnetGroup", "memorydb:CreateParameterGroup"]
      alterar = ["memorydb:DeleteCluster", "memorydb:UpdateCluster", "memorydb:DeleteSubnetGroup",
        "memorydb:UpdateSubnetGroup", "memorydb:DeleteParameterGroup", "memorydb:UpdateParameterGroup",
      "memorydb:ListTags"]
      etiquetar    = ["memorydb:TagResource"]
      desetiquetar = ["memorydb:UntagResource"]
    }
    glue = {
      grupo          = "catalogo"
      recursos       = ["arn:aws:glue:${local.r}:${local.a}:job/${local.k}-*"]
      recursos_criar = []
      criar          = ["glue:CreateJob"]
      alterar        = ["glue:GetJob", "glue:UpdateJob", "glue:DeleteJob"]
      # Etiquetas do catálogo (banco, tabelas e conexão) ficam no item CatalogoGlueDoProjeto da lista.
      etiquetar    = []
      desetiquetar = []
    }
    athena = {
      grupo          = "catalogo"
      recursos       = ["arn:aws:athena:${local.r}:${local.a}:workgroup/${local.k}-*"]
      recursos_criar = []
      criar          = ["athena:CreateWorkGroup"]
      alterar = ["athena:GetWorkGroup", "athena:UpdateWorkGroup", "athena:DeleteWorkGroup",
        "athena:CreateNamedQuery", "athena:GetNamedQuery", "athena:BatchGetNamedQuery",
      "athena:DeleteNamedQuery", "athena:ListTagsForResource"]
      etiquetar    = ["athena:TagResource"]
      desetiquetar = ["athena:UntagResource"]
    }
    kms = {
      grupo          = "chaves"
      recursos       = ["arn:aws:kms:${local.r}:${local.a}:key/*"]
      recursos_criar = []
      criar          = [] # kms:CreateKey só aceita Resource "*": declaração própria abaixo
      alterar = ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags",
        "kms:PutKeyPolicy", "kms:EnableKeyRotation", "kms:DisableKeyRotation", "kms:UpdateKeyDescription",
        "kms:ScheduleKeyDeletion", "kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias",
      "kms:Decrypt", "kms:GenerateDataKey"]
      etiquetar    = ["kms:TagResource"]
      desetiquetar = ["kms:UntagResource"]
    }
    ecs = {
      grupo = "conteineres"
      recursos = [
        "arn:aws:ecs:${local.r}:${local.a}:cluster/${local.k}-*",
        "arn:aws:ecs:${local.r}:${local.a}:service/${local.k}-*/*",
        "arn:aws:ecs:${local.r}:${local.a}:task-definition/${local.k}-*:*",
      ]
      recursos_criar = []
      criar          = ["ecs:CreateCluster", "ecs:CreateService"]
      alterar = ["ecs:DescribeClusters", "ecs:UpdateCluster", "ecs:UpdateClusterSettings",
        "ecs:PutClusterCapacityProviders", "ecs:DeleteCluster", "ecs:DescribeServices",
      "ecs:UpdateService", "ecs:DeleteService", "ecs:ListTagsForResource"]
      etiquetar    = ["ecs:TagResource"]
      desetiquetar = ["ecs:UntagResource"]
    }
    ecr = {
      grupo          = "conteineres"
      recursos       = ["arn:aws:ecr:${local.r}:${local.a}:repository/${local.k}-*"]
      recursos_criar = []
      criar          = ["ecr:CreateRepository"]
      alterar = ["ecr:DescribeRepositories", "ecr:DeleteRepository", "ecr:PutLifecyclePolicy",
        "ecr:GetLifecyclePolicy", "ecr:DeleteLifecyclePolicy", "ecr:PutImageScanningConfiguration",
        "ecr:PutImageTagMutability", "ecr:GetRepositoryPolicy", "ecr:ListTagsForResource",
        "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages", "ecr:ListImages", "ecr:BatchDeleteImage"]
      etiquetar    = ["ecr:TagResource"]
      desetiquetar = ["ecr:UntagResource"]
    }
    sagemaker = {
      grupo = "ml"
      recursos = [for t in ["model", "endpoint-config", "endpoint"] :
      "arn:aws:sagemaker:${local.r}:${local.a}:${t}/${local.k}-*"]
      recursos_criar = []
      criar          = ["sagemaker:CreateModel", "sagemaker:CreateEndpointConfig", "sagemaker:CreateEndpoint"]
      alterar = ["sagemaker:DescribeModel", "sagemaker:DeleteModel", "sagemaker:DescribeEndpointConfig",
        "sagemaker:DeleteEndpointConfig", "sagemaker:DescribeEndpoint", "sagemaker:UpdateEndpoint",
      "sagemaker:DeleteEndpoint", "sagemaker:ListTags"]
      etiquetar    = ["sagemaker:AddTags"]
      desetiquetar = ["sagemaker:DeleteTags"]
    }
    airflow = {
      grupo          = "ml"
      recursos       = ["arn:aws:airflow:${local.r}:${local.a}:environment/${local.pk}-*"]
      recursos_criar = []
      criar          = ["airflow:CreateEnvironment"]
      alterar        = ["airflow:GetEnvironment", "airflow:UpdateEnvironment", "airflow:DeleteEnvironment", "airflow:ListTagsForResource"]
      etiquetar      = ["airflow:TagResource"]
      desetiquetar   = ["airflow:UntagResource"]
    }
    bedrock = {
      grupo = "ml"
      # Guardrail e perfil de inferência do produto (módulo registro-produto da plataforma, T053).
      recursos = [
        "arn:aws:bedrock:${local.r}:${local.a}:guardrail/*",
        "arn:aws:bedrock:${local.r}:${local.a}:application-inference-profile/*",
      ]
      # Origens que a criação referencia: perfis e modelos de sistema, e o perfil de guardrail entre
      # regiões. São da AWS e não têm a tag do projeto (formato a conferir na T053).
      recursos_criar = [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:${local.a}:inference-profile/*",
        "arn:aws:bedrock:*:*:guardrail-profile/*",
      ]
      criar = ["bedrock:CreateGuardrail", "bedrock:CreateInferenceProfile"]
      alterar = ["bedrock:GetGuardrail", "bedrock:UpdateGuardrail", "bedrock:DeleteGuardrail",
        "bedrock:CreateGuardrailVersion", "bedrock:GetInferenceProfile", "bedrock:DeleteInferenceProfile",
      "bedrock:ListTagsForResource"]
      etiquetar    = ["bedrock:TagResource"]
      desetiquetar = ["bedrock:UntagResource"]
    }
    logs = {
      grupo = "observabilidade"
      recursos = [
        "arn:aws:logs:${local.r}:${local.a}:log-group:${local.k}-*",
        "arn:aws:logs:${local.r}:${local.a}:log-group:/aws/sagemaker/Endpoints/${local.k}-*",
        "arn:aws:logs:${local.r}:${local.a}:log-group:airflow-${local.pk}-*",
      ]
      recursos_criar = []
      criar          = ["logs:CreateLogGroup"]
      alterar = ["logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:AssociateKmsKey", "logs:DisassociateKmsKey", "logs:ListTagsForResource", "logs:ListTagsLogGroup"]
      etiquetar    = ["logs:TagResource", "logs:TagLogGroup"]
      desetiquetar = ["logs:UntagResource", "logs:UntagLogGroup"]
    }
    cloudwatch = {
      grupo          = "observabilidade"
      recursos       = ["arn:aws:cloudwatch:${local.r}:${local.a}:alarm:${local.k}-*"]
      recursos_criar = []
      criar          = ["cloudwatch:PutMetricAlarm"]
      alterar        = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:ListTagsForResource"]
      etiquetar      = ["cloudwatch:TagResource"]
      desetiquetar   = ["cloudwatch:UntagResource"]
    }
    sns = {
      grupo          = "observabilidade"
      recursos       = ["arn:aws:sns:${local.r}:${local.a}:${local.k}-*"]
      recursos_criar = []
      criar          = ["sns:CreateTopic"]
      alterar = ["sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:DeleteTopic", "sns:Subscribe",
      "sns:ListTagsForResource"]
      etiquetar    = ["sns:TagResource"]
      desetiquetar = ["sns:UntagResource"]
    }
    ssm = {
      grupo = "identidade"
      # Parâmetro do produto no contrato da plataforma, criado pelo módulo registro-produto no state do produto.
      recursos       = ["arn:aws:ssm:${local.r}:${local.a}:parameter/00-plataforma-agentes/contrato/v1/produtos/${local.k}"]
      recursos_criar = []
      criar          = ["ssm:PutParameter"]
      alterar        = ["ssm:PutParameter", "ssm:GetParameter", "ssm:DeleteParameter", "ssm:ListTagsForResource"]
      etiquetar      = ["ssm:AddTagsToResource"]
      desetiquetar   = ["ssm:RemoveTagsFromResource"]
    }
    iam = {
      grupo = "identidade"
      recursos = [
        "arn:aws:iam::${local.a}:role/${local.k}-*",
        "arn:aws:iam::${local.a}:policy/${local.k}-*",
      ]
      recursos_criar = []
      criar          = ["iam:CreateRole", "iam:CreatePolicy"]
      # AttachRolePolicy fica fora: declaração própria com iam:PolicyARN.
      alterar = ["iam:GetRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy",
        "iam:DeleteRole", "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
        "iam:DetachRolePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:DeletePolicy"]
      etiquetar    = ["iam:TagRole", "iam:TagPolicy"]
      desetiquetar = ["iam:UntagRole", "iam:UntagPolicy"]
    }
  }

  usados = { for s in var.servicos : s => local.catalogo[s] }

  regex_leitura = "^[a-z0-9-]+:(Describe|Get|List|BatchGet)"

  # Grupo armazenamento: o state da chave e os buckets do projeto (S3). As leituras Describe/List de
  # vários serviços vão para observabilidade, para a política de rede caber no limite de 6.144.
  # ---- Lista nomeada, com os marcadores trocados (mesma ordem do auxiliar do teste) ----
  # A chave KMS do state só é conhecida depois do apply da conta: o marcador dela é trocado depois do
  # jsondecode, item a item, para a estrutura (ids e grupos) ficar conhecida já no plan.
  lista_renderizada = replace(replace(replace(replace(replace(var.lista_sem_tag,
    "{conta}", var.conta),
    "{regiao}", var.regiao),
    "{chave_glue}", replace(var.chave, "-", "_")),
    "{bucket_state}", var.state_bucket),
  "{chave}", var.chave)
  excecoes = { for e in jsondecode(local.lista_renderizada).excecoes : e.id => merge(e, {
    recursos = [for x in e.recursos : x == "{chave_kms_state}" ? var.state_kms_key_arn : x]
  }) }

  grupo_por_servico = merge(
    { for s, c in local.catalogo : s => c.grupo },
    { s3 = "armazenamento", lakeformation = "catalogo", budgets = "observabilidade", ce = "observabilidade", tag = "observabilidade", xray = "observabilidade" },
  )
  grupo_da_excecao = { for id, e in local.excecoes : id => (
    startswith(id, "Estado") ? "armazenamento" : startswith(id, "Leitura") ? "observabilidade" : lookup(local.grupo_por_servico, split(":", e.acoes[0])[0], "observabilidade")
  ) }

  declaracao_da_excecao = { for id, e in local.excecoes : id => merge(
    { Sid = id, Effect = "Allow", Action = e.acoes, Resource = e.recursos },
    try(e.condicao, null) == null ? {} : { Condition = e.condicao },
  ) }

  arn_deploy = "arn:aws:iam::${var.conta}:role/${var.chave}-deploy"
  arn_plan   = "arn:aws:iam::${var.conta}:role/${var.chave}-plan"

  # ---- Role de deploy ----
  declaracoes_deploy_por_grupo = {
    for g in distinct(concat([for s, c in local.usados : c.grupo], values(local.grupo_da_excecao), ["chaves", "conteineres", "identidade", "armazenamento"])) : g => concat(
      flatten([for s, c in local.usados : c.grupo != g || length(c.criar) == 0 ? [] : [{
        Sid      = "Criar${title(s)}", Effect = "Allow", Action = c.criar,
        Resource = concat(c.recursos, c.recursos_criar), Condition = local.tag_criar
      }]]),
      flatten([for s, c in local.usados : c.grupo != g || length(c.alterar) == 0 ? [] : [{
        Sid       = "Alterar${title(s)}", Effect = "Allow", Action = c.alterar, Resource = c.recursos,
        Condition = local.tag_recurso
      }]]),
      # Tag na criação no EC2: só dentro de uma ação de criação (ec2:CreateAction, o padrão da AWS para
      # tag na criação). Com o Null, a deploy adotaria um recurso existente sem tag (a VPC padrão, por
      # exemplo), porque os ARNs do EC2 não levam o nome, e depois o alteraria pelo ABAC (M1 da revisão).
      g != "rede" || !contains(var.servicos, "ec2") ? [] : [{
        Sid      = "EtiquetarNaCriacaoEc2", Effect = "Allow"
        Action   = local.catalogo.ec2.etiquetar
        Resource = local.catalogo.ec2.recursos
        Condition = {
          StringEquals = {
            "aws:RequestTag/project" = var.chave
            "ec2:CreateAction"       = local.catalogo.ec2.criar
          }
        }
      }],
      # Nos outros serviços: só em recurso que ainda não tem a tag project. Onde o ARN leva o prefixo da
      # chave, adotar um recurso sem tag é adotar um recurso do próprio projeto; na chave KMS (key/*) e
      # no guardrail do Bedrock (guardrail/*) o ARN não tem nome, e o risco residual está no ADR-0015.
      length(flatten([for s, c in local.usados : c.etiquetar if c.grupo == g && s != "ec2"])) == 0 ? [] : [{
        Sid      = "EtiquetarNaCriacao${title(g)}", Effect = "Allow"
        Action   = flatten([for s, c in local.usados : c.etiquetar if c.grupo == g && s != "ec2"])
        Resource = flatten([for s, c in local.usados : c.recursos if c.grupo == g && s != "ec2"])
        Condition = {
          StringEquals = { "aws:RequestTag/project" = var.chave }
          Null         = { "aws:ResourceTag/project" = "true" }
        }
      }],
      # Tag depois: só em recurso do projeto, sem mexer na chave project.
      length(flatten([for s, c in local.usados : concat(c.etiquetar, c.desetiquetar) if c.grupo == g])) == 0 ? [] : [{
        Sid      = "EtiquetarRecurso${title(g)}", Effect = "Allow"
        Action   = flatten([for s, c in local.usados : concat(c.etiquetar, c.desetiquetar) if c.grupo == g])
        Resource = flatten([for s, c in local.usados : c.recursos if c.grupo == g])
        Condition = {
          StringEquals                   = { "aws:ResourceTag/project" = var.chave }
          "ForAllValues:StringNotEquals" = { "aws:TagKeys" = ["project"] }
        }
      }],
      g != "chaves" || !contains(var.servicos, "kms") ? [] : [
        # kms:CreateKey só aceita Resource "*"; a condição de tag limita.
        { Sid = "CriarChaveKms", Effect = "Allow", Action = ["kms:CreateKey"], Resource = ["*"], Condition = local.tag_criar },
        # DynamoDB, MemoryDB e SageMaker criam grants em nome de quem cria o recurso.
        {
          Sid       = "AlterarGrantKmsDoProjeto", Effect = "Allow", Action = ["kms:CreateGrant"],
          Resource  = ["arn:aws:kms:${local.r}:${local.a}:key/*"],
          Condition = merge(local.tag_recurso, { Bool = { "kms:GrantIsForAWSResource" = "true" } })
        },
      ],
      g != "conteineres" || !contains(var.servicos, "ecs") ? [] : [
        # RegisterTaskDefinition e DeregisterTaskDefinition: recurso "*" na referência (conferir),
        # limitados pela tag.
        { Sid = "CriarTaskDefinitionEcs", Effect = "Allow", Action = ["ecs:RegisterTaskDefinition"], Resource = ["*"], Condition = local.tag_criar },
        { Sid = "RemoverTaskDefinitionEcs", Effect = "Allow", Action = ["ecs:DeregisterTaskDefinition", "ecs:DeleteTaskDefinitions"], Resource = ["*"], Condition = local.tag_recurso },
        # F3: o roteiro roda como tarefa ECS no task definition do projeto, no cluster do projeto.
        {
          Sid       = "ExecutarRoteiroEcs", Effect = "Allow", Action = ["ecs:RunTask"],
          Resource  = ["arn:aws:ecs:${local.r}:${local.a}:task-definition/${local.k}-*:*"],
          Condition = merge(local.tag_recurso, { ArnLike = { "ecs:cluster" = "arn:aws:ecs:${local.r}:${local.a}:cluster/${local.k}-*" } })
        },
      ],
      g != "identidade" || !contains(var.servicos, "iam") ? [] : [
        # Só políticas do projeto; nunca uma gerenciada da AWS (AdministratorAccess).
        {
          Sid       = "AlterarIamAnexarPolitica", Effect = "Allow", Action = ["iam:AttachRolePolicy"],
          Resource  = ["arn:aws:iam::${local.a}:role/${local.k}-*"],
          Condition = merge(local.tag_recurso, { ArnLike = { "iam:PolicyARN" = "arn:aws:iam::${local.a}:policy/${local.k}-*" } })
        },
      ],
      g != "armazenamento" ? [] : [
        # As próprias roles de identidade casam com o prefixo da chave: Deny explícito.
        { Sid = "NegaAlterarIdentidadeDoProjeto", Effect = "Deny", Action = ["iam:*"], Resource = [local.arn_deploy, local.arn_plan] },
      ],
      [for id, e in local.excecoes : local.declaracao_da_excecao[id] if contains(e.roles, "deploy") && local.grupo_da_excecao[id] == g],
    )
  }
  declaracoes_deploy_extras = length(var.declaracoes_extras_deploy) == 0 ? {} : { extras = var.declaracoes_extras_deploy }
  declaracoes_deploy        = merge(local.declaracoes_deploy_por_grupo, local.declaracoes_deploy_extras)
  politicas_deploy          = { for g, ds in local.declaracoes_deploy : g => jsonencode({ Version = "2012-10-17", Statement = ds }) if length(ds) > 0 }

  # ---- Role de plan: só leitura e o state da chave ----
  declaracoes_plan_por_grupo = {
    for g in distinct(concat([for s, c in local.usados : c.grupo], values(local.grupo_da_excecao))) : g => concat(
      flatten([for s, c in local.usados : c.grupo != g || length([for x in c.alterar : x if can(regex(local.regex_leitura, x))]) == 0 ? [] : [{
        Sid       = "Ler${title(s)}", Effect = "Allow",
        Action    = [for x in c.alterar : x if can(regex(local.regex_leitura, x))],
        Resource  = c.recursos,
        Condition = local.tag_recurso
      }]]),
      [for id, e in local.excecoes : local.declaracao_da_excecao[id] if contains(e.roles, "plan") && local.grupo_da_excecao[id] == g],
    )
  }
  politicas_plan = { for g, ds in local.declaracoes_plan_por_grupo : g => jsonencode({ Version = "2012-10-17", Statement = ds }) if length(ds) > 0 }

  # ---- Gate: as mesmas regras do TT-I01, avaliadas no plan ----
  tem_tag = { for papel, ds in {
    deploy = flatten(values(local.declaracoes_deploy))
    plan   = flatten(values(local.declaracoes_plan_por_grupo))
    } : papel => alltrue([for s in ds : (
      !(contains(flatten([s.Action]), "*") && contains(flatten([s.Resource]), "*")) &&
      (s.Effect == "Deny" || (
        alltrue([for x in flatten([s.Action]) : x != "*" && !endswith(x, ":*")]) && (
          try(s.Condition.StringEquals["aws:RequestTag/project"], "") == var.chave ||
          try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == var.chave ||
          (
            contains(keys(local.excecoes), try(s.Sid, "")) &&
            contains(try(local.excecoes[s.Sid].roles, []), papel) &&
            toset(try(local.excecoes[s.Sid].acoes, [])) == toset(flatten([s.Action])) &&
            toset(try(local.excecoes[s.Sid].recursos, [])) == toset(flatten([s.Resource])) &&
            jsonencode(try(local.excecoes[s.Sid].condicao, null)) == jsonencode(try(s.Condition, null))
          )
        )
      ))
  )]) }

  # Gate das etiquetas (M1): toda declaração com ação de tag, fora da lista, está numa das três formas;
  # o ec2:CreateTags só aparece com ec2:CreateAction.
  regex_tag = ":(TagResource|UntagResource|CreateTags|DeleteTags|AddTags|RemoveTags|AddTagsToResource|RemoveTagsFromResource|Tag[A-Z][A-Za-z]*|Untag[A-Z][A-Za-z]*)$"
  etiquetas_ok = alltrue([for s in flatten(values(local.declaracoes_deploy)) : (
    s.Effect == "Deny" ||
    contains(keys(local.excecoes), try(s.Sid, "")) ||
    !anytrue([for x in flatten([s.Action]) : can(regex(local.regex_tag, x))]) ||
    (
      try(s.Condition.StringEquals["aws:ResourceTag/project"], "") == var.chave &&
      contains(flatten([try(s.Condition["ForAllValues:StringNotEquals"]["aws:TagKeys"], [])]), "project")
    ) ||
    (
      try(s.Condition.StringEquals["aws:RequestTag/project"], "") == var.chave &&
      length(flatten([try(s.Condition.StringEquals["ec2:CreateAction"], [])])) > 0 &&
      alltrue([for x in flatten([s.Action]) : x == "ec2:CreateTags"])
    ) ||
    (
      try(s.Condition.StringEquals["aws:RequestTag/project"], "") == var.chave &&
      try(s.Condition.Null["aws:ResourceTag/project"], "") == "true" &&
      !contains(flatten([s.Action]), "ec2:CreateTags")
    )
  )])

  confianca = { for papel, subs in {
    deploy = [for amb in var.ambientes_deploy : "repo:${var.repositorio}:environment:${amb}"]
    plan   = "repo:${var.repositorio}:pull_request"
    } : papel => jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect    = "Allow"
        Principal = { Federated = var.oidc_provider_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = subs
          }
        }
      }]
  }) }
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.chave}-deploy"
  description          = "${var.chave}: apply e destroy pelo GitHub Actions (aws-lab e aws-lab-destroy), com ABAC (ADR-0015)"
  assume_role_policy   = local.confianca.deploy
  max_session_duration = 3600
  tags                 = var.tags

  lifecycle {
    precondition {
      condition     = local.tem_tag.deploy
      error_message = "Toda declaração Allow da deploy precisa de aws:RequestTag/project ou aws:ResourceTag/project = ${var.chave}, ou ser um item da lista nomeada com as mesmas ações, recursos e condição; e nenhuma pode ter ação * com recurso * nem svc:*."
    }
    precondition {
      condition     = local.etiquetas_ok
      error_message = "Tag na criação: no EC2, ec2:CreateTags só com aws:RequestTag/project e ec2:CreateAction; nos outros serviços, com aws:RequestTag/project e Null aws:ResourceTag/project. Tag depois: aws:ResourceTag/project e sem a chave project em aws:TagKeys."
    }
    precondition {
      condition     = alltrue([for p in values(local.politicas_deploy) : length(p) <= 6144]) && length(local.politicas_deploy) <= 10
      error_message = "Cada política gerenciada da deploy cabe em 6.144 caracteres, e a role tem no máximo 10."
    }
  }
}

resource "aws_iam_role" "plan" {
  name                 = "${var.chave}-plan"
  description          = "${var.chave}: plan comentado no PR, só leitura e o state da chave (ADR-0015)"
  assume_role_policy   = local.confianca.plan
  max_session_duration = 3600
  tags                 = var.tags

  lifecycle {
    precondition {
      condition     = local.tem_tag.plan
      error_message = "Toda declaração Allow da plan precisa de aws:ResourceTag/project = ${var.chave} ou ser um item da lista nomeada para a plan."
    }
    precondition {
      condition     = alltrue([for p in values(local.politicas_plan) : length(p) <= 6144]) && length(local.politicas_plan) <= 10
      error_message = "Cada política gerenciada da plan cabe em 6.144 caracteres, e a role tem no máximo 10."
    }
  }
}

# Nomes 00-conta-*: o AttachRolePolicy do projeto aceita policy/<chave>-* e não pode anexar estas.
resource "aws_iam_policy" "deploy" {
  for_each    = local.politicas_deploy
  name        = "00-conta-${var.chave}-deploy-${each.key}"
  description = "${var.chave}: permissões de deploy (${each.key}), ABAC pela tag project"
  policy      = each.value
  tags        = var.tags
}

resource "aws_iam_role_policy_attachment" "deploy" {
  for_each   = aws_iam_policy.deploy
  role       = aws_iam_role.deploy.name
  policy_arn = each.value.arn
}

resource "aws_iam_policy" "plan" {
  for_each    = local.politicas_plan
  name        = "00-conta-${var.chave}-plan-${each.key}"
  description = "${var.chave}: leitura para o plan do PR (${each.key})"
  policy      = each.value
  tags        = var.tags
}

resource "aws_iam_role_policy_attachment" "plan" {
  for_each   = aws_iam_policy.plan
  role       = aws_iam_role.plan.name
  policy_arn = each.value.arn
}
