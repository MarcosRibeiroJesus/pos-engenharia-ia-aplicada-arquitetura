# Rede privada por padrão (R1) e saída das tasks por endpoints de interface (ADR-0002).
data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  #checkov:skip=CKV_AWS_394:As AZs são escolhidas por índice no apply e ficam no state; mudar a lista não move recursos existentes
  state = "available"
}

locals {
  name   = "${var.project_name}-${var.environment}"
  region = data.aws_region.current.region
  azs    = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # MWAA privado precisa de SQS (Celery) e dos endpoints do próprio Airflow.
  mwaa_endpoint_services = ["sqs", "airflow.api", "airflow.env", "airflow.ops"]
  interface_services = var.enable_interface_endpoints ? toset(concat(
    var.interface_endpoint_services,
    var.enable_mwaa ? local.mwaa_endpoint_services : []
  )) : toset([])
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${local.name}-vpc"
  }
}

# R1: o security group padrão fica sem regras, para nada usá-lo por acidente.
resource "aws_default_security_group" "default" {
  vpc_id  = aws_vpc.main.id
  ingress = []
  egress  = []
}

# ---------------------------------------------------------------- subnets
resource "aws_subnet" "private" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name = "${local.name}-private-${count.index + 1}"
    Tier = "private"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Subnets públicas só existem com opt-in explícito (API pública com HTTPS).
resource "aws_internet_gateway" "gw" {
  count  = var.expose_api_publicly ? 1 : 0
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name}-igw"
  }
}

resource "aws_subnet" "public" {
  count                   = var.expose_api_publicly ? var.az_count : 0
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false # só o ALB vive aqui e recebe IP pelo próprio serviço

  tags = {
    Name = "${local.name}-public-${count.index + 1}"
    Tier = "public"
  }
}

resource "aws_route_table" "public" {
  count  = var.expose_api_publicly ? 1 : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw[0].id
  }

  tags = {
    Name = "${local.name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = var.expose_api_publicly ? var.az_count : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# ---------------------------------------------------------------- endpoints
# Gateway: S3 (camadas do ECR, golden dataset) e DynamoDB. Sem custo por hora.
resource "aws_vpc_endpoint" "gateway" {
  for_each          = toset(["s3", "dynamodb"])
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${local.region}.${each.key}"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name = "${local.name}-${each.key}-gw-endpoint"
  }
}

# Interface: US$ 0,01/h por endpoint por AZ. No lab, 1 AZ (ADR-0002).
resource "aws_vpc_endpoint" "interface" {
  for_each            = local.interface_services
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${local.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = slice(aws_subnet.private[*].id, 0, var.interface_endpoint_az_count)
  security_group_ids  = [aws_security_group.endpoints.id]

  tags = {
    Name = "${local.name}-${each.key}-endpoint"
  }
}

# ---------------------------------------------------------------- security groups
resource "aws_security_group" "alb" {
  #checkov:skip=CKV2_AWS_5:Anexado ao ALB no módulo ecs_service (falso positivo entre módulos)
  name        = "${local.name}-alb-sg"
  description = "Entrada HTTPS/HTTP no ALB e saida so para as tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "API: VPC por padrao; internet so com opt-in e HTTPS"
    from_port   = var.expose_api_publicly ? 443 : 80
    to_port     = var.expose_api_publicly ? 443 : 80
    protocol    = "tcp"
    cidr_blocks = var.expose_api_publicly ? var.public_ingress_cidrs : [var.vpc_cidr]
  }

  egress {
    description = "Para as tasks ECS"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name = "${local.name}-alb-sg"
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs-sg"
  description = "Tasks ECS: entrada so do ALB; saida so para a VPC e endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Do ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "HTTPS para endpoints de interface na VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description     = "HTTPS para S3 e DynamoDB via endpoint de gateway"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [for e in aws_vpc_endpoint.gateway : e.prefix_list_id]
  }

  egress {
    description = "MemoryDB (TLS)"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name = "${local.name}-ecs-sg"
  }
}

resource "aws_security_group" "endpoints" {
  name        = "${local.name}-endpoints-sg"
  description = "Endpoints de interface: HTTPS a partir da VPC"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS da VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name = "${local.name}-endpoints-sg"
  }
}

resource "aws_security_group" "internal" {
  #checkov:skip=CKV2_AWS_5:Anexado ao MemoryDB no módulo memorydb_cluster (falso positivo entre módulos)
  name        = "${local.name}-internal-sg"
  description = "MemoryDB: entrada so das tasks ECS, sem saida"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MemoryDB a partir do ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = {
    Name = "${local.name}-internal-sg"
  }
}

# ---------------------------------------------------------------- flow logs (R6)
resource "aws_cloudwatch_log_group" "flow_logs" {
  #checkov:skip=CKV_AWS_338:Lab retém 14 dias; retenção longa custa armazenamento sem uso (README, FinOps)
  count             = var.enable_flow_logs ? 1 : 0
  name              = "/vpc/${local.name}/flow-logs"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

data "aws_iam_policy_document" "flow_logs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flow_logs" {
  count              = var.enable_flow_logs ? 1 : 0
  name               = "${local.name}-flow-logs-role"
  assume_role_policy = data.aws_iam_policy_document.flow_logs_assume.json
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "write-flow-logs"
  role  = aws_iam_role.flow_logs[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow_logs[0].arn}:*"
    }]
  })
}

resource "aws_flow_log" "vpc" {
  count                = var.enable_flow_logs ? 1 : 0
  vpc_id               = aws_vpc.main.id
  traffic_type         = "REJECT" # o lab só precisa ver o que foi bloqueado; ALL custa mais ingestão
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow_logs[0].arn
  iam_role_arn         = aws_iam_role.flow_logs[0].arn
}
