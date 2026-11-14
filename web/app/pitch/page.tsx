import type { Metadata } from "next";
import Deck from "./Deck";

export const metadata: Metadata = { title: "Sharded Trolls: pitch", alternates: { types: { "text/markdown": "/pitch.md" } } };

export default function PitchPage() {
  return <Deck />;
}
