// Porta mínima de tabela chave-valor (pk/sk). A lógica de domínio depende só desta interface;
// o adaptador DynamoDB fica em infra/aws e a versão em memória serve aos testes.
export type Item = Record<string, unknown> & { pk: string; sk: string };

export interface Condicao {
  /** Atributo que precisa ter este valor (ou não existir, se `naoExiste`). */
  atributo: string;
  igual?: unknown;
  naoExiste?: boolean;
}

export interface OperacaoTransacao {
  tipo: "gravar" | "atualizar";
  item?: Item;
  pk?: string;
  sk?: string;
  campos?: Record<string, unknown>;
  remover?: string[];
  condicoes?: Condicao[];
}

export class ErroCondicao extends Error {
  constructor(m = "condição não satisfeita") {
    super(m);
    this.name = "ErroCondicao";
  }
}

export interface TabelaChaveValor {
  obter(pk: string, sk: string): Promise<Item | undefined>;
  consultar(pk: string, prefixoSk?: string): Promise<Item[]>;
  consultarIndice(indice: string, atributo: string, valor: string): Promise<Item[]>;
  gravar(item: Item, condicoes?: Condicao[]): Promise<void>;
  atualizar(pk: string, sk: string, campos: Record<string, unknown>, condicoes?: Condicao[], remover?: string[]): Promise<Item>;
  somar(pk: string, sk: string, atributo: string, n: number, extras: Record<string, unknown>): Promise<Item>;
  apagar(pk: string, sk: string): Promise<void>;
  transacao(ops: OperacaoTransacao[]): Promise<void>;
}

function confere(item: Item | undefined, condicoes: Condicao[] = []) {
  for (const c of condicoes) {
    const v = item?.[c.atributo];
    if (c.naoExiste ? v !== undefined : v !== c.igual) return false;
  }
  return true;
}

/** Implementação em memória com a mesma semântica de condição e transação do DynamoDB. */
export class TabelaMemoria implements TabelaChaveValor {
  readonly itens = new Map<string, Item>();
  private k(pk: string, sk: string) {
    return `${pk}\u0000${sk}`;
  }

  async obter(pk: string, sk: string) {
    const i = this.itens.get(this.k(pk, sk));
    return i ? structuredClone(i) : undefined;
  }
  async consultar(pk: string, prefixoSk = "") {
    return [...this.itens.values()]
      .filter((i) => i.pk === pk && i.sk.startsWith(prefixoSk))
      .sort((a, b) => a.sk.localeCompare(b.sk))
      .map((i) => structuredClone(i));
  }
  async consultarIndice(_indice: string, atributo: string, valor: string) {
    return [...this.itens.values()].filter((i) => i[atributo] === valor).map((i) => structuredClone(i));
  }
  async gravar(item: Item, condicoes?: Condicao[]) {
    if (!confere(this.itens.get(this.k(item.pk, item.sk)), condicoes)) throw new ErroCondicao();
    this.itens.set(this.k(item.pk, item.sk), structuredClone(item));
  }
  async atualizar(pk: string, sk: string, campos: Record<string, unknown>, condicoes?: Condicao[], remover: string[] = []) {
    const atual = this.itens.get(this.k(pk, sk));
    if (!confere(atual, condicoes)) throw new ErroCondicao();
    const novo: Item = { ...(atual ?? { pk, sk }), ...structuredClone(campos) };
    for (const r of remover) delete novo[r];
    this.itens.set(this.k(pk, sk), novo);
    return structuredClone(novo);
  }
  async somar(pk: string, sk: string, atributo: string, n: number, extras: Record<string, unknown>) {
    const atual = this.itens.get(this.k(pk, sk));
    return this.atualizar(pk, sk, { ...extras, [atributo]: Number(atual?.[atributo] ?? 0) + n });
  }
  async apagar(pk: string, sk: string) {
    this.itens.delete(this.k(pk, sk));
  }
  async transacao(ops: OperacaoTransacao[]) {
    // Tudo ou nada: confere todas as condições antes de aplicar.
    for (const op of ops) {
      const pk = op.item?.pk ?? op.pk!;
      const sk = op.item?.sk ?? op.sk!;
      if (!confere(this.itens.get(this.k(pk, sk)), op.condicoes)) throw new ErroCondicao("transação cancelada");
    }
    for (const op of ops) {
      if (op.tipo === "gravar") await this.gravar(op.item!);
      else await this.atualizar(op.pk!, op.sk!, op.campos ?? {}, [], op.remover);
    }
  }
}
