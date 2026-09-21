import { network } from "hardhat";
import { parseEther, formatEther, isAddress, getAddress } from "viem";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * D-1: abastece a turma.
 *
 * Le students.json (lista de enderecos coletada no formulario de pre-aula),
 * deposita ETH no GasFaucet e manda gas + tokens para cada aluno.
 *
 *   npm run fund:sepolia
 *
 * Roda quantas vezes quiser: e idempotente no sentido de que so adiciona.
 * Alunos que chegarem sem estar na lista usam o faucet no proprio app.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GAS_POR_ALUNO = parseEther(process.env.GAS_POR_ALUNO ?? "0.02");
const CSR_POR_ALUNO = parseEther(process.env.CSR_POR_ALUNO ?? "5000");
const BRLX_POR_ALUNO = parseEther(process.env.BRLX_POR_ALUNO ?? "10000");
const RESERVA_FAUCET = parseEther(process.env.RESERVA_FAUCET ?? "0.3");

const { viem, networkName } = await network.connect();
const publicClient = await viem.getPublicClient();
const [professor] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

// --- Carrega deployment e lista da turma ------------------------------------

const deploymentPath = join(ROOT, "deployments", `${chainId}.json`);
if (!existsSync(deploymentPath)) {
  throw new Error(`Sem deployment para chainId ${chainId}. Rode o deploy antes.`);
}
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

const studentsPath = join(ROOT, "students.json");
if (!existsSync(studentsPath)) {
  throw new Error(
    "students.json nao encontrado. Crie a partir de students.example.json com os enderecos da turma.",
  );
}
const raw: unknown = JSON.parse(readFileSync(studentsPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("students.json deve ser um array de enderecos.");

const invalidos = raw.filter((a) => typeof a !== "string" || !isAddress(a));
if (invalidos.length > 0) {
  console.warn(`\nAVISO: ${invalidos.length} entrada(s) invalida(s) ignorada(s):`);
  invalidos.forEach((a) => console.warn(`  ${String(a)}`));
}

// Dedupe: aluno que preencheu o formulario duas vezes nao recebe em dobro.
const alunos = [
  ...new Set(
    raw.filter((a): a is string => typeof a === "string" && isAddress(a)).map((a) => getAddress(a)),
  ),
];

if (alunos.length === 0) throw new Error("Nenhum endereco valido em students.json.");

// --- Confere se o orcamento fecha ANTES de comecar a gastar -----------------

const csr = await viem.getContractAt("ClassroomToken", deployment.contracts.csr);
const brlx = await viem.getContractAt("ClassroomToken", deployment.contracts.brlx);
const gasFaucet = await viem.getContractAt("GasFaucet", deployment.contracts.gasFaucet);

const saldo = await publicClient.getBalance({ address: professor.account.address });
const necessario = GAS_POR_ALUNO * BigInt(alunos.length) + RESERVA_FAUCET;

console.log(`\n=== DeFi Lab — abastecendo a turma ===`);
console.log(`rede        ${networkName} (chainId ${chainId})`);
console.log(`alunos      ${alunos.length}`);
console.log(`por aluno   ${formatEther(GAS_POR_ALUNO)} ETH + ${formatEther(CSR_POR_ALUNO)} CSR + ${formatEther(BRLX_POR_ALUNO)} BRLX`);
console.log(`reserva     ${formatEther(RESERVA_FAUCET)} ETH no GasFaucet`);
console.log(`saldo       ${formatEther(saldo)} ETH`);
console.log(`necessario  ~${formatEther(necessario)} ETH (+ gas das transacoes)\n`);

if (saldo < necessario) {
  throw new Error(
    `Saldo insuficiente. Faltam ~${formatEther(necessario - saldo)} ETH. ` +
      `Passe nos faucets de Sepolia ou reduza GAS_POR_ALUNO.`,
  );
}

// --- Abastece o GasFaucet (a rede de seguranca da aula) ---------------------

if (RESERVA_FAUCET > 0n) {
  console.log("Depositando no GasFaucet...");
  const hash = await professor.sendTransaction({
    to: gasFaucet.address,
    value: RESERVA_FAUCET,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  const restantes = await gasFaucet.read.remainingClaims();
  console.log(`  ok — o faucet atende mais ${restantes} saques\n`);
}

// --- Distribui ---------------------------------------------------------------

let ok = 0;
const falhas: { aluno: string; erro: string }[] = [];

for (const [i, aluno] of alunos.entries()) {
  const prefixo = `[${String(i + 1).padStart(2, "0")}/${alunos.length}] ${aluno}`;
  try {
    const saldoAluno = await publicClient.getBalance({ address: aluno });

    // Nao reenvia ETH para quem ja tem — economiza o faucet de Sepolia,
    // que e o recurso mais escasso da operacao.
    if (saldoAluno < GAS_POR_ALUNO / 2n) {
      const hash = await professor.sendTransaction({ to: aluno, value: GAS_POR_ALUNO });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    await csr.write.transfer([aluno, CSR_POR_ALUNO]);
    await brlx.write.transfer([aluno, BRLX_POR_ALUNO]);

    console.log(`${prefixo}  ok`);
    ok++;
  } catch (e) {
    const erro = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.error(`${prefixo}  FALHOU — ${erro}`);
    falhas.push({ aluno, erro });
  }
}

console.log(`\n${ok}/${alunos.length} abastecidos.`);
if (falhas.length > 0) {
  console.log("\nRefaca estes (ou deixe que usem o faucet do app):");
  falhas.forEach((f) => console.log(`  ${f.aluno}`));
}

const saldoFinal = await publicClient.getBalance({ address: professor.account.address });
console.log(`\nSaldo restante: ${formatEther(saldoFinal)} ETH\n`);
