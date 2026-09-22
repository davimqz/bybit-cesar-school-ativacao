"use client";

import { useState } from "react";
import { useConnection, useReadContracts, useReadContract } from "wagmi";
import { maxUint256 } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useAgora } from "@/hooks/useEscrow";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import {
  CONTRACTS,
  SITUACAO,
  SITUACOES,
  TOKENS,
  abis,
  encurtar,
  fmt,
  fmtBps,
  fmtRestante,
  situacaoDaCampanha,
  type Campanha,
} from "@/lib/contracts";

const PRAZOS = [
  { rotulo: "5 min", segundos: 300 },
  { rotulo: "1 h", segundos: 3600 },
  { rotulo: "7 dias", segundos: 604800 },
];

export default function CrowdfundingPage() {
  const { isConnected } = useConnection();
  const base = { address: CONTRACTS.crowdfunding, abi: abis.crowdfunding } as const;

  const { data, refetch } = useReadContracts({
    contracts: [{ ...base, functionName: "todas" }],
    query: { refetchInterval: 4000 },
  });

  const campanhas = (data?.[0]?.result as readonly Campanha[] | undefined) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Crowdfunding tudo-ou-nada</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          &ldquo;Se não bater a meta, todos recebem de volta&rdquo; normalmente é uma promessa de
          quem está arrecadando. Aqui é uma regra do contrato: o criador{" "}
          <strong>não consegue</strong> sacar com a meta em aberto — nem que queira.
        </p>
      </div>

      <Card>
        <ConnectBar />
      </Card>

      <CriarCampanha conectado={isConnected} onFeito={refetch} />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Campanhas</h2>
        {campanhas.length === 0 ? (
          <Aviso tom="info">Nenhuma campanha ainda. Crie a primeira acima.</Aviso>
        ) : (
          <div className="space-y-6">
            {[...campanhas].reverse().map((c) => (
              <CartaoCampanha key={String(c.id)} campanha={c} onFeito={refetch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoCampanha({ campanha, onFeito }: { campanha: Campanha; onFeito: () => void }) {
  const { address, isConnected } = useConnection();
  const agora = useAgora();
  const [valor, setValor] = useState("100");

  const { saldoBrlx, allowanceBrlx, refetch } = useSaldosEAprovacoes(CONTRACTS.crowdfunding);
  const txAprovar = useTx();
  const txContribuir = useTx();
  const txSacar = useTx();
  const txReembolsar = useTx();

  const { data: minha } = useReadContract({
    address: CONTRACTS.crowdfunding,
    abi: abis.crowdfunding,
    functionName: "contribuicoes",
    args: address ? [campanha.id, address] : undefined,
    query: { enabled: !!address, refetchInterval: 4000 },
  });

  const minhaContribuicao = (minha as bigint | undefined) ?? 0n;
  const situacao = situacaoDaCampanha(campanha, agora);
  const info = SITUACOES[situacao];

  const souCriador = !!address && address.toLowerCase() === campanha.criador.toLowerCase();
  const quantia = paraWei(valor);
  const progressoBps =
    campanha.meta > 0n ? (campanha.arrecadado * 10_000n) / campanha.meta : 0n;
  const largura = Math.min(100, Number(progressoBps) / 100);

  const precisaAprovar = quantia !== undefined && (allowanceBrlx ?? 0n) < quantia;
  const semSaldo = quantia !== undefined && (saldoBrlx ?? 0n) < quantia;

  async function chamar(tx: ReturnType<typeof useTx>, functionName: string, args: unknown[]) {
    await tx.enviar({
      address: CONTRACTS.crowdfunding,
      abi: abis.crowdfunding,
      functionName,
      args,
    });
    refetch();
    onFeito();
  }

  return (
    <Card
      titulo={campanha.titulo || `Campanha #${campanha.id}`}
      subtitulo={`#${campanha.id} · criada por ${souCriador ? "você" : encurtar(campanha.criador)}`}
      destaque={situacao === SITUACAO.falhou}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              {
                neutro: "bg-slate-100 text-slate-700",
                bom: "bg-emerald-100 text-emerald-700",
                ruim: "bg-rose-100 text-rose-700",
                alerta: "bg-amber-100 text-amber-800",
              }[info.tom]
            }`}
          >
            {info.rotulo}
          </span>
          <span className="text-sm text-slate-500">{info.explicacao}</span>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-semibold tabular-nums">
              {fmt(campanha.arrecadado, 0)} / {fmt(campanha.meta, 0)} BRLX
            </span>
            <span className="text-slate-500 tabular-nums">{fmtBps(progressoBps, 0)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${
                situacao === SITUACAO.falhou
                  ? "bg-rose-400"
                  : progressoBps >= 10_000n
                    ? "bg-emerald-500"
                    : "bg-slate-900"
              }`}
              style={{ width: `${largura}%` }}
            />
          </div>
        </div>

        <dl className="grid gap-5 sm:grid-cols-4">
          <Stat rotulo="Apoiadores" valor={String(campanha.apoiadores)} />
          <Stat
            rotulo="Prazo"
            valor={fmtRestante(campanha.prazo, agora)}
            tom={Number(campanha.prazo) <= agora ? "ruim" : "neutro"}
          />
          <Stat
            rotulo="Falta para a meta"
            valor={fmt(
              campanha.arrecadado >= campanha.meta ? 0n : campanha.meta - campanha.arrecadado,
              0,
            )}
            sufixo="BRLX"
          />
          <Stat
            rotulo="Você colocou"
            valor={fmt(minhaContribuicao, 0)}
            sufixo="BRLX"
            tom={minhaContribuicao > 0n ? "bom" : "neutro"}
          />
        </dl>

        {situacao === SITUACAO.arrecadando && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <CampoValor
              rotulo="Contribuir"
              valor={valor}
              onChange={setValor}
              sufixo="BRLX"
              disponivel={fmt(saldoBrlx)}
            />
            {semSaldo && <Aviso tom="alerta">Saldo de BRLX insuficiente.</Aviso>}
            <div className="flex flex-wrap gap-3">
              {precisaAprovar && (
                <Botao
                  disabled={!isConnected || txAprovar.ocupada}
                  onClick={async () => {
                    await txAprovar.enviar({
                      address: TOKENS.brlx.address,
                      abi: abis.token,
                      functionName: "approve",
                      args: [CONTRACTS.crowdfunding, maxUint256],
                    });
                    refetch();
                  }}
                >
                  Aprovar BRLX
                </Botao>
              )}
              <Botao
                disabled={
                  !isConnected || !quantia || precisaAprovar || semSaldo || txContribuir.ocupada
                }
                onClick={() => quantia && chamar(txContribuir, "contribuir", [campanha.id, quantia])}
              >
                {txContribuir.ocupada ? "Enviando…" : "Contribuir"}
              </Botao>
            </div>
            <StatusTx tx={txAprovar} sucesso="Aprovado." />
            <StatusTx tx={txContribuir} sucesso="Contribuição registrada." />
          </div>
        )}

        {situacao === SITUACAO.metaBatida && souCriador && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <Botao
              disabled={txSacar.ocupada}
              onClick={() => chamar(txSacar, "sacar", [campanha.id])}
            >
              {txSacar.ocupada ? "Sacando…" : `Sacar ${fmt(campanha.arrecadado, 0)} BRLX`}
            </Botao>
            <StatusTx tx={txSacar} sucesso="Valor transferido para você." />
          </div>
        )}

        {situacao === SITUACAO.falhou && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            {minhaContribuicao > 0n ? (
              <>
                <Botao
                  disabled={txReembolsar.ocupada}
                  onClick={() => chamar(txReembolsar, "reembolsar", [campanha.id])}
                >
                  {txReembolsar.ocupada
                    ? "Sacando…"
                    : `Sacar meu reembolso de ${fmt(minhaContribuicao, 0)} BRLX`}
                </Botao>
                <StatusTx tx={txReembolsar} sucesso="Reembolso na sua carteira." />
              </>
            ) : (
              <Aviso tom="info">
                Você não tem nada a reembolsar nesta campanha.
              </Aviso>
            )}
            <NotaDeAula>
              Repare que ninguém devolveu nada para você: <strong>você</strong> foi buscar. O
              contrato não sai distribuindo reembolso em lote, e isso é proposital — um único
              endereço que falhasse ao receber travaria a fila inteira, e o gas de mil
              apoiadores não cabe num bloco. Em DeFi, quase todo pagamento é você quem puxa.
            </NotaDeAula>
          </div>
        )}

        {situacao === SITUACAO.metaBatida && !souCriador && minhaContribuicao > 0n && (
          <NotaDeAula>
            A meta foi batida, então o seu dinheiro agora é do projeto — não há mais botão de
            reembolso, e nenhum código no contrato permite criar um. A janela para mudar de
            ideia fechou no instante em que a meta encheu.
          </NotaDeAula>
        )}
      </div>
    </Card>
  );
}

function CriarCampanha({ conectado, onFeito }: { conectado: boolean; onFeito: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [meta, setMeta] = useState("1000");
  const [prazo, setPrazo] = useState(3600);
  const tx = useTx();

  const metaWei = paraWei(meta);

  return (
    <Card titulo="Criar uma campanha" subtitulo="Criar não custa nada: não há dinheiro envolvido aqui">
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Título
          </span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={60}
            placeholder="Ex: Camisas da turma"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          />
        </label>

        <CampoValor rotulo="Meta" valor={meta} onChange={setMeta} sufixo="BRLX" />

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Prazo
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
          <p className="mt-2 text-xs text-slate-400">
            Para demonstrar o reembolso na aula: meta alta e prazo de 5 min.
          </p>
        </div>

        <Botao
          disabled={!conectado || !titulo.trim() || !metaWei || tx.ocupada}
          onClick={async () => {
            if (!metaWei) return;
            await tx.enviar({
              address: CONTRACTS.crowdfunding,
              abi: abis.crowdfunding,
              functionName: "criar",
              args: [titulo.trim(), metaWei, BigInt(prazo)],
            });
            onFeito();
          }}
        >
          {tx.ocupada ? "Criando…" : "Criar campanha"}
        </Botao>

        <StatusTx tx={tx} sucesso="Campanha no ar." />
      </div>
    </Card>
  );
}
