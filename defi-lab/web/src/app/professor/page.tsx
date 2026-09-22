"use client";

import { useState } from "react";
import { useConnection, useReadContract, useBalance } from "wagmi";
import { formatUnits, isAddressEqual, maxUint256, parseEther, type Address } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { usePoolData, useSaldosEAprovacoes } from "@/hooks/usePool";
import { useStaking } from "@/hooks/useStaking";
import {
  abis,
  CONTRACTS,
  POOLS,
  PROFESSOR,
  TOKENS,
  fmt,
  fmtBps,
  fmtDuracao,
  fmtPct,
  fmtPreco,
} from "@/lib/contracts";
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
      <EstadoDoLivro />
      <EstadoDoCofre />
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

/**
 * O livro pode morrer no meio da aula: a turma come os dois lados e sobra uma
 * tela vazia. Este cartão avisa antes disso e dá o gesto dramático do lab —
 * varrer um lado inteiro de uma vez.
 */
function EstadoDoLivro() {
  const [quantia, setQuantia] = useState("500");
  const base = { address: CONTRACTS.orderBook, abi: abis.livro } as const;
  const opcoes = { query: { refetchInterval: 5000 } } as const;

  const { data: vivas } = useReadContract({ ...base, functionName: "ordensVivas", ...opcoes });
  const { data: bid } = useReadContract({ ...base, functionName: "melhorCompra", ...opcoes });
  const { data: ask } = useReadContract({ ...base, functionName: "melhorVenda", ...opcoes });
  const { data: spread } = useReadContract({ ...base, functionName: "spreadBps", ...opcoes });

  const { allowanceCsr, allowanceBrlx, refetch } = useSaldosEAprovacoes(CONTRACTS.orderBook);
  const txAprovar = useTx();
  const txVarrer = useTx();

  const valor = paraWei(quantia);
  const { data: simulacao } = useReadContract({
    ...base,
    functionName: "simularCompra",
    args: valor ? [valor] : undefined,
    query: { enabled: !!valor },
  });

  const s = simulacao as readonly [bigint, bigint, bigint, bigint] | undefined;
  const b = bid as readonly [bigint, bigint] | undefined;
  const a = ask as readonly [bigint, bigint] | undefined;

  const ordens = vivas !== undefined ? Number(vivas) : undefined;
  const esvaziando = ordens !== undefined && ordens < 4;

  // Varrer é comprar aceitando qualquer preço: o objetivo é justamente o estrago.
  const precisaAprovar = (allowanceBrlx ?? 0n) === 0n;

  return (
    <Card
      titulo="Livro de ordens"
      subtitulo="Se este livro esvaziar, o lab de trade morre"
      destaque={esvaziando}
    >
      <dl className="grid gap-5 sm:grid-cols-4">
        <Stat
          rotulo="Ordens vivas"
          valor={ordens !== undefined ? String(ordens) : "—"}
          tom={esvaziando ? "ruim" : "bom"}
        />
        <Stat rotulo="Melhor compra" valor={fmtPreco(b?.[0])} sufixo="BRLX" />
        <Stat rotulo="Melhor venda" valor={fmtPreco(a?.[0])} sufixo="BRLX" />
        <Stat rotulo="Spread" valor={fmtBps(spread as bigint | undefined)} />
      </dl>

      {esvaziando && (
        <div className="mt-4">
          <Aviso tom="alerta">
            O livro está acabando. Vá em <strong>/trade</strong> e coloque ordens novas —
            você tem 10 milhões de cada token. Uma escada de três níveis em cada lado
            devolve o lab ao ar.
          </Aviso>
        </div>
      )}

      <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
        <CampoValor rotulo="Varrer o livro comprando" valor={quantia} onChange={setQuantia} sufixo="CSR" />

        {s && (
          <dl className="grid grid-cols-3 gap-4 rounded-xl bg-slate-50 p-4">
            <Stat rotulo="Custo" valor={fmt(s[0])} sufixo="BRLX" />
            <Stat rotulo="Preço médio" valor={fmtPreco(s[2])} sufixo="BRLX" />
            <Stat rotulo="Slippage" valor={fmtBps(s[3])} tom={s[3] > 500n ? "ruim" : "alerta"} />
          </dl>
        )}

        <div className="flex flex-wrap gap-3">
          {precisaAprovar && (
            <Botao
              disabled={txAprovar.ocupada}
              onClick={async () => {
                await txAprovar.enviar({
                  address: TOKENS.brlx.address,
                  abi: abis.token,
                  functionName: "approve",
                  args: [CONTRACTS.orderBook, maxUint256],
                });
                refetch();
              }}
            >
              Aprovar BRLX
            </Botao>
          )}
          <Botao
            variante="perigo"
            disabled={!valor || precisaAprovar || txVarrer.ocupada}
            onClick={async () => {
              if (!valor) return;
              await txVarrer.enviar({
                ...base,
                functionName: "comprarAMercado",
                args: [valor, maxUint256],
              });
              refetch();
            }}
          >
            {txVarrer.ocupada ? "Varrendo…" : "Varrer o lado da venda"}
          </Botao>
        </div>

        <StatusTx tx={txAprovar} sucesso="Aprovado." />
        <StatusTx tx={txVarrer} sucesso="Livro varrido. O spread explodiu na tela de todo mundo." />

        <NotaDeAula>
          O gêmeo do whale swap, no outro mercado. Lá o preço escorrega pela curva; aqui as
          linhas desaparecem uma por uma e o spread abre. Peça que a turma olhe o livro
          antes e depois — quem tinha ordem parada acabou de vender sem escolher o momento.
        </NotaDeAula>
      </div>
    </Card>
  );
}

