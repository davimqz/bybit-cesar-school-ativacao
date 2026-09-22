"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { maxUint256 } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import {
  Card,
  Stat,
  Botao,
  CampoValor,
  Aviso,
  NotaDeAula,
} from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useStaking } from "@/hooks/useStaking";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import {
  CONTRACTS,
  TOKENS,
  abis,
  aprParaApy,
  fmt,
  fmtDuracao,
  fmtPct,
  linkExplorer,
} from "@/lib/contracts";

/**
 * Lab de staking.
 *
 * A pergunta da página não é "quanto rende": é "de onde vem". Por isso a reserva
 * e o prazo de validade dela ficam no topo, antes do APR — a ordem dos cartões é
 * o argumento.
 */
export default function StakingPage() {
  const { isConnected } = useConnection();
  const s = useStaking();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Staking</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Deposite CSR e receba mais CSR com o tempo. Antes de olhar o
          percentual, olhe a reserva: todo rendimento sai de algum lugar, e aqui
          você consegue ver exatamente de onde e por quanto tempo ainda.
        </p>
      </div>

      <DeOndeVem />

      <Card>
        <ConnectBar />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <MinhaPosicao />
        <Operacoes conectado={isConnected} onFeito={s.refetch} />
      </div>
    </div>
  );
}

function DeOndeVem() {
  const { reserva, segundosDeReserva, taxaPorSegundo, totalEmStake, aprBps } =
    useStaking();
  const link = linkExplorer("address", CONTRACTS.staking);

  const secando = segundosDeReserva !== undefined && segundosDeReserva < 3600n;
  const apy = aprParaApy(aprBps);

  return (
    <Card
      titulo="De onde vem o rendimento"
      subtitulo="Uma reserva finita, num contrato que você pode ler"
      destaque={secando}
    >
      <dl className="grid gap-5 sm:grid-cols-4">
        <Stat
          rotulo="Reserva restante"
          valor={fmt(reserva, 0)}
          sufixo="CSR"
          tom={secando ? "ruim" : "neutro"}
          dica="é daqui que sai tudo"
        />
        <Stat
          rotulo="Dura mais"
          valor={fmtDuracao(segundosDeReserva)}
          tom={secando ? "ruim" : "bom"}
          dica="no ritmo de emissão atual"
        />
        <Stat
          rotulo="Emissão"
          valor={fmt(taxaPorSegundo, 4)}
          sufixo="CSR/s"
          dica="dividida entre todos os depositantes"
        />
        <Stat
          rotulo="Total depositado"
          valor={fmt(totalEmStake, 0)}
          sufixo="CSR"
        />
      </dl>

      <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
        <Stat
          rotulo="APR (o que o contrato faz)"
          valor={fmtPct(
            aprBps !== undefined ? Number(aprBps) / 10_000 : undefined,
          )}
          tom="alerta"
          dica="emissão de um ano ÷ total depositado"
        />
        <Stat
          rotulo="APY (se você reinvestir toda semana)"
          valor={fmtPct(apy)}
          tom="alerta"
          dica="projeção do front, não promessa do contrato"
        />
      </div>

      {secando && (
        <div className="mt-4">
          <Aviso tom="erro">
            A reserva está no fim. Quando ela zerar, o rendimento vira zero — e
            o APR também, porque o contrato para de emitir. Avise o professor.
          </Aviso>
        </div>
      )}

      <NotaDeAula>
        Esse APR é absurdo de propósito, e é a lição mais útil deste lab: número
        alto não é generosidade, é{" "}
        <strong>emissão dividida por pouca gente</strong>. Quando alguém grande
        depositar, ele cai na sua frente sem ninguém te avisar. E quando a
        reserva secar, ele vira zero. Sempre pergunte quem está pagando a conta
        — aqui foi o professor, e o depósito dele está{" "}
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="underline">
            visível no explorador
          </a>
        ) : (
          "visível no contrato"
        )}
        . Em protocolos que prometem 10.000%, a resposta costuma ser: um token
        recém emitido que ninguém quer comprar.
      </NotaDeAula>
    </Card>
  );
}

