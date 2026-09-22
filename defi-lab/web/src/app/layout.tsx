import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { activeChain } from "@/lib/wagmi";

/**
 * IBM Plex: uma família desenhada para contexto técnico, não para landing page.
 * A Mono carrega todas as figuras do lab — os números são o conteúdo aqui, e
 * coluna de número só se lê de longe quando os dígitos têm largura fixa.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeFi Lab — CESAR School",
  description:
    "Laboratório de DeFi em testnet: pool de liquidez, staking, trade, escrow e crowdfunding.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="border-border bg-card sticky top-0 z-40 border-b">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
              <Link
                href="/"
                className="focus-visible:ring-ring rounded-md text-base font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
              >
                DeFi Lab{" "}
                <span className="text-muted-foreground font-normal">
                  CESAR School × Bybit
                </span>
              </Link>

              <span className="border-warn-border bg-warn-surface text-warn ml-auto order-1 rounded-full border px-3 py-1 text-xs font-semibold sm:order-none">
                {activeChain.name} · dinheiro de mentira
              </span>

              <div className="order-2 w-full sm:order-none sm:w-auto sm:flex-1">
                <Nav />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

          <footer className="border-border mx-auto mt-4 max-w-6xl border-t px-6 py-8">
            <p className="text-muted-foreground max-w-prose text-sm">
              Conteúdo educacional. Todos os ativos são de rede de teste e não
              têm valor algum. Nada aqui é recomendação de investimento.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