/**
 * Cofre de staking: a reserva e o gesto que derruba o APR da turma inteira.
 *
 * O depósito baleia é o gêmeo do whale swap e da varredura do livro — cada lab
 * tem um momento em que o professor mostra, ao vivo, que o número na tela do
 * aluno não é uma promessa feita a ele.
 */
function EstadoDoCofre() {
  const [quantia, setQuantia] = useState("50000");
  const [recarga, setRecarga] = useState("20000");

  const s = useStaking();
  const { saldoCsr, allowanceCsr, refetch } = useSaldosEAprovacoes(CONTRACTS.staking);

  const txAprovar = useTx();
  const txBaleia = useTx();
  const txAbastecer = useTx();

  const valor = paraWei(quantia);
  const valorRecarga = paraWei(recarga);

  // APR depois do depósito: mesma conta do contrato, com a base nova.
  const aprDepois =
    s.taxaPorSegundo !== undefined && s.totalEmStake !== undefined && valor
      ? Number((s.taxaPorSegundo * 31_536_000n * 10_000n) / (s.totalEmStake + valor)) / 10_000
      : undefined;

  const secando = s.segundosDeReserva !== undefined && s.segundosDeReserva < 3600n;
  const precisaAprovar =
    (valor !== undefined || valorRecarga !== undefined) && (allowanceCsr ?? 0n) === 0n;

  return (
    <Card titulo="Cofre de staking" subtitulo="A reserva paga o rendimento — e ela acaba" destaque={secando}>
      <dl className="grid gap-5 sm:grid-cols-4">
        <Stat
          rotulo="Reserva"
          valor={fmt(s.reserva, 0)}
          sufixo="CSR"
          tom={secando ? "ruim" : "bom"}
        />
        <Stat rotulo="Dura mais" valor={fmtDuracao(s.segundosDeReserva)} tom={secando ? "ruim" : "neutro"} />
        <Stat
          rotulo="APR agora"
          valor={fmtPct(s.aprBps !== undefined ? Number(s.aprBps) / 10_000 : undefined)}
          tom="alerta"
        />
        <Stat rotulo="Total depositado" valor={fmt(s.totalEmStake, 0)} sufixo="CSR" />
      </dl>

      {secando && (
        <div className="mt-4">
          <Aviso tom="erro">
            A reserva está no fim: o rendimento vai parar. Abasteça abaixo antes de
            começar o lab de staking.
          </Aviso>
        </div>
      )}

      <div className="mt-6 grid gap-6 border-t border-slate-200 pt-6 sm:grid-cols-2">
        <div className="space-y-3">
          <CampoValor
            rotulo="Depósito baleia"
            valor={quantia}
            onChange={setQuantia}
            sufixo="CSR"
            disponivel={fmt(saldoCsr)}
          />
          {aprDepois !== undefined && (
            <Stat
              rotulo="APR da turma depois disso"
              valor={fmtPct(aprDepois)}
              tom="ruim"
              dica="cai na tela de todos ao mesmo tempo"
            />
          )}
          <Botao
            variante="perigo"
            disabled={!valor || precisaAprovar || txBaleia.ocupada}
            onClick={async () => {
              if (!valor) return;
              await txBaleia.enviar({
                address: CONTRACTS.staking,
                abi: abis.staking,
                functionName: "depositar",
                args: [valor],
              });
              refetch();
              s.refetch();
            }}
          >
            {txBaleia.ocupada ? "Depositando…" : "Depositar como baleia"}
          </Botao>
          <StatusTx tx={txBaleia} sucesso="APR derrubado. Peça para olharem a própria posição." />
        </div>

        <div className="space-y-3">
          <CampoValor
            rotulo="Abastecer a reserva"
            valor={recarga}
            onChange={setRecarga}
            sufixo="CSR"
            disponivel={fmt(saldoCsr)}
          />
          <Botao
            variante="secundario"
            disabled={!valorRecarga || precisaAprovar || txAbastecer.ocupada}
            onClick={async () => {
              if (!valorRecarga) return;
              await txAbastecer.enviar({
                address: CONTRACTS.staking,
                abi: abis.staking,
                functionName: "abastecer",
                args: [valorRecarga],
              });
              refetch();
              s.refetch();
            }}
          >
            {txAbastecer.ocupada ? "Abastecendo…" : "Abastecer"}
          </Botao>
          <StatusTx tx={txAbastecer} sucesso="Reserva reforçada." />
        </div>
      </div>

      {precisaAprovar && (
        <div className="mt-4">
          <Botao
            disabled={txAprovar.ocupada}
            onClick={async () => {
              await txAprovar.enviar({
                address: TOKENS.csr.address,
                abi: abis.token,
                functionName: "approve",
                args: [CONTRACTS.staking, maxUint256],
              });
              refetch();
            }}
          >
            Aprovar CSR no cofre
          </Botao>
          <div className="mt-3">
            <StatusTx tx={txAprovar} sucesso="Aprovado." />
          </div>
        </div>
      )}

      <NotaDeAula>
        O depósito baleia não tira nada de ninguém: o principal de cada aluno continua
        intacto. O que ele faz é diluir a fatia — e é por isso que o rendimento cai. A
        pergunta para a turma: alguém te avisou antes?
      </NotaDeAula>
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
