import { type ReactNode } from "react";

/**
 * Primitivos visuais do lab.
 *
 * Tema claro e números grandes de propósito: isto é projetado numa sala
 * com luz acesa. Fundo escuro em projetor de sala de aula some.
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
    <section
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        destaque ? "border-amber-400 ring-2 ring-amber-100" : "border-slate-200"
      }`}
    >
      {titulo && (
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

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
  const cores = {
    neutro: "text-slate-900",
    bom: "text-emerald-600",
    ruim: "text-rose-600",
    alerta: "text-amber-600",
  }[tom];

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${cores}`}>
        {valor}
        {sufixo && <span className="ml-1 text-base font-normal text-slate-400">{sufixo}</span>}
      </dd>
      {dica && <p className="mt-1 text-xs text-slate-400">{dica}</p>}
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
  const estilos = {
    primario: "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300",
    secundario:
      "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    perigo: "bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-200",
  }[variante];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${estilos}`}
    >
      {children}
    </button>
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
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</span>
        {disponivel && (
          <span className="text-xs text-slate-400">
            saldo: {disponivel}
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="ml-2 font-medium text-slate-600 underline hover:text-slate-900"
              >
                máx
              </button>
            )}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-slate-900">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="0,0"
          className="w-full bg-transparent px-3 py-2.5 text-lg tabular-nums outline-none"
        />
        {sufixo && <span className="px-3 text-sm font-medium text-slate-400">{sufixo}</span>}
      </div>
    </label>
  );
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "alerta" | "erro"; children: ReactNode }) {
  const cores = {
    info: "bg-slate-50 text-slate-600 border-slate-200",
    alerta: "bg-amber-50 text-amber-800 border-amber-200",
    erro: "bg-rose-50 text-rose-800 border-rose-200",
  }[tom];

  return <div className={`rounded-lg border px-4 py-3 text-sm ${cores}`}>{children}</div>;
}

/** Explicação curta do conceito, ao lado do número que o demonstra. */
export function NotaDeAula({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-slate-500">
      {children}
    </p>
  );
}
