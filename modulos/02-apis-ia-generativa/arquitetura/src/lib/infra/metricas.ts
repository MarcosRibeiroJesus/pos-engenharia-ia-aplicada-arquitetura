// Métricas de negócio. Na Lambda saem em CloudWatch Embedded Metric Format (EMF) no log,
// sem chamada de API nem custo de PutMetricData; os alarmes do Terraform leem daqui.
export type Unidade = "Count" | "Milliseconds" | "None";

export interface Metricas {
  emitir(nome: string, valor: number, unidade: Unidade, dimensoes?: Record<string, string>): void;
}

export class MetricasMemoria implements Metricas {
  readonly pontos: Array<{ nome: string; valor: number; dimensoes: Record<string, string> }> = [];
  emitir(nome: string, valor: number, _u: Unidade, dimensoes: Record<string, string> = {}) {
    this.pontos.push({ nome, valor, dimensoes });
  }
  soma(nome: string) {
    return this.pontos.filter((p) => p.nome === nome).reduce((a, p) => a + p.valor, 0);
  }
}

export class MetricasEmf implements Metricas {
  constructor(
    private readonly namespace: string,
    private readonly servico: string,
    private readonly escrever: (linha: string) => void = (l) => process.stdout.write(`${l}\n`),
  ) {}

  emitir(nome: string, valor: number, unidade: Unidade, dimensoes: Record<string, string> = {}) {
    // A dimensão Servico sempre existe, porque os alarmes filtram por ela.
    // Dimensões extras saem num segundo conjunto, para não fragmentar a série do alarme.
    const extras = Object.keys(dimensoes);
    const conjuntos = extras.length ? [["Servico"], ["Servico", ...extras]] : [["Servico"]];
    this.escrever(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{ Namespace: this.namespace, Dimensions: conjuntos, Metrics: [{ Name: nome, Unit: unidade }] }],
        },
        Servico: this.servico,
        ...dimensoes,
        [nome]: valor,
      }),
    );
  }
}
