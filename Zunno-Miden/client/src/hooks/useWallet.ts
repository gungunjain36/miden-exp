'use client';

import { useWallet as useMidenWallet } from '@demox-labs/miden-wallet-adapter';
import { useUserAccount } from '@/userstate/useUserAccount';
import { useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Custom hook to manage wallet connection state
 */
export function useWallet() {
  const { accountId: address, connected: isConnected, wallet } = useMidenWallet();
  const { account, updateUserAccount } = useUserAccount();
  const { toast } = useToast();

  // Update Recoil state when Wagmi account changes
  useEffect(() => {
    if (address && isConnected) {
      updateUserAccount(address);
    }
  }, [address, isConnected, updateUserAccount]);

  // Handle wallet disconnection
  const handleDisconnect = useCallback(() => {
    try {
      wallet?.adapter.disconnect?.();
    } catch (e) {}
    updateUserAccount(null);
    
    toast({
      title: "Wallet Disconnected",
      description: "Your wallet has been disconnected.",
      duration: 3000,
    });
  }, [wallet, updateUserAccount, toast]);

  // Miden has no EVM chainId concept here

  return {
    address,
    isConnected,
    disconnect: handleDisconnect,
    account
  };
}
