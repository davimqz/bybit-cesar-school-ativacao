import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin],

  solidity: {
    profiles: {
      default: { version: "0.8.28" },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },

  networks: {
    // Rede local: e aqui que a aula e ensaiada. Blocos instantaneos e,
    // principalmente, controle do relogio (ver scripts/ e os testes).
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },

    // `npm run node` em um terminal + `--network localhost` no outro.
    // E assim que voce ensaia a aula inteira sem gastar ETH de faucet.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      accounts: "remote",
    },

    // Rede da aula. Sepolia ja vem configurada na MetaMask — a turma so
    // precisa habilitar "show test networks".
    sepolia: {
      type: "http",
      chainType: "l1",
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },

  // Contratos verificados no Etherscan nao sao detalhe: e o que permite o
  // aluno ler o codigo que acabou de executar. "Leia antes de confiar."
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
};

export default config;
