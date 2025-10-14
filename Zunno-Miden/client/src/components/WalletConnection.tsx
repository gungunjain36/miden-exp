"use client";

import React, { useEffect } from "react";
import { useWallet, WalletMultiButton } from '@demox-labs/miden-wallet-adapter';

interface WalletConnectionProps {
  onConnect?: (publicKey: string | null) => void;
}

export function WalletConnection({ onConnect }: WalletConnectionProps) {
  const { accountId, connected } = useWallet();

  // Notify parent when connection/account changes
  useEffect(() => {
    if (onConnect) {
      onConnect(accountId ?? null);
    }
  }, [accountId, onConnect]);

  return (
    <div className="flex flex-col gap-4 items-center">
      <div className="max-w-xs">
        <WalletMultiButton />
      </div>
      {connected && accountId && (
        <p className="text-sm text-gray-600">Connected: {accountId}</p>
      )}
    </div>
  );
}
