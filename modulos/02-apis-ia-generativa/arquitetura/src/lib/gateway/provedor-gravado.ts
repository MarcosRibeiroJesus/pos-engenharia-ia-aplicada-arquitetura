// Provedor de respostas gravadas (ADR-0006). É o modo padrão do lab, dos testes e da
// integração no Floci: nenhuma chamada ao Claude real.
// As fixtures foram ESCRITAS À MÃO no formato da Messages API (não foram capturadas do modelo),
// então validam o contrato e a lógica determinística em volta, não o comportamento do modelo.
import type Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ErroProvedor, type ProvedorLlm, type RequisicaoLlm, type Tarefa } from "./tipos.js";

export interface Fixture {
  id: string;
  descricao?: string;
  tarefa: Tarefa;
  /**
   * contem/naoContem: trechos procurados nas mensagens (não no system, que tem os exemplos).
   * mensagem: trechos procurados só na mensagem atual do paciente (não no histórico).
   */
  quando: { contem: string[]; naoContem?: string[]; mensagem?: string[]; modelo?: string };
  /** Formato da Messages API, só com os campos que importam (o resto o provedor completa). */
  resposta?: { content: Array<Record<string, unknown>>; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };
  erro?: { categoria: ErroProvedor["categoria"]; status?: number; mensagem: string };
}

const minusculo = (s: string) => s.normalize("NFKC").toLowerCase();

/** Texto do bloco "Mensagem do paciente" da primeira mensagem (o turno atual). */
function mensagemAtual(req: RequisicaoLlm): string {
  const primeira = req.messages[0]?.content;
  const blocos = typeof primeira === "string" ? [{ type: "text", text: primeira }] : (primeira ?? []);
  for (const b of blocos as Array<{ type: string; text?: string }>) {
    if (b.type === "text" && b.text?.startsWith("Mensagem do paciente:")) {
      return b.text.replace(/^Mensagem do paciente:\n<[^>]*>/, "").replace(/<\/dados_nao_confiaveis_[^>]*>$/, "");
    }
  }
  return typeof primeira === "string" ? primeira : "";
}

export class ProvedorGravado implements ProvedorLlm {
  readonly nome = "gravado";
  constructor(private readonly fixtures: Fixture[]) {}

  static deDiretorio(dir: string): ProvedorGravado {
    const fixtures = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Fixture[]);
    return new ProvedorGravado(fixtures);
  }

  async chamar(modelo: string, req: RequisicaoLlm, tarefa: Tarefa): Promise<Anthropic.Message> {
    const texto = minusculo(JSON.stringify(req.messages));
    const atual = minusculo(mensagemAtual(req));
    const f = this.fixtures.find(
      (x) =>
        x.tarefa === tarefa &&
        (!x.quando.modelo || x.quando.modelo === modelo) &&
        x.quando.contem.every((t) => texto.includes(minusculo(t))) &&
        (x.quando.mensagem ?? []).every((t) => atual.includes(minusculo(t))) &&
        !(x.quando.naoContem ?? []).some((t) => texto.includes(minusculo(t))),
    );
    if (!f) throw new ErroProvedor("requisicao_invalida", false, `Sem resposta gravada para a tarefa ${tarefa}.`);
    if (f.erro) throw new ErroProvedor(f.erro.categoria, ["transitorio", "limite_de_taxa"].includes(f.erro.categoria), f.erro.mensagem, f.erro.status);
    const r = f.resposta!;
    return {
      id: `msg_gravada_${f.id}`,
      type: "message",
      role: "assistant",
      model: modelo,
      stop_sequence: null,
      ...structuredClone(r),
      usage: { ...r.usage },
    } as unknown as Anthropic.Message;
  }
}
