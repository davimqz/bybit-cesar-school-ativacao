import { formatUnits, type Address } from "viem";
import deployment from "./deployment.json";
import {
  classroomTokenAbi,
  miniAmmAbi,
  gasFaucetAbi,
  miniOrderBookAbi,
  miniStakingAbi,
  miniEscrowAbi,
  miniCrowdfundingAbi,
} from "./abis";

export const CONTRACTS = {
  csr: deployment.contracts.csr as Address,
  brlx: deployment.contracts.brlx as Address,
  gasFaucet: deployment.contracts.gasFaucet as Address,
  poolFundo: deployment.contracts.poolFundo as Address,
  poolRaso: deployment.contracts.poolRaso as Address,
  orderBook: deployment.contracts.orderBook as Address,
  staking: deployment.contracts.staking as Address,
  escrow: deployment.contracts.escrow as Address,
  crowdfunding: deployment.contracts.crowdfunding as Address,
} as const;

export const PROFESSOR = deployment.professor as Address;
export const CHAIN_ID = deployment.chainId;

export const abis = {
  token: classroomTokenAbi,
  pool: miniAmmAbi,
  gasFaucet: gasFaucetAbi,
  livro: miniOrderBookAbi,
  staking: miniStakingAbi,
  escrow: miniEscrowAbi,
  crowdfunding: miniCrowdfundingAbi,
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

// --- Staking ----------------------------------------------------------------

/**
 * APR -> APY, com capitalizacao a cada `periodos` no ano.
 *
 * O contrato so sabe o APR: ele emite de forma linear. O APY e uma projecao de
 * quem reinveste, e por isso mora aqui no front e nao na blockchain — nenhum
 * contrato pode prometer que voce vai clicar em "reinvestir" toda semana.
 */
export function aprParaApy(aprBps: bigint | undefined, periodos = 52): number | undefined {
  if (aprBps === undefined) return undefined;
  const apr = Number(aprBps) / 10_000;
  return (1 + apr / periodos) ** periodos - 1;
}

/** Percentual grande sem virar notacao cientifica nem ocupar a tela inteira. */
export function fmtPct(fracao: number | undefined, casas = 2): string {
  if (fracao === undefined || !Number.isFinite(fracao)) return "—";
  const pct = fracao * 100;
  if (pct >= 1e9) return `${(pct / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi%`;
  if (pct >= 1e6) return `${(pct / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi%`;
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

/** Segundos -> "2 d 4 h", para o prazo de validade da reserva. */
export function fmtDuracao(segundos: bigint | undefined): string {
  if (segundos === undefined) return "—";
  const s = Number(segundos);
  if (s <= 0) return "acabou";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

// --- Escrow -----------------------------------------------------------------

/** O enum `Estado` do MiniEscrow, na ordem do contrato. */
export const ESTADO = {
  financiado: 0,
  enviado: 1,
  concluido: 2,
  reembolsado: 3,
  emDisputa: 4,
} as const;

export type Acordo = {
  id: bigint;
  comprador: Address;
  vendedor: Address;
  arbitro: Address;
  valor: bigint;
  prazoEnvio: bigint;
  momentoEnvio: bigint;
  estado: number;
  descricao: string;
};

/** Rótulo, cor e explicação de cada estado — a tela inteira depende disto. */
export const ESTADOS: Record<
  number,
  { rotulo: string; tom: "neutro" | "bom" | "ruim" | "alerta"; explicacao: string }
> = {
  [ESTADO.financiado]: {
    rotulo: "Financiado",
    tom: "alerta",
    explicacao: "O dinheiro está travado no contrato. O vendedor ainda não marcou envio.",
  },
  [ESTADO.enviado]: {
    rotulo: "Enviado",
    tom: "neutro",
    explicacao: "O vendedor declarou o envio. O comprador tem uma janela para reclamar.",
  },
  [ESTADO.concluido]: {
    rotulo: "Concluído",
    tom: "bom",
    explicacao: "O valor foi para o vendedor. Acordo encerrado, sem volta.",
  },
  [ESTADO.reembolsado]: {
    rotulo: "Reembolsado",
    tom: "bom",
    explicacao: "O valor voltou para o comprador. Acordo encerrado, sem volta.",
  },
  [ESTADO.emDisputa]: {
    rotulo: "Em disputa",
    tom: "ruim",
    explicacao: "Congelado. Só o árbitro decide agora — nem o relógio resolve.",
  },
};

/** Contagem regressiva legível. Negativo vira "venceu". */
export function fmtRestante(alvo: bigint | undefined, agora: number): string {
  if (alvo === undefined || alvo === 0n) return "—";
  const s = Number(alvo) - agora;
  if (s <= 0) return "venceu";
  const m = Math.floor(s / 60);
  const seg = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${m}:${String(seg).padStart(2, "0")}`;
}

// --- Crowdfunding -----------------------------------------------------------

/** O enum `Situacao` do MiniCrowdfunding. */
export const SITUACAO = {
  arrecadando: 0,
  metaBatida: 1,
  sacada: 2,
  falhou: 3,
} as const;

export type Campanha = {
  id: bigint;
  criador: Address;
  titulo: string;
  meta: bigint;
  prazo: bigint;
  arrecadado: bigint;
  apoiadores: bigint;
  sacada: boolean;
};

export const SITUACOES: Record<
  number,
  { rotulo: string; tom: "neutro" | "bom" | "ruim" | "alerta"; explicacao: string }
> = {
  [SITUACAO.arrecadando]: {
    rotulo: "Arrecadando",
    tom: "neutro",
    explicacao: "Ainda dentro do prazo e abaixo da meta. O criador não consegue sacar.",
  },
  [SITUACAO.metaBatida]: {
    rotulo: "Meta batida",
    tom: "bom",
    explicacao: "O criador já pode sacar tudo. Quem contribuiu não tem mais reembolso.",
  },
  [SITUACAO.sacada]: {
    rotulo: "Sacada",
    tom: "bom",
    explicacao: "O dinheiro foi para o criador. Campanha encerrada.",
  },
  [SITUACAO.falhou]: {
    rotulo: "Falhou",
    tom: "ruim",
    explicacao: "Prazo vencido sem bater a meta. Cada apoiador saca o que colocou.",
  },
};

/** A situação calculada no front, igual ao `situacao()` do contrato. */
export function situacaoDaCampanha(c: Campanha, agora: number): number {
  if (c.sacada) return SITUACAO.sacada;
  if (c.arrecadado >= c.meta) return SITUACAO.metaBatida;
  if (Number(c.prazo) <= agora) return SITUACAO.falhou;
  return SITUACAO.arrecadando;
}
