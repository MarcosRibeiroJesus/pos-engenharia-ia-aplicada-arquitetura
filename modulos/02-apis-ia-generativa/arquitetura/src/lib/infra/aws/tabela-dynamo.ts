// Adaptador DynamoDB da porta TabelaChaveValor, com condições e transações nativas.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { ErroCondicao, type Condicao, type Item, type OperacaoTransacao, type TabelaChaveValor } from "../tabela.js";

let docPadrao: DynamoDBDocumentClient | undefined;
function doc() {
  docPadrao ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  return docPadrao;
}

function expressaoCondicao(condicoes: Condicao[] = [], prefixo = "c") {
  if (!condicoes.length) return {};
  const nomes: Record<string, string> = {};
  const valores: Record<string, unknown> = {};
  const partes = condicoes.map((c, i) => {
    nomes[`#${prefixo}${i}`] = c.atributo;
    if (c.naoExiste) return `attribute_not_exists(#${prefixo}${i})`;
    valores[`:${prefixo}${i}`] = c.igual;
    return `#${prefixo}${i} = :${prefixo}${i}`;
  });
  return { ConditionExpression: partes.join(" AND "), nomes, valores };
}

function atualizacao(campos: Record<string, unknown>, remover: string[] = []) {
  const nomes: Record<string, string> = {};
  const valores: Record<string, unknown> = {};
  const sets = Object.entries(campos).map(([k, v], i) => {
    nomes[`#s${i}`] = k;
    valores[`:s${i}`] = v;
    return `#s${i} = :s${i}`;
  });
  const rems = remover.map((k, i) => {
    nomes[`#r${i}`] = k;
    return `#r${i}`;
  });
  const expr = [sets.length ? `SET ${sets.join(", ")}` : "", rems.length ? `REMOVE ${rems.join(", ")}` : ""].filter(Boolean).join(" ");
  return { expr, nomes, valores };
}

function ehFalhaDeCondicao(e: unknown) {
  const nome = (e as { name?: string }).name;
  return nome === "ConditionalCheckFailedException" || nome === "TransactionCanceledException";
}

export class TabelaDynamo implements TabelaChaveValor {
  constructor(
    private readonly nome: string,
    private readonly cliente: DynamoDBDocumentClient = doc(),
  ) {}

  async obter(pk: string, sk: string) {
    const r = await this.cliente.send(new GetCommand({ TableName: this.nome, Key: { pk, sk }, ConsistentRead: true }));
    return r.Item as Item | undefined;
  }

  private async paginar(input: QueryCommandInput) {
    const itens: Item[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const r = await this.cliente.send(new QueryCommand({ ...input, ExclusiveStartKey: inicio }));
      itens.push(...((r.Items ?? []) as Item[]));
      inicio = r.LastEvaluatedKey;
    } while (inicio);
    return itens;
  }

  async consultar(pk: string, prefixoSk?: string) {
    return this.paginar({
      TableName: this.nome,
      KeyConditionExpression: prefixoSk ? "pk = :pk AND begins_with(sk, :p)" : "pk = :pk",
      ExpressionAttributeValues: prefixoSk ? { ":pk": pk, ":p": prefixoSk } : { ":pk": pk },
      ConsistentRead: true,
    });
  }

  async consultarIndice(indice: string, atributo: string, valor: string) {
    return this.paginar({
      TableName: this.nome,
      IndexName: indice,
      KeyConditionExpression: "#a = :v",
      ExpressionAttributeNames: { "#a": atributo },
      ExpressionAttributeValues: { ":v": valor },
    });
  }

  async gravar(item: Item, condicoes?: Condicao[]) {
    const c = expressaoCondicao(condicoes);
    try {
      await this.cliente.send(
        new PutCommand({
          TableName: this.nome,
          Item: item,
          ...(c.ConditionExpression
            ? { ConditionExpression: c.ConditionExpression, ExpressionAttributeNames: c.nomes, ...(Object.keys(c.valores!).length ? { ExpressionAttributeValues: c.valores } : {}) }
            : {}),
        }),
      );
    } catch (e) {
      if (ehFalhaDeCondicao(e)) throw new ErroCondicao();
      throw e;
    }
  }

  async atualizar(pk: string, sk: string, campos: Record<string, unknown>, condicoes?: Condicao[], remover?: string[]) {
    const u = atualizacao(campos, remover);
    const c = expressaoCondicao(condicoes);
    const valores = { ...u.valores, ...(c.valores ?? {}) };
    try {
      const r = await this.cliente.send(
        new UpdateCommand({
          TableName: this.nome,
          Key: { pk, sk },
          UpdateExpression: u.expr,
          ExpressionAttributeNames: { ...u.nomes, ...(c.nomes ?? {}) },
          ...(Object.keys(valores).length ? { ExpressionAttributeValues: valores } : {}),
          ...(c.ConditionExpression ? { ConditionExpression: c.ConditionExpression } : {}),
          ReturnValues: "ALL_NEW",
        }),
      );
      return r.Attributes as Item;
    } catch (e) {
      if (ehFalhaDeCondicao(e)) throw new ErroCondicao();
      throw e;
    }
  }

  async somar(pk: string, sk: string, atributo: string, n: number, extras: Record<string, unknown>) {
    const u = atualizacao(extras);
    const r = await this.cliente.send(
      new UpdateCommand({
        TableName: this.nome,
        Key: { pk, sk },
        UpdateExpression: `ADD #soma :n${u.expr ? ` ${u.expr}` : ""}`,
        ExpressionAttributeNames: { "#soma": atributo, ...u.nomes },
        ExpressionAttributeValues: { ":n": n, ...u.valores },
        ReturnValues: "ALL_NEW",
      }),
    );
    return r.Attributes as Item;
  }

  async apagar(pk: string, sk: string) {
    await this.cliente.send(new DeleteCommand({ TableName: this.nome, Key: { pk, sk } }));
  }

  async transacao(ops: OperacaoTransacao[]) {
    const itens = ops.map((op, i) => {
      const c = expressaoCondicao(op.condicoes, `t${i}c`);
      const condNomes = c.nomes ?? {};
      const condValores = c.valores ?? {};
      const cond = c.ConditionExpression ? { ConditionExpression: c.ConditionExpression } : {};
      if (op.tipo === "gravar") {
        return {
          Put: {
            TableName: this.nome,
            Item: op.item!,
            ...cond,
            ...(Object.keys(condNomes).length ? { ExpressionAttributeNames: condNomes } : {}),
            ...(Object.keys(condValores).length ? { ExpressionAttributeValues: condValores } : {}),
          },
        };
      }
      const u = atualizacao(op.campos ?? {}, op.remover);
      const valores = { ...u.valores, ...condValores };
      return {
        Update: {
          TableName: this.nome,
          Key: { pk: op.pk!, sk: op.sk! },
          UpdateExpression: u.expr,
          ...cond,
          ExpressionAttributeNames: { ...u.nomes, ...condNomes },
          ...(Object.keys(valores).length ? { ExpressionAttributeValues: valores } : {}),
        },
      };
    });
    try {
      await this.cliente.send(new TransactWriteCommand({ TransactItems: itens }));
    } catch (e) {
      if (ehFalhaDeCondicao(e)) throw new ErroCondicao("transação cancelada");
      throw e;
    }
  }
}
