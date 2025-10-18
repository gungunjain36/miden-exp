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
  AccountInterface,
  NetworkId,
  Address,
  AccountId,
} from "@demox-labs/miden-sdk";
import {
  type MidenTransaction,
  TransactionType,
  CustomTransaction,
} from "@demox-labs/miden-wallet-adapter";

import makeMoveNoteCode from "./notes/make_a_move_code";
import gameContractCode from "./contracts/tic_tac_toe_code";
import { TIC_TAC_TOE_CONTRACT_ID } from "./constants";
import { generateRandomSerialNumber, instantiateClient } from "./utils";

// lib/makeMove.ts
export async function makeMove(
  nonce: number,
  fieldIndex: number,
  connectedWalletIdString: string,
  requestTransaction: (transaction: MidenTransaction) => Promise<string>
): Promise<string | null> {
  if (typeof window === "undefined") {
    console.warn("webClient() can only run in the browser");
    return "";
  }

  // Create client instance
  const client = await instantiateClient({
    accountsToImport: [],
  });

  const connectedWalletId = Address.fromBech32(
    connectedWalletIdString
  ).accountId();

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

  // Creating the library to call the counter contract
  const gameComponentLib = AssemblerUtils.createAccountComponentLibrary(
    assembler, // assembler
    "external_contract::game_contract", // library path to call the contract
    gameContractCode // account code of the contract
  );

  assembler = assembler.withDebugMode(true).withLibrary(gameComponentLib);

  const noteScript = assembler.compileNoteScript(makeMoveNoteCode);

  const noteInputs = new NoteInputs(
    new FeltArray([new Felt(BigInt(nonce)), new Felt(BigInt(fieldIndex))])
  );
  const noteTag = NoteTag.fromAccountId(gameContractAccount.id());
  const metadata = new NoteMetadata(
    connectedWalletId,
    NoteType.Public,
    noteTag,
    NoteExecutionHint.always(),
    new Felt(BigInt(0))
  );
  const makeMoveNote = new Note(
    new NoteAssets([]),
    metadata,
    new NoteRecipient(generateRandomSerialNumber(), noteScript, noteInputs)
  );

  const noteRequest = new TransactionRequestBuilder()
    .withOwnOutputNotes(new OutputNotesArray([OutputNote.full(makeMoveNote)]))
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

  return txId;
}
