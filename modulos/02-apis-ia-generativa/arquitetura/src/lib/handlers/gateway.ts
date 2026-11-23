// Lambda do gateway de LLM. Invocada só pelo orquestrador (IAM); não tem rota na API.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EstadoGatewayDynamo } from "../gateway/estado.js";
import { ProvedorBedrockMantle } from "../gateway/provedor-bedrock.js";
import { ProvedorGravado } from "../gateway/provedor-gravado.js";
import { GatewayLlm } from "../gateway/roteador.js";
import type { PedidoGateway, ProvedorLlm, RespostaGateway } from "../gateway/tipos.js";
import { exigir, log } from "../infra/ambiente.js";
import { TabelaDynamo } from "../infra/aws/tabela-dynamo.js";
import { MetricasEmf } from "../infra/metricas.js";
import { rastreadorDoAmbiente } from "../observabilidade/rastreador.js";

// Na AWS não há LANGFUSE_*: o rastreador é nulo e a observabilidade fica em CloudWatch e X-Ray.
const rastreador = rastreadorDoAmbiente();

let gateway: GatewayLlm | undefined;

function provedor(): ProvedorLlm {
  const modo = process.env.MODO_LLM ?? "gravado";
  if (modo === "bedrock") return new ProvedorBedrockMantle({ regiao: exigir("AWS_REGION") });
  return ProvedorGravado.deDiretorio(join(dirname(fileURLToPath(import.meta.url)), "respostas-gravadas"));
}

function montar() {
  return new GatewayLlm({
    provedor: provedor(),
    estado: new EstadoGatewayDynamo(new TabelaDynamo(exigir("TABELA_GATEWAY"))),
    metricas: new MetricasEmf(process.env.NAMESPACE_METRICAS ?? "AssistenteAgendamento", "gateway"),
    cadeia: JSON.parse(exigir("CADEIA_MODELOS")) as string[],
    precos: JSON.parse(exigir("PRECOS_USD_MTOK")),
    cotaTokensDia: Number(exigir("COTA_TOKENS_DIA")),
    rastreador,
  });
}

export async function handler(evento: PedidoGateway): Promise<RespostaGateway> {
  if (!evento || typeof evento.clienteId !== "string" || !evento.requisicao) {
    return { ok: false, erro: { categoria: "requisicao_invalida", retentavel: false, mensagem: "Pedido malformado.", tentativas: [] }, tentativas: [] };
  }
  gateway ??= montar();
  const r = await gateway.chamar(evento);
  await rastreador.descarregar();
  log(r.ok ? "INFO" : "WARN", "chamada_llm", {
    clienteId: evento.clienteId,
    tarefa: evento.tarefa,
    ok: r.ok,
    modelo: r.ok ? r.modelo : undefined,
    categoria: r.ok ? undefined : r.erro.categoria,
    tentativas: r.tentativas,
  });
  return r;
}
