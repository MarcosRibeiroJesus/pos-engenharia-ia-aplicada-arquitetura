// Dublês das portas de infraestrutura, com a mesma semântica dos serviços AWS.
import type { FluxoAprovacao, Notificador } from "../../lib/dominio/operacoes.js";
import type { Executor } from "../../lib/executor/executor.js";

/** Simula o Step Functions: guarda o token e, na decisão, roda Choice → Executar/Rejeitar. */
export class FluxoAprovacaoMemoria implements FluxoAprovacao {
  readonly execucoes: string[] = [];
  private readonly tokens = new Map<string, { acao: Record<string, unknown> }>();
  constructor(private readonly executor: Executor) {}

  async iniciar(acaoId: string, acao: Record<string, unknown>) {
    if (this.execucoes.includes(acaoId)) return; // nome de execução é único, como no SFN
    this.execucoes.push(acaoId);
    const token = `token-${acaoId}`;
    this.tokens.set(token, { acao });
    await this.executor.registrarPendencia({ acao: acao as never, token });
  }

  async concluirTarefa(token: string, saida: { aprovado: boolean; aprovadorId: string; motivo?: string }) {
    const t = this.tokens.get(token);
    if (!t) throw new Error("TaskDoesNotExist");
    this.tokens.delete(token);
    if (saida.aprovado === true) await this.executor.cancelar({ acao: t.acao as never, decisao: saida });
    else await this.executor.rejeitar({ acao: t.acao as never, decisao: saida });
  }
}

export class NotificadorMemoria implements Notificador {
  readonly avisos: unknown[] = [];
  async avisar(m: Record<string, unknown>) {
    this.avisos.push(m);
  }
}
