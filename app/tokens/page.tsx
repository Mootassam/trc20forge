import type { Metadata } from "next";
import { MyTokens } from "@/components/MyTokens";

export const metadata: Metadata = {
  title: "My tokens · TRC-20 Forge",
  description: "Your deployed and imported TRC-20 tokens: balances and sending, without repeating setup.",
};

export default function TokensPage() {
  return <MyTokens />;
}
