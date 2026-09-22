import { type ReactNode } from "react";
import { Info, TriangleAlert, OctagonAlert } from "lucide-react";
import {
  Card as ShadCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Primitivos visuais do lab.
 *
 * Tudo aqui é lido em dois lugares ao mesmo tempo: um projetor de sala
 * iluminada e um celular no 4G. As duas consequências que explicam quase todas
 * as escolhas deste arquivo:
 *
 *   1. Nada de texto cinza claro. O que era `slate-400` (2,6:1) virou
 *      `muted-foreground` (6,36:1) — projetor lava cinza claro até sumir.
 *   2. Toda figura é mono e tabular. Estes números atualizam a cada 2 s, e
 *      dígito que muda de largura a cada refresh faz a coluna tremer.
 *
 * Não há tooltip em lugar nenhum de propósito: metade da turma está no celular,
 * onde hover não existe. Informação que importa fica visível.
 */

export function Card({
  titulo,
  subtitulo,
  children,
  destaque = false,
}: {
  titulo?: string;
  subtitulo?: string;
  children: ReactNode;
  destaque?: boolean;
}) {
  return (
    <ShadCard
      className={cn(
        // Este style desenha o cartão com `ring`, não `border`, e mede todo o
        // respiro por `--card-spacing`. Definir a variável em vez de cravar
        // padding mantém header e conteúdo alinhados pelo mesmo eixo.
        "[--card-spacing:--spacing(6)] gap-5 text-base",
        // O âmbar da marca vira moldura num lugar só: "olhe aqui agora"
        // (reserva secando, disputa aberta, campanha que falhou). Se aparecer
        // em dois cartões ao mesmo tempo, não marca mais nada.
        destaque && "ring-signal ring-2",
      )}
    >
      {titulo && (
        <CardHeader className="border-border border-b pb-4">
          <CardTitle className="text-lg leading-snug font-semibold">
            {titulo}
          </CardTitle>
          {subtitulo && (
            <CardDescription className="max-w-prose">
              {subtitulo}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </ShadCard>
  );
}

const TONS = {
  neutro: "text-foreground",
  bom: "text-up",
  ruim: "text-down",
  alerta: "text-warn",
} as const;

/**
 * Um número e o que ele significa.
 *
 * O rótulo é frase normal, não caixa-alta espaçada: caixa-alta é mais lenta de
 * ler e aqui ela competiria com a figura, que é quem deve ganhar.
 */
export function Stat({
  rotulo,
  valor,
  sufixo,
  tom = "neutro",
  dica,
}: {
  rotulo: string;
  valor: string;
  sufixo?: string;
  tom?: "neutro" | "bom" | "ruim" | "alerta";
  dica?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-sm font-medium">{rotulo}</dt>
      <dd
        className={cn(
          "mt-1 font-mono text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums",
          TONS[tom],
        )}
      >
        {valor}
        {sufixo && (
          <span className="text-muted-foreground ml-1.5 font-sans text-base font-medium">
            {sufixo}
          </span>
        )}
      </dd>
      {dica && (
        <p className="text-muted-foreground mt-1.5 max-w-prose text-sm">
          {dica}
        </p>
      )}
    </div>
  );
}

export function Botao({
  children,
  onClick,
  disabled,
  variante = "primario",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variante?: "primario" | "secundario" | "perigo";
  type?: "button" | "submit";
}) {
  const variant = {
    primario: "default",
    secundario: "outline",
    perigo: "destructive",
  }[variante] as "default" | "outline" | "destructive";

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size="lg"
    >
      {children}
    </Button>
  );
}

export function CampoValor({
  rotulo,
  valor,
  onChange,
  sufixo,
  disponivel,
  onMax,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  sufixo?: string;
  disponivel?: string;
  onMax?: () => void;
}) {
  return (
    <label className="block">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{rotulo}</span>
        {disponivel && (
          <span className="text-muted-foreground text-sm">
            saldo <span className="font-mono tabular-nums">{disponivel}</span>
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="text-foreground focus-visible:ring-ring ml-2 rounded font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                usar tudo
              </button>
            )}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <Input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="0,0"
          className="h-12 font-mono text-lg tabular-nums md:text-lg"
        />
        {sufixo && (
          <span className="text-muted-foreground w-16 shrink-0 text-sm font-semibold">
            {sufixo}
          </span>
        )}
      </div>
    </label>
  );
}

const AVISOS = {
  info: {
    Icone: Info,
    classe:
      "border-border bg-muted text-foreground [&>svg]:text-muted-foreground",
  },
  alerta: {
    Icone: TriangleAlert,
    classe: "border-warn-border bg-warn-surface text-warn [&>svg]:text-warn",
  },
  erro: {
    Icone: OctagonAlert,
    classe: "border-down-border bg-down-surface text-down [&>svg]:text-down",
  },
} as const;

export function Aviso({
  tom = "info",
  children,
}: {
  tom?: "info" | "alerta" | "erro";
  children: ReactNode;
}) {
  const { Icone, classe } = AVISOS[tom];

  return (
    <Alert className={cn("px-4 py-3", classe)}>
      <Icone />
      <AlertDescription className="max-w-prose text-sm leading-relaxed text-current">
        {children}
      </AlertDescription>
    </Alert>
  );
}

/**
 * A voz do professor, ao lado do número que ela explica.
 *
 * O fio âmbar à esquerda é o que separa "o lab está te dizendo um dado" de
 * "o lab está te ensinando uma coisa". É o mesmo âmbar da marca, usado como
 * estrutura — o único jeito de usá-lo, já que como texto ele não tem contraste.
 */
export function NotaDeAula({ children }: { children: ReactNode }) {
  return (
    <p className="border-signal text-muted-foreground mt-4 max-w-prose border-l-2 py-0.5 pl-4 text-sm leading-relaxed">
      {children}
    </p>
  );
}
