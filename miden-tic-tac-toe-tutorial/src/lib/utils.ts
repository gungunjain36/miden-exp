import {
  WebClient,
  Address,
  Felt,
  Word,
  AccountId,
  Account,
} from "@demox-labs/miden-sdk";
import { NODE_URL } from "./constants";

export const instantiateClient = async ({
  accountsToImport,
}: {
  accountsToImport: string[];
}) => {
  const nodeEndpoint = NODE_URL;
  const client = await WebClient.createClient(nodeEndpoint);
  for (const accString of accountsToImport) {
    try {
      const accountId = Address.fromBech32(accString).accountId();
      await safeAccountImport(client, accountId);
    } catch {
      console.warn(`Failed to import account: ${accString}`);
    }
  }
  await client.syncState();
  return client;
};

export const safeAccountImport = async (
  client: any, // WebClient
  accountId: any // AccountId
) => {
  if ((await client.getAccount(accountId)) == null) {
    try {
      client.importAccountById(accountId);
    } catch (e) {
      console.warn(e);
    }
  }
};

export const generateRandomSerialNumber = (): Word => {
  return Word.newFromFelts([
    new Felt(BigInt(Math.floor(Math.random() * 0x1_0000_0000))),
    new Felt(BigInt(Math.floor(Math.random() * 0x1_0000_0000))),
    new Felt(BigInt(Math.floor(Math.random() * 0x1_0000_0000))),
    new Felt(BigInt(Math.floor(Math.random() * 0x1_0000_0000))),
  ]);
};

export const getNonceWord = (nonce: number): Word => {
  return Word.newFromFelts([
    new Felt(BigInt(0)),
    new Felt(BigInt(0)),
    new Felt(BigInt(0)),
    new Felt(BigInt(nonce)),
  ]);
};

export const getAccount = async (
  client: WebClient,
  accountId: AccountId
): Promise<Account | undefined> => {
  let account = await client.getAccount(accountId);
  if (!account) {
    await client.importAccountById(accountId);
    await client.syncState();
    account = await client.getAccount(accountId);
  }
  return account;
};

export const convertContractIndexToBoardIndex = (index: number): number => {
  return index - 1;
};

export const convertBoardIndexToContractIndex = (index: number): number => {
  return index + 1;
};
