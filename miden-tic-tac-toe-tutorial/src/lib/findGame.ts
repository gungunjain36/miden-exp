import { AccountId, Address } from "@demox-labs/miden-sdk";
import { PLAYER_IDS_MAPPING_SLOT, TIC_TAC_TOE_CONTRACT_ID } from "./constants";
import { getNonceWord, instantiateClient, getAccount } from "./utils";

// lib/findGame.ts
export async function findGame(
  connectedWalletIdString: string,
  nonce: number
): Promise<{ found: boolean; isPlayer1: boolean }> {
  try {
    // Convert string IDs to AccountId objects
    const gameAccountId = AccountId.fromHex(TIC_TAC_TOE_CONTRACT_ID);

    const connectedWalletId = Address.fromBech32(
      connectedWalletIdString
    ).accountId();

    // Create client instance
    const client = await instantiateClient({
      accountsToImport: [connectedWalletIdString],
    });
    await client.syncState();

    // Get the game account to access its storage
    const gameAccount = await getAccount(client, gameAccountId);
    if (!gameAccount) {
      throw new Error(`Account not found after import: ${gameAccountId}`);
    }

    // Check storage slots 1 and 2 for player1 and player2 account IDs
    const storage = gameAccount.storage();

    const nonceWord = getNonceWord(nonce);

    // Storage slot 1: player1 account ID
    const playerIdsSlot = storage.getMapItem(
      PLAYER_IDS_MAPPING_SLOT,
      nonceWord
    );

    const connectedIdPrefix = connectedWalletId.prefix();
    const connectedIdSuffix = connectedWalletId.suffix();

    // 0, 0, prefix, suffix (reversed)
    if (playerIdsSlot !== undefined) {
      const felts = playerIdsSlot.toFelts();

      const player1IdPrefixFelt = felts[3];
      const player1IdSuffixFelt = felts[2];
      const player2IdPrefixFelt = felts[1];
      const player2IdSuffixFelt = felts[0];

      if (
        player1IdPrefixFelt.asInt() === connectedIdPrefix.asInt() &&
        player1IdSuffixFelt.asInt() === connectedIdSuffix.asInt()
      ) {
        return { isPlayer1: true, found: true };
      } else if (
        player2IdPrefixFelt.asInt() === connectedIdPrefix.asInt() &&
        player2IdSuffixFelt.asInt() === connectedIdSuffix.asInt()
      ) {
        return { isPlayer1: false, found: true };
      }
    }
    return { isPlayer1: false, found: false };
  } catch (error) {
    console.error("Failed to find game:", error);
    return { isPlayer1: false, found: false };
  }
}
