"use client";

import { useRef, useEffect, useState } from "react";
import { useWallet, WalletMultiButton } from '@demox-labs/miden-wallet-adapter';
import { useRouter } from "next/navigation";
import { UnoGameContract } from "@/lib/types";
import { getContractNew } from "@/lib/web3";
import io, { Socket } from "socket.io-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useUserAccount } from "@/userstate/useUserAccount";
import { WalletConnection } from "@/components/WalletConnection";
// import {
//   useAccount,
//   useConnect,
//   useWalletClient,
// } from "wagmi";
import BottomNavigation from "@/components/BottomNavigation";
import GameCard from "./gameCard";
import Link from "next/link";
import { getMidenContract } from "@/lib/midenAdapter";

const CONNECTION =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
  "https://abigail-unkempt-jonah.ngrok-free.dev";

// DIAM wallet integration removed

export default function PlayGame() {
  const [contract, setContract] = useState<UnoGameContract | null>(null);
  const [open, setOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [computerCreateLoading, setComputerCreateLoading] = useState(false);
  const [joiningGameId, setJoiningGameId] = useState<BigInt | null>(null);
  const [gameId, setGameId] = useState<BigInt | null>(null);
  const [games, setGames] = useState<BigInt[]>([]);
  const router = useRouter();

  const { account: address, isConnected } = useUserAccount();
  const { connectedAccount, requestTransaction } = useWallet();

  const socket = useRef<Socket | null>(null);

  const { toast } = useToast();

  // // Using Wagmi hooks for wallet connection
  // const { connect, connectors } = useConnect();

  // Connection handled by WalletMultiButton

  const fetchGames = async () => {
    if (contract) {
      try {
        console.log("Fetching active games (on-chain)...");
        const activeGames = await contract.getActiveGames();
        console.log("Active games:", activeGames);
        setGames(activeGames);
      } catch (error) {
        console.error("Failed to fetch games:", error);
      }
    }
  };

  useEffect(() => {
    if (!socket.current) {
      socket.current = io(CONNECTION, {
        transports: ["websocket"],
      }) as any; // Type assertion to fix the type mismatch

      console.log("Socket connection established");
    }
  }, [socket]);

  useEffect(() => {
    if (contract) {
      console.log("Contract initialized, calling fetchGames"); // Add this line
      fetchGames();

      if (socket.current) {
        console.log("Socket connection established");
        // Refresh on creator or server broadcast events
        socket.current.on("gameRoomCreated", () => {
          console.log("Game room created event received");
          fetchGames();
        });
        socket.current.on("createGameRoom", () => {
          console.log("createGameRoom event received");
          fetchGames();
        });

        // Cleanup function
        return () => {
          if (socket.current) {
            socket.current.off("gameRoomCreated");
            socket.current.off("createGameRoom");
          }
        };
      }
    } else {
      console.log("Contract not initialized yet"); // Add this line
    }
  }, [contract, socket]);

  const ISSERVER = typeof window === "undefined";

  const openHandler = () => {
    setOpen(false);
  };

  const createGame = async () => {
    if (contract && connectedAccount) {
      try {
        setCreateLoading(true);

        console.log("Creating game...");

        // Using Wagmi address directly with the contract
        const tx = await contract.createGame(connectedAccount.id);
        console.log("Transaction hash:", tx.hash);
        await tx.wait();
        console.log("Game created successfully");

        if (socket && socket.current) {
          socket.current.emit("createGameRoom");
          }

        fetchGames();
        setCreateLoading(false);
      } catch (error) {
        console.error("Failed to create game:", error);
        toast({
          title: "Error",
          description: "Failed to create game. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        setCreateLoading(false);
      }
    } else {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to create a game.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const startComputerGame = async () => {
    if (contract && address) {
      try {
        setComputerCreateLoading(true);

        console.log("Creating computer game...");

        const tx = await contract.createGame(address as `0x${string}`);
        const receipt = await tx.wait();
        console.log("Computer game created successfully:", receipt);

        // Extract gameId from the event logs
        const gameCreatedEvent = receipt.logs.find(
          (log: any) => log.fragment && log.fragment.name === "GameCreated"
        );

        if (gameCreatedEvent) {
          const gameId = gameCreatedEvent.args[0];
          console.log("Computer Game ID:", gameId.toString());
          setGameId(gameId);

          // Emit socket event to create computer game room
          if (socket.current) {
            socket.current.emit("createComputerGame", {
              gameId: gameId.toString(),
              playerAddress: address
            });
            console.log("Socket event emitted for computer game creation");
          }

          // Navigate to game room with computer mode flag
          router.push(`/game/${gameId}?mode=computer`);
        }

        // toast({
        //   title: "Computer Game Started",
        //   description: "Starting game against computer opponent!",
        //   duration: 3000,
        // });
      } catch (error) {
        console.error("Failed to create computer game:", error);
        toast({
          title: "Error",
          description: "Failed to start computer game. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        setComputerCreateLoading(false);
      }
    } else {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to play against computer.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const joinGame = async (gameId: BigInt) => {
    if (contract && address) {
      try {
        setJoiningGameId(gameId);

        console.log(`Joining game ${gameId.toString()}...`);

        const gameIdBigint = BigInt(gameId.toString());
        // Using Wagmi address directly
        const tx = await contract.joinGame(gameIdBigint, address as `0x${string}`);
        console.log("Transaction hash:", tx.hash);
        await tx.wait();

        console.log("Joined game successfully");
        router.push(`/game/${gameId.toString()}`);
      } catch (error) {
        console.error("Failed to join game:", error);
        setJoiningGameId(null);
        toast({
          title: "Transaction Failed",
          description: "Failed to join game.",
          variant: "destructive",
        });
      }
    } else {
      setJoiningGameId(null);
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to join a game.",
        variant: "destructive",
      });
    }
  };

  const setup = async () => {
    if (address) {
      try {
        const { contract } = getMidenContract(requestTransaction);
        setContract(contract);
      } catch (error) {
        console.error("Failed to setup contract:", error);
      }
    }
  };

  useEffect(() => {
    if (address) {
      setup();
    } else {
      setContract(null);
    }
  }, [address]);

  return (
    <div
    className="min-h-screen text-white relative overflow-hidden" 
    style={{
    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' 
  }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black/10"></div>
        
        <div className="absolute top-0 left-0 right-0 h-[30%] bg-gradient-to-b from-purple-500/10 to-transparent"></div>
        
        <div className="absolute top-[10%] left-[5%] w-[300px] h-[300px] rounded-full bg-blue-500/20 blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[250px] h-[250px] rounded-full bg-purple-500/20 blur-[80px] animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-[40%] right-[20%] w-[200px] h-[200px] rounded-full bg-pink-500/10 blur-[60px] animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-12">
        <div className="flex items-center space-x-3">
          <div className="w-16 h-12 bg-white rounded-full flex items-center justify-center overflow-hidden">
            <Link href="/">
              <img src="/images/logo.png" alt="" />
            </Link>
          </div>
        </div>
        
        {isConnected && (
          <div className="flex items-center space-x-2">
            <WalletConnection />
          </div>
        )}
      </div>

      {!isConnected ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <div className="text-center mb-2">
            <h1 className="text-4xl font-bold mb-2">Welcome Back!</h1>
            <p className="text-gray-300 text-lg">Ready to challenge?</p>
          </div>
          <WalletConnection />
        </div>
      ) : (
        <div className="px-4">
          {/* Welcome Section */}
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold">Welcome Back!</h1>
            <p className="text-gray-300 text-sm mb-1">Ready to challenge?</p>
          </div>

          {/* Game Modes Section */}
          <div className="mb-8">
            {/* <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Game Modes</h2>
              <button className="text-cyan-400 text-sm font-medium">View All</button>
            </div> */}

            <div className="grid grid-cols-2 gap-4">
              {/* Quick Match Card */}
              <div 
                className="rounded-3xl relative overflow-hidden min-h-[160px] cursor-pointer transition-all duration-300 active:translate-y-1 border border-white/10"
                style={{
                  background: 'linear-gradient(180deg, #4a9eff 0%, #0069e3 100%)',
                  boxShadow: '0 10px 20px rgba(0, 105, 227, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.1), inset 0 2px 0 rgba(255, 255, 255, 0.3)'
                }}
                onClick={startComputerGame}
              >
                {/* Glossy shine overlay */}
                <div className="absolute top-0 left-0 right-0 h-[50%] bg-gradient-to-b from-white/30 to-transparent rounded-t-3xl pointer-events-none"></div>
                
                {/* Side shine effect */}
                <div className="absolute top-[5%] bottom-[5%] left-0 w-[3px] bg-gradient-to-b from-white/0 via-white/50 to-white/0 pointer-events-none"></div>
                
                {/* Content container with padding */}
                <div className="relative p-3 h-full flex flex-col">
                  {/* Icon */}
                  {/* <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg mb-4">
                    <span className="text-2xl text-white">⚡</span>
                  </div> */}
                  
                  {/* Text content */}
                  <div className="mt-auto">
                    <h3 className="font-bold text-2xl mb-2 text-white">Quick Match</h3>
                    <p className="text-white/80 text-sm mb-3">Play against AI opponent</p>
                    {/* <div className="flex items-center text-white/70 text-sm">
                      <span>Coming soon...</span>
                    </div> */}
                  </div>
                </div>
                {computerCreateLoading && (
                  <div className="absolute inset-0 bg-black/50 rounded-3xl flex items-center justify-center">
                    <div className="text-white font-medium">Creating...</div>
                  </div>
                )}
              </div>

              {/* Create Room Card */}
              <div 
                className="rounded-3xl relative overflow-hidden min-h-[160px] cursor-pointer transition-all duration-300 active:translate-y-1 border border-white/10"
                onClick={createGame}
                style={{
                  background: 'linear-gradient(180deg, #ff5a87 0%, #e3003a 100%)',
                  boxShadow: '0 10px 20px rgba(227, 0, 58, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.1), inset 0 2px 0 rgba(255, 255, 255, 0.3)'
                }}
              >
                {/* Glossy shine overlay */}
                <div className="absolute top-0 left-0 right-0 h-[50%] bg-gradient-to-b from-white/30 to-transparent rounded-t-3xl pointer-events-none"></div>
                
                {/* Side shine effect */}
                <div className="absolute top-[5%] bottom-[5%] left-0 w-[3px] bg-gradient-to-b from-white/0 via-white/50 to-white/0 pointer-events-none"></div>
                
                {/* Content container with padding */}
                <div className="relative p-3 h-full flex flex-col">
                  {/* Icon */}
                  {/* <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg mb-4">
                    <span className="text-2xl font-bold text-white">+</span>
                  </div> */}
                  
                  {/* Text content */}
                  <div className="mt-auto">
                    <h3 className="font-bold text-2xl mb-2 text-white">Create Room</h3>
                    <p className="text-white/80 text-sm mb-3">Custom settings & invite friends</p>
                  </div>
                </div>
                {createLoading && (
                  <div className="absolute inset-0 bg-black/50 rounded-3xl flex items-center justify-center">
                    <div className="text-white font-medium">Creating...</div>
                  </div>
                )}
              </div>

              {/* Tournament Card */}
              {/* <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-3xl p-6 relative overflow-hidden min-h-[160px]">
                <div className="absolute top-4 left-4">
                  <div className="w-12 h-12 bg-purple-400/30 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🏆</span>
                  </div>
                </div>
                <div className="mt-16">
                  <h3 className="font-bold text-lg mb-2">Tournament</h3>
                  <p className="text-purple-100 text-sm mb-3">Compete for big prizes</p>
                  <div className="flex items-center text-yellow-300 text-sm font-medium">
                    <span className="mr-2">💰</span>
                    <span>10,000 ZUNNO</span>
                  </div>
                  <div className="text-yellow-300 text-xs">Prize Pool</div>
                </div>
              </div> */}

              {/* Practice Card */}
              {/* <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-3xl p-6 relative overflow-hidden min-h-[160px]">
                <div className="absolute top-4 left-4">
                  <div className="w-12 h-12 bg-green-400/30 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🎯</span>
                  </div>
                </div>
                <div className="mt-16">
                  <h3 className="font-bold text-lg mb-2">Practice</h3>
                  <p className="text-green-100 text-sm mb-3">Play against AI opponents</p>
                  <div className="flex items-center text-green-100 text-sm">
                    <span className="mr-2">🤖</span>
                    <span>No gas fees</span>
                  </div>
                </div>
              </div> */}
            </div>
          </div>

          {/* Available Rooms Section */}
          <div className="mb-24">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-bold">Available Rooms</h2>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-sm font-medium">{games.length} Live</span>
                </div>
              </div>
              <button
                onClick={fetchGames}
                className="p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all duration-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            
            {games.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {games.toReversed().map((gameId, index) => (
                  <div
                    key={index}
                    className="rounded-3xl relative overflow-hidden border border-white/10 transition-all duration-300 hover:border-white/20 hover:scale-[1.02] cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                      backdropFilter: 'blur(20px)',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                    }}
                    onClick={() => joinGame(gameId)}
                  >
                    {/* Glass effect overlay */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                    
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center border border-white/20">
                            <span className="text-xl">🎮</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">Room #{gameId.toString().slice(-4)}</h3>
                            <p className="text-gray-300 text-sm">Waiting for players</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="text-green-400 text-sm font-medium">Live</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold">1</div>
                            <div className="text-xs text-gray-400">Players</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold">2</div>
                            <div className="text-xs text-gray-400">Max</div>
                          </div>
                        </div>
                        
                        <button
                          disabled={joiningGameId !== null && joiningGameId.toString() === gameId.toString()}
                          className="rounded-2xl relative overflow-hidden border border-white/20 transition-all duration-300 hover:border-white/30 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                          style={{
                            background: 'linear-gradient(180deg, #4a9eff 0%, #0069e3 100%)',
                            boxShadow: '0 6px 16px rgba(0, 105, 227, 0.4), inset 0 -1px 0 rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                          }}
                        >
                          {/* Glossy shine overlay */}
                          <div className="absolute top-0 left-0 right-0 h-[50%] bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl pointer-events-none"></div>
                          
                          <div className="relative px-6 py-3">
                            <span className="font-semibold text-white text-sm">
                              {joiningGameId !== null && joiningGameId.toString() === gameId.toString() ? (
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                  <span>Joining...</span>
                                </div>
                              ) : (
                                "Join Game"
                              )}
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div 
                className="rounded-3xl relative overflow-hidden border border-white/10"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                }}
              >
                {/* Glass effect overlay */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                
                <div className="p-8 text-center">
                  <div className="mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-white/10">
                      <span className="text-4xl">🎮</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    No Active Rooms
                  </h3>
                  <p className="text-gray-300 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                    Be the first to create a room and start an epic UNO battle with other players!
                  </p>
                  <button
                    onClick={createGame}
                    disabled={createLoading}
                    className="rounded-2xl relative overflow-hidden border border-white/20 transition-all duration-300 hover:border-white/30 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(180deg, #ff5a87 0%, #e3003a 100%)',
                      boxShadow: '0 8px 20px rgba(227, 0, 58, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.1), inset 0 2px 0 rgba(255, 255, 255, 0.3)'
                    }}
                  >
                    {/* Glossy shine overlay */}
                    <div className="absolute top-0 left-0 right-0 h-[50%] bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl pointer-events-none"></div>
                    
                    <div className="relative px-8 py-4">
                      <span className="font-semibold text-white">
                        {createLoading ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Creating Room...</span>
                          </div>
                        ) : (
                          "Create Room"
                        )}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <BottomNavigation />
      
      <Toaster />
    </div>
  );
}
