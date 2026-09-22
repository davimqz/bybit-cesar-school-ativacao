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
export const activeChain =
  deployment.chainId === hardhatLocal.id ? hardhatLocal : sepolia;

/**
 * RPC de leitura do front.
 *
 * O padrão público aguenta uma pessoa testando, não uma turma: com 30 alunos
 * recarregando painéis a cada 2 s ele passa a devolver 429 e os números somem
 * da tela. Defina `NEXT_PUBLIC_SEPOLIA_RPC_URL` (veja `.env.example`) com um
 * endpoint dedicado antes da aula — é o mesmo cuidado que o checklist pede.
 */
const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
  "https://ethereum-sepolia-rpc.publicnode.com";

export const config = createConfig({
  chains: [sepolia, hardhatLocal],

  /**
   * Caminho 1 — EIP-6963, o moderno.
   *
   * Cada extensão anuncia o próprio provider por evento, com nome e id, sem
   * ninguém disputar `window.ethereum`. É agnóstico de carteira e de navegador:
   * MetaMask, Rabby, Coinbase, Brave Wallet, Phantom, em Chrome, Edge, Brave,
   * Firefox ou Opera. Nenhum nome é cravado em lugar nenhum.
   *
   * É o caminho que funciona quando o aluno tem DUAS carteiras instaladas —
   * caso em que uma embrulha a outra num Proxy e a leitura de `window.ethereum`
   * estoura as invariantes de Proxy do JS ('get' on proxy: property
   * 'removeListener' is a read-only and non-configurable data property).
   * A Brave é a suspeita mais comum aqui, porque traz carteira própria ligada
   * de fábrica e ela briga com a MetaMask pela mesma propriedade.
   */
  multiInjectedProviderDiscovery: true,

  /**
   * Caminho 2 — `window.ethereum`, o antigo, como rede de segurança.
   *
   * Carteira desatualizada não anuncia por EIP-6963, e sem este connector o
   * aluno ficaria sem NENHUM botão para clicar. Numa sala onde não dá para
   * padronizar navegador nem versão de extensão, perder esse aluno é pior que
   * um erro no console: o erro de Proxy é barulho que não impede a conexão
   * pelo caminho 1, mas ficar sem connector impede tudo.
   *
   * A ConnectBar só oferece este quando a descoberta não achou ninguém, então
   * quem tem carteira moderna nunca passa por aqui.
   *
   * Sem WalletConnect: a aula roda em desktop com extensão, e menos dependência
   * externa = menos coisa para cair no meio da aula.
   */
  connectors: [injected({ shimDisconnect: true })],

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
