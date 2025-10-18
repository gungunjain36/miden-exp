import Game from "./pages/Game";
import { Providers } from "./providers";
import "@demox-labs/miden-wallet-adapter-reactui/styles.css";

export default function App() {
  return (
    <Providers>
      <Game />
    </Providers>
  );
}
