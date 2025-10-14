"use client";

import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// Removed WagmiProvider to fully migrate to Miden wallet adapter
import RecoilProvider from "../userstate/RecoilProvider";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { MiniKitContextProvider } from "../providers/MiniKitProvider";
import { base, baseSepolia } from "wagmi/chains";
import { CampProvider } from "@campnetwork/origin/react";
import {
  WalletProvider,
  WalletModalProvider,
  MidenWalletAdapter,
} from '@demox-labs/miden-wallet-adapter';
import '@demox-labs/miden-wallet-adapter/styles.css';

const queryClient = new QueryClient();
const wallets = [
  new MidenWalletAdapter({ appName: 'Zunno-App' }),
];

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RecoilProvider>
        <WalletProvider wallets={wallets}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </RecoilProvider>
    </QueryClientProvider>
  );
}

