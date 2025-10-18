export type Player = "X" | "O";
export type BoardState = (Player | null)[];
export type GameStatus = "playing" | "player1_wins" | "player2_wins" | "draw";
