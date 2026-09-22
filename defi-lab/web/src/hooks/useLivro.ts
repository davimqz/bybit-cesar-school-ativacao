"use client";

import { useConnection, useReadContracts } from "wagmi";
import { CONTRACTS, LADO, abis, type Ordem } from "@/lib/contracts";

/**
 * Leitura completa do livro de ordens.
 *
 * O contrato devolve as ordens vivas sem ordem nenhuma — quem ordena é a tela,
 * porque é aqui que "melhor preço primeiro" deixa de ser abstrato e vira a
 * primeira linha da lista.
 */
export function useLivro() {
  const { address } = useConnection();
  const base = { address: CONTRACTS.orderBook, abi: abis.livro } as const;

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...base, functionName: "livro" },
      { ...base, functionName: "melhorCompra" },
      { ...base, functionName: "melhorVenda" },
      { ...base, functionName: "spreadBps" },
      { ...base, functionName: "ordensVivas" },
    ],
    query: { refetchInterval: 4000 },
  });

  const ordens = (data?.[0]?.result as readonly Ordem[] | undefined) ?? [];
  const melhorCompra = data?.[1]?.result as readonly [bigint, bigint] | undefined;
  const melhorVenda = data?.[2]?.result as readonly [bigint, bigint] | undefined;

  // Vendas: menor preço primeiro (o mais barato é o melhor para quem compra).
  const vendas = ordens
    .filter((o) => Number(o.lado) === LADO.venda)
    .sort((a, b) => (a.preco === b.preco ? Number(a.id - b.id) : a.preco < b.preco ? -1 : 1));

  // Compras: maior preço primeiro.
  const compras = ordens
    .filter((o) => Number(o.lado) === LADO.compra)
    .sort((a, b) => (a.preco === b.preco ? Number(a.id - b.id) : a.preco > b.preco ? -1 : 1));

  const minhas = address
    ? ordens.filter((o) => o.dono.toLowerCase() === address.toLowerCase())
    : [];

  return {
    vendas,
    compras,
    minhas,
    bid: melhorCompra?.[0],
    bidQtd: melhorCompra?.[1],
    ask: melhorVenda?.[0],
    askQtd: melhorVenda?.[1],
    spreadBps: data?.[3]?.result as bigint | undefined,
    ordensVivas: data?.[4]?.result as bigint | undefined,
    /** Preço do meio: a referência que a tela usa quando não há negócio fechado. */
    meio:
      melhorCompra?.[0] && melhorVenda?.[0] && melhorCompra[0] > 0n && melhorVenda[0] > 0n
        ? (melhorCompra[0] + melhorVenda[0]) / 2n
        : undefined,
    refetch,
    isLoading,
  };
}

/** Profundidade acumulada de um lado, para desenhar as barras do livro. */
export function acumulado(ordens: readonly Ordem[]): bigint[] {
  const saida: bigint[] = [];
  let soma = 0n;
  for (const o of ordens) {
    soma += o.quantidade;
    saida.push(soma);
  }
  return saida;
}
