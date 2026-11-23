// Camada 3: detector heurístico de injeção. Não é a defesa principal (heurística se contorna);
// serve para barrar o ataque óbvio cedo, medir tentativas (métrica InjecaoBloqueada) e pôr
// anexos suspeitos em quarentena. A proteção que não depende de acertar o padrão está no gate.
import { formaDeDeteccao } from "./normalizacao.js";

export type Nivel = "nenhum" | "suspeito" | "alto";

interface Regra {
  nome: string;
  re: RegExp;
  peso: number;
}

// Padrões sobre a forma de detecção (minúsculas, sem acento, sem homóglifo).
const REGRAS: Regra[] = [
  { nome: "ignorar_instrucoes", re: /\b(ignore|ignora|desconsidere|esqueca|esquece)\b.{0,40}\b(instrucoes|regras|ordens|orientacoes|instructions|rules|prompt)\b/, peso: 3 },
  { nome: "ignore_previous", re: /\bignore\b.{0,20}\b(previous|above|prior|all)\b/, peso: 3 },
  { nome: "troca_de_papel", re: /\b(voce agora e|a partir de agora voce|aja como|finja ser|you are now|act as)\b/, peso: 2 },
  { nome: "papel_privilegiado", re: /\b(administrador|admin|root|superusuario|desenvolvedor|sistema)\b/, peso: 1 },
  { nome: "exfiltrar_prompt", re: /\b(revele|mostre|imprima|repita|print|reveal|show)\b.{0,30}\b(prompt|instrucoes do sistema|system prompt|suas instrucoes)\b/, peso: 3 },
  { nome: "prompt_do_sistema", re: /\b(prompt do sistema|system prompt|mensagem do sistema)\b/, peso: 1 },
  { nome: "falsificar_delimitador", re: /<\/?\s*(dados_nao_confiaveis|sistema|system|instrucoes|assistant|tool_result)/, peso: 3 },
  { nome: "falso_turno", re: /^\s*(sistema|system|assistant|assistente)\s*:/m, peso: 2 },
  { nome: "modo_sem_restricoes", re: /\b(modo desenvolvedor|developer mode|jailbreak|sem restricoes|no restrictions|dan)\b/, peso: 3 },
  { nome: "acao_em_massa", re: /\b(cancele|cancelar|apague|apagar|delete)\b.{0,20}\b(todas|todos|tudo|all)\b/, peso: 2 },
  { nome: "outro_usuario", re: /\b(de outro paciente|de outros pacientes|outro usuario|usuario\s*id|usuarioid)\b/, peso: 2 },
];

const LIMIAR_ALTO = 3;

export function detectarInjecao(texto: string): { nivel: Nivel; pontos: number; sinais: string[] } {
  const sinais = new Set<string>();
  let pontos = 0;

  const avaliar = (t: string) => {
    const f = formaDeDeteccao(t);
    for (const r of REGRAS) {
      if (r.re.test(f) && !sinais.has(r.nome)) {
        sinais.add(r.nome);
        pontos += r.peso;
      }
    }
  };

  avaliar(texto);

  // Instrução codificada em base64: decodifica e reavalia.
  for (const m of texto.match(/[A-Za-z0-9+/]{24,}={0,2}/g) ?? []) {
    const decodificado = Buffer.from(m, "base64").toString("utf8");
    if (/^[\p{L}\p{N}\p{P}\p{Zs}\n]+$/u.test(decodificado)) {
      const antes = pontos;
      avaliar(decodificado);
      if (pontos > antes) {
        sinais.add("base64");
        pontos += 1;
      }
    }
  }

  const nivel: Nivel = pontos >= LIMIAR_ALTO ? "alto" : pontos > 0 ? "suspeito" : "nenhum";
  return { nivel, pontos, sinais: [...sinais] };
}
