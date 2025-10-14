'use client';

import ProfilePage from '@/components/profile/ProfilePage';
import { useUserAccount } from '@/userstate/useUserAccount';
import BottomNavigation from '@/components/BottomNavigation';

export default function Profile() {
  const { account: userAccount, isConnected } = useUserAccount();

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white">
      <div className="container mx-auto py-6 px-4 pb-24">
        <ProfilePage userAccount={userAccount} isConnected={isConnected} />
      </div>
      <BottomNavigation />
    </main>
  );
}
