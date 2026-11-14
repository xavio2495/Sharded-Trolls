import type { Metadata } from "next";
import Header from "@/app/components/shell/Header";
import { Dashboard } from "./components/Dashboard";

export const metadata: Metadata = {
  title: "The Feeding · Sharded Trolls",
  description: "Live state of the eight trolls on NEAR testnet: feeders, food, hoards, your home troll, and the daily settlement.",
};

export default function AppPage() {
  return (
    <div className="min-h-full bg-paper">
      <Header current="/app" sticky />
      {/* desktop and tablet: one screen, no page scroll; phones stack and scroll */}
      <main className="mx-auto max-w-[96rem] p-3 md:h-[calc(100svh-var(--header)-3px)] md:overflow-hidden md:p-4">
        <Dashboard />
      </main>
    </div>
  );
}
