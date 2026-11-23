// Empacota cada Lambda num único index.mjs (dist/<funcao>/index.mjs), que o Terraform zipa.
// O AWS SDK v3 fica fora do pacote: o runtime nodejs22.x já traz.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const funcoes = ["gateway", "orquestrador", "executor"];
rmSync("dist", { recursive: true, force: true });

for (const f of funcoes) {
  mkdirSync(`dist/${f}`, { recursive: true });
  await build({
    entryPoints: [`lib/handlers/${f}.ts`],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: `dist/${f}/index.mjs`,
    external: ["@aws-sdk/*"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    // Bibliotecas CommonJS dentro do ESM precisam de require.
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
}

// Laboratório local (Langfuse e gate de avaliação): roda na máquina, não vai para a AWS.
mkdirSync("dist/cli", { recursive: true });
await build({
  entryPoints: ["lib/lab/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/cli/lab.mjs",
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

// O gateway leva as respostas gravadas (modo "gravado", sem chamada ao Claude).
cpSync("fixtures/respostas-gravadas", "dist/gateway/respostas-gravadas", { recursive: true });
console.log(`pacotes: ${funcoes.map((f) => `dist/${f}`).join(", ")}`);
