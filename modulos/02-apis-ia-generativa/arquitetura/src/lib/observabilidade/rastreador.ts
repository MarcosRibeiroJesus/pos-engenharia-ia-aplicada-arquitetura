// Observabilidade de LLM (ADR-0008). Contrato neutro com três implementações:
// - Nulo: padrão na AWS, onde ficam CloudWatch (EMF), X-Ray e o ledger de custo.
// - Memória: testes.
// - Langfuse: só no laboratório local (Docker Compose), como na aula. Na AWS o Langfuse
//   teria custo fixo (vários serviços sempre ligados) e ficou só como desenho no ADR.

export interface Turno {
  traceId: string;
  usuarioId: string;
  sessaoId: string;
  entrada: string;
  saida: string;
  eventos: string[];
  inicio: string;
  fim: string;
}

export interface Geracao {
  traceId: string;
  nome: string;
  modelo: string;
  entrada: unknown;
  saida: unknown;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  inicio: string;
  fim: string;
  erro?: string;
  metadados?: Record<string, unknown>;
}

export interface Nota {
  traceId: string;
  nome: string;
  valor: number;
  comentario?: string;
}

export interface Rastreador {
  turno(t: Turno): void;
  geracao(g: Geracao): void;
  nota(n: Nota): void;
  descarregar(): Promise<void>;
}

export class RastreadorNulo implements Rastreador {
  turno() {}
  geracao() {}
  nota() {}
  async descarregar() {}
}

export class RastreadorMemoria implements Rastreador {
  readonly turnos: Turno[] = [];
  readonly geracoes: Geracao[] = [];
  readonly notas: Nota[] = [];
  turno(t: Turno) {
    this.turnos.push(t);
  }
  geracao(g: Geracao) {
    this.geracoes.push(g);
  }
  nota(n: Nota) {
    this.notas.push(n);
  }
  async descarregar() {}
}

export interface OpcoesLangfuse {
  host: string;
  chavePublica: string;
  chaveSecreta: string;
  fetch?: typeof fetch;
  /** Mascara o texto do paciente antes de enviar (padrão: true). */
  mascarar?: boolean;
}

type Evento = { id: string; timestamp: string; type: "trace-create" | "generation-create" | "score-create"; body: Record<string, unknown> };

let seq = 0;
const idEvento = () => `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Envia em lote para a API pública de ingestão do Langfuse (/api/public/ingestion). */
export class RastreadorLangfuse implements Rastreador {
  private fila: Evento[] = [];
  private readonly f: typeof fetch;
  private readonly mascarar: boolean;

  constructor(private readonly o: OpcoesLangfuse) {
    this.f = o.fetch ?? fetch;
    this.mascarar = o.mascarar ?? true;
  }

  private texto(t: string) {
    return this.mascarar ? `[${t.length} caracteres]` : t;
  }

  turno(t: Turno) {
    this.fila.push({
      id: idEvento(),
      timestamp: t.fim,
      type: "trace-create",
      body: {
        id: t.traceId,
        name: "turno",
        userId: t.usuarioId,
        sessionId: t.sessaoId,
        input: this.texto(t.entrada),
        output: t.saida,
        timestamp: t.inicio,
        metadata: { eventos: t.eventos },
        tags: ["assistente-agendamento"],
      },
    });
  }

  geracao(g: Geracao) {
    this.fila.push({
      id: idEvento(),
      timestamp: g.fim,
      type: "generation-create",
      body: {
        id: `${g.traceId}-${g.nome}-${seq}`,
        traceId: g.traceId,
        name: g.nome,
        model: g.modelo,
        startTime: g.inicio,
        endTime: g.fim,
        input: this.mascarar ? "[mascarado]" : g.entrada,
        output: g.saida,
        usage: { input: g.tokensEntrada, output: g.tokensSaida, unit: "TOKENS" },
        costDetails: { total: g.custoUsd },
        level: g.erro ? "ERROR" : "DEFAULT",
        ...(g.erro ? { statusMessage: g.erro } : {}),
        metadata: g.metadados ?? {},
      },
    });
  }

  nota(n: Nota) {
    this.fila.push({
      id: idEvento(),
      timestamp: new Date().toISOString(),
      type: "score-create",
      body: { id: idEvento(), traceId: n.traceId, name: n.nome, value: n.valor, ...(n.comentario ? { comment: n.comentario } : {}) },
    });
  }

  async descarregar() {
    if (!this.fila.length) return;
    const batch = this.fila;
    this.fila = [];
    const auth = Buffer.from(`${this.o.chavePublica}:${this.o.chaveSecreta}`).toString("base64");
    const r = await this.f(`${this.o.host.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
      body: JSON.stringify({ batch }),
    });
    // 207 = multi-status: a API aceita o lote e lista erros por evento.
    if (!r.ok) throw new Error(`Langfuse respondeu ${r.status}`);
  }
}

/** Liga o Langfuse só se as três variáveis existirem (laboratório local). */
export function rastreadorDoAmbiente(env: NodeJS.ProcessEnv = process.env): Rastreador {
  const { LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = env;
  if (LANGFUSE_HOST && LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY) {
    return new RastreadorLangfuse({ host: LANGFUSE_HOST, chavePublica: LANGFUSE_PUBLIC_KEY, chaveSecreta: LANGFUSE_SECRET_KEY, mascarar: env.LANGFUSE_MASCARAR !== "false" });
  }
  return new RastreadorNulo();
}
