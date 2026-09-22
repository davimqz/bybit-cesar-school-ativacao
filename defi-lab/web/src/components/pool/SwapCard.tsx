"use client";

import { useEffect, useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { formatUnits, maxUint256, parseEther, type Address } from "viem";
import {
  Card,
  Stat,
  Botao,
  CampoValor,
  NotaDeAula,
  Aviso,
} from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { abis, TOKENS, fmt, fmtBps } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

const TOLERANCIAS = [50, 100, 500] as const; // em basis points

/** "1.234,56" ou "1234.56" -> wei. Retorna undefined se não der para ler. */
export function paraWei(valor: string): bigint | undefined {
  const limpo = valor.replace(/\s/g, "").replace(",", ".");
  if (!limpo || !/^\d*\.?\d*$/.test(limpo)) return undefined;
  try {
    const wei = parseEther(limpo);
    return wei > 0n ? wei : undefined;
  } catch {
    return undefined;
  }
}

export function SwapCard({
  pool,
  onPrevisto,
}: {
  pool: Address;
  onPrevisto?: (p: { x: number; y: number } | undefined) => void;
}) {
  const { isConnected } = useConnection();
  const [vendendoCsr, setVendendoCsr] = useState(true);
  const [quantia, setQuantia] = useState("");
  const [toleranciaBps, setToleranciaBps] = useState<number>(100);

  const tokenEntrada = vendendoCsr ? TOKENS.csr : TOKENS.brlx;
  const tokenSaida = vendendoCsr ? TOKENS.brlx : TOKENS.csr;

  const valor = paraWei(quantia);
  const { saldoCsr, saldoBrlx, allowanceCsr, allowanceBrlx, refetch } =
    useSaldosEAprovacoes(pool);

  const saldoEntrada = vendendoCsr ? saldoCsr : saldoBrlx;
  const allowanceEntrada = vendendoCsr ? allowanceCsr : allowanceBrlx;

  const txAprovar = useTx();
  const txSwap = useTx();

  // O contrato faz a conta; a tela só mostra. Nenhuma matemática de AMM
  // é reimplementada em JavaScript — a fonte da verdade é a mesma que executa.
  const { data: previsao, error: erroPrevisao } = useReadContract({
    chainId: activeChain.id,
    address: pool,
    abi: abis.pool,
    functionName: "previewSwap",
    args: valor ? [tokenEntrada.address, valor] : undefined,
    query: { enabled: !!valor, refetchInterval: 4000 },
  });

  const { data: reservas } = useReadContract({
    chainId: activeChain.id,
    address: pool,
    abi: abis.pool,
    functionName: "getReserves",
    query: { refetchInterval: 4000 },
  });

  const [recebe, semImpacto, slippageBps] =
    (previsao as readonly [bigint, bigint, bigint] | undefined) ?? [];

  // Avisa a curva onde o pool vai parar, para desenhar o deslocamento.
  useEffect(() => {
    if (!reservas || !valor || recebe === undefined) {
      onPrevisto?.(undefined);
      return;
    }
    const [r0, r1] = reservas as readonly [bigint, bigint];
    const dx = Number(formatUnits(valor, 18));
    const dy = Number(formatUnits(recebe, 18));
    const x = Number(formatUnits(r0, 18));
    const y = Number(formatUnits(r1, 18));
    onPrevisto?.(
      vendendoCsr ? { x: x + dx, y: y - dy } : { x: x - dy, y: y + dx },
    );
  }, [reservas, valor, recebe, vendendoCsr, onPrevisto]);

  const precisaAprovar =
    valor !== undefined && (allowanceEntrada ?? 0n) < valor;
  const saldoInsuficiente = valor !== undefined && (saldoEntrada ?? 0n) < valor;

  const minimoAceito =
    recebe !== undefined
      ? (recebe * BigInt(10_000 - toleranciaBps)) / 10_000n
      : undefined;

  const precoEfetivo =
    recebe !== undefined && valor
      ? Number(formatUnits(recebe, 18)) / Number(formatUnits(valor, 18))
      : undefined;

  return (
    <Card
      titulo="Trocar"
      subtitulo="O preço não é seu: é a razão entre as reservas"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Botao
            variante="secundario"
            onClick={() => setVendendoCsr((v) => !v)}
          >
            {tokenEntrada.symbol} → {tokenSaida.symbol} ⇄
          </Botao>
        </div>

        <CampoValor
          rotulo={`Você entrega (${tokenEntrada.symbol})`}
          valor={quantia}
          onChange={setQuantia}
          sufixo={tokenEntrada.symbol}
          disponivel={fmt(saldoEntrada)}
          onMax={() =>
            saldoEntrada && setQuantia(formatUnits(saldoEntrada, 18))
          }
        />

        {valor && !erroPrevisao && recebe !== undefined && (
          <>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted p-4">
              <Stat
                rotulo="Você recebe"
                valor={fmt(recebe)}
                sufixo={tokenSaida.symbol}
                tom="bom"
              />
              <Stat
                rotulo="Slippage"
                valor={fmtBps(slippageBps)}
                tom={
                  (slippageBps ?? 0n) > 300n
                    ? "ruim"
                    : (slippageBps ?? 0n) > 100n
                      ? "alerta"
                      : "neutro"
                }
                dica={`sem impacto seriam ${fmt(semImpacto)}`}
              />
              <Stat
                rotulo="Preço efetivo"
                valor={
                  precoEfetivo
                    ? precoEfetivo.toLocaleString("pt-BR", {
                        maximumFractionDigits: 4,
                      })
                    : "—"
                }
                sufixo={`${tokenSaida.symbol}/${tokenEntrada.symbol}`}
              />
              <Stat
                rotulo="Mínimo aceito"
                valor={fmt(minimoAceito)}
                sufixo={tokenSaida.symbol}
              />
            </dl>

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tolerância de slippage
              </span>
              <div className="mt-2 flex gap-2">
                {TOLERANCIAS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setToleranciaBps(bps)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      toleranciaBps === bps
                        ? "border-foreground bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:border-input"
                    }`}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {erroPrevisao && valor && (
          <Aviso tom="erro">
            O pool não consegue executar esse tamanho. Geralmente significa que
            você está tentando levar mais do que existe na reserva.
          </Aviso>
        )}

        {saldoInsuficiente && (
          <Aviso tom="alerta">
            Saldo insuficiente de {tokenEntrada.symbol}.
          </Aviso>
        )}

        {/*
          O botao de aprovar NAO some depois de usado. Numerar "1." e "2." nao
          bastava: com o passo 1 fora da tela, o aluno via so um botao sobrando
          e lia o aviso verde do `approve` como se a troca tivesse acontecido.
        */}
        <div className="flex flex-wrap gap-3">
          <Botao
            variante={precisaAprovar ? "primario" : "secundario"}
            disabled={
              !isConnected ||
              !precisaAprovar ||
              txAprovar.ocupada ||
              saldoInsuficiente
            }
            onClick={async () => {
              await txAprovar.enviar({
                address: tokenEntrada.address,
                abi: abis.token,
                functionName: "approve",
                args: [pool, maxUint256],
              });
              refetch();
            }}
          >
            {txAprovar.ocupada
              ? "Aprovando…"
              : precisaAprovar
                ? `Passo 1 de 2 · Aprovar ${tokenEntrada.symbol}`
                : `Passo 1 de 2 · ${tokenEntrada.symbol} aprovado ✓`}
          </Botao>

          <Botao
            disabled={
              !isConnected ||
              !valor ||
              precisaAprovar ||
              saldoInsuficiente ||
              txSwap.ocupada
            }
            onClick={async () => {
              if (!valor || minimoAceito === undefined) return;
              await txSwap.enviar({
                address: pool,
                abi: abis.pool,
                functionName: "swap",
                args: [tokenEntrada.address, valor, minimoAceito],
              });
              refetch();
            }}
          >
            {txSwap.ocupada ? "Trocando…" : "Passo 2 de 2 · Trocar"}
          </Botao>
        </div>

        {!txSwap.hash && (
          <StatusTx
            tx={txAprovar}
            sucesso="Aprovado — e nenhum token saiu da sua carteira ainda. Falta o passo 2: clique em Trocar."
          />
        )}
        <StatusTx tx={txSwap} sucesso="Troca executada." />

        <NotaDeAula>
          <strong>Aprovar</strong> e <strong>trocar</strong> são duas transações
          porque um contrato não pode simplesmente pegar seus tokens: você
          precisa autorizar antes. É o mesmo <code>approve</code> de qualquer
          DEX real — e a razão pela qual aprovações antigas e esquecidas são um
          risco de segurança.
        </NotaDeAula>
      </div>
    </Card>
  );
}
