import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { activeChain } from "@/lib/wagmi";

export const metadata: Metadata = {
  title: "DeFi Lab — CESAR School",
  description: "Laboratório de DeFi em testnet: pool de liquidez, staking, trade, escrow e crowdfunding.",
};

const NAV = [
  { href: "/", rotulo: "Início" },
  { href: "/faucet", rotulo: "Faucet" },
  { href: "/pool", rotulo: "Pool de liquidez" },
  { href: "/trade", rotulo: "Trade" },
  { href: "/telao", rotulo: "Telão" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Providers>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
              <Link href="/" className="text-base font-semibold tracking-tight">
                DeFi Lab <span className="font-normal text-slate-400">· CESAR School</span>
              </Link>
              <nav className="flex gap-6 text-sm">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-slate-600 transition hover:text-slate-900"
                  >
                    {item.rotulo}
                  </Link>
                ))}
              </nav>
              <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {activeChain.name} · dinheiro de mentira
              </span>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

          <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs leading-relaxed text-slate-400">
            Conteúdo educacional. Todos os ativos são de rede de teste e não têm valor algum.
            Nada aqui é recomendação de investimento.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
