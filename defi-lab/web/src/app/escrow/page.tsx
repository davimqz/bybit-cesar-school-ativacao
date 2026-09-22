"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { maxUint256, type Address } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { CartaoAcordo } from "@/components/escrow/CartaoAcordo";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useEscrow } from "@/hooks/useEscrow";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import { CONTRACTS, PROFESSOR, TOKENS, abis, encurtar, fmt } from "@/lib/contracts";

const PRAZOS = [
  { rotulo: "5 min", segundos: 300 },
  { rotulo: "10 min", segundos: 600 },
  { rotulo: "30 min", segundos: 1800 },
];

export default function EscrowPage() {
  const { isConnected } = useConnection();
  const e = useEscrow();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Escrow</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Custódia condicional: o dinheiro sai da carteira do comprador e fica preso no
          contrato até alguém declarar que a entrega aconteceu. O contrato cumpre a regra
          com precisão absoluta — e é justamente aí que mora o problema.
        </p>
      </div>

      <ComoFunciona emCustodia={e.emCustodia} acordos={e.acordos.length} />

      <Card>
        <ConnectBar />
      </Card>

      <CriarAcordo conectado={isConnected} onFeito={e.refetch} />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Seus acordos</h2>
        {!isConnected ? (
          <Aviso tom="info">Conecte a carteira para ver os acordos em que você é parte.</Aviso>
        ) : e.meus.length === 0 ? (
          <Aviso tom="info">
            Você não participa de nenhum acordo ainda. Combine com um colega: um cria o
            acordo colocando o endereço do outro como vendedor.
          </Aviso>
        ) : (
          <div className="space-y-6">
            {e.meus.map((a) => (
              <CartaoAcordo key={String(a.id)} acordo={a} onFeito={e.refetch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComoFunciona({
  emCustodia,
  acordos,
}: {
  emCustodia?: bigint;
  acordos: number;
}) {
  return (
    <Card titulo="Como este contrato funciona" subtitulo="Cinco estados, e quem manda em cada um">
      <dl className="mb-6 grid gap-5 sm:grid-cols-2">
        <Stat
          rotulo="Em custódia agora"
          valor={fmt(emCustodia)}
          sufixo="BRLX"
          dica="dinheiro da turma parado no contrato"
        />
        <Stat rotulo="Acordos criados" valor={String(acordos)} />
      </dl>

      <ol className="space-y-3 text-sm text-slate-700">
        {[
          ["Financiado", "O comprador cria o acordo e o valor sai da carteira dele na mesma transação."],
          ["Enviado", "O vendedor declara o envio. Nenhuma prova é exigida — a blockchain não sabe se a caixa saiu."],
          ["Concluído", "O comprador libera. É o caminho que nunca precisa de árbitro."],
          ["Reembolsado", "O vendedor não enviou no prazo, e o comprador recupera o dinheiro."],
          ["Em disputa", "Qualquer um dos dois congela o acordo. Daí em diante, só o árbitro decide."],
        ].map(([nome, texto], i) => (
          <li key={nome} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {i + 1}
            </span>
            <span className="pt-0.5">
              <strong>{nome}</strong> — {texto}
            </span>
          </li>
        ))}
      </ol>

      <NotaDeAula>
        Repare no que o contrato <em>não</em> faz: ele não verifica entrega nenhuma. Ele
        move dinheiro conforme quem tem permissão diz para mover. O árbitro deste lab é o
        professor ({encurtar(PROFESSOR)}), e ele pode decidir contra a evidência — o código
        vai executar isso com a mesma precisão com que executaria a decisão justa. Esse é o
        <strong> risco de oráculo</strong>: a parte do sistema que não é código continua
        sendo uma pessoa, e você escolheu qual pessoa quando assinou.
      </NotaDeAula>
    </Card>
  );
}

function CriarAcordo({ conectado, onFeito }: { conectado: boolean; onFeito: () => void }) {
  const [vendedor, setVendedor] = useState("");
  const [valor, setValor] = useState("500");
  const [descricao, setDescricao] = useState("Caneca da CESAR");
  const [prazo, setPrazo] = useState(600);

  const { saldoBrlx, allowanceBrlx, refetch } = useSaldosEAprovacoes(CONTRACTS.escrow);
  const txAprovar = useTx();
  const txCriar = useTx();

  const quantia = paraWei(valor);
  const enderecoValido = /^0x[a-fA-F0-9]{40}$/.test(vendedor.trim());
  const precisaAprovar = quantia !== undefined && (allowanceBrlx ?? 0n) < quantia;
  const semSaldo = quantia !== undefined && (saldoBrlx ?? 0n) < quantia;

  return (
    <Card titulo="Criar um acordo" subtitulo="Você entra como comprador, e paga na hora">
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Endereço do vendedor
          </span>
          <input
            value={vendedor}
            onChange={(ev) => setVendedor(ev.target.value)}
            placeholder="0x… (peça para o colega)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-slate-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            O que está sendo comprado
          </span>
          <input
            value={descricao}
            onChange={(ev) => setDescricao(ev.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <CampoValor
          rotulo="Valor"
          valor={valor}
          onChange={setValor}
          sufixo="BRLX"
          disponivel={fmt(saldoBrlx)}
        />

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Prazo para o vendedor marcar envio
          </span>
          <div className="mt-2 flex gap-2">
            {PRAZOS.map((p) => (
              <button
                key={p.segundos}
                onClick={() => setPrazo(p.segundos)}
                className={`rounded-lg border px-3 py-1 text-sm transition ${
                  prazo === p.segundos
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        <Aviso tom="info">
          O árbitro será o professor ({encurtar(PROFESSOR)}), fixo neste lab. O contrato
          recusa um árbitro que seja você mesmo ou o vendedor — mas note que ele só consegue
          barrar o caso óbvio: duas carteiras da mesma pessoa passariam.
        </Aviso>

        {semSaldo && (
          <Aviso tom="alerta">
            Saldo de BRLX insuficiente. O valor sai da sua carteira agora, não na entrega.
          </Aviso>
        )}

        <div className="flex flex-wrap gap-3">
          {precisaAprovar && (
            <Botao
              disabled={!conectado || txAprovar.ocupada}
              onClick={async () => {
                await txAprovar.enviar({
                  address: TOKENS.brlx.address,
                  abi: abis.token,
                  functionName: "approve",
                  args: [CONTRACTS.escrow, maxUint256],
                });
                refetch();
              }}
            >
              {txAprovar.ocupada ? "Processando…" : "Aprovar BRLX"}
            </Botao>
          )}
          <Botao
            disabled={
              !conectado ||
              !enderecoValido ||
              !quantia ||
              precisaAprovar ||
              semSaldo ||
              txCriar.ocupada
            }
            onClick={async () => {
              if (!quantia) return;
              await txCriar.enviar({
                address: CONTRACTS.escrow,
                abi: abis.escrow,
                functionName: "criar",
                args: [
                  vendedor.trim() as Address,
                  PROFESSOR,
                  quantia,
                  BigInt(prazo),
                  descricao.trim(),
                ],
              });
              refetch();
              onFeito();
            }}
          >
            {txCriar.ocupada ? "Criando…" : "Criar e depositar"}
          </Botao>
        </div>

        <StatusTx tx={txAprovar} sucesso="Aprovado." />
        <StatusTx tx={txCriar} sucesso="Acordo criado e valor em custódia." />
      </div>
    </Card>
  );
}
