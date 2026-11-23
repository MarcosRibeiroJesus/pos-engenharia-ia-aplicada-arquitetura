# Verificador do custo fixo da base (TT-K02, RNF-002, Art. V, ADR-0002, ADR-0007, ADR-0013), usado só
# pelo tests/custo_fixo.tftest.hcl. Recebe o output custo_fixo_da_base do root e reprova (validação da
# variável) o que a tabela "Custo do lab" do plano não prevê: endpoint de interface fora dos 5 da base
# ou em mais de 1 AZ, NAT Gateway, MWAA, snapshot do MemoryDB e mais de 1 ALB, 1 nó ou 1 task.
# A mesma regra roda sobre o root real e sobre as fixtures sintéticas que precisam reprovar.
terraform {
  required_version = ">= 1.10.0"
}

locals {
  # Saída das tasks (ADR-0002) sem o monitoring, porque as métricas vão por EMF no endpoint logs (ADR-0013).
  endpoints_da_base = toset(["ecr.api", "ecr.dkr", "logs", "sagemaker.runtime", "bedrock-runtime"])
}

variable "base" {
  description = "Recursos cobrados por hora da base, como o output custo_fixo_da_base do root."
  type = object({
    contagem_por_tipo                 = map(number)
    endpoints_de_interface            = map(number)
    endpoints_de_gateway              = set(string)
    memorydb_nos                      = number
    memorydb_snapshot_retention_limit = number
    ecs_tarefas                       = number
  })

  validation {
    condition     = toset(keys(var.base.endpoints_de_interface)) == local.endpoints_da_base
    error_message = "A base tem exatamente os endpoints de interface ecr.api, ecr.dkr, logs, sagemaker.runtime e bedrock-runtime; monitoring e os do MWAA ficam só na janela (ADR-0013, ADR-0007). Recebido: ${jsonencode(keys(var.base.endpoints_de_interface))}."
  }
  validation {
    condition     = alltrue([for s, azs in var.base.endpoints_de_interface : azs == 1])
    error_message = "No lab, cada endpoint de interface fica em 1 AZ (ADR-0002): ${jsonencode(var.base.endpoints_de_interface)}."
  }
  validation {
    condition     = var.base.endpoints_de_gateway == toset(["s3", "dynamodb"])
    error_message = "S3 e DynamoDB saem por endpoint de gateway, sem custo por hora (ADR-0002)."
  }
  validation {
    condition     = lookup(var.base.contagem_por_tipo, "aws_nat_gateway", 0) == 0
    error_message = "Nenhum NAT Gateway na base: a saída é por endpoints (ADR-0002)."
  }
  validation {
    condition     = lookup(var.base.contagem_por_tipo, "aws_mwaa_environment", 0) == 0
    error_message = "Nenhum MWAA na base: o ambiente vive só na raiz da janela, com prazo próprio (ADR-0007, D-052)."
  }
  validation {
    condition     = var.base.memorydb_snapshot_retention_limit == 0
    error_message = "MemoryDB sem snapshot automático no lab: os vetores vêm do lote e o snapshot cobraria depois do destroy (Art. V)."
  }
  validation {
    condition = (lookup(var.base.contagem_por_tipo, "aws_lb", 0) == 1
      && lookup(var.base.contagem_por_tipo, "aws_memorydb_cluster", 0) == 1
      && var.base.memorydb_nos == 1
    && var.base.ecs_tarefas == 1)
    error_message = "Custo fixo da tabela do plano: 1 ALB, 1 cluster do MemoryDB com 1 nó e 1 task (RNF-002)."
  }
}

output "total_de_endpoints_de_interface" {
  description = "Quantidade de endpoints de interface verificados (a regra precisa ter o que checar)."
  value       = length(var.base.endpoints_de_interface)
}
