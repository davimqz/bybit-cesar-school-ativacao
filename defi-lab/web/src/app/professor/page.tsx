"use client";

import { useState } from "react";
import { useConnection, useReadContract, useBalance } from "wagmi";
import { formatUnits, isAddressEqual, maxUint256, parseEther, type Address } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { usePoolData, useSaldosEAprovacoes } from "@/hooks/usePool";
import { abis, CONTRACTS, POOLS, PROFESSOR, TOKENS, fmt, fmtBps } from "@/lib/contracts";
import { paraWei } from "@/components/pool/SwapCard";

/**
 * Painel do professor.
 *
 * O controle de acesso é o `owner` dos contratos — não uma senha no front.
 * Se um aluno curioso abrir esta página, ele vê os botões e descobre que o
 * contrato recusa a transação dele. Isso é uma aula, não um bug.
 */
export default function ProfessorPage() {
  const { address, isConnected } = useConnection();
  const ehProfessor = !!address && isAddressEqual(address, PROFESSOR);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Painel do professor</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Os controles que movem o mercado ao vivo. Use o whale swap depois que a turma
          estiver posicionada como LP — é ali que a perda impermanente aparece na tela de
          todo mundo ao mesmo tempo.
        </p>
      </div>

      <Card>
        <ConnectBar />
      </Card>

      {isConnected && !ehProfessor && (
        <Aviso tom="alerta">
          Esta carteira não é a dona dos contratos. Você consegue ver os controles, mas as
          funções restritas vão reverter — o <code>onlyOwner</code> mora no contrato, não
          nesta página.
        </Aviso>
      )}

      <EstadoDaOperacao />
      <WhaleSwap />
      <Mintar habilitado={ehProfessor} />
    </div>
  );
}

function EstadoDaOperacao() {
  const { data: saquesRestantes } = useReadContract({
    address: CONTRACTS.gasFaucet,
    abi: abis.gasFaucet,
    functionName: "remainingClaims",
    query: { refetchInterval: 5000 },
  });

  const { data: saldoFaucet } = useBalance({
    address: CONTRACTS.gasFaucet,
    query: { refetchInterval: 5000 },
  });

  const restantes = saquesRestantes !== undefined ? Number(saquesRestantes) : undefined;
  const acabando = restantes !== undefined && restantes < 10;

  return (
    <Card titulo="Estado da operação" subtitulo="Olhe isto antes de começar a aula" destaque={acabando}>
      <dl className="grid gap-5 sm:grid-cols-2">
        <Stat
          rotulo="Saques de gas restantes"
          valor={restantes !== undefined ? String(restantes) : "—"}
          tom={acabando ? "ruim" : "bom"}
          dica="cada aluno consome 1"
        />
        <Stat rotulo="Saldo do GasFaucet" valor={fmt(saldoFaucet?.value, 4)} sufixo="ETH" />
      </dl>
      {acabando && (
        <div className="mt-4">
          <Aviso tom="erro">
            O faucet está acabando. Mande ETH para {CONTRACTS.gasFaucet} antes que a turma
            trave.
          </Aviso>
        </div>
      )}
    </Card>
  );
}

