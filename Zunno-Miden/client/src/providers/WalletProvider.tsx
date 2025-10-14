'use client';

import { Children, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import {
  WalletProvider,
  WalletModalProvider,
  MidenWalletAdapter,
} from '@demox-labs/miden-wallet-adapter';
import '@demox-labs/miden-wallet-adapter/styles.css';
import { config as wagmiConfig } from '@/lib/wagmi';

interface WalletProviderProps {
  children: ReactNode;
}

const wallets = [
  new MidenWalletAdapter({ appName: 'Zunno App' }),
];

export function WalletProvider({ children }) {
  return (
    <WalletProvider wallets={wallets}>
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </WalletProvider>
  );
}

