import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { href: "#why", label: "Why eight" },
  { href: "#toll", label: "The toll" },
  { href: "#feeding", label: "The Feeding" },
  { href: "#proof", label: "Proof" },
  { href: "/evidence", label: "Evidence" },
];

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-paper/85 backdrop-blur-md">
      <nav className="container flex h-[var(--header)] items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} className="size-11" />
          <span className="font-display text-2xl text-ink-0">Sharded Trolls</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="nav text-ink-1 hover:text-ink-0">
              <span className="roll" data-text={l.label}>
                <span>{l.label}</span>
              </span>
            </a>
          ))}
          <Link href="/app" className="btn btn-moss" data-magnetic>
            <span className="roll" data-text="Open the app">
              <span>Open the app</span>
            </span>
          </Link>
        </div>
        <div className="md:hidden">
          <Link href="/app" className="btn btn-moss">App</Link>
        </div>
      </nav>
    </header>
  );
}
