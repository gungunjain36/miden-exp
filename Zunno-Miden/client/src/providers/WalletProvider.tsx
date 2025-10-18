"use client";
import {
  MidenWalletAdapter,
  PrivateDataPermission,
  WalletModalProvider,
  WalletProvider,
} from "@demox-labs/miden-wallet-adapter-react";
import React, { useEffect, useState } from "react";

interface WalletProviderProps {
  children: React.ReactNode;
}

export function CustomWalletProvider({ children }: WalletProviderProps) {
  const [wallets, setWallets] = useState<MidenWalletAdapter[]>([]);
  useEffect(() => {
    const midenAdapter = new MidenWalletAdapter({
      appName: "Miden Uno App",
    });
    setWallets([midenAdapter]);
  }, []);
  return (
    <WalletProvider
      wallets={wallets}
      autoConnect
      privateDataPermission={PrivateDataPermission.UponRequest}
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}

