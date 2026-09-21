import Link from "next/link";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, NotaDeAula } from "@/components/ui";
import { CONTRACTS, linkExplorer, encurtar } from "@/lib/contracts";

const LABS = [
  {
    href: "/pool",
    titulo: "Pool de liquidez",
    conceito: "x · y = k, slippage, taxas e impermanent loss",
    pronto: true,
  },
  { href: "/trade", titulo: "Trade (order book)", conceito: "o outro jeito de formar preço", pronto: false },
  { href: "/staking", titulo: "Staking", conceito: "APR × APY e de onde vem o rendimento", pronto: false },
  { href: "/escrow", titulo: "Escrow", conceito: "custódia condicional e risco de oráculo", pronto: false },
  { href: "/crowdfunding", titulo: "Crowdfunding", conceito: "arrecadação tudo-ou-nada", pronto: false },
];

const PASSOS = [
  "Instale a extensão MetaMask e crie uma carteira nova (não use uma que tenha valor real).",
  "Nas configurações da MetaMask, ative “Mostrar redes de teste”.",
  "Conecte a carteira aqui em cima e troque para a rede Sepolia.",
  "Pegue gas e tokens no Faucet.",
  "Entre no lab de Pool de liquidez.",
];

export default function Home() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Laboratório de DeFi</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Os mesmos mecanismos da Aula 3, rodando de verdade em uma blockchain pública de
          teste. Você vai assinar transações reais, pagar gas real de testnet e ver o
          resultado no explorador de blocos.
        </p>
      </div>

      <Card titulo="Sua carteira">
        <ConnectBar />
      </Card>

      <Card titulo="Antes de começar" subtitulo="Cinco passos, uma vez só">
        <ol className="space-y-2">
          {PASSOS.map((passo, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {i + 1}
              </span>
              <span className="pt-0.5">{passo}</span>
            </li>
          ))}
        </ol>
        <NotaDeAula>
          Carteira nova, sempre. A chave privada de uma carteira de aula não deve nunca ter
          tocado em nada de valor — essa separação é a primeira prática de segurança de Web3.
        </NotaDeAula>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Labs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LABS.map((lab) =>
            lab.pronto ? (
              <Link
                key={lab.href}
                href={lab.href}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-900"
              >
                <h3 className="font-semibold">{lab.titulo}</h3>
                <p className="mt-1 text-sm text-slate-500">{lab.conceito}</p>
                <span className="mt-3 inline-block text-sm font-medium text-slate-900">
                  Abrir →
                </span>
              </Link>
            ) : (
              <div
                key={lab.href}
                className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-5"
              >
                <h3 className="font-semibold text-slate-400">{lab.titulo}</h3>
                <p className="mt-1 text-sm text-slate-400">{lab.conceito}</p>
                <span className="mt-3 inline-block text-sm text-slate-300">em construção</span>
              </div>
            ),
          )}
        </div>
      </div>

      <Card titulo="Os contratos desta aula" subtitulo="Código público. Leia antes de confiar.">
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(CONTRACTS).map(([nome, endereco]) => {
            const link = linkExplorer("address", endereco);
            return (
              <div key={nome} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-slate-500">{nome}</dt>
                <dd className="font-mono text-sm">
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
                      {encurtar(endereco)}
                    </a>
                  ) : (
                    encurtar(endereco)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <NotaDeAula>
          Contrato publicado é imutável — inclusive os bugs. Por isso o código fica verificado
          no explorador: qualquer pessoa pode ler exatamente as regras que acabou de executar.
        </NotaDeAula>
      </Card>
    </div>
  );
}
