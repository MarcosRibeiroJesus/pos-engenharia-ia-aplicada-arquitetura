// Adaptadores das portas para os serviços AWS: S3 (anexos), Lambda (gateway e executor),
// Step Functions (aprovação) e SNS (aviso à recepção). Sem lógica de negócio aqui.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { SendTaskSuccessCommand, SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { LeitorAnexos } from "../../defesa/anexos.js";
import { MAX_BYTES_ANEXO } from "../../defesa/anexos.js";
import type { FluxoAprovacao, Notificador } from "../../dominio/operacoes.js";
import type { ResultadoAgendar } from "../../executor/executor.js";
import type { PedidoGateway, RespostaGateway } from "../../gateway/tipos.js";
import type { PortaExecutor } from "../../grafo/grafo.js";
import type { ClienteGateway } from "../../intencao/extrator.js";
import type { Slot } from "../../dominio/tipos.js";

export class LeitorAnexosS3 implements LeitorAnexos {
  constructor(
    private readonly bucket: string,
    private readonly s3 = new S3Client({}),
  ) {}
  async ler(chave: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    const bytes = Number(r.ContentLength ?? 0);
    // Não baixa o corpo de arquivo grande: o tamanho já reprova.
    const corpo = bytes <= MAX_BYTES_ANEXO ? ((await r.Body?.transformToString("utf-8")) ?? "") : "";
    return { corpo, tipo: r.ContentType ?? "application/octet-stream", bytes };
  }
}

async function invocar<T>(lambda: LambdaClient, funcao: string, payload: unknown): Promise<{ ok: true; valor: T } | { ok: false; erro: string }> {
  const r = await lambda.send(new InvokeCommand({ FunctionName: funcao, InvocationType: "RequestResponse", Payload: Buffer.from(JSON.stringify(payload)) }));
  const texto = r.Payload ? Buffer.from(r.Payload).toString("utf8") : "null";
  if (r.FunctionError) return { ok: false, erro: `${r.FunctionError}: ${texto.slice(0, 300)}` };
  return { ok: true, valor: JSON.parse(texto) as T };
}

export class ClienteGatewayLambda implements ClienteGateway {
  constructor(
    private readonly funcao: string,
    private readonly lambda = new LambdaClient({}),
  ) {}
  async chamar(p: PedidoGateway): Promise<RespostaGateway> {
    try {
      const r = await invocar<RespostaGateway>(this.lambda, this.funcao, p);
      if (r.ok) return r.valor;
      return { ok: false, erro: { categoria: "transitorio", retentavel: true, mensagem: r.erro, tentativas: [] }, tentativas: [] };
    } catch (e) {
      // Falha de rede ou de permissão ao chamar o gateway: vira erro estruturado (5.3).
      return { ok: false, erro: { categoria: "transitorio", retentavel: true, mensagem: String(e), tentativas: [] }, tentativas: [] };
    }
  }
}

export class ExecutorLambda implements PortaExecutor {
  constructor(
    private readonly funcao: string,
    private readonly lambda = new LambdaClient({}),
  ) {}
  async agendar(p: { usuarioId: string; slot: Slot; idempotencia: string }): Promise<ResultadoAgendar> {
    const r = await invocar<ResultadoAgendar>(this.lambda, this.funcao, { etapa: "agendar", ...p });
    if (!r.ok) throw new Error(`executor: ${r.erro}`);
    return r.valor;
  }
}

export class FluxoAprovacaoSfn implements FluxoAprovacao {
  constructor(
    private readonly stateMachineArn: string,
    private readonly sfn = new SFNClient({}),
  ) {}
  async iniciar(acaoId: string, acao: Record<string, unknown>) {
    try {
      await this.sfn.send(new StartExecutionCommand({ stateMachineArn: this.stateMachineArn, name: acaoId, input: JSON.stringify({ acao }) }));
    } catch (e) {
      // Nome de execução repetido = mesmo pedido: idempotente.
      if ((e as { name?: string }).name !== "ExecutionAlreadyExists") throw e;
    }
  }
  async concluirTarefa(token: string, saida: { aprovado: boolean; aprovadorId: string; motivo?: string }) {
    await this.sfn.send(new SendTaskSuccessCommand({ taskToken: token, output: JSON.stringify(saida) }));
  }
}

export class NotificadorSns implements Notificador {
  constructor(
    private readonly topico: string,
    private readonly sns = new SNSClient({}),
  ) {}
  async avisar(m: Record<string, unknown>) {
    await this.sns.send(new PublishCommand({ TopicArn: this.topico, Subject: "Cancelamento aguardando aprovação", Message: JSON.stringify(m) }));
  }
}
