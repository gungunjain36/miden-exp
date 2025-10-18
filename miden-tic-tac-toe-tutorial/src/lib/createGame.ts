import {
  AssemblerUtils,
  TransactionKernel,
  NoteInputs,
  NoteMetadata,
  FeltArray,
  NoteAssets,
  Felt,
  NoteTag,
  NoteType,
  NoteExecutionHint,
  NoteRecipient,
  Note,
  OutputNote,
  OutputNotesArray,
  TransactionRequestBuilder,
  AccountId,
  Address,
  NetworkId,
  AccountInterface,
} from "@demox-labs/miden-sdk";
import {
  type MidenTransaction,
  TransactionType,
  CustomTransaction,
} from "@demox-labs/miden-wallet-adapter";

import gameContractCode from "./contracts/tic_tac_toe_code";
import createGameNoteCode from "./notes/create_game_note_code";
import { instantiateClient, generateRandomSerialNumber } from "./utils";
import { NONCE_SLOT, TIC_TAC_TOE_CONTRACT_ID } from "./constants";

// lib/createGame.ts
export async function createGame(
  player2IdString: string,
  connectedWalletIdString: string,
  requestTransaction: (transaction: MidenTransaction) => Promise<string>
): Promise<{ nonce: number; txIx: string }> {
  if (typeof window === "undefined") {
    console.warn("webClient() can only run in the browser");
    return { nonce: 0, txIx: "" };
  }

  // Create client instance
  const client = await instantiateClient({
    accountsToImport: [],
  });

  const connectedWalletId = Address.fromBech32(
    connectedWalletIdString
  ).accountId();
  const player2Id = Address.fromBech32(player2IdString).accountId();

  // Building the tic tac toe contract
  let assembler = TransactionKernel.assembler();

  const gameContractId = AccountId.fromHex(TIC_TAC_TOE_CONTRACT_ID);

  // Reading the public state of the tic tac toe contract from testnet,
  // and importing it into the WebClient
  let gameContractAccount = await client.getAccount(gameContractId);
  if (!gameContractAccount) {
    await client.importAccountById(gameContractId);
    await client.syncState();
    gameContractAccount = await client.getAccount(gameContractId);
    if (!gameContractAccount) {
      throw new Error(`Account not found after import: ${gameContractId}`);
    }
  }

  // Get new nonce
  const oldNonceStorage = gameContractAccount
    .storage()
    .getItem(NONCE_SLOT)
    ?.toU64s();

  // Creating the library to call the counter contract
  const gameComponentLib = AssemblerUtils.createAccountComponentLibrary(
    assembler, // assembler
    "external_contract::game_contract", // library path to call the contract
    gameContractCode // account code of the contract
  );

  assembler = assembler.withDebugMode(true).withLibrary(gameComponentLib);

  const noteScript = assembler.compileNoteScript(createGameNoteCode);

  const noteInputs = new NoteInputs(
    new FeltArray([player2Id.suffix(), player2Id.prefix()])
  );
  const noteTag = NoteTag.fromAccountId(gameContractAccount.id());
  const metadata = new NoteMetadata(
    connectedWalletId,
    NoteType.Public,
    noteTag,
    NoteExecutionHint.always(),
    new Felt(BigInt(0))
  );
  const createGameNote = new Note(
    new NoteAssets([]),
    metadata,
    new NoteRecipient(generateRandomSerialNumber(), noteScript, noteInputs)
  );

  const noteRequest = new TransactionRequestBuilder()
    .withOwnOutputNotes(new OutputNotesArray([OutputNote.full(createGameNote)]))
    .build();

  const tx = new CustomTransaction(
    connectedWalletId.toBech32(NetworkId.Testnet, AccountInterface.Unspecified),
    noteRequest
  );

  const txId = await requestTransaction({
    type: TransactionType.Custom,
    payload: tx,
  });

  await client.syncState();

  // Return the game contract account ID
  return { nonce: Number(oldNonceStorage?.[3]) + 1, txIx: txId };
}
