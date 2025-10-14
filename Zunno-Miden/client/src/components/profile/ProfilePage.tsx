'use client';

import React from 'react';
import Link from 'next/link';
import { WalletConnection } from '@/components/WalletConnection';

interface ProfilePageProps {
  userAccount: string | null;
  isConnected: boolean;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ userAccount, isConnected }) => {
  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl bg-white/10 backdrop-blur-md rounded-xl shadow-lg p-8 text-white">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">User Profile</h1>
          <Link href="/play" className="bg-[#ff9000] hover:bg-[#ff7000] text-white font-bold py-2 px-4 rounded-full transition-colors">
            Back to Game
          </Link>
        </div>
        
        <div className="space-y-6">
          <div className="bg-black/30 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Wallet Address</h2>
            {isConnected && userAccount ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono break-all bg-black/20 p-3 rounded">{userAccount}</p>
                <p className="text-sm text-gray-300">This is your wallet address used for authentication and transactions.</p>
              </div>
            ) : (
              <div className="bg-black/20 p-4 rounded-lg">
                <p className="mb-4">No wallet connected. Please connect your wallet to view your profile.</p>
                <WalletConnection />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
