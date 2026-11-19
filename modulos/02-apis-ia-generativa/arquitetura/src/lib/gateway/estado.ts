// Estado do gateway: cota diária, circuit breaker e ledger de custo.
// Duas implementações com o mesmo contrato: memória (testes) e DynamoDB (Lambda).
import type { EstadoCircuito, EstadoGateway, LancamentoCusto } from "./tipos.js";
import type { TabelaChaveValor } from "../infra/tabela.js";

export class EstadoGatewayMemoria implements EstadoGateway {
  readonly lancamentos: LancamentoCusto[] = [];
  private readonly tokens = new Map<string, number>();
  private readonly circuitos = new Map<string, EstadoCircuito>();

  async tokensUsados(clienteId: string, dia: string) {
    return this.tokens.get(`${clienteId}#${dia}`) ?? 0;
  }
  async somarTokens(clienteId: string, dia: string, n: number) {
    const k = `${clienteId}#${dia}`;
    this.tokens.set(k, (this.tokens.get(k) ?? 0) + n);
  }
  async lerCircuito(modelo: string) {
    return this.circuitos.get(modelo) ?? { falhas: 0, abertoAte: 0 };
  }
  async registrarFalha(modelo: string, agoraMs: number, limite: number, aberturaMs: number) {
    const c = await this.lerCircuito(modelo);
    const falhas = c.falhas + 1;
    const novo = { falhas, abertoAte: falhas >= limite ? agoraMs + aberturaMs : c.abertoAte };
    this.circuitos.set(modelo, novo);
    return novo;
  }
  async registrarSucesso(modelo: string) {
    this.circuitos.set(modelo, { falhas: 0, abertoAte: 0 });
  }
  async registrarCusto(l: LancamentoCusto) {
    this.lancamentos.push(l);
  }
}

const NOVENTA_DIAS_S = 90 * 24 * 3600;

/** Implementação em DynamoDB (tabela gateway: pk/sk + TTL em expira_em). */
export class EstadoGatewayDynamo implements EstadoGateway {
  constructor(private readonly tabela: TabelaChaveValor) {}

  async tokensUsados(clienteId: string, dia: string) {
    const item = await this.tabela.obter(`COTA#${clienteId}`, dia);
    return Number(item?.tokens ?? 0);
  }
  async somarTokens(clienteId: string, dia: string, n: number) {
    // ADD é atômico: chamadas concorrentes não perdem contagem.
    await this.tabela.somar(`COTA#${clienteId}`, dia, "tokens", n, { expira_em: segundos() + 3 * 24 * 3600 });
  }
  async lerCircuito(modelo: string) {
    const item = await this.tabela.obter(`CIRCUITO#${modelo}`, "estado");
    return { falhas: Number(item?.falhas ?? 0), abertoAte: Number(item?.aberto_ate ?? 0) };
  }
  async registrarFalha(modelo: string, agoraMs: number, limite: number, aberturaMs: number) {
    const item = await this.tabela.somar(`CIRCUITO#${modelo}`, "estado", "falhas", 1, {});
    const falhas = Number(item.falhas ?? 1);
    let abertoAte = Number(item.aberto_ate ?? 0);
    if (falhas >= limite) {
      abertoAte = agoraMs + aberturaMs;
      await this.tabela.atualizar(`CIRCUITO#${modelo}`, "estado", { aberto_ate: abertoAte });
    }
    return { falhas, abertoAte };
  }
  async registrarSucesso(modelo: string) {
    await this.tabela.atualizar(`CIRCUITO#${modelo}`, "estado", { falhas: 0, aberto_ate: 0 });
  }
  async registrarCusto(l: LancamentoCusto) {
    await this.tabela.gravar({
      pk: `CUSTO#${l.dia}`,
      sk: `${l.instante}#${Math.random().toString(36).slice(2, 10)}`,
      cliente_id: l.clienteId,
      tarefa: l.tarefa,
      modelo: l.modelo,
      tokens_entrada: l.tokensEntrada,
      tokens_saida: l.tokensSaida,
      custo_usd: l.custoUsd,
      fallback: l.fallback,
      expira_em: segundos() + NOVENTA_DIAS_S,
    });
  }
}

function segundos() {
  return Math.floor(Date.now() / 1000);
}
