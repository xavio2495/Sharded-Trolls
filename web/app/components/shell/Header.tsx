import Image from "next/image";
import Link from "next/link";

// Sections are reached by scrolling; the header only points to the other places: the app, the pitch, the evidence.
const LINKS = [
  { href: "/pitch", label: "Pitch" },
  { href: "/evidence", label: "Evidence" },
];

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-[3px] border-ink-0 bg-paper">
      <nav className="flex h-[var(--header)] w-full px-[var(--gutter)] items-center justify-between gap-4">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} className="size-10 flex-none md:size-11" />
          <span className="truncate font-display text-xl text-ink-0 md:text-2xl">Sharded Trolls</span>
        </Link>
        <div className="flex flex-none items-center gap-5 md:gap-8">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav hidden min-h-11 items-center text-ink-0 sm:inline-flex">
              <span className="roll" data-text={l.label}>
                <span>{l.label}</span>
              </span>
            </Link>
          ))}
          <Link href="/app" className="btn btn-moss" data-magnetic>
            <span className="sm:hidden">App</span>
            <span className="hidden sm:inline">Open the app</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
