variable "tags" {
  description = "Tags obrigatórias do projeto (project, module, managed-by)."
  type        = map(string)
  validation {
    condition     = alltrue([for k in ["project", "module", "managed-by"] : contains(keys(var.tags), k)])
    error_message = "As tags project, module e managed-by são obrigatórias (regra R4)."
  }
}
