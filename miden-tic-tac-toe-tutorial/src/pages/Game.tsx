import { useState, useEffect } from "react";
import { useWallet } from "@demox-labs/miden-wallet-adapter-react";
import { WalletMultiButton } from "@demox-labs/miden-wallet-adapter-reactui";
import { createGame } from "../lib/createGame";
import { findGame } from "../lib/findGame";
import { makeMove } from "../lib/makeMove";
import { makeWinMove } from "../lib/makeWinMove";
import { castWin } from "../lib/castWin";
import { type MidenTransaction } from "@demox-labs/miden-wallet-adapter";
import { readBoard, createBoardPoller } from "../lib/readBoard";
import { convertBoardIndexToContractIndex } from "../lib/utils";
import { type Player, type BoardState, type GameStatus } from "../types";

export default function Game() {
  const [board, setBoard] = useState<BoardState>(() => Array(9).fill(null));
  const [showCreateGameForm, setShowCreateGameForm] = useState(false);
  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isGeneratingPlayer2, setIsGeneratingPlayer2] = useState(false);
  const [nonceInput, setNonceInput] = useState<number | null>(null);
  const [currentGameNonce, setCurrentGameNonce] = useState<number | null>(null);
  const [isFindingGame, setIsFindingGame] = useState(false);
  const [showFindGameForm, setShowFindGameForm] = useState(false);
  const [isCastingWin, setIsCastingWin] = useState(false);
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [isPlayerOne, setIsPlayerOne] = useState<boolean | null>(null);
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<
    "player1" | "player2"
  >("player1");
  const [isLoadingBoardData, setIsLoadingBoardData] = useState(false);

  useEffect(() => {
    if (currentGameNonce) {
      setIsLoadingBoardData(true);

      // Load board data immediately
      const loadInitialBoard = async () => {
        try {
          const boardData = await readBoard(currentGameNonce);
          updateBoardFromData(boardData);
          setIsLoadingBoardData(false);
        } catch (error) {
          console.error("Error loading initial board:", error);
          setIsLoadingBoardData(false);
        }
      };

      loadInitialBoard();

      // Then start polling for updates
      const stopPolling = createBoardPoller(
        currentGameNonce,
        (boardData) => {
          updateBoardFromData(boardData);
        },
        5000
      );

      return stopPolling;
    }
  }, [currentGameNonce]);

  const {
    wallet,
    accountId: rawAccountId,
    connected,
    requestTransaction,
  } = useWallet();

  const updateBoardFromData = (boardData: {
    player1Values: number[];
    player2Values: number[];
  }) => {
    const newBoard: BoardState = Array(9).fill(null);

    boardData.player1Values.forEach((index) => {
      if (index >= 0 && index < 9) {
        newBoard[index] = "X";
      }
    });

    boardData.player2Values.forEach((index) => {
      if (index >= 0 && index < 9) {
        newBoard[index] = "O";
      }
    });

    setBoard(newBoard);
    updateGameStatus(newBoard);
    updateCurrentTurn(boardData);
  };

  const getWinningCombinations = () => [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const checkWinningLine = (board: BoardState, player: Player): boolean => {
    return getWinningCombinations().some((combination) =>
      combination.every((index) => board[index] === player)
    );
  };

  const getWinningLine = (
    board: BoardState,
    player: Player
  ): number[] | null => {
    const winningCombination = getWinningCombinations().find((combination) =>
      combination.every((index) => board[index] === player)
    );
    return winningCombination || null;
  };

  const isWinningMove = (
    board: BoardState,
    player: Player,
    moveIndex: number
  ): { isWinning: boolean; winningLine: number[] | null } => {
    const testBoard = [...board];
    testBoard[moveIndex] = player;

    const winningLine = getWinningLine(testBoard, player);
    return {
      isWinning: winningLine !== null,
      winningLine,
    };
  };

  const isBoardFull = (board: BoardState): boolean => {
    return board.every((cell) => cell !== null);
  };

  const isDrawState = (board: BoardState): boolean => {
    // Check if board is completely full
    if (isBoardFull(board)) {
      return true;
    }

    // Check if only one empty square remains
    const emptyCells = board
      .map((cell, index) => (cell === null ? index : -1))
      .filter((index) => index !== -1);

    if (emptyCells.length === 1) {
      const emptyIndex = emptyCells[0];

      // Determine which player would make the next move
      const player1Count = board.filter((cell) => cell === "X").length;
      const player2Count = board.filter((cell) => cell === "O").length;
      const nextPlayer = player1Count === player2Count ? "X" : "O";

      // Simulate the move and check if it would create a winning line
      const simulatedBoard = [...board];
      simulatedBoard[emptyIndex] = nextPlayer;

      // If the simulated move doesn't create a winning line, it's a draw
      if (!checkWinningLine(simulatedBoard, nextPlayer)) {
        return true;
      }
    }

    return false;
  };

  const updateGameStatus = (board: BoardState) => {
    if (checkWinningLine(board, "X")) {
      setGameStatus("player1_wins");
    } else if (checkWinningLine(board, "O")) {
      setGameStatus("player2_wins");
    } else if (isDrawState(board)) {
      setGameStatus("draw");
    } else {
      setGameStatus("playing");
    }
  };

  const currentUserHasWon = (): boolean => {
    if (!currentGameNonce || !connected || isPlayerOne === null) return false;

    if (isPlayerOne && gameStatus === "player1_wins") return true;
    if (!isPlayerOne && gameStatus === "player2_wins") return true;
    return false;
  };

  const getGameStatusDisplay = (): { text: string; color: string } => {
    if (isPlayerOne === null)
      return { text: "Loading...", color: "text-gray-400" };

    switch (gameStatus) {
      case "player1_wins":
        return isPlayerOne
          ? { text: "🎉 You Won!", color: "text-green-400" }
          : { text: "💔 You Lost", color: "text-red-400" };
      case "player2_wins":
        return !isPlayerOne
          ? { text: "🎉 You Won!", color: "text-green-400" }
          : { text: "💔 You Lost", color: "text-red-400" };
      case "draw":
        return { text: "🤝 It's a Draw!", color: "text-yellow-400" };
      default:
        return {
          text: getTurnStatusText(),
          color: isCurrentPlayerTurn() ? "text-green-400" : "text-orange-400",
        };
    }
  };

  const updateCurrentTurn = (boardData: {
    player1Values: number[];
    player2Values: number[];
  }) => {
    const player1Count = boardData.player1Values.length;
    const player2Count = boardData.player2Values.length;

    if (player1Count === player2Count) {
      setCurrentTurnPlayer("player1");
    } else if (player1Count > player2Count) {
      setCurrentTurnPlayer("player2");
    } else {
      setCurrentTurnPlayer("player1");
    }
  };

  const isGameEnded = (): boolean => {
    return gameStatus !== "playing";
  };

  const isCurrentPlayerTurn = (): boolean => {
    if (isPlayerOne === null) return false;

    if (isPlayerOne && currentTurnPlayer === "player1") return true;
    if (!isPlayerOne && currentTurnPlayer === "player2") return true;
    return false;
  };

  const getTurnStatusText = (): string => {
    if (isPlayerOne === null) return "";

    if (isCurrentPlayerTurn()) {
      return "Your turn to play";
    } else if (isLoadingBoardData) {
      return "Loading board...";
    } else {
      return "Waiting for opponent...";
    }
  };

  // Internal function to handle making a move
  const executeMove = async (
    nonce: number,
    fieldIndex: number,
    accountIdString: string,
    requestTransaction: (transaction: MidenTransaction) => Promise<string>
  ) => {
    try {
      console.log(
        "Making move with values: ",
        nonce,
        fieldIndex,
        accountIdString
      );
      await makeMove(nonce, fieldIndex, accountIdString, requestTransaction);
    } catch (error) {
      console.error("Failed to make move:", error);
      alert("Failed to make move. Please try again.");
    }
  };

  // Internal function to handle making a winning move
  const executeWinMove = async (
    nonce: number,
    fieldIndex: number,
    winningFieldIndex1: number,
    winningFieldIndex2: number,
    accountIdString: string,
    requestTransaction: (transaction: MidenTransaction) => Promise<string>
  ) => {
    try {
      console.log(
        "Making winning move with values: ",
        nonce,
        fieldIndex,
        winningFieldIndex1,
        winningFieldIndex2,
        accountIdString
      );
      await makeWinMove(
        nonce,
        fieldIndex,
        winningFieldIndex1,
        winningFieldIndex2,
        accountIdString,
        requestTransaction
      );
    } catch (error) {
      console.error("Failed to make winning move:", error);
      alert("Failed to make winning move. Please try again.");
    }
  };

  const handleSquareClick = async (index: number) => {
    if (
      board[index] ||
      !currentGameNonce ||
      !rawAccountId ||
      !requestTransaction ||
      isGameEnded() ||
      !isCurrentPlayerTurn()
    )
      return;

    if (typeof window === "undefined") return;

    const currentPlayerSymbol = isPlayerOne ? "X" : "O";
    const { isWinning, winningLine } = isWinningMove(
      board,
      currentPlayerSymbol,
      index
    );

    if (isWinning && winningLine) {
      // Use makeWinMove for winning moves
      const otherIndexes = winningLine.filter((i) => i !== index);

      await executeWinMove(
        currentGameNonce,
        convertBoardIndexToContractIndex(index),
        convertBoardIndexToContractIndex(otherIndexes[0]),
        convertBoardIndexToContractIndex(otherIndexes[1]),
        rawAccountId,
        requestTransaction
      );
    } else {
      // Use regular makeMove for non-winning moves
      await executeMove(
        currentGameNonce,
        convertBoardIndexToContractIndex(index),
        rawAccountId,
        requestTransaction
      );
    }
  };

  // Internal function to generate a new wallet
  const generateNewWallet = async () => {
    try {
      const { AccountStorageMode, NetworkId, AccountInterface, WebClient } =
        await import("@demox-labs/miden-sdk");

      // Create a temporary client for wallet generation
      const { NODE_URL } = await import("../lib/constants");
      const client = await WebClient.createClient(NODE_URL);

      const randomWallet = await client.newWallet(
        AccountStorageMode.public(),
        true
      );

      const id = randomWallet
        .id()
        .toBech32(NetworkId.Testnet, AccountInterface.BasicWallet)
        .toString();

      setPlayer2Id(id);
    } catch (error) {
      console.error("Failed to generate wallet:", error);
      alert("Failed to generate wallet. Please try again.");
    }
  };

  const handleGeneratePlayer2 = async () => {
    setIsGeneratingPlayer2(true);

    // Only run on client side
    if (typeof window === "undefined") {
      setIsGeneratingPlayer2(false);
      return;
    }

    await generateNewWallet();
    setIsGeneratingPlayer2(false);
  };

  const handleCreateGame = async () => {
    if (!rawAccountId || !player2Id || !requestTransaction) {
      alert("Please provide both player account IDs");
      return;
    }

    // Only run on client side
    if (typeof window === "undefined") return;

    setIsCreatingGame(true);

    try {
      const { nonce: newGameNonce } = await createGame(
        player2Id,
        rawAccountId,
        requestTransaction
      );
      setCurrentGameNonce(newGameNonce);
      setIsPlayerOne(true);
      setShowCreateGameForm(false);
      console.log("Game created with nonce:", newGameNonce);
    } catch (error) {
      console.error("Failed to create game:", error);
      alert("Failed to create game. Please try again.");
    }

    setIsCreatingGame(false);
  };

  // Internal function to find and join a game
  const findAndJoinGame = async (nonce: number, accountIdString: string) => {
    try {
      const { found, isPlayer1 } = await findGame(accountIdString, nonce);

      if (found) {
        if (isPlayer1) {
          setIsPlayerOne(true);
        } else {
          setIsPlayerOne(false);
        }
        setCurrentGameNonce(nonce);
        setShowFindGameForm(false);
      } else {
        alert("You are not a player in this game or the game was not found.");
      }
    } catch (error) {
      console.error("Failed to find game:", error);
      alert("Failed to find game. Please check the account ID and try again.");
    }
  };

  const handleFindGame = async () => {
    if (!nonceInput || !rawAccountId) {
      alert("Please provide a nonce and connect your wallet");
      return;
    }

    // Only run on client side
    if (typeof window === "undefined") return;

    setIsFindingGame(true);
    await findAndJoinGame(nonceInput, rawAccountId);
    setIsFindingGame(false);
  };

  const handleConnectWallet = async () => {
    if (wallet && connected) {
      try {
        const accountIdString = wallet.adapter.accountId;
        if (accountIdString) {
          setPlayer1Id(accountIdString);
        }
      } catch (error) {
        console.error("Failed to get wallet accounts:", error);
      }
    }
  };

  // Boilerplate function for cast win
  const handleCastWin = async () => {
    if (!currentGameNonce || !rawAccountId || !requestTransaction) {
      alert("No game found or wallet not connected");
      return;
    }

    if (typeof window === "undefined") return;

    const currentPlayerSymbol = isPlayerOne ? "X" : "O";
    const winningLine = getWinningLine(board, currentPlayerSymbol);

    if (!winningLine) {
      alert("No winning line detected");
      return;
    }

    setIsCastingWin(true);

    try {
      const txId = await castWin(
        currentGameNonce,
        winningLine.map((index) => convertBoardIndexToContractIndex(index)),
        rawAccountId,
        requestTransaction
      );

      console.log("Cast win transaction submitted:", txId);
    } catch (error) {
      console.error("Failed to cast win:", error);
      alert("Failed to cast win. Please try again.");
    }

    setIsCastingWin(false);
  };

  // Auto-populate player1 ID when wallet connects
  useEffect(() => {
    if (connected) {
      handleConnectWallet();
    }
  }, [connected]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-slate-100 relative">
      {/* Title Header - Top Left */}
      <div className="absolute top-6 left-6">
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 px-6 py-4">
          <h1 className="text-xl font-semibold text-orange-400">
            Miden Tic Tac Toe Game
          </h1>
        </div>
      </div>

      {/* Wallet Connect - Top Right */}
      <div className="absolute top-6 right-6 flex gap-4 items-center">
        {currentGameNonce && (
          <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 px-4 py-2">
            <p className="text-green-400 font-semibold text-sm">
              Game: {currentGameNonce}
            </p>
          </div>
        )}
        <WalletMultiButton />
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen">
        {!currentGameNonce ? (
          <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8 max-w-md w-full">
            {!showCreateGameForm && !showFindGameForm ? (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-orange-400 mb-6">
                  Welcome to Tic Tac Toe
                </h2>
                {!connected ? (
                  <>
                    <p className="text-gray-300 mb-8">
                      Please connect your wallet to create a new game or join an
                      existing one!
                    </p>
                    <p className="text-yellow-400 text-sm mb-4">
                      👆 Use the wallet button in the top right corner
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-300 mb-8">
                      Choose an option to get started:
                    </p>
                    <div className="space-y-4">
                      <button
                        onClick={() => setShowCreateGameForm(true)}
                        className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                      >
                        Create New Game
                      </button>
                      <button
                        onClick={() => setShowFindGameForm(true)}
                        className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                      >
                        Find Game
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : showCreateGameForm ? (
              <div>
                <h2 className="text-2xl font-bold text-orange-400 mb-6">
                  Create New Game
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Player 1 Account ID (Your Wallet)
                    </label>
                    <div className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-gray-300 font-mono text-sm">
                      {player1Id || "Connect wallet to see account ID"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Player 2 Account ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={player2Id}
                        onChange={(e) => setPlayer2Id(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                        placeholder="Enter Player 2 Account ID"
                      />
                      <button
                        onClick={handleGeneratePlayer2}
                        disabled={isGeneratingPlayer2}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all duration-200 whitespace-nowrap"
                      >
                        {isGeneratingPlayer2 ? "Generating..." : "Generate"}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={handleCreateGame}
                      disabled={isCreatingGame || !player1Id || !player2Id}
                      className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all duration-200"
                    >
                      {isCreatingGame ? "Creating..." : "Create Game"}
                    </button>
                    <button
                      onClick={() => setShowCreateGameForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-semibold transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-blue-400 mb-6">
                  Find Game
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nonce
                    </label>
                    <input
                      type="number"
                      value={nonceInput || ""}
                      onChange={(e) =>
                        setNonceInput(
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-400"
                      placeholder="Enter nonce (number)"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={handleFindGame}
                      disabled={isFindingGame || !nonceInput || !connected}
                      className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all duration-200"
                    >
                      {isFindingGame ? "Finding..." : "Play"}
                    </button>
                    <button
                      onClick={() => setShowFindGameForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-semibold transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
            {/* Game Status */}
            <div className="mb-6 text-center">
              <div className="bg-gray-700 rounded-xl p-4 border border-gray-600">
                <h3
                  className={`text-xl font-bold ${
                    getGameStatusDisplay().color
                  }`}
                >
                  {getGameStatusDisplay().text}
                </h3>
              </div>
            </div>

            {/* Cast Win Button */}
            {currentUserHasWon() && (
              <div className="mb-6 text-center">
                <button
                  onClick={handleCastWin}
                  disabled={isCastingWin}
                  className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {isCastingWin ? "Casting Win..." : "🏆 Cast Win"}
                </button>
              </div>
            )}

            {/* Tic Tac Toe Board */}
            <div className="relative">
              <div className="grid grid-cols-3 gap-2">
                {board.map((cell, index) => {
                  const isDisabled =
                    isGameEnded() ||
                    !isCurrentPlayerTurn() ||
                    cell !== null ||
                    isLoadingBoardData;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSquareClick(index)}
                      disabled={isDisabled}
                      className={`w-24 h-24 border-2 rounded-lg flex items-center justify-center text-4xl font-bold transition-all duration-200 flex-shrink-0 ${
                        isDisabled
                          ? "bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed"
                          : "bg-gray-700 hover:bg-gray-600 border-orange-400 text-orange-400 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-400/20 active:scale-95"
                      }`}
                    >
                      {cell}
                    </button>
                  );
                })}
              </div>

              {/* Loading Overlay */}
              {isLoadingBoardData && (
                <div className="absolute inset-0 bg-gray-800 bg-opacity-80 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-400 mx-auto mb-4"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