function MinhaPosicao() {
  const { minhaPosicao, pendente, minhaFatiaBps, taxaPorSegundo } =
    useStaking();

  // O que esta posição ganha por minuto, no estado atual do cofre.
  const porMinuto =
    taxaPorSegundo !== undefined && minhaFatiaBps !== undefined
      ? (taxaPorSegundo * 60n * minhaFatiaBps) / 10_000n
      : undefined;

  const depositado = (minhaPosicao ?? 0n) > 0n;
  const temPendente = (pendente ?? 0n) > 0n;

  // Retirar o principal não queima o rendimento já fechado: ele continua no
  // contrato esperando ser colhido. Esconder o painel aqui faria o aluno achar
  // que o ganho evaporou na retirada — e ele desistiria de clicar em Colher.
  const dentro = depositado || temPendente;

  return (
    <Card
      titulo="Sua posição"
      subtitulo="O pendente sobe sozinho — não precisa recarregar"
    >
      {!dentro ? (
        <Aviso tom="info">
          Você não tem nada depositado. Deposite ao lado e este painel começa a
          contar.
        </Aviso>
      ) : (
        <dl className="grid gap-5 sm:grid-cols-2">
          <Stat rotulo="Depositado" valor={fmt(minhaPosicao)} sufixo="CSR" />
          <Stat
            rotulo="Rendimento a colher"
            valor={fmt(pendente)}
            sufixo="CSR"
            tom="bom"
            dica="conta desde o último bloco"
          />
          <Stat
            rotulo="Sua fatia do cofre"
            valor={fmtPct(
              minhaFatiaBps !== undefined
                ? Number(minhaFatiaBps) / 10_000
                : undefined,
            )}
            dica="é ela que define quanto da emissão é sua"
          />
          <Stat rotulo="Rendendo" valor={fmt(porMinuto)} sufixo="CSR/min" />
        </dl>
      )}

      {!depositado && temPendente && (
        <div className="mt-4">
          <Aviso tom="alerta">
            Você retirou todo o principal, mas o rendimento já fechado continua
            aqui — e ele não some. Clique em <strong>Colher</strong> ao lado
            para levá-lo para a carteira. Repare também que ele parou de
            crescer: sem depósito, sua fatia do cofre é zero.
          </Aviso>
        </div>
      )}

      <NotaDeAula>
        Repare que sua fatia — e não o seu depósito — é o que determina o
        rendimento. Depositar o dobro não dobra o ganho se o cofre triplicar de
        tamanho no mesmo dia. Rendimento em DeFi é quase sempre uma disputa por
        uma emissão fixa.
      </NotaDeAula>
    </Card>
  );
}

