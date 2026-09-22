"use client";

import { useConnection, useReadContracts } from "wagmi";
import { CONTRACTS, abis } from "@/lib/contracts";
import { useAgora } from "@/hooks/useEscrow";
import { activeChain } from "@/lib/wagmi";

/**
 * Leitura do cofre de staking.
 *
 * `refetchInterval` curto de propósito: o `pendente` do contrato projeta o tempo
 * desde o último bloco, então o número sobe na tela sozinho. Num lab de
 * rendimento, ver o número mexer é metade da aula.
 */
export function useStaking() {
  const { address } = useConnection();
  const agora = useAgora();
  const base = {
    address: CONTRACTS.staking,
    abi: abis.staking,
    chainId: activeChain.id,
  } as const;
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
      { ...base, functionName: "ultimaAtualizacao" },
    ],
    query: { refetchInterval: 2000 },
  });

  const posicao = data?.[5]?.result as
    readonly [bigint, bigint, bigint] | undefined;

  const totalEmStake = data?.[0]?.result as bigint | undefined;
  const reservaArmazenada = data?.[1]?.result as bigint | undefined;
  const taxaPorSegundo = data?.[2]?.result as bigint | undefined;
  const ultimaAtualizacao = data?.[8]?.result as bigint | undefined;

  /**
   * A reserva que o contrato TERIA agora, não a que está gravada.
   *
   * `reservaDeRecompensa` só é debitada quando alguém transaciona — o contrato
   * faz a conta preguiçosamente, como todo MasterChef. Ler o número cru deixaria
   * "Reserva restante" e "Dura mais" parados na tela enquanto o rendimento sobe,
   * que é exatamente o contrário do que esta página existe para mostrar. Aqui
   * repetimos a projeção de `_atualizar()`: mesma fórmula, mesmo teto.
   */
  const reserva = (() => {
    if (reservaArmazenada === undefined) return undefined;
    if (
      totalEmStake === undefined ||
      taxaPorSegundo === undefined ||
      ultimaAtualizacao === undefined ||
      totalEmStake === 0n
    ) {
      // Cofre vazio não emite: a reserva espera, igual ao contrato.
      return reservaArmazenada;
    }
    const decorrido = BigInt(agora) - ultimaAtualizacao;
    if (decorrido <= 0n) return reservaArmazenada;
    const devido = decorrido * taxaPorSegundo;
    return devido >= reservaArmazenada ? 0n : reservaArmazenada - devido;
  })();

  const segundosDeReserva =
    reserva !== undefined && taxaPorSegundo !== undefined && taxaPorSegundo > 0n
      ? reserva / taxaPorSegundo
      : reserva === undefined
        ? undefined
        : 0n;

  /**
   * APR projetado. O do contrato usa a reserva gravada, então continua
   * anunciando rendimento depois de a emissão ter secado de fato.
   */
  const aprBps =
    totalEmStake === undefined ||
    taxaPorSegundo === undefined ||
    reserva === undefined
      ? undefined
      : totalEmStake === 0n || reserva === 0n
        ? 0n
        : (taxaPorSegundo * 31_536_000n * 10_000n) / totalEmStake;

  return {
    totalEmStake,
    reserva,
    taxaPorSegundo,
    aprBps,
    segundosDeReserva,
    minhaPosicao: posicao?.[0],
    /** Rendimento já fechado e ainda não sacado — sobrevive a retirar o principal. */
    naoColhido: posicao?.[2],
    pendente: data?.[6]?.result as bigint | undefined,
    minhaFatiaBps: data?.[7]?.result as bigint | undefined,
    refetch,
    isLoading,
  };
}
