import type { Metadata } from "next";
import Deck from "./Deck";

export const metadata: Metadata = { title: "Sharded Trolls: pitch" };

export default function PitchPage() {
  return <Deck />;
}