function WhaleSwap() {
  const [poolAddr, setPoolAddr] = useState<Address>(CONTRACTS.poolFundo);
  const [quantia, setQuantia] = useState("10000");

  const dados = usePoolData(poolAddr);
  const { saldoCsr, allowanceCsr, refetch } = useSaldosEAprovacoes(poolAddr);
  const valor = paraWei(quantia);

  const txAprovar = useTx();
  const txSwap = useTx();

  const { data: previsao } = useReadContract({
    address: poolAddr,
    abi: abis.pool,
    functionName: "previewSwap",
    args: valor ? [CONTRACTS.csr, valor] : undefined,
    query: { enabled: !!valor },
  });

  const p = previsao as readonly [bigint, bigint, bigint] | undefined;
  const fracaoDaReserva =
    valor && dados.reserve0 && dados.reserve0 > 0n
      ? (Number(formatUnits(valor, 18)) / Number(formatUnits(dados.reserve0, 18))) * 100
      : undefined;

  const precisaAprovar = valor !== undefined && (allowanceCsr ?? 0n) < valor;

  return (
    <Card titulo="Whale swap" subtitulo="Mover o preço de propósito, na frente da turma">
      <div className="space-y-4">
        <div className="flex gap-2">
          {POOLS.map((pool) => (
            <button
              key={pool.key}
              onClick={() => setPoolAddr(pool.address)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                poolAddr === pool.address
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {pool.nome}
            </button>
          ))}
        </div>

        <CampoValor
          rotulo="Vender CSR no pool"
          valor={quantia}
          onChange={setQuantia}
          sufixo="CSR"
          disponivel={fmt(saldoCsr)}
        />

        {p && (
          <dl className="grid grid-cols-3 gap-4 rounded-xl bg-slate-50 p-4">
            <Stat rotulo="Recebe" valor={fmt(p[0])} sufixo="BRLX" />
            <Stat
              rotulo="Slippage"
              valor={fmtBps(p[2])}
              tom={p[2] > 500n ? "ruim" : "alerta"}
            />
            <Stat
              rotulo="% da reserva"
              valor={
                fracaoDaReserva !== undefined
                  ? `${fracaoDaReserva.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                  : "—"
              }
            />
          </dl>
        )}

        <div className="flex flex-wrap gap-3">
          {precisaAprovar && (
            <Botao
              disabled={txAprovar.ocupada}
              onClick={async () => {
                await txAprovar.enviar({
                  address: TOKENS.csr.address,
                  abi: abis.token,
                  functionName: "approve",
                  args: [poolAddr, maxUint256],
                });
                refetch();
              }}
            >
              Aprovar CSR
            </Botao>
          )}
          <Botao
            variante="perigo"
            disabled={!valor || precisaAprovar || txSwap.ocupada}
            onClick={async () => {
              if (!valor) return;
              // minAmountOut = 0: aqui o objetivo é justamente aceitar o estrago.
              await txSwap.enviar({
                address: poolAddr,
                abi: abis.pool,
                functionName: "swap",
                args: [CONTRACTS.csr, valor, 0n],
              });
              refetch();
            }}
          >
            {txSwap.ocupada ? "Executando…" : "Executar whale swap"}
          </Botao>
        </div>

        <StatusTx tx={txAprovar} sucesso="Aprovado." />
        <StatusTx tx={txSwap} sucesso="Preço movido. Peça para a turma olhar o painel de LP." />

        <NotaDeAula>
          Peça que todos abram a aba do pool antes de você clicar. O número de perda
          impermanente vira vermelho na tela de quem é LP no mesmo segundo.
        </NotaDeAula>
      </div>
    </Card>
  );
}

function Mintar({ habilitado }: { habilitado: boolean }) {
  const [destino, setDestino] = useState("");
  const [quantia, setQuantia] = useState("10000");
  const tx = useTx();

  const valido = /^0x[a-fA-F0-9]{40}$/.test(destino.trim());

  return (
    <Card titulo="Emitir tokens" subtitulo="Socorro rápido para aluno que ficou sem saldo">
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Endereço do aluno
          </span>
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="0x…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-slate-900"
          />
        </label>

        <CampoValor rotulo="Quantidade (de cada token)" valor={quantia} onChange={setQuantia} />

        <div className="flex flex-wrap gap-3">
          {Object.values(TOKENS).map((token) => (
            <Botao
              key={token.symbol}
              variante="secundario"
              disabled={!habilitado || !valido || tx.ocupada}
              onClick={() =>
                tx.enviar({
                  address: token.address,
                  abi: abis.token,
                  functionName: "mint",
                  args: [destino.trim() as Address, parseEther(quantia.replace(",", "."))],
                })
              }
            >
              Emitir {token.symbol}
            </Botao>
          ))}
        </div>

        <StatusTx tx={tx} sucesso="Tokens emitidos." />
      </div>
    </Card>
  );
}
