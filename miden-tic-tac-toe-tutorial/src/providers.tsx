import { WalletProvider } from "@demox-labs/miden-wallet-adapter-react";
import { WalletModalProvider } from "@demox-labs/miden-wallet-adapter";
import { PrivateDataPermission } from "@demox-labs/miden-wallet-adapter-base";
import { MidenWalletAdapter } from "@demox-labs/miden-wallet-adapter-miden";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<MidenWalletAdapter[]>([]);

  useEffect(() => {
    const midenAdapter = new MidenWalletAdapter({
      appName: "Miden Demo App",
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
