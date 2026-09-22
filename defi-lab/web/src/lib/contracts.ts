import { formatUnits, type Address } from "viem";
import deployment from "./deployment.json";
import { classroomTokenAbi, miniAmmAbi, gasFaucetAbi, miniOrderBookAbi } from "./abis";

export const CONTRACTS = {
  csr: deployment.contracts.csr as Address,
  brlx: deployment.contracts.brlx as Address,
  gasFaucet: deployment.contracts.gasFaucet as Address,
  poolFundo: deployment.contracts.poolFundo as Address,
  poolRaso: deployment.contracts.poolRaso as Address,
  orderBook: deployment.contracts.orderBook as Address,
} as const;

export const PROFESSOR = deployment.professor as Address;
export const CHAIN_ID = deployment.chainId;

export const abis = {
  token: classroomTokenAbi,
  pool: miniAmmAbi,
  gasFaucet: gasFaucetAbi,
  livro: miniOrderBookAbi,
} as const;

/** Os dois pools da aula. `raso` existe para doer. */
export const POOLS = [
  {
    key: "fundo" as const,
    address: CONTRACTS.poolFundo,
    nome: "Pool Fundo",
    descricao: "Liquidez alta. O mercado 'normal'.",
  },
  {
    key: "raso" as const,
    address: CONTRACTS.poolRaso,
    nome: "Pool Raso",
    descricao: "Mesmo par, mesmo preço, 1/100 do tamanho.",
  },
];

export type PoolKey = (typeof POOLS)[number]["key"];

export const TOKENS = {
  csr: { address: CONTRACTS.csr, symbol: "CSR", nome: "CESAR Coin" },
  brlx: { address: CONTRACTS.brlx, symbol: "BRLX", nome: "CESAR Real" },
} as const;

export type TokenKey = keyof typeof TOKENS;

export function tokenPorEndereco(address?: Address) {
  if (!address) return undefined;
  const alvo = address.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === alvo);
}

// --- Formatação -------------------------------------------------------------

/** Número legível num telão: sem notação científica, sem 18 casas. */
export function fmt(valor: bigint | undefined, casas = 2, decimais = 18): string {
  if (valor === undefined) return "—";
  const n = Number(formatUnits(valor, decimais));
  if (n !== 0 && Math.abs(n) < 0.01) return "< 0,01";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Basis points -> percentual. 1687 bps vira "16,87%". */
export function fmtBps(bps: bigint | undefined, casas = 2): string {
  if (bps === undefined) return "—";
  return `${(Number(bps) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

export function encurtar(address?: string): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const EXPLORER_BASE =
  CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : undefined;

export function linkExplorer(tipo: "address" | "tx", valor: string): string | undefined {
  if (!EXPLORER_BASE) return undefined;
  return `${EXPLORER_BASE}/${tipo}/${valor}`;
}

// --- Livro de ordens --------------------------------------------------------

/** O enum `Lado` do MiniOrderBook. */
export const LADO = { compra: 0, venda: 1 } as const;
export type Lado = (typeof LADO)[keyof typeof LADO];

/** Uma ordem como o contrato devolve. */
export type Ordem = {
  id: bigint;
  dono: Address;
  lado: number;
  preco: bigint;
  quantidade: bigint;
  custodiaQuote: bigint;
  viva: boolean;
};

/**
 * Preco por CSR, formatado para a tela.
 *
 * Duas casas somem o degrau do livro (2,02 e 2,05 viram o mesmo numero),
 * entao aqui sao quatro — e a diferenca entre niveis que a aula discute.
 */
export function fmtPreco(preco: bigint | undefined): string {
  if (preco === undefined) return "—";
  return Number(formatUnits(preco, 18)).toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
