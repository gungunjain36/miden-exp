// lib/incrementCounterContract.ts
export async function getWebClient() {
    if (typeof window === "undefined") {
      throw new Error("webClient() can only run in the browser");
    }
    const { WebClient } = await import("@demox-labs/miden-sdk");
    const nodeEndpoint = "https://rpc.testnet.miden.io";
    return WebClient.createClient(nodeEndpoint);
}

export async function getCounterValue(): Promise<number> {
    const { AccountId } = await import("@demox-labs/miden-sdk");
    const client = await getWebClient();
    await client.syncState();

    const counterContractId = AccountId.fromBech32(
      "mtst1qrhk9zc2au2vxqzaynaz5ddhs4cqqghmajy",
    );

    let counterAccount = await client.getAccount(counterContractId);
    if (!counterAccount) {
      await client.importAccountById(counterContractId);
      await client.syncState();
      counterAccount = await client.getAccount(counterContractId);
      if (!counterAccount) throw new Error("Counter account not found after import");
    }

    const word = counterAccount.storage().getItem(0);
    const val = Number(
      BigInt("0x" + word!.toHex().slice(-16).match(/../g)!.reverse().join("")),
    );
    return val;
}

export async function incrementCounterContract(): Promise<{ count: number; txId: string }>{
    if (typeof window === "undefined") {
      throw new Error("webClient() can only run in the browser");
    }
  
    const {
      AccountId,
      AssemblerUtils,
      TransactionKernel,
      TransactionRequestBuilder,
      TransactionScript,
    } = await import("@demox-labs/miden-sdk");
  
    const client = await getWebClient();
    console.log("Current block number: ", (await client.syncState()).blockNum());
  
    const counterContractCode = `
      use.miden::account
      use.std::sys
  
      const.COUNTER_SLOT=0
  
      export.get_count
          push.COUNTER_SLOT
          exec.account::get_item
          exec.sys::truncate_stack
      end
  
      export.increment_count
          push.COUNTER_SLOT
          exec.account::get_item
          add.1
          push.COUNTER_SLOT
          exec.account::set_item
          exec.sys::truncate_stack
      end
      `;
  
    let assembler = TransactionKernel.assembler();
  
    const counterContractId = AccountId.fromBech32(
      "mtst1qrhk9zc2au2vxqzaynaz5ddhs4cqqghmajy",
    );
  
    let counterContractAccount = await client.getAccount(counterContractId);
    if (!counterContractAccount) {
      await client.importAccountById(counterContractId);
      await client.syncState();
      counterContractAccount = await client.getAccount(counterContractId);
      if (!counterContractAccount) {
        throw new Error(`Account not found after import: ${counterContractId}`);
      }
    }
  
    let txScriptCode = `
      use.external_contract::counter_contract
      begin
          call.counter_contract::increment_count
      end
    `;
  
    let counterComponentLib = AssemblerUtils.createAccountComponentLibrary(
      assembler,
      "external_contract::counter_contract",
      counterContractCode,
    );
  
    let txScript = TransactionScript.compile(
      txScriptCode,
      assembler.withLibrary(counterComponentLib),
    );
  
    let txIncrementRequest = new TransactionRequestBuilder()
      .withCustomScript(txScript)
      .build();
  
    let txResult = await client.newTransaction(
      counterContractAccount.id(),
      txIncrementRequest,
    );
  
    await client.submitTransaction(txResult);
    await client.syncState();
  
    const txId = txResult.executedTransaction().id().toHex();

    let counter = await client.getAccount(counterContractAccount.id());
    let countWord = counter?.storage().getItem(0);
    const count = Number(
      BigInt("0x" + countWord!.toHex().slice(-16).match(/../g)!.reverse().join("")),
    );
  
    console.log("Count: ", count, "Tx:", txId);
    return { count, txId };
}
  