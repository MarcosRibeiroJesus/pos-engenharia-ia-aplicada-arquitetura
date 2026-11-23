// Memória do assistente em DynamoDB (a aula usa SQLite e Postgres; a troca está no ADR-0003).
// Tudo de um paciente fica sob a mesma partição USUARIO#<id>, o que torna o direito de
// apagar uma Query + exclusões, sem varrer a tabela.
//   SESSAO#<s>#TURNO#<instante>   turnos recentes (TTL 7 dias)
//   SESSAO#<s>#RESUMO             resumo compactado da sessão (TTL 30 dias)
//   SESSAO#<s>#CANDIDATOS         opções oferecidas na última pergunta (TTL 1 hora)
//   FATO#<instante>#<ref>         fatos fixados pelo código (TTL 90 dias)
//   PREF#<chave>                  preferências com proveniência (sem TTL; apagáveis)
import type { TabelaChaveValor } from "../infra/tabela.js";
import type { Fato } from "../dominio/tipos.js";
import type { Preferencia } from "../defesa/memoria-guarda.js";

export interface Turno {
  papel: "paciente" | "assistente";
  texto: string;
  em: string;
}

export interface PreferenciaGuardada {
  chave: string;
  valor: string;
  fonte: { sessaoId: string; em: string; trecho: string };
}

export interface Candidato {
  consultaId: string;
  descricao: string;
}

export interface ContextoMemoria {
  fatos: Fato[];
  resumo: string;
  preferencias: PreferenciaGuardada[];
  turnos: Turno[];
  candidatos: Candidato[];
}

export interface OpcoesMemoria {
  turnosNoContexto?: number;
  limiteParaResumo?: number;
}

const DIA = 86_400;
const MAX_TEXTO = 1000;
// Desempate de turnos no mesmo milissegundo (a ordem da sort key é a ordem da conversa).
let sequencia = 0;

export class Memoria {
  private readonly turnosNoContexto: number;
  private readonly limiteParaResumo: number;

  constructor(
    private readonly t: TabelaChaveValor,
    private readonly relogio: () => Date = () => new Date(),
    o: OpcoesMemoria = {},
  ) {
    this.turnosNoContexto = o.turnosNoContexto ?? 6;
    this.limiteParaResumo = o.limiteParaResumo ?? 10;
  }

  private pk(u: string) {
    return `USUARIO#${u}`;
  }
  private ttl(dias: number) {
    return Math.floor(this.relogio().getTime() / 1000) + dias * DIA;
  }

  async carregar(usuarioId: string, sessaoId: string): Promise<ContextoMemoria> {
    const itens = await this.t.consultar(this.pk(usuarioId));
    const turnos = itens
      .filter((i) => i.sk.startsWith(`SESSAO#${sessaoId}#TURNO#`))
      .map((i) => ({ papel: i.papel as Turno["papel"], texto: String(i.texto), em: String(i.em) }));
    const resumo = itens.find((i) => i.sk === `SESSAO#${sessaoId}#RESUMO`);
    const cand = itens.find((i) => i.sk === `SESSAO#${sessaoId}#CANDIDATOS`);
    return {
      fatos: itens.filter((i) => i.sk.startsWith("FATO#")).map((i) => i.fato as Fato),
      resumo: resumo ? String(resumo.texto) : "",
      preferencias: itens.filter((i) => i.sk.startsWith("PREF#")).map((i) => ({ chave: String(i.chave), valor: String(i.valor), fonte: i.fonte as PreferenciaGuardada["fonte"] })),
      turnos: turnos.slice(-this.turnosNoContexto),
      candidatos: cand ? (cand.lista as Candidato[]) : [],
    };
  }

  async registrarTurno(usuarioId: string, sessaoId: string, papel: Turno["papel"], texto: string) {
    const em = this.relogio().toISOString();
    await this.t.gravar({
      pk: this.pk(usuarioId),
      sk: `SESSAO#${sessaoId}#TURNO#${em}#${String(sequencia++ % 1_000_000).padStart(6, "0")}`,
      papel,
      texto: texto.slice(0, MAX_TEXTO),
      em,
      expira_em: this.ttl(7),
    });
  }

  async fixarFato(usuarioId: string, fato: Fato) {
    await this.t.gravar({ pk: this.pk(usuarioId), sk: `FATO#${fato.em}#${fato.referencia}`, fato, expira_em: this.ttl(90) });
  }

  /** Só recebe preferências que já passaram pela guarda (filtrarPreferencias). */
  async salvarPreferencias(usuarioId: string, sessaoId: string, prefs: Preferencia[], trecho: string) {
    for (const p of prefs) {
      await this.t.gravar({
        pk: this.pk(usuarioId),
        sk: `PREF#${p.chave}`,
        chave: p.chave,
        valor: p.valor,
        fonte: { sessaoId, em: this.relogio().toISOString(), trecho: trecho.slice(0, 200) },
      });
    }
  }

  async salvarCandidatos(usuarioId: string, sessaoId: string, lista: Candidato[]) {
    await this.t.gravar({ pk: this.pk(usuarioId), sk: `SESSAO#${sessaoId}#CANDIDATOS`, lista, expira_em: this.ttl(1 / 24) });
  }

  private async turnosDaSessao(usuarioId: string, sessaoId: string) {
    return this.t.consultar(this.pk(usuarioId), `SESSAO#${sessaoId}#TURNO#`);
  }

  async precisaResumir(usuarioId: string, sessaoId: string) {
    return (await this.turnosDaSessao(usuarioId, sessaoId)).length > this.limiteParaResumo;
  }

  async turnosParaResumir(usuarioId: string, sessaoId: string): Promise<Turno[]> {
    const todos = await this.turnosDaSessao(usuarioId, sessaoId);
    return todos.slice(0, -this.turnosNoContexto).map((i) => ({ papel: i.papel as Turno["papel"], texto: String(i.texto), em: String(i.em) }));
  }

  /** Grava o resumo e só então apaga os turnos antigos: se falhar no meio, nada se perde. */
  async aplicarResumo(usuarioId: string, sessaoId: string, resumo: string) {
    const todos = await this.turnosDaSessao(usuarioId, sessaoId);
    const antigos = todos.slice(0, -this.turnosNoContexto);
    await this.t.gravar({ pk: this.pk(usuarioId), sk: `SESSAO#${sessaoId}#RESUMO`, texto: resumo.slice(0, 1200), em: this.relogio().toISOString(), expira_em: this.ttl(30) });
    for (const i of antigos) await this.t.apagar(i.pk, i.sk);
  }

  async apagarTudo(usuarioId: string) {
    const itens = await this.t.consultar(this.pk(usuarioId));
    for (const i of itens) await this.t.apagar(i.pk, i.sk);
    return { apagados: itens.length };
  }
}
