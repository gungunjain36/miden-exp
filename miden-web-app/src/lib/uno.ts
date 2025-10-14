// lib/uno.ts
import type { WebClient as IWebClient } from "@demox-labs/miden-sdk";

export async function getWebClient(): Promise<IWebClient> {
  if (typeof window === "undefined") throw new Error("Browser only");
  const { WebClient } = await import("@demox-labs/miden-sdk");
  return WebClient.createClient("https://rpc.testnet.miden.io");
}

export async function getUnoAccount(client: IWebClient, bech32: string) {
  const { AccountId } = await import("@demox-labs/miden-sdk");
  const id = AccountId.fromBech32(bech32);
  let acc = await client.getAccount(id);
  if (!acc) {
    await client.importAccountById(id);
    await client.syncState();
    acc = await client.getAccount(id);
  }
  if (!acc) throw new Error("Account not found after import");
  return acc;
}

const UNO_ACCOUNT_CODE = `
use.miden::account
use.std::sys

const.GAME_STATUS_NOT_STARTED=0
const.PLAYER_COUNT_SLOT=1
const.GAME_SEED_SLOT=2
const.PLAYER_COMMITMENTS_START_SLOT=10
const.PLAYER_SECRETS_START_SLOT=20
const.DECK_START_SLOT=100

export.init
    push.GAME_STATUS_NOT_STARTED
    push.0
    exec.account::set_item
    push.0
    push.PLAYER_COUNT_SLOT
    exec.account::set_item
end

export.join_game
    push.PLAYER_COUNT_SLOT
    exec.account::get_item
    push.1 add
    push.PLAYER_COUNT_SLOT
    exec.account::set_item
    exec.sys::truncate_stack
end

export.commit_randomness
    push.PLAYER_COMMITMENTS_START_SLOT
    add
    exec.account::set_item
    exec.sys::truncate_stack
end

export.verify_commitment
    push.PLAYER_COMMITMENTS_START_SLOT
    add
    exec.account::get_item
    assert_eqw
    exec.sys::truncate_stack
end

export.store_secret
    push.PLAYER_SECRETS_START_SLOT
    add
    exec.account::set_item
    exec.sys::truncate_stack
end

export.init_deck
    push.17
    push.DECK_START_SLOT
    exec.account::set_item
    push.34
    push.DECK_START_SLOT push.1 add
    exec.account::set_item
    push.73
    push.DECK_START_SLOT push.107 add
    exec.account::set_item
    exec.sys::truncate_stack
end

export.generate_seed
    push.1 push.2 push.3 push.4
    push.GAME_SEED_SLOT
    exec.account::set_item
    exec.sys::truncate_stack
end

export.shuffle_deck
    push.DECK_START_SLOT
    exec.account::get_item
    push.DECK_START_SLOT push.1 add
    exec.account::get_item
    push.DECK_START_SLOT
    exec.account::set_item
    push.DECK_START_SLOT push.1 add
    exec.account::set_item
    exec.sys::truncate_stack
end
`;

async function callUnoScript(client: IWebClient, accountBech32: string, scriptCode: string) {
  const {
    AssemblerUtils,
    TransactionKernel,
    TransactionRequestBuilder,
    TransactionScript,
  } = await import("@demox-labs/miden-sdk");

  const assembler = TransactionKernel.assembler();
  const unoLib = AssemblerUtils.createAccountComponentLibrary(
    assembler,
    "external_contract::uno_contract",
    UNO_ACCOUNT_CODE,
  );
  const txScript = TransactionScript.compile(scriptCode, assembler.withLibrary(unoLib));

  const acc = await getUnoAccount(client, accountBech32);
  const req = new TransactionRequestBuilder().withCustomScript(txScript).build();
  const txRes = await client.newTransaction(acc.id(), req);
  await client.submitTransaction(txRes);
  await client.syncState();
  return txRes.executedTransaction().id().toHex();
}

export async function joinGame(accountBech32: string) {
  const client = await getWebClient();
  const script = `use.external_contract::uno_contract begin call.uno_contract::join_game end`;
  const txId = await callUnoScript(client, accountBech32, script);
  const acc = await getUnoAccount(client, accountBech32);
  const playerCount = acc.storage().getItem(1);
  return { txId, playerCountHex: playerCount.toHex() };
}

export async function commitRandomness(accountBech32: string, idx: number, commitment: [string, string, string, string]) {
  const client = await getWebClient();
  const [a,b,c,d] = commitment;
  const script = `
use.external_contract::uno_contract
begin
  push.${a}
  push.${b}
  push.${c}
  push.${d}
  push.${idx}
  call.uno_contract::commit_randomness
end`;
  const txId = await callUnoScript(client, accountBech32, script);
  return { txId };
}

export async function revealRandomness(accountBech32: string, idx: number, h: [string,string,string,string], s: [string,string,string,string]) {
  const client = await getWebClient();
  const [h0,h1,h2,h3] = h; const [s0,s1,s2,s3] = s;
  const script = `
use.external_contract::uno_contract
begin
  push.${h0} push.${h1} push.${h2} push.${h3} push.${idx}
  call.uno_contract::verify_commitment
  push.${s0} push.${s1} push.${s2} push.${s3} push.${idx}
  call.uno_contract::store_secret
end`;
  const txId = await callUnoScript(client, accountBech32, script);
  return { txId };
}

export async function initDeck(accountBech32: string) {
  const client = await getWebClient();
  const script = `use.external_contract::uno_contract begin call.uno_contract::init_deck end`;
  const txId = await callUnoScript(client, accountBech32, script);
  const acc = await getUnoAccount(client, accountBech32);
  return { txId, card0: acc.storage().getItem(100).toHex(), card107: acc.storage().getItem(207).toHex() };
}

export async function generateSeed(accountBech32: string) {
  const client = await getWebClient();
  const script = `use.external_contract::uno_contract begin call.uno_contract::generate_seed end`;
  const txId = await callUnoScript(client, accountBech32, script);
  const acc = await getUnoAccount(client, accountBech32);
  return { txId, seed: acc.storage().getItem(2).toHex() };
}

export async function shuffleDeck(accountBech32: string) {
  const client = await getWebClient();
  const script = `use.external_contract::uno_contract begin call.uno_contract::shuffle_deck end`;
  const txId = await callUnoScript(client, accountBech32, script);
  const acc = await getUnoAccount(client, accountBech32);
  return { txId, card0: acc.storage().getItem(100).toHex(), card107: acc.storage().getItem(207).toHex() };
}

export function wordHexToU64(wordHex: string): number {
  return Number(BigInt("0x" + wordHex.slice(-16).match(/../g)!.reverse().join("")));
}
