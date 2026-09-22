import Link from "next/link";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, NotaDeAula } from "@/components/ui";
import { CONTRACTS, linkExplorer, encurtar } from "@/lib/contracts";

/**
 * Os labs na ordem em que a aula acontece, com a duração de cada um.
 *
 * A numeração aqui não é enfeite: isto é mesmo uma sequência, e os minutos
 * saem do roteiro do professor. É a única informação da página que o aluno não
 * consegue deduzir sozinho — ele sabe o que é staking, não sabe que faltam
 * 12 minutos dele.
 */
const LABS = [
  {
    href: "/pool",
    titulo: "Pool de liquidez",
    conceito: "x · y = k, slippage, taxas e impermanent loss",
    minutos: 45,
  },
  {
    href: "/trade",
    titulo: "Trade (order book)",
    conceito: "spread, profundidade e prioridade preço-tempo",
    minutos: 15,
  },
  {
    href: "/staking",
    titulo: "Staking",
    conceito: "APR × APY e de onde vem o rendimento",
    minutos: 12,
  },
  {
    href: "/escrow",
    titulo: "Escrow",
    conceito: "custódia condicional e risco de oráculo",
    minutos: 15,
  },
  {
    href: "/crowdfunding",
    titulo: "Crowdfunding",
    conceito: "arrecadação tudo-ou-nada e reembolso por pull",
    minutos: 12,
  },
];

const PASSOS = [
  "Instale a extensão MetaMask e crie uma carteira nova (não use uma que tenha valor real).",
  "Nas configurações da MetaMask, ative “Mostrar redes de teste”.",
  "Conecte a carteira aqui em cima e troque para a rede Sepolia.",
  "Pegue gas e tokens no Faucet.",
  "Entre nos labs — são cinco, e a home lista todos.",
];

export default function Home() {
  return (
    <div className="space-y-10">
      <div className="max-w-3xl">
        <h1 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
          O dinheiro é de mentira.
          <br />
          Os contratos são de verdade.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-prose text-lg">
          Tudo aqui roda numa blockchain pública. Você vai assinar transações
          reais, gastar gas real de testnet e conseguir ler, no explorador de
          blocos, exatamente a regra que acabou de executar. O que não tem valor
          são os tokens.
        </p>
      </div>

      <Card titulo="Sua carteira">
        <ConnectBar />
      </Card>

      <Card titulo="Antes de começar" subtitulo="Cinco passos, uma vez só">
        <ol className="space-y-2">
          {PASSOS.map((passo, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5">{passo}</span>
            </li>
          ))}
        </ol>
        <NotaDeAula>
          Carteira nova, sempre. A chave privada de uma carteira de aula não
          deve nunca ter tocado em nada de valor — essa separação é a primeira
          prática de segurança de Web3.
        </NotaDeAula>
      </Card>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">
            Os cinco labs, na ordem da aula
          </h2>
          <span className="text-muted-foreground text-sm">
            <span className="font-mono tabular-nums">99</span> min no total
          </span>
        </div>

        <ol className="ring-foreground/10 divide-border bg-card divide-y overflow-hidden rounded-xl ring-1">
          {LABS.map((lab, i) => (
            <li key={lab.href}>
              <Link
                href={lab.href}
                className="hover:bg-muted focus-visible:ring-ring group flex items-center gap-4 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2"
              >
                <span className="bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="group-hover:underline group-hover:underline-offset-4 block font-semibold">
                    {lab.titulo}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {lab.conceito}
                  </span>
                </span>

                <span className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                  {lab.minutos} min
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <Card
        titulo="Os contratos desta aula"
        subtitulo="Código público. Leia antes de confiar."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(CONTRACTS).map(([nome, endereco]) => {
            const link = linkExplorer("address", endereco);
            return (
              <div
                key={nome}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="text-sm text-muted-foreground">{nome}</dt>
                <dd className="font-mono text-sm">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground"
                    >
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
          Contrato publicado é imutável — inclusive os bugs. Por isso o código
          fica verificado no explorador: qualquer pessoa pode ler exatamente as
          regras que acabou de executar.
        </NotaDeAula>
      </Card>
    </div>
  );
}
