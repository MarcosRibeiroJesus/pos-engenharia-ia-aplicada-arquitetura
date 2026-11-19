// Gateway de LLM serverless: a versão gerenciada do roteamento multi-modelo da aula (ADR-0001).
// Decide o modelo, aplica cota e circuit breaker, faz fallback em cadeia e contabiliza custo.
import type { Metricas } from "../infra/metricas.js";
import type {
  CategoriaErro,
  EstadoGateway,
  PedidoGateway,
  PrecoModelo,
  ProvedorLlm,
  RespostaGateway,
  Tentativa,
} from "./tipos.js";
import { ErroProvedor } from "./tipos.js";

export const MAX_TOKENS_TETO = 4096;

export interface ConfigGateway {
  provedor: ProvedorLlm;
  estado: EstadoGateway;
  metricas: Metricas;
  cadeia: string[];
  precos: Record<string, PrecoModelo>;
  cotaTokensDia: number;
  relogio?: () => Date;
  limiteFalhas?: number;
  aberturaMs?: number;
}

/** Categorias em que tentar o próximo modelo da cadeia faz sentido. */
const FAZ_FALLBACK = new Set<CategoriaErro>(["transitorio", "limite_de_taxa", "acesso_negado", "recusa"]);
/** Categorias que contam como falha do modelo para o circuit breaker. */
const CONTA_NO_CIRCUITO = new Set<CategoriaErro>(["transitorio", "limite_de_taxa"]);

export class GatewayLlm {
  private readonly relogio: () => Date;
  private readonly limiteFalhas: number;
  private readonly aberturaMs: number;

  constructor(private readonly cfg: ConfigGateway) {
    this.relogio = cfg.relogio ?? (() => new Date());
    this.limiteFalhas = cfg.limiteFalhas ?? 3;
    this.aberturaMs = cfg.aberturaMs ?? 60_000;
  }

  async chamar(pedido: PedidoGateway): Promise<RespostaGateway> {
    const tentativas: Tentativa[] = [];
    const agora = this.relogio();
    const dia = agora.toISOString().slice(0, 10);

    const invalido = this.validar(pedido);
    if (invalido) return this.falha("requisicao_invalida", false, invalido, tentativas);

    const usados = await this.cfg.estado.tokensUsados(pedido.clienteId, dia);
    if (usados >= this.cfg.cotaTokensDia) {
      this.cfg.metricas.emitir("CotaExcedida", 1, "Count");
      return this.falha("cota_excedida", false, `Cota diária de ${this.cfg.cotaTokensDia} tokens esgotada para ${pedido.clienteId}.`, tentativas);
    }

    for (const [i, modelo] of this.cfg.cadeia.entries()) {
      const circuito = await this.cfg.estado.lerCircuito(modelo);
      if (circuito.abertoAte > this.relogio().getTime()) {
        tentativas.push({ modelo, resultado: "circuito_aberto", latenciaMs: 0 });
        this.cfg.metricas.emitir("CircuitoAberto", 1, "Count", { Modelo: modelo });
        continue;
      }

      const inicio = Date.now();
      try {
        const resposta = await this.cfg.provedor.chamar(modelo, pedido.requisicao, pedido.tarefa);
        const latenciaMs = Date.now() - inicio;
        if (resposta.stop_reason === "refusal") {
          // Recusa é decisão do modelo, não falha de infraestrutura: tenta o próximo, sem abrir o circuito.
          tentativas.push({ modelo, resultado: "recusa", latenciaMs });
          continue;
        }
        tentativas.push({ modelo, resultado: "ok", latenciaMs });
        await this.cfg.estado.registrarSucesso(modelo);
        const custoUsd = await this.contabilizar(pedido, modelo, resposta.usage, dia, i > 0);
        this.cfg.metricas.emitir("LatenciaLlmMs", latenciaMs, "Milliseconds", { Modelo: modelo });
        if (i > 0) this.cfg.metricas.emitir("FallbackAcionado", 1, "Count");
        return { ok: true, modelo, resposta, custoUsd, tentativas };
      } catch (e) {
        const erro = e instanceof ErroProvedor ? e : new ErroProvedor("transitorio", true, String(e));
        tentativas.push({ modelo, resultado: erro.categoria, latenciaMs: Date.now() - inicio });
        if (CONTA_NO_CIRCUITO.has(erro.categoria)) {
          const c = await this.cfg.estado.registrarFalha(modelo, this.relogio().getTime(), this.limiteFalhas, this.aberturaMs);
          if (c.abertoAte > this.relogio().getTime()) this.cfg.metricas.emitir("CircuitoAberto", 1, "Count", { Modelo: modelo });
        }
        if (!FAZ_FALLBACK.has(erro.categoria)) {
          return this.falha(erro.categoria, erro.retentavel, erro.message, tentativas);
        }
      }
    }

    this.cfg.metricas.emitir("TodosModelosFalharam", 1, "Count");
    return this.falha("todos_modelos_falharam", true, "Nenhum modelo da cadeia respondeu; tente de novo mais tarde.", tentativas);
  }

  private validar(p: PedidoGateway): string | null {
    const r = p.requisicao as Record<string, unknown>;
    if ("model" in r) return "O modelo é escolhido pelo gateway; não envie `model`.";
    if (!Number.isInteger(p.requisicao.max_tokens) || p.requisicao.max_tokens < 1 || p.requisicao.max_tokens > MAX_TOKENS_TETO) {
      return `max_tokens deve estar entre 1 e ${MAX_TOKENS_TETO}.`;
    }
    if (!/^[a-z0-9-]{1,64}$/.test(p.clienteId)) return "clienteId inválido.";
    return null;
  }

  private async contabilizar(
    pedido: PedidoGateway,
    modelo: string,
    usage: { input_tokens: number; output_tokens: number },
    dia: string,
    fallback: boolean,
  ): Promise<number> {
    const preco = this.cfg.precos[modelo] ?? { entrada: 0, saida: 0 };
    const custoUsd = (usage.input_tokens * preco.entrada + usage.output_tokens * preco.saida) / 1_000_000;
    await this.cfg.estado.somarTokens(pedido.clienteId, dia, usage.input_tokens + usage.output_tokens);
    await this.cfg.estado.registrarCusto({
      dia,
      instante: this.relogio().toISOString(),
      clienteId: pedido.clienteId,
      tarefa: pedido.tarefa,
      modelo,
      tokensEntrada: usage.input_tokens,
      tokensSaida: usage.output_tokens,
      custoUsd,
      fallback,
    });
    this.cfg.metricas.emitir("CustoUSD", custoUsd, "None", { Tarefa: pedido.tarefa });
    this.cfg.metricas.emitir("Tokens", usage.input_tokens + usage.output_tokens, "Count", { Tarefa: pedido.tarefa });
    return custoUsd;
  }

  private falha(categoria: CategoriaErro, retentavel: boolean, mensagem: string, tentativas: Tentativa[]): RespostaGateway {
    return { ok: false, erro: { categoria, retentavel, mensagem, tentativas }, tentativas };
  }
}
