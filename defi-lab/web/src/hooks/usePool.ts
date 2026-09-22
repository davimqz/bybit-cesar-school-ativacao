"use client";

import { useConnection, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { abis, CONTRACTS } from "@/lib/contracts";
import deployment from "@/lib/deployment.json";
import { activeChain, clienteDeLogs } from "@/lib/wagmi";

/** Leitura completa de um pool + a posição do aluno nele. */
export function usePoolData(pool: Address) {
  const { address } = useConnection();
  const base = {
    address: pool,
    abi: abis.pool,
    chainId: activeChain.id,
  } as const;

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "reserve0" },
      { ...base, functionName: "reserve1" },
      { ...base, functionName: "invariant" },
      { ...base, functionName: "spotPrice0In1" },
      { ...base, functionName: "totalSupply" },
      { ...base, functionName: "balanceOf", args: [address ?? "0x0"] },
      { ...base, functionName: "positionValue", args: [address ?? "0x0"] },
    ],
    query: { refetchInterval: 4000 },
  });

  const posicao = data?.[6]?.result as readonly [bigint, bigint] | undefined;

  return {
    reserve0: data?.[0]?.result as bigint | undefined,
    reserve1: data?.[1]?.result as bigint | undefined,
    k: data?.[2]?.result as bigint | undefined,
    spot: data?.[3]?.result as bigint | undefined,
    totalShares: data?.[4]?.result as bigint | undefined,
    minhasShares: data?.[5]?.result as bigint | undefined,
    minhaPosicao0: posicao?.[0],
    minhaPosicao1: posicao?.[1],
    refetch,
    isLoading,
  };
}

/** Saldos e allowances do aluno para os dois tokens do par. */
export function useSaldosEAprovacoes(spender: Address) {
  const { address } = useConnection();
  const habilitado = !!address;

  // `chainId` em CADA contrato, não no topo da chamada: o `readContracts` do
  // wagmi agrupa por `contract.chainId ?? config.state.chainId` e descarta um
  // chainId de nível superior. No topo ele passa no TypeScript e não faz nada.
  const token = { abi: abis.token, chainId: activeChain.id } as const;

  const { data, refetch } = useReadContracts({
    contracts: [
      {
        ...token,
        address: CONTRACTS.csr,
        functionName: "balanceOf",
        args: [address ?? "0x0"],
      },
      {
        ...token,
        address: CONTRACTS.brlx,
        functionName: "balanceOf",
        args: [address ?? "0x0"],
      },
      {
        ...token,
        address: CONTRACTS.csr,
        functionName: "allowance",
        args: [address ?? "0x0", spender],
      },
      {
        ...token,
        address: CONTRACTS.brlx,
        functionName: "allowance",
        args: [address ?? "0x0", spender],
      },
    ],
    query: { enabled: habilitado, refetchInterval: 4000 },
  });

  return {
    saldoCsr: data?.[0]?.result as bigint | undefined,
    saldoBrlx: data?.[1]?.result as bigint | undefined,
    allowanceCsr: data?.[2]?.result as bigint | undefined,
    allowanceBrlx: data?.[3]?.result as bigint | undefined,
    refetch,
  };
}

const EVENTO_LIQUIDEZ_ADICIONADA = parseAbiItem(
  "event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 shares)",
);

/**
 * Soma tudo que o aluno já depositou neste pool, lendo os eventos.
 *
 * É a base da comparação de impermanent loss: "a cesta que você entregou"
 * contra "o que você tiraria hoje". Com vários aportes em preços diferentes
 * a conta vira uma aproximação — o que é suficiente para o ponto da aula,
 * e está dito na tela para ninguém sair com a ideia errada.
 */
export function useDepositosDoAluno(pool: Address) {
  const { address } = useConnection();

  return useQuery({
    queryKey: ["depositos", pool, address],
    enabled: !!address,
    refetchInterval: 8000,
    queryFn: async () => {
      if (!address) return { total0: 0n, total1: 0n, aportes: 0 };

      const logs = await clienteDeLogs.getLogs({
        address: pool,
        event: EVENTO_LIQUIDEZ_ADICIONADA,
        args: { provider: address },
        fromBlock: BigInt(deployment.deployBlock ?? "0"),
        toBlock: "latest",
      });

      let total0 = 0n;
      let total1 = 0n;
      for (const log of logs) {
        total0 += log.args.amount0 ?? 0n;
        total1 += log.args.amount1 ?? 0n;
      }
      return { total0, total1, aportes: logs.length };
    },
  });
}
