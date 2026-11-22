terraform {
  # 1.10 é a primeira versão com lock nativo do S3 (use_lockfile).
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # 6.50.0 é a primeira versão com aws_bedrockagentcore_policy e com
      # policy_engine_configuration no aws_bedrockagentcore_gateway; o terraform init
      # confirmou nela o gateway, o gateway_target, a policy, o policy_engine e o
      # aws_bedrock_guardrail com tier_config e cross_region_config (plano, seção Provider).
      version = "~> 6.50"
    }
  }

  # State remoto com lock (Art. VI, TH-08). Backend parcial: bucket, key e região vêm no init,
  # por -backend-config, para nenhuma conta nem bucket entrar no repositório.
  backend "s3" {
    use_lockfile = true
  }
}
