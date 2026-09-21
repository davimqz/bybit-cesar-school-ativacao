"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  // Um QueryClient por montagem: evita vazar cache entre sessoes no dev.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A turma inteira olhando numeros ao vivo: vale recarregar rapido.
            refetchInterval: 4000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
