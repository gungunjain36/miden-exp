"use client";
import { useState } from "react";
import { incrementCounterContract } from "@/lib/incrementCounterContract";

export default function Home() {
  const [isIncrementCounter, setIsIncrementCounter] = useState(false);

  const handleIncrementCounterContract = async () => {
    setIsIncrementCounter(true);
    await incrementCounterContract();
    setIsIncrementCounter(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-slate-800 dark:text-slate-100">
      <div className="text-center">
        <h1 className="text-4xl font-semibold mb-4 text-white">Miden Web App</h1>
        <p className="mb-6 text-white">Open your browser console to see WebClient logs.</p>

        <div className="max-w-sm w-full bg-gray-800/20 border border-gray-600 rounded-2xl p-6 mx-auto flex flex-col gap-4">
          <button
            onClick={handleIncrementCounterContract}
            className="w-full px-6 py-3 text-lg cursor-pointer bg-transparent border-2 border-orange-600 text-white rounded-lg transition-all hover:bg-orange-600 hover:text-white"
          >
            {isIncrementCounter
              ? "Working..."
              : "Tutorial #3: Increment Counter Contract"}
          </button>
        </div>
      </div>
    </main>
  );
}
