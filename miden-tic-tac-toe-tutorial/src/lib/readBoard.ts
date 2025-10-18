import { AccountId, Word } from "@demox-labs/miden-sdk";
import {
  PLAYER1_VALUES_MAPPING_SLOT,
  PLAYER2_VALUES_MAPPING_SLOT,
  TIC_TAC_TOE_CONTRACT_ID,
} from "./constants";
import {
  getAccount,
  getNonceWord,
  instantiateClient,
  convertContractIndexToBoardIndex,
} from "./utils";

export async function readBoard(
  nonce: number
): Promise<{ player1Values: number[]; player2Values: number[] }> {
  const gameAccountId = AccountId.fromHex(TIC_TAC_TOE_CONTRACT_ID);
  // Create client instance
  const client = await instantiateClient({
    accountsToImport: [],
  });
  await client.syncState();

  // Get the game account to access its storage
  const gameAccount = await getAccount(client, gameAccountId);
  if (!gameAccount) {
    throw new Error(`Account not found after import: ${gameAccountId}`);
  }

  let player1ValuesMapping: Word | undefined;
  try {
    player1ValuesMapping = gameAccount
      .storage()
      .getMapItem(PLAYER1_VALUES_MAPPING_SLOT, getNonceWord(nonce));
  } catch {
    // throws error if mapping has no values
  }

  let player2ValuesMapping: Word | undefined;
  try {
    player2ValuesMapping = gameAccount
      .storage()
      .getMapItem(PLAYER2_VALUES_MAPPING_SLOT, getNonceWord(nonce));
  } catch {
    // throws error if mapping has no values
  }

  const player1Values = player1ValuesMapping
    ? mappingValuesToIndexes(player1ValuesMapping)
    : [];
  const player2Values = player2ValuesMapping
    ? mappingValuesToIndexes(player2ValuesMapping)
    : [];

  return { player1Values, player2Values };
}

export function createBoardPoller(
  nonce: number,
  onUpdate: (boardData: {
    player1Values: number[];
    player2Values: number[];
  }) => void,
  intervalMs: number = 5000
): () => void {
  const interval = setInterval(async () => {
    try {
      const boardData = await readBoard(nonce);
      onUpdate(boardData);
    } catch (error) {
      console.error("Error polling board:", error);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

function mappingValuesToIndexes(mappingWord: Word): number[] {
  const felts = mappingWord.toFelts();
  return felts
    .map((felt) => felt.asInt())
    .filter((value) => value !== 0n)
    .map((value) => convertContractIndexToBoardIndex(Number(value)));
}
