"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", rotulo: "Início" },
  { href: "/faucet", rotulo: "Faucet" },
  { href: "/pool", rotulo: "Pool" },
  { href: "/trade", rotulo: "Trade" },
  { href: "/staking", rotulo: "Staking" },
  { href: "/escrow", rotulo: "Escrow" },
  { href: "/crowdfunding", rotulo: "Crowdfunding" },
  { href: "/telao", rotulo: "Telão" },
];

/**
 * Navegação dos labs.
 *
 * A marca do item ativo é um fio âmbar embaixo, não uma pílula colorida: o
 * aluno troca de lab oito vezes numa aula e precisa saber onde está sem que a
 * barra vire o elemento mais chamativo da tela.
 *
 * No celular a fila rola na horizontal em vez de quebrar em duas linhas — uma
 * barra que muda de altura empurra o conteúdo da página para baixo no meio da
 * aula.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Labs"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {NAV.map((item) => {
        const ativo =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              ativo
                ? "text-foreground after:bg-signal after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:content-['']"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
