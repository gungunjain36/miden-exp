"use client";
import { useEffect, useState } from "react";
import { getCounterValue, incrementCounterContract } from "@/lib/incrementCounterContract";
import { joinGame, commitRandomness, revealRandomness, initDeck, generateSeed, shuffleDeck, wordHexToU64 } from "@/lib/uno";

export default function Home() {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const [unoAccount, setUnoAccount] = useState("");
  const [unoMsg, setUnoMsg] = useState<string | null>(null);

  const loadCount = async () => {
    try {
      setError(null);
      setLoading(true);
      const c = await getCounterValue();
      setCount(c);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCount();
  }, []);

  const handleIncrement = async () => {
    try {
      setError(null);
      setLoading(true);
      const { count: newCount, txId } = await incrementCounterContract();
      setCount(newCount);
      setLastTx(txId);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const ensureAcc = () => {
    if (!unoAccount) throw new Error("Enter UNO account id (bech32)");
  };

  const doJoin = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      const res = await joinGame(unoAccount);
      setUnoMsg(`Joined. Players: ${wordHexToU64(res.playerCountHex)} | Tx ${res.txId}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  const doCommit = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      // Example secret commitment (precomputed externally or via server). Replace with real.
      const commit = ["8356861120497034222","14136319511511356219","15889649503805827246","947551707161554774"];
      const res = await commitRandomness(unoAccount, 0, commit);
      setUnoMsg(`Committed. Tx ${res.txId}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  const doReveal = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      const h = ["8356861120497034222","14136319511511356219","15889649503805827246","947551707161554774"];
      const s = ["10","20","30","40"];
      const res = await revealRandomness(unoAccount, 0, h, s);
      setUnoMsg(`Revealed. Tx ${res.txId}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  const doInitDeck = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      const res = await initDeck(unoAccount);
      setUnoMsg(`Deck init. Tx ${res.txId} | c0=${res.card0} c107=${res.card107}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  const doGenerateSeed = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      const res = await generateSeed(unoAccount);
      setUnoMsg(`Seed set. Tx ${res.txId} | seed=${res.seed}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  const doShuffle = async () => {
    try {
      setUnoMsg(null); setError(null); setLoading(true);
      ensureAcc();
      const res = await shuffleDeck(unoAccount);
      setUnoMsg(`Shuffled. Tx ${res.txId} | c0=${res.card0} c107=${res.card107}`);
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-slate-800 dark:text-slate-100">
      <div className="text-center">
        <h1 className="text-4xl font-semibold mb-4 text-white">Miden Web App</h1>
        <p className="mb-6 text-white">Open your browser console to see WebClient logs.</p>

        <div className="max-w-xl w-full bg-gray-800/20 border border-gray-600 rounded-2xl p-6 mx-auto flex flex-col gap-4 text-left text-white/90">
          <h2 className="text-white text-lg font-semibold">UNO Controls</h2>
          <input
            value={unoAccount}
            onChange={(e) => setUnoAccount(e.target.value)}
            placeholder="UNO Account Bech32 (e.g. mtst1q...)"
            className="w-full px-3 py-2 bg-transparent border border-gray-600 rounded"
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <button onClick={doJoin} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-sky-600 text-white rounded-lg transition-all hover:bg-sky-600 disabled:opacity-50">Join</button>
            <button onClick={doCommit} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-amber-600 text-white rounded-lg transition-all hover:bg-amber-600 disabled:opacity-50">Commit</button>
            <button onClick={doReveal} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-emerald-600 text-white rounded-lg transition-all hover:bg-emerald-600 disabled:opacity-50">Reveal</button>
            <button onClick={doInitDeck} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-purple-600 text-white rounded-lg transition-all hover:bg-purple-600 disabled:opacity-50">Init Deck</button>
            <button onClick={doGenerateSeed} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-pink-600 text-white rounded-lg transition-all hover:bg-pink-600 disabled:opacity-50">Generate Seed</button>
            <button onClick={doShuffle} disabled={loading} className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-orange-600 text-white rounded-lg transition-all hover:bg-orange-600 disabled:opacity-50">Shuffle</button>
          </div>

          {unoMsg && <div className="text-sm mt-2 break-all">{unoMsg}</div>}
          {error && <div className="text-red-400 text-sm mt-2 break-all">{error}</div>}
        </div>

        <div className="max-w-sm w-full bg-gray-800/20 border border-gray-600 rounded-2xl p-6 mx-auto flex flex-col gap-4 mt-6">
          <div className="text-left text-white/90">
            <div className="flex items-center justify-between">
              <span className="font-medium">Counter</span>
              <span className="text-lg font-semibold">{count ?? "—"}</span>
            </div>
            {lastTx && (
              <div className="mt-2 text-sm text-white/70 break-all">
                Last Tx: <a className="underline" href={`https://testnet.midenscan.com/tx/${lastTx}`} target="_blank" rel="noreferrer">{lastTx}</a>
              </div>
            )}
            {error && (
              <div className="mt-2 text-red-400 text-sm">{error}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={loadCount}
              disabled={loading}
              className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-sky-600 text-white rounded-lg transition-all hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Fetch Count"}
            </button>
            <button
              onClick={handleIncrement}
              disabled={loading}
              className="px-4 py-2 text-sm cursor-pointer bg-transparent border-2 border-orange-600 text-white rounded-lg transition-all hover:bg-orange-600 disabled:opacity-50"
            >
              {loading ? "Working..." : "Increment"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
