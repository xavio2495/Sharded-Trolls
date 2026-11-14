import Image from "next/image";
import Link from "next/link";

// One header for every page: home, the three reading pages, and the app button.
const LINKS = [
  { href: "/pitch", label: "Pitch" },
  { href: "/paper", label: "Paper" },
  { href: "/evidence", label: "Evidence" },
];

type Props = {
  /** the page this header sits on; its link is marked current, and on /app the app button is hidden */
  current?: "/" | "/pitch" | "/paper" | "/evidence" | "/app";
  /** in-flow sticky header for plain pages; the landing page keeps a fixed one over its scenes */
  sticky?: boolean;
};

export default function Header({ current = "/", sticky = false }: Props) {
  return (
    <header className={`${sticky ? "sticky" : "fixed inset-x-0"} top-0 z-50 border-b-[3px] border-ink-0 bg-paper`}>
      <nav className="flex h-[var(--header)] w-full items-center justify-between gap-4 px-[var(--gutter)]">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3" aria-label="Sharded Trolls, home">
          <Image src="/logo.svg" alt="" width={44} height={44} className="size-10 flex-none md:size-11" />
          <span className="hidden font-display text-xl whitespace-nowrap text-ink-0 min-[400px]:inline md:text-2xl">Sharded Trolls</span>
        </Link>
        <div className="flex flex-none items-center gap-5 md:gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`nav hidden min-h-11 items-center sm:inline-flex ${current === l.href ? "text-accent-deep underline decoration-2 underline-offset-8" : "text-ink-0"}`}
            >
              <span className="roll" data-text={l.label}>
                <span>{l.label}</span>
              </span>
            </Link>
          ))}
          {current === "/app" ? (
            <Link href="/" className="nav inline-flex min-h-11 items-center text-ink-0 sm:hidden">
              Home
            </Link>
          ) : (
            <Link href="/app" className="btn btn-moss">
              <span className="sm:hidden">App</span>
              <span className="hidden sm:inline">Open the app</span>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
