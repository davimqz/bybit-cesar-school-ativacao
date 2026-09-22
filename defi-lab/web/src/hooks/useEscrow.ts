"use client";

import { useEffect, useState } from "react";
import { useConnection, useReadContracts } from "wagmi";
import { CONTRACTS, ESTADO, abis, type Acordo } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

/**
 * Leitura do escrow: todos os acordos, mais os que envolvem quem está conectado.
 *
 * O contrato devolve o array inteiro — a turma cabe nele, e ler tudo de uma vez
 * é mais simples (e mais barato em RPC) que paginar por id.
 */
export function useEscrow() {
  const { address } = useConnection();
  const base = {
    address: CONTRACTS.escrow,
    abi: abis.escrow,
    chainId: activeChain.id,
  } as const;

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "todos" },
      { ...base, functionName: "emCustodia" },
    ],
    query: { refetchInterval: 4000 },
  });

  const acordos = (data?.[0]?.result as readonly Acordo[] | undefined) ?? [];
  const eu = address?.toLowerCase();

  const meus = eu
    ? acordos.filter(
        (a) =>
          a.comprador.toLowerCase() === eu ||
          a.vendedor.toLowerCase() === eu ||
          a.arbitro.toLowerCase() === eu,
      )
    : [];

  return {
    acordos,
    // Mais recentes primeiro: numa aula, o acordo que importa é o que acabou de nascer.
    meus: [...meus].reverse(),
    disputas: acordos.filter((a) => Number(a.estado) === ESTADO.emDisputa),
    emCustodia: data?.[1]?.result as bigint | undefined,
    refetch,
    isLoading,
  };
}

/**
 * Relógio de parede, em segundos, para as contagens regressivas.
 *
 * Os prazos do contrato vivem em `block.timestamp`, que em rede real acompanha o
 * tempo de verdade — então comparar com o relógio do navegador é suficiente, e
 * poupa uma leitura de bloco por segundo.
 */
export function useAgora(intervaloMs = 1000) {
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(
      () => setAgora(Math.floor(Date.now() / 1000)),
      intervaloMs,
    );
    return () => clearInterval(t);
  }, [intervaloMs]);

  return agora;
}
