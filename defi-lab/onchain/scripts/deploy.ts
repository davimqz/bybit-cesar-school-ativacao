import { network } from "hardhat";
import { parseEther, formatEther } from "viem";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Publica a infraestrutura da aula e ja deixa os pools semeados.
 *
 *   npm run deploy:local     (ensaio)
 *   npm run deploy:sepolia   (D-2, a valer)
 *
 * No fim escreve deployments/<chainId>.json e copia os enderecos para o
 * front. Nenhum endereco e digitado a mao em lugar nenhum.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// --- Parametros da aula -----------------------------------------------------

const SUPPLY_INICIAL = parseEther("10000000"); // estoque do professor
const FAUCET_TOKENS = parseEther("1000"); // por saque, por aluno
const FAUCET_COOLDOWN = 60n; // 1 min: a aula nao pode esperar 24h

const GAS_DRIP = parseEther("0.01"); // ~40 transacoes por aluno em Sepolia
const GAS_COOLDOWN = 300n; // 5 min
const GAS_FAUCET_SEED = process.env.GAS_FAUCET_SEED ?? "0"; // ETH depositado agora

// Pool "fundo": o mercado normal da aula. 1 CSR = 2 BRLX.
const POOL_FUNDO_CSR = parseEther("50000");
const POOL_FUNDO_BRLX = parseEther("100000");

// Pool "raso": mesmo par, mesmo preco, 1/100 do tamanho.
// Existe por um unico motivo: o mesmo swap doer 100x mais aqui.
const POOL_RASO_CSR = parseEther("500");
const POOL_RASO_BRLX = parseEther("1000");

// ---------------------------------------------------------------------------

const { viem, networkName } = await network.connect();
const publicClient = await viem.getPublicClient();
const [professor] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

const saldo = await publicClient.getBalance({ address: professor.account.address });

console.log(`\n=== DeFi Lab — deploy ===`);
console.log(`rede       ${networkName} (chainId ${chainId})`);
console.log(`professor  ${professor.account.address}`);
console.log(`saldo      ${formatEther(saldo)} ETH\n`);

if (saldo === 0n) {
  throw new Error("Carteira sem ETH. Em Sepolia, passe pelos faucets antes de rodar isto.");
}

// --- Tokens -----------------------------------------------------------------

console.log("[1/5] Publicando tokens...");
const csr = await viem.deployContract("ClassroomToken", [
  "CESAR Coin", "CSR", SUPPLY_INICIAL, FAUCET_TOKENS, FAUCET_COOLDOWN, professor.account.address,
]);
console.log(`      CSR   ${csr.address}`);

const brlx = await viem.deployContract("ClassroomToken", [
  "CESAR Real", "BRLX", SUPPLY_INICIAL, FAUCET_TOKENS, FAUCET_COOLDOWN, professor.account.address,
]);
console.log(`      BRLX  ${brlx.address}`);

// --- Faucet de gas ----------------------------------------------------------

console.log("[2/5] Publicando GasFaucet...");
const gasFaucet = await viem.deployContract(
  "GasFaucet",
  [GAS_DRIP, GAS_COOLDOWN, professor.account.address],
  { value: parseEther(GAS_FAUCET_SEED) },
);
console.log(`      GasFaucet ${gasFaucet.address} (${GAS_FAUCET_SEED} ETH)`);

// --- Pools ------------------------------------------------------------------

console.log("[3/5] Publicando pools...");
const poolFundo = await viem.deployContract("MiniAMM", [
  csr.address, brlx.address, "CESAR LP CSR/BRLX", "CLP",
]);
const poolRaso = await viem.deployContract("MiniAMM", [
  csr.address, brlx.address, "CESAR LP CSR/BRLX (raso)", "CLPR",
]);
console.log(`      fundo ${poolFundo.address}`);
console.log(`      raso  ${poolRaso.address}`);

// --- Semeando liquidez ------------------------------------------------------

console.log("[4/5] Semeando liquidez...");

// Uma transacao por vez, esperando o recibo. `contract.write.*` devolve o hash
// sem confirmar: em rede real, a transacao seguinte pede o nonce antes de a rede
// registrar a anterior, as duas saem com o mesmo nonce e o no rejeita a segunda
// ("replacement transaction underpriced"). No no local os blocos sao instantaneos
// e o problema nao aparece — e exatamente o tipo de bug que so a Sepolia mostra.
const confirmar = async (envio: Promise<`0x${string}`>) => {
  const hash = await envio;
  return publicClient.waitForTransactionReceipt({ hash });
};

await confirmar(csr.write.approve([poolFundo.address, SUPPLY_INICIAL]));
await confirmar(brlx.write.approve([poolFundo.address, SUPPLY_INICIAL]));
await confirmar(poolFundo.write.addLiquidity([POOL_FUNDO_CSR, POOL_FUNDO_BRLX, 0n, 0n]));

await confirmar(csr.write.approve([poolRaso.address, SUPPLY_INICIAL]));
await confirmar(brlx.write.approve([poolRaso.address, SUPPLY_INICIAL]));
await confirmar(poolRaso.write.addLiquidity([POOL_RASO_CSR, POOL_RASO_BRLX, 0n, 0n]));

const slipFundo = await poolFundo.read.previewSwap([csr.address, parseEther("100")]);
const slipRaso = await poolRaso.read.previewSwap([csr.address, parseEther("100")]);
console.log(`      swap de 100 CSR -> slippage ${slipFundo[2]} bps (fundo) / ${slipRaso[2]} bps (raso)`);

// --- Gravando enderecos -----------------------------------------------------

console.log("[5/5] Gravando enderecos...");

// Bloco a partir do qual o front procura eventos. Sem isto, o telao e o
// painel de impermanent loss varreriam a chain inteira a cada refresh.
const deployBlock = await publicClient.getBlockNumber();

const deployment = {
  chainId,
  network: networkName,
  deployedAt: new Date().toISOString(),
  deployBlock: deployBlock.toString(),
  professor: professor.account.address,
  contracts: {
    csr: csr.address,
    brlx: brlx.address,
    gasFaucet: gasFaucet.address,
    poolFundo: poolFundo.address,
    poolRaso: poolRaso.address,
  },
};

const destinos = [
  join(ROOT, "deployments", `${chainId}.json`),
  join(ROOT, "..", "web", "src", "lib", "deployment.json"),
];

for (const destino of destinos) {
  const dir = dirname(destino);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(destino, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`      ${destino}`);
}

console.log("\nPronto.\n");
console.log("Proximos passos:");
console.log("  1. npx hardhat verify --network sepolia <endereco> <args>   (os alunos vao LER esse codigo)");
console.log("  2. npm run fund:sepolia   (gas + tokens para a lista da turma)");
console.log("  3. Adicione CSR e BRLX na sua MetaMask pelos enderecos acima\n");