function Operacoes({
  conectado,
  onFeito,
}: {
  conectado: boolean;
  onFeito: () => void;
}) {
  const [aba, setAba] = useState<"depositar" | "retirar">("depositar");
  const [quantia, setQuantia] = useState("500");

  const { minhaPosicao, pendente } = useStaking();
  const { saldoCsr, allowanceCsr, refetch } = useSaldosEAprovacoes(
    CONTRACTS.staking,
  );

  const txAprovar = useTx();
  const txOperar = useTx();
  const txColher = useTx();
  const txReinvestir = useTx();

  const valor = paraWei(quantia);
  const depositando = aba === "depositar";

  const precisaAprovar =
    depositando && valor !== undefined && (allowanceCsr ?? 0n) < valor;
  const semSaldo =
    depositando && valor !== undefined && (saldoCsr ?? 0n) < valor;
  const semPosicao =
    !depositando && valor !== undefined && (minhaPosicao ?? 0n) < valor;
  const temPendente = (pendente ?? 0n) > 0n;

  function concluir() {
    refetch();
    onFeito();
  }

  return (
    <Card titulo="Operar" subtitulo="Depositar, retirar, colher e reinvestir">
      <div className="mb-4 flex gap-2">
        {(["depositar", "retirar"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              aba === k
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <CampoValor
          rotulo={depositando ? "Depositar no cofre" : "Retirar do cofre"}
          valor={quantia}
          onChange={setQuantia}
          sufixo="CSR"
          disponivel={depositando ? fmt(saldoCsr) : fmt(minhaPosicao)}
        />

        {semSaldo && (
          <Aviso tom="alerta">
            Saldo de CSR insuficiente. Pegue mais no faucet da aula.
          </Aviso>
        )}
        {semPosicao && (
          <Aviso tom="alerta">
            Você não tem esse tanto depositado para retirar.
          </Aviso>
        )}

        {/*
          Duas transacoes, duas etapas visiveis.

          O botao de aprovar NAO some depois de usado, e o de depositar nunca
          fica escondido: os dois ficam na tela o tempo todo, numerados. Antes,
          o aluno via um unico botao, assinava o `approve`, recebia um aviso
          verde com link do explorador e achava que tinha depositado — mas
          `approve` nao move token nenhum, entao o saldo nao mudava e ninguem
          entendia por que. Numa aula ao vivo, isso trava a sala inteira.
        */}
        {depositando && (
          <p className="text-sm text-muted-foreground">
            Depositar são <strong>duas transações</strong>: a aprovação apenas
            escreve uma permissão, e é o depósito que move os seus CSR.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {depositando && (
            <Botao
              variante={precisaAprovar ? "primario" : "secundario"}
              disabled={!conectado || !precisaAprovar || txAprovar.ocupada}
              onClick={async () => {
                await txAprovar.enviar({
                  address: TOKENS.csr.address,
                  abi: abis.token,
                  functionName: "approve",
                  args: [CONTRACTS.staking, maxUint256],
                });
                concluir();
              }}
            >
              {txAprovar.ocupada
                ? "Processando…"
                : precisaAprovar
                  ? "Passo 1 de 2 · Aprovar CSR"
                  : "Passo 1 de 2 · CSR aprovado ✓"}
            </Botao>
          )}
          <Botao
            disabled={
              !conectado ||
              !valor ||
              precisaAprovar ||
              semSaldo ||
              semPosicao ||
              txOperar.ocupada
            }
            onClick={async () => {
              if (!valor) return;
              await txOperar.enviar({
                address: CONTRACTS.staking,
                abi: abis.staking,
                functionName: depositando ? "depositar" : "retirar",
                args: [valor],
              });
              concluir();
            }}
          >
            {txOperar.ocupada
              ? "Enviando…"
              : depositando
                ? "Passo 2 de 2 · Depositar"
                : "Retirar"}
          </Botao>
        </div>

        {/*
          O aviso do approve sai de cena assim que o deposito e enviado: sem
          isto, "falta o passo 2" continuaria na tela depois do passo 2 feito.
        */}
        {!txOperar.hash && (
          <StatusTx
            tx={txAprovar}
            sucesso="Aprovado — e nenhum token saiu da sua carteira ainda. Falta o passo 2: clique em Depositar."
          />
        )}
        <StatusTx
          tx={txOperar}
          sucesso={
            depositando ? "Depositado. Seu rendimento já começou." : "Retirado."
          }
        />

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-3">
            <Botao
              variante="secundario"
              disabled={!conectado || !temPendente || txColher.ocupada}
              onClick={async () => {
                await txColher.enviar({
                  address: CONTRACTS.staking,
                  abi: abis.staking,
                  functionName: "colher",
                });
                concluir();
              }}
            >
              {txColher.ocupada
                ? "Colhendo…"
                : `Colher ${fmt(pendente)} CSR`}
            </Botao>
            <Botao
              disabled={!conectado || !temPendente || txReinvestir.ocupada}
              onClick={async () => {
                await txReinvestir.enviar({
                  address: CONTRACTS.staking,
                  abi: abis.staking,
                  functionName: "reinvestir",
                });
                concluir();
              }}
            >
              {txReinvestir.ocupada ? "Reinvestindo…" : "Reinvestir"}
            </Botao>
          </div>

          <StatusTx tx={txColher} sucesso="Rendimento na carteira." />
          <StatusTx
            tx={txReinvestir}
            sucesso="Rendimento virou depósito. Sua fatia cresceu."
          />

          <NotaDeAula>
            <strong>Reinvestir</strong> não move token nenhum: a recompensa já
            estava neste contrato, e a operação só aumenta a sua fatia. É
            exatamente essa diferença que separa APR de APY — e o ganho extra de
            quem reinveste sai do bolso de quem esquece de fazer isso, porque a
            emissão total não muda.
          </NotaDeAula>
        </div>
      </div>
    </Card>
  );
}
