"use client";

import { useConnection, useReadContracts } from "wagmi";
import { CONTRACTS, abis } from "@/lib/contracts";

/**
 * Leitura do cofre de staking.
 *
 * `refetchInterval` curto de propósito: o `pendente` do contrato projeta o tempo
 * desde o último bloco, então o número sobe na tela sozinho. Num lab de
 * rendimento, ver o número mexer é metade da aula.
 */
export function useStaking() {
  const { address } = useConnection();
  const base = { address: CONTRACTS.staking, abi: abis.staking } as const;
  const eu = address ?? "0x0000000000000000000000000000000000000000";

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "totalEmStake" },
      { ...base, functionName: "reservaDeRecompensa" },
      { ...base, functionName: "taxaPorSegundo" },
      { ...base, functionName: "aprBps" },
      { ...base, functionName: "segundosDeReserva" },
      { ...base, functionName: "posicoes", args: [eu] },
      { ...base, functionName: "pendente", args: [eu] },
      { ...base, functionName: "fatiaBps", args: [eu] },
    ],
    query: { refetchInterval: 2000 },
  });

  const posicao = data?.[5]?.result as readonly [bigint, bigint, bigint] | undefined;

  return {
    totalEmStake: data?.[0]?.result as bigint | undefined,
    reserva: data?.[1]?.result as bigint | undefined,
    taxaPorSegundo: data?.[2]?.result as bigint | undefined,
    aprBps: data?.[3]?.result as bigint | undefined,
    segundosDeReserva: data?.[4]?.result as bigint | undefined,
    minhaPosicao: posicao?.[0],
    pendente: data?.[6]?.result as bigint | undefined,
    minhaFatiaBps: data?.[7]?.result as bigint | undefined,
    refetch,
    isLoading,
  };
}
