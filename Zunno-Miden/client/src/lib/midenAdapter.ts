import type { UnoGameContract } from './types';

function makeTxLike(label: string, logs?: any[]) {
  const hash = `${label}-${Date.now().toString(16)}`;
  return {
    hash,
    async wait() {
      return { logs: logs || [] };
    },
  } as any;
}

async function getWebClient() {
  const { WebClient } = await import('@demox-labs/miden-sdk');
  return WebClient.createClient(process.env.NEXT_PUBLIC_MIDEN_NODE_URL || 'https://rpc.testnet.miden.io');
}

async function getUnoAccount(client: any, bech32: string) {
  const { AccountId } = await import('@demox-labs/miden-sdk');
  const id = AccountId.fromBech32(bech32);
  let acc = await client.getAccount(id);
  if (!acc) {
    await client.importAccountById(id);
    await client.syncState();
    acc = await client.getAccount(id);
  }
  if (!acc) throw new Error('UNO account not found');
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

async function callUnoScript(accountBech32: string, scriptCode: string) {
  const {
    AssemblerUtils,
    TransactionKernel,
    TransactionRequestBuilder,
    TransactionScript,
  } = await import('@demox-labs/miden-sdk');
  const client = await getWebClient();
  const assembler = TransactionKernel.assembler();
  const unoLib = AssemblerUtils.createAccountComponentLibrary(
    assembler,
    'external_contract::uno_contract',
    UNO_ACCOUNT_CODE,
  );
  const txScript = TransactionScript.compile(scriptCode, assembler.withLibrary(unoLib));
  const acc = await getUnoAccount(client, accountBech32);
  const req = new TransactionRequestBuilder().withCustomScript(txScript).build();
  const txRes = await client.newTransaction(acc.id(), req);
  await client.submitTransaction(txRes);
  await client.syncState();
  return { txId: txRes.executedTransaction().id().toHex(), client };
}

function readGames(): bigint[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('midenGames');
  if (!raw) return [];
  try { return JSON.parse(raw).map((x: string) => BigInt(x)); } catch { return []; }
}

function writeGames(ids: bigint[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('midenGames', JSON.stringify(ids.map(String)));
}

export function getMidenContract(): { contract: UnoGameContract; wallet: string } {
  const midenAccountId = process.env.NEXT_PUBLIC_MIDEN_ACCOUNT_ID || '';

  const contract: UnoGameContract = {
    async createGame(_account?: `0x${string}` | undefined) {
      const gid = BigInt(Date.now());
      const games = readGames();
      games.push(gid);
      writeGames(games);
      const logs = [
        { fragment: { name: 'GameCreated' }, args: [gid] },
      ];
      return makeTxLike('miden-createGame', logs);
    },
    async joinGame(_gameId: bigint, _address?: `0x${string}` | undefined) {
      if (!midenAccountId) return makeTxLike('miden-joinGame');
      // Try contract export; if it no-ops, fallback to direct increment of slot 1
      try {
        const script = `use.external_contract::uno_contract begin call.uno_contract::join_game end`;
        await callUnoScript(midenAccountId, script);
      } catch {
        const directInc = `
use.std::sys
begin
  # mirror join_game: read slot 1, add 1, write back
  push.1
  exec.account::get_item
  push.1 add
  push.1
  exec.account::set_item
  exec.sys::truncate_stack
end`;
        try { await callUnoScript(midenAccountId, directInc); } catch {}
      }
      return makeTxLike('miden-joinGame');
    },
    async startGame(_gameId: bigint) {
      if (!midenAccountId) return makeTxLike('miden-startGame');
      const script = `
use.external_contract::uno_contract
begin
  call.uno_contract::join_game
  call.uno_contract::init_deck
  call.uno_contract::generate_seed
  call.uno_contract::shuffle_deck
end`;
      try {
        const { client } = await callUnoScript(midenAccountId, script);
        try {
          const acc = await getUnoAccount(client as any, midenAccountId);
          console.log('Miden startGame post-state:', {
            statusHex: acc.storage().getItem(0)?.toHex?.(),
            playerCountHex: acc.storage().getItem(1)?.toHex?.(),
            seedHex: acc.storage().getItem(2)?.toHex?.(),
            card0Hex: acc.storage().getItem(100)?.toHex?.(),
            card1Hex: acc.storage().getItem(101)?.toHex?.(),
          });
        } catch {}
      } catch (e) {
        console.error('Miden startGame script error', e);
        throw e;
      }
      return makeTxLike('miden-startGame');
    },
    async commitMove(_gameId: bigint, _moveHash: string) {
      return makeTxLike('miden-commitMove');
    },
    async getGame(gameId: bigint) {
      try {
        if (!midenAccountId) throw new Error('no account');
        const client = await getWebClient();
        const acc = await getUnoAccount(client, midenAccountId);
        const status = acc.storage().getItem(0); // status
        const playersWord = acc.storage().getItem(1); // player count
        const toU64 = (hex: string) => Number(BigInt('0x' + hex.slice(-16).match(/../g)!.reverse().join('')));
        const statusNum = toU64(status.toHex());
        const playersCount = toU64(playersWord.toHex());
        const players = Array.from({ length: Math.max(0, playersCount) }, (_, i) => `player_${i+1}`);
        const now = BigInt(Math.floor(Date.now()/1000));
        return [gameId, players, statusNum, now, BigInt(0), '', []];
      } catch {
        const now = BigInt(Math.floor(Date.now()/1000));
        return [gameId, [], 0, now, BigInt(0), '', []];
      }
    },
    async getGameActions(_gameId: bigint) {
      return [];
    },
    async endGame(_gameId: bigint, _gameHash: string) {
      return makeTxLike('miden-endGame');
    },
    async getActiveGames() {
      return readGames();
    },
    async getNotStartedGames() {
      return readGames();
    },
  } as unknown as UnoGameContract;

  return { contract, wallet: `miden:${midenAccountId || 'webclient'}` };
}
