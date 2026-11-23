output "api_url" {
  value = module.api.url
}

output "api_key_id" {
  description = "Id da chave do canal. Valor: aws apigateway get-api-key --api-key <id> --include-value."
  value       = module.api.api_key_id
}

output "tabelas" {
  value = {
    agenda    = module.tabela_agenda.nome
    memoria   = module.tabela_memoria.nome
    gateway   = module.tabela_gateway.nome
    operacoes = module.tabela_operacoes.nome
  }
}

output "bucket_anexos" {
  value = module.anexos.nome
}

output "funcoes" {
  value = {
    gateway      = module.gateway.nome
    orquestrador = module.orquestrador.nome
    executor     = module.executor.nome
  }
}

output "state_machine_arn" {
  value = module.aprovacao.arn
}

output "topico_aprovacoes_arn" {
  value = aws_sns_topic.aprovacoes.arn
}

output "topico_alertas_arn" {
  value = module.monitoramento.topico_alertas_arn
}

output "politicas" {
  description = "Políticas efetivas por função (os testes conferem o menor privilégio entre elas)."
  value = {
    gateway      = module.gateway.politica
    orquestrador = module.orquestrador.politica
    executor     = module.executor.politica
  }
}

output "tags" {
  value = local.tags
}

output "waf_habilitado" {
  value = length(module.waf) > 0
}
