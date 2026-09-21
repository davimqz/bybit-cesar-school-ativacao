"use client";

import { useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { formatUnits, maxUint256, type Address } from "viem";
import { Card, Botao, CampoValor, NotaDeAula, Aviso, Stat } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { usePoolData, useSaldosEAprovacoes } from "@/hooks/usePool";
import { abis, TOKENS, fmt } from "@/lib/contracts";
import { paraWei } from "./SwapCard";

/** Margem aplicada aos `*Min` do contrato: 1% de folga. */
const FOLGA_BPS = 100n;

export function LiquidezCard({ pool }: { pool: Address }) {
  const { isConnected } = useConnection();
  const [aba, setAba] = useState<"depositar" | "retirar">("depositar");

  return (
    <Card titulo="Ser o outro lado" subtitulo="Fornecer liquidez e viver de taxas">
      <div className="mb-5 flex gap-2">
        {(["depositar", "retirar"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              aba === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {aba === "depositar" ? <Depositar pool={pool} conectado={isConnected} /> : <Retirar pool={pool} conectado={isConnected} />}
    </Card>
  );
}

function Depositar({ pool, conectado }: { pool: Address; conectado: boolean }) {
  const [quantiaCsr, setQuantiaCsr] = useState("");
  const valorCsr = paraWei(quantiaCsr);

  const { reserve0, reserve1 } = usePoolData(pool);
  const { saldoCsr, saldoBrlx, allowanceCsr, allowanceBrlx, refetch } = useSaldosEAprovacoes(pool);

  const txAprovarCsr = useTx();
  const txAprovarBrlx = useTx();
  const txDepositar = useTx();

  // Quanto de BRLX o pool exige para acompanhar esse CSR. O pool não aceita
  // qualquer proporção: ele impõe a razão atual entre as reservas.
  const { data: brlxNecessario } = useReadContract({
    address: pool,
    abi: abis.pool,
    functionName: "quote",
    args: valorCsr && reserve0 && reserve1 ? [valorCsr, reserve0, reserve1] : undefined,
    query: { enabled: !!valorCsr && !!reserve0 && !!reserve1 },
  });

  const par = brlxNecessario as bigint | undefined;

  const faltaCsr = valorCsr !== undefined && (saldoCsr ?? 0n) < valorCsr;
  const faltaBrlx = par !== undefined && (saldoBrlx ?? 0n) < par;
  const aprovarCsr = valorCsr !== undefined && (allowanceCsr ?? 0n) < valorCsr;
  const aprovarBrlx = par !== undefined && (allowanceBrlx ?? 0n) < par;

  return (
    <div className="space-y-4">
      <CampoValor
        rotulo="Você deposita"
        valor={quantiaCsr}
        onChange={setQuantiaCsr}
        sufixo="CSR"
        disponivel={fmt(saldoCsr)}
        onMax={() => saldoCsr && setQuantiaCsr(formatUnits(saldoCsr, 18))}
      />

      {par !== undefined && (
        <div className="rounded-xl bg-slate-50 p-4">
          <Stat
            rotulo="E o pool exige, junto"
            valor={fmt(par)}
            sufixo="BRLX"
            tom={faltaBrlx ? "ruim" : "neutro"}
            dica="proporção definida pelas reservas atuais, não por você"
          />
        </div>
      )}

      {(faltaCsr || faltaBrlx) && (
        <Aviso tom="alerta">
          Saldo insuficiente de {faltaCsr ? "CSR" : "BRLX"}. Pegue mais no faucet.
        </Aviso>
      )}

      <div className="flex flex-wrap gap-3">
        {aprovarCsr && (
          <Botao
            disabled={!conectado || txAprovarCsr.ocupada}
            onClick={async () => {
              await txAprovarCsr.enviar({
                address: TOKENS.csr.address,
                abi: abis.token,
                functionName: "approve",
                args: [pool, maxUint256],
              });
              refetch();
            }}
          >
            Aprovar CSR
          </Botao>
        )}
        {aprovarBrlx && (
          <Botao
            disabled={!conectado || txAprovarBrlx.ocupada}
            onClick={async () => {
              await txAprovarBrlx.enviar({
                address: TOKENS.brlx.address,
                abi: abis.token,
                functionName: "approve",
                args: [pool, maxUint256],
              });
              refetch();
            }}
          >
            Aprovar BRLX
          </Botao>
        )}
        <Botao
          disabled={
            !conectado || !valorCsr || par === undefined || aprovarCsr || aprovarBrlx ||
            faltaCsr || faltaBrlx || txDepositar.ocupada
          }
          onClick={async () => {
            if (!valorCsr || par === undefined) return;
            await txDepositar.enviar({
              address: pool,
              abi: abis.pool,
              functionName: "addLiquidity",
              args: [
                valorCsr,
                par,
                (valorCsr * (10_000n - FOLGA_BPS)) / 10_000n,
                (par * (10_000n - FOLGA_BPS)) / 10_000n,
              ],
            });
            refetch();
          }}
        >
          {txDepositar.ocupada ? "Depositando…" : "Virar LP"}
        </Botao>
      </div>

      <StatusTx tx={txAprovarCsr} sucesso="CSR aprovado." />
      <StatusTx tx={txAprovarBrlx} sucesso="BRLX aprovado." />
      <StatusTx tx={txDepositar} sucesso="Você agora é provedor de liquidez." />

      <NotaDeAula>
        Você não escolhe a proporção do aporte: o pool impõe a razão atual entre as reservas.
        Depositar fora dela seria mover o preço de graça — e alguém arbitraria isso no bloco
        seguinte.
      </NotaDeAula>
    </div>
  );
}

function Retirar({ pool, conectado }: { pool: Address; conectado: boolean }) {
  const [percentual, setPercentual] = useState(100);
  const { minhasShares, minhaPosicao0, minhaPosicao1, refetch } = usePoolData(pool);
  const tx = useTx();

  const shares = minhasShares ? (minhasShares * BigInt(percentual)) / 100n : 0n;
  const recebe0 = minhaPosicao0 ? (minhaPosicao0 * BigInt(percentual)) / 100n : 0n;
  const recebe1 = minhaPosicao1 ? (minhaPosicao1 * BigInt(percentual)) / 100n : 0n;

  const semPosicao = !minhasShares || minhasShares === 0n;

  if (semPosicao) {
    return <Aviso tom="info">Você ainda não tem posição neste pool.</Aviso>;
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Quanto retirar
        </span>
        <div className="mt-2 flex gap-2">
          {[25, 50, 100].map((p) => (
            <button
              key={p}
              onClick={() => setPercentual(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                percentual === p
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
        <Stat rotulo="Você recebe" valor={fmt(recebe0)} sufixo="CSR" />
        <Stat rotulo="Você recebe" valor={fmt(recebe1)} sufixo="BRLX" />
      </dl>

      <Botao
        disabled={!conectado || shares === 0n || tx.ocupada}
        onClick={async () => {
          await tx.enviar({
            address: pool,
            abi: abis.pool,
            functionName: "removeLiquidity",
            args: [
              shares,
              (recebe0 * (10_000n - FOLGA_BPS)) / 10_000n,
              (recebe1 * (10_000n - FOLGA_BPS)) / 10_000n,
            ],
          });
          refetch();
        }}
      >
        {tx.ocupada ? "Retirando…" : "Retirar liquidez"}
      </Botao>

      <StatusTx tx={tx} sucesso="Posição encerrada." />

      <NotaDeAula>
        Repare na composição do que volta: dificilmente é a mesma cesta que você depositou.
        O pool te devolve mais do ativo que caiu e menos do que subiu — a mecânica por trás
        da perda impermanente.
      </NotaDeAula>
    </div>
  );
}
