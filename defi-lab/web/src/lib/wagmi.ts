import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";
import deployment from "./deployment.json";

/** Nó local do Hardhat — usado no ensaio da aula. */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/**
 * A rede em que os contratos publicados vivem. Sai do deployment.json,
 * que é escrito pelo script de deploy — ninguém digita chainId a mão.
 */
export const activeChain = deployment.chainId === hardhatLocal.id ? hardhatLocal : sepolia;

const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const config = createConfig({
  chains: [sepolia, hardhatLocal],
  // Só MetaMask (e qualquer carteira injetada). Sem WalletConnect: a aula
  // inteira roda em desktop com extensão, e menos dependência = menos falha.
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC),
    [hardhatLocal.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
