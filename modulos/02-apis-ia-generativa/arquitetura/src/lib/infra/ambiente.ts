// Leitura das variáveis de ambiente das Lambdas, com erro claro quando falta alguma.
export function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return v;
}

/** RELOGIO_FIXO: só no lab com respostas gravadas, para as datas das fixtures valerem. */
export function relogio(): () => Date {
  const fixo = process.env.RELOGIO_FIXO;
  return fixo ? () => new Date(fixo) : () => new Date();
}

export function log(nivel: "INFO" | "WARN" | "ERROR", mensagem: string, dados: Record<string, unknown> = {}) {
  // Sem texto do paciente nos logs: só ids e eventos.
  console.log(JSON.stringify({ nivel, mensagem, ...dados }));
}
