"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWallet } from "./useWallet";

type Ctx = ReturnType<typeof useWallet>;
const WalletCtx = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const value = useWallet();
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWalletCtx(): Ctx {
  const v = useContext(WalletCtx);
  if (!v) throw new Error("useWalletCtx must be used inside <WalletProvider>");
  return v;
}
