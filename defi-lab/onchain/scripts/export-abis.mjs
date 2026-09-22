import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copia as ABIs compiladas para o front, tipadas como `const`.
 *
 *   node scripts/export-abis.mjs
 *
 * Rode sempre que mexer nos contratos: o front le a ABI daqui, entao
 * assinatura mudada e refletida no TypeScript na hora.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CONTRATOS = {
  classroomToken: "contracts/tokens/ClassroomToken.sol/ClassroomToken.json",
  miniAmm: "contracts/amm/MiniAMM.sol/MiniAMM.json",
  gasFaucet: "contracts/utils/GasFaucet.sol/GasFaucet.json",
  miniOrderBook: "contracts/orderbook/MiniOrderBook.sol/MiniOrderBook.json",
  miniStaking: "contracts/staking/MiniStaking.sol/MiniStaking.json",
  miniEscrow: "contracts/escrow/MiniEscrow.sol/MiniEscrow.json",
};

const partes = [
  "// GERADO POR scripts/export-abis.mjs — NAO EDITE A MAO.",
  "// Regenere com: npm run export-abis (no pacote onchain).",
  "",
];

for (const [nome, caminho] of Object.entries(CONTRATOS)) {
  const artifactPath = join(ROOT, "artifacts", caminho);
  if (!existsSync(artifactPath)) {
    throw new Error(`Artifact ausente: ${artifactPath}. Rode 'npm run build' antes.`);
  }
  const { abi } = JSON.parse(readFileSync(artifactPath, "utf8"));
  partes.push(`export const ${nome}Abi = ${JSON.stringify(abi, null, 2)} as const;`, "");
}

const destino = join(ROOT, "..", "web", "src", "lib", "abis.ts");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, partes.join("\n"));

console.log(`ABIs exportadas para ${destino}`);
