import type { UnoGameContract } from "./types";
import {
  instantiateClient,
  generateRandomSerialNumber,
  getAccount,
} from "./midenUtils";
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
import { UNO_CONTRACT_ID } from "../constants/constants";
import createGameNoteCode from "./notes/create_game_note_code";
import gameContractCode from "./contracts/uno_contract_code";

function makeTxLike(label: string, logs?: any[]) {
  const hash = `${label}-${Date.now().toString(16)}`;
  return {
    hash,
    async wait() {
      return { logs: logs || [] };
    },
  } as any;
}

export function getMidenContract(
  requestTransaction: (transaction: MidenTransaction) => Promise<string>
): { contract: UnoGameContract; wallet: string } {
  const midenAccountId = process.env.NEXT_PUBLIC_MIDEN_ACCOUNT_ID || "";

  const contract: UnoGameContract = {
    async createGame(
      connectedWalletIdString: string
    ) {
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

      // Building the tic tac toe contract
      let assembler = TransactionKernel.assembler();

      const gameContractId = Address.fromBech32(UNO_CONTRACT_ID).accountId();

      // Reading the public state of the tic tac toe contract from testnet,
      // and importing it into the WebClient
      let gameContractAccount = await client.getAccount(gameContractId);
      if (!gameContractAccount) {
        await client.importAccountById(gameContractId);
        await client.syncState();
        gameContractAccount = await client.getAccount(gameContractId);
        if (!gameContractAccount) {
          throw new Error(
            `Account not found after import: ${gameContractId}`
          );
        }
      }

      // Get new nonce
      const oldNonceStorage = gameContractAccount
        .storage()
        .getItem(7)
        ?.toU64s();

      // Creating the library to call the counter contract
      const gameComponentLib = AssemblerUtils.createAccountComponentLibrary(
        assembler, // assembler
        "external_contract::game_contract", // library path to call the contract
        gameContractCode // account code of the contract
      );

      assembler = assembler.withDebugMode(true).withLibrary(gameComponentLib);

      const noteScript = assembler.compileNoteScript(createGameNoteCode);
      
      const gameId = BigInt(Date.now());
      const gameIdWord = Word.fromNumber(gameId);

      const noteInputs = new NoteInputs(new FeltArray(gameIdWord.toFelts()));
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
        new Recipient(generateRandomSerialNumber(), noteScript, noteInputs)
      );

      const noteRequest = new TransactionRequestBuilder()
        .withOwnOutputNotes(
          new OutputNotesArray([OutputNote.full(createGameNote)])
        )
        .build();

      const tx = new CustomTransaction(
        connectedWalletId.toBech32(
          NetworkId.Testnet,
          AccountInterface.Unspecified
        ),
        noteRequest
      );

      const txId = await requestTransaction({
        type: TransactionType.Custom,
        payload: tx,
      });

      await client.syncState();

      // Return the game contract account ID
      return { nonce: Number(oldNonceStorage?.[3]) + 1, txIx: txId };
    },
  };

  return { contract, wallet: `miden:${midenAccountId || "webclient"}` };
}
