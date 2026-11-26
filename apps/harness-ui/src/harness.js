import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function lerJsonSeguro(caminho, padrao) {
  if (!existsSync(caminho)) return padrao;
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return padrao;
  }
}

export function lerEstadoHarness(raiz) {
  const dirHarness = join(raiz, 'harness');
  const estado = lerJsonSeguro(join(dirHarness, 'estado.json'), { projetos: [] });
  const agentes = lerJsonSeguro(join(dirHarness, 'agentes.json'), { agentes: {}, tarefas: {} });
  const especialistas = lerJsonSeguro(join(dirHarness, 'especialistas.json'), { especialistas: {} });

  const projetos = (estado.projetos || []).map((p) => ({
    chave: p.chave,
    titulo: p.titulo || p.chave,
    fase: p.fase || 'especificar',
    branch: p.branch || '',
    pasta: Array.isArray(p.pastas) && p.pastas[0] ? p.pastas[0] : '',
  }));

  return {
    raiz,
    projetos,
    agentes: Object.entries(agentes.agentes || {}).map(([id, info]) => ({
      id,
      nome: info.nome || id,
      modelos: info.modelos || {},
    })),
    tarefas: Object.keys(agentes.tarefas || {}),
    especialistas: Object.keys(especialistas.especialistas || {}),
  };
}

export function montarPromptPassagem({ agente = 'claude-code', tarefa = 'codigo', projeto = '' } = {}) {
  const alvo = projeto ? `o projeto \`${projeto}\`` : 'o projeto indicado em harness/estado.json pelo branch atual';
  return (
    `Você é o agente de código deste repositório. Leia AGENTS.md e siga-o à risca. ` +
    `Antes de qualquer coisa rode \`bash harness/init.sh\` e \`python3 harness/memoria.py ler\`. ` +
    `Trabalhe em ${alvo}: continue da fase SDD e da próxima tarefa mostradas pelo init.sh, ` +
    `uma tarefa por vez, com teste antes do código. Tipo de trabalho: ${tarefa}. ` +
    `Ao terminar ou antes de parar, faça commit, atualize harness/progresso.md e registre na entrada ` +
    `o agente (${agente}). Perguntas ao dono vão no PR, nunca suponha a resposta.`
  );
}
