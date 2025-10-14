import React from "react";
import Link from "next/link";
import { useWallet } from '@demox-labs/miden-wallet-adapter';
import {WalletConnection} from "../WalletConnection";

function Header({ roomCode }) {
    const { accountId, connected } = useWallet();

  return (
    <div className="topInfo">
      <div className="flex items-center justify-between px-4 w-full">
        <div className="flex items-center space-x-3">
          <div className="w-16 h-12 bg-white rounded-full flex items-center justify-center overflow-hidden">
            <Link href="/">
              <img src="/images/logo.png" alt="" />
            </Link>
          </div>
        </div>

        {connected && (
          <div className="flex items-center space-x-2">
            <WalletConnection />
          </div>
        )}
      </div>
    </div>
  );
}
const MemoizedHeader = React.memo(Header);
export default MemoizedHeader;
