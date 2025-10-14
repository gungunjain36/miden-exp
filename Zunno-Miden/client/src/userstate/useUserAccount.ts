'use client';

import { useRecoilState, useRecoilValue } from 'recoil';
import { userAccountState, isUserConnectedState } from './userState';
import { useEffect, useState } from 'react';
import { useWallet } from '@demox-labs/miden-wallet-adapter';

export function useUserAccount() {
  const [account, setAccount] = useRecoilState(userAccountState);
  const isConnected = useRecoilValue(isUserConnectedState);
  const [bytesAddress, setBytesAddress] = useState<string | null>(null);
  
  // Connect to Miden wallet account
  const { accountId: midenAccountId, connected: midenConnected } = useWallet();
  const ensName = undefined;
  const ensAvatar = undefined;

  // Update account state when Miden account changes
  useEffect(() => {
    if (midenAccountId && midenConnected) {
      setAccount(midenAccountId);
    } else if (!midenConnected) {
      // Clear account when disconnected
      setAccount(null);
    }
  }, [midenAccountId, midenConnected, setAccount]);

  // Handle address format conversion for game compatibility
  useEffect(() => {
    if (account) {
      try {
        // All accounts are now Ethereum addresses (start with 0x)
        setBytesAddress(account);
      } catch (error) {
        console.error('Error processing account address:', error);
        setBytesAddress(null);
      }
    } else {
      setBytesAddress(null);
    }
  }, [account]);

  const updateUserAccount = (newAccount: string | null) => {
    setAccount(newAccount);
  };

  return {
    account,
    ensName,
    ensAvatar,
    isConnected: isConnected || midenConnected,
    updateUserAccount,
    bytesAddress,
  };
}
