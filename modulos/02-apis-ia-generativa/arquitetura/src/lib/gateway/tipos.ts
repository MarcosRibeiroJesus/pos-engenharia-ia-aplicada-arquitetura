// Contrato do gateway de LLM (ADR-0001). O chamador manda um pedido neutro, sem modelo;
// o gateway escolhe o modelo pela cadeia, aplica cota e circuit breaker e devolve
// sucesso ou um erro estruturado (categoria + retentável), nunca uma exceção solta.
import type Anthropic from "@anthropic-ai/sdk";

export type RequisicaoLlm = Omit<Anthropic.MessageCreateParamsNonStreaming, "model">;
export type Tarefa = "extrair_intencao" | "resumir";

export interface PedidoGateway {
  clienteId: string;
  tarefa: Tarefa;
  requisicao: RequisicaoLlm;
}

export type CategoriaErro =
  | "transitorio"
  | "limite_de_taxa"
  | "acesso_negado"
  | "requisicao_invalida"
  | "recusa"
  | "cota_excedida"
  | "circuito_aberto"
  | "todos_modelos_falharam";

export interface Tentativa {
  modelo: string;
  resultado: "ok" | CategoriaErro;
  latenciaMs: number;
}

export interface ErroLlm {
  categoria: CategoriaErro;
  retentavel: boolean;
  mensagem: string;
  tentativas: Tentativa[];
}

export type RespostaGateway =
  | { ok: true; modelo: string; resposta: Anthropic.Message; custoUsd: number; tentativas: Tentativa[] }
  | { ok: false; erro: ErroLlm; tentativas: Tentativa[] };

/** Erro de um provedor, já classificado. Só o gateway o vê; o chamador recebe ErroLlm. */
export class ErroProvedor extends Error {
  constructor(
    readonly categoria: Exclude<CategoriaErro, "cota_excedida" | "circuito_aberto" | "todos_modelos_falharam">,
    readonly retentavel: boolean,
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroProvedor";
  }
}

export interface ProvedorLlm {
  readonly nome: string;
  chamar(modelo: string, requisicao: RequisicaoLlm, tarefa: Tarefa): Promise<Anthropic.Message>;
}

export interface PrecoModelo {
  entrada: number; // US$ por milhão de tokens
  saida: number;
}

export interface LancamentoCusto {
  dia: string;
  instante: string;
  clienteId: string;
  tarefa: Tarefa;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  fallback: boolean;
}

export interface EstadoCircuito {
  falhas: number;
  abertoAte: number;
}

export interface EstadoGateway {
  tokensUsados(clienteId: string, dia: string): Promise<number>;
  somarTokens(clienteId: string, dia: string, tokens: number): Promise<void>;
  lerCircuito(modelo: string): Promise<EstadoCircuito>;
  registrarFalha(modelo: string, agoraMs: number, limite: number, aberturaMs: number): Promise<EstadoCircuito>;
  registrarSucesso(modelo: string): Promise<void>;
  registrarCusto(l: LancamentoCusto): Promise<void>;
}
