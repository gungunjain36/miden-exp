// main.rs

use miden_lib::account::auth::NoAuth;
use miden_lib::StdLibrary;
use tokio::time::{sleep, Duration};
use miden_objects::crypto::hash::rpo::Rpo256;
use rand::RngCore;
use std::{fs, path::Path, sync::Arc};

use miden_assembly::{
    ast::{Module, ModuleKind},
    LibraryPath,
};
use miden_client::{
    account::{
        AccountBuilder, AccountIdAddress, AccountStorageMode, AccountType, Address,
        AddressInterface, StorageSlot,
    },
    note::{Note, NoteAssets, NoteExecutionHint, NoteInputs, NoteMetadata, NoteRecipient, NoteTag, NoteType},
    builder::ClientBuilder,
    keystore::FilesystemKeyStore,
    rpc::{Endpoint, TonicRpcClient},
    transaction::{OutputNote, TransactionKernel, TransactionRequestBuilder},
    ClientError, Felt, ScriptBuilder,
};
use miden_objects::{
    account::{AccountComponent, NetworkId},
    assembly::Assembler,
    assembly::DefaultSourceManager,
};

fn create_library(
    assembler: Assembler,
    library_path: &str,
    source_code: &str,
) -> Result<miden_assembly::Library, Box<dyn std::error::Error>> {
    let source_manager = Arc::new(DefaultSourceManager::default());
    let module = Module::parser(ModuleKind::Library).parse_str(
        LibraryPath::new(library_path)?,
        source_code,
        &source_manager,
    )?;
    let library = assembler.clone().assemble_library([module])?;
    Ok(library)
}

#[tokio::main]
async fn main() -> Result<(), ClientError> {
    // Initialize client
    let endpoint = Endpoint::testnet();
    let timeout_ms = 10_000;
    let rpc_api = Arc::new(TonicRpcClient::new(&endpoint, timeout_ms));
    let keystore = FilesystemKeyStore::new("./keystore".into()).unwrap().into();

    let mut client = ClientBuilder::new()
        .rpc(rpc_api)
        .authenticator(keystore)
        .in_debug_mode(true.into())
        .build()
        .await?;

    let sync_summary = client.sync_state().await.unwrap();
    println!("Latest block: {}", sync_summary.block_num);


// -------------------------------------------------------------------------
// STEP 1: Create UNO registry as a NETWORK account (shared state)
// -------------------------------------------------------------------------
println!("\n[STEP 1] Creating UNO registry as a NETWORK account");

// Prepare assembler (debug mode = true)
let assembler: Assembler = TransactionKernel::assembler()
    .with_debug_mode(true)
    .with_static_library(&StdLibrary::default())
    .unwrap();

// Load the MASM file for the UNO contract (serves as registry + game logic)
let counter_path = Path::new("./masm/accounts/uno.masm");
let counter_code = fs::read_to_string(counter_path).unwrap();

// Compile the account code with sufficient storage slots used by the contract (0..=207)
let mut slots: Vec<StorageSlot> = Vec::with_capacity(208);
for _ in 0..208 {
    slots.push(StorageSlot::Value([
        Felt::new(0),
        Felt::new(0),
        Felt::new(0),
        Felt::new(0),
    ].into()));
}

let counter_component = AccountComponent::compile(
    counter_code.clone(),
    assembler.clone(),
    slots,
)
.unwrap()
.with_supports_all_types();

// Init seed for the counter contract
let mut seed = [0_u8; 32];
client.rng().fill_bytes(&mut seed);

// Build the new `Account` with the component
let (counter_contract, counter_seed) = AccountBuilder::new(seed)
    .account_type(AccountType::RegularAccountImmutableCode)
    .storage_mode(AccountStorageMode::Network) // IMPORTANT: network storage mode
    .with_component(counter_component.clone())
    .with_auth_component(NoAuth)
    .build()
    .unwrap();

println!(
        "counter_contract commitment: {:?}",
        counter_contract.commitment()
    );
println!(
    "counter_contract id: {:?}",
    Address::from(AccountIdAddress::new(
        counter_contract.id(),
        AddressInterface::Unspecified
    ))
    .to_bech32(NetworkId::Testnet)
);
println!("counter_contract storage: {:?}", counter_contract.storage());

client
    .add_account(&counter_contract.clone(), Some(counter_seed), false)
    .await
    .unwrap();


// -------------------------------------------------------------------------
// STEP 2: Deploy network account with a state-changing script
//         (register contract on-chain by mutating its storage)
// -------------------------------------------------------------------------
println!("\n[STEP 2] Deploy network UNO contract via state-changing script");

// Load the MASM script referencing the increment procedure
// We'll use a tiny script that increments player count (slot 1)
let script_code = "use.external_contract::uno_contract\n\nbegin\n    call.uno_contract::join_game\nend";

let assembler: Assembler = TransactionKernel::assembler()
    .with_debug_mode(true)
    .with_static_library(&StdLibrary::default())
    .unwrap();
let account_component_lib = create_library(
    assembler.clone(),
    "external_contract::uno_contract",
    &counter_code,
)
.unwrap();

let tx_script = ScriptBuilder::new(true)
    .with_dynamically_linked_library(&account_component_lib)
    .unwrap()
    .compile_tx_script(script_code)
    .unwrap();

// Build a transaction request with the custom script
let tx_increment_request = TransactionRequestBuilder::new()
    .custom_script(tx_script)
    .build()
    .unwrap();

// Execute the transaction on the network account
let tx_result = client
    .new_transaction(counter_contract.id(), tx_increment_request)
    .await
    .unwrap();

let _ = client.submit_transaction(tx_result.clone()).await;
client.sync_state().await.unwrap();

let tx_id = tx_result.executed_transaction().id();
println!(
    "Deployment tx on MidenScan: https://testnet.midenscan.com/tx/{:?}",
    tx_id
);

// Optional: small wait to ensure commit on slower networks
sleep(Duration::from_secs(2)).await;
client.sync_state().await.unwrap();

// Verify a state change occurred (slot 1 incremented)
let account = client.get_account(counter_contract.id()).await.unwrap();
println!(
    "uno(network) player count after deploy: {:?}",
    account.unwrap().account().storage().get_item(1)
);

    // -------------------------------------------------------------------------
    // STEP 3: A player commits to a secret
    // -------------------------------------------------------------------------
    println!("\n[STEP 3] Player 0 commits to a secret");

    // Define the secret and calculate its hash (commitment)
    let secret = [Felt::new(10), Felt::new(20), Felt::new(30), Felt::new(40)];
    let commitment = Rpo256::hash_elements(&secret);
    println!("Player 0 secret: {:?}", secret);
    println!("Player 0 commitment: {:?}", commitment);

    // Load the MASM script for committing and replace the placeholders
    let commit_script_path = Path::new("./masm/scripts/commit_randomness_script.masm");
    let commit_script_template = fs::read_to_string(commit_script_path).unwrap();
    let commit_script_code = commit_script_template
        .replace("{COMMITMENT_HASH_A}", &commitment.as_elements()[0].to_string())
        .replace("{COMMITMENT_HASH_B}", &commitment.as_elements()[1].to_string())
        .replace("{COMMITMENT_HASH_C}", &commitment.as_elements()[2].to_string())
        .replace("{COMMITMENT_HASH_D}", &commitment.as_elements()[3].to_string());


    let commit_tx_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_tx_script(commit_script_code)
        .unwrap();

    // Build a transaction request with the custom script
    let tx_commit_request = TransactionRequestBuilder::new()
        .custom_script(commit_tx_script)
        .build()
        .unwrap();

    // Execute the transaction locally
    let tx_commit_result = client
        .new_transaction(counter_contract.id(), tx_commit_request)
        .await
        .unwrap();

    // Submit transaction to the network
    let _ = client.submit_transaction(tx_commit_result).await;

    client.sync_state().await.unwrap();

    // Retrieve updated contract data to see the stored commitment
    let account = client.get_account(counter_contract.id()).await.unwrap();
    println!(
        "player 0 commitment: {:?}",
        account.unwrap().account().storage().get_item(10)
    );

    // -------------------------------------------------------------------------
    // STEP 4: A player reveals their secret
    // -------------------------------------------------------------------------
    println!("\n[STEP 4] Player 0 reveals their secret");

    // Load the MASM script for revealing and replace the commitment placeholders
    let reveal_script_path = Path::new("./masm/scripts/reveal_randomness_script.masm");
    let reveal_script_template = fs::read_to_string(reveal_script_path).unwrap();
    let reveal_script_code = reveal_script_template
        .replace("{REVEAL_COMMITMENT_HASH_A}", &commitment.as_elements()[0].to_string())
        .replace("{REVEAL_COMMITMENT_HASH_B}", &commitment.as_elements()[1].to_string())
        .replace("{REVEAL_COMMITMENT_HASH_C}", &commitment.as_elements()[2].to_string())
        .replace("{REVEAL_COMMITMENT_HASH_D}", &commitment.as_elements()[3].to_string());

    let reveal_tx_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_tx_script(reveal_script_code)
        .unwrap();

    // Build a transaction request with the custom script
    let tx_reveal_request = TransactionRequestBuilder::new()
        .custom_script(reveal_tx_script)
        .build()
        .unwrap();

    // Execute the transaction locally
    let tx_reveal_result = client
        .new_transaction(counter_contract.id(), tx_reveal_request)
        .await
        .unwrap();

    // Submit transaction to the network
    let _ = client.submit_transaction(tx_reveal_result).await;

    client.sync_state().await.unwrap();

    // Retrieve updated contract data to see the stored secret
    let account = client.get_account(counter_contract.id()).await.unwrap();
    println!(
        "player 0 revealed secret: {:?}",
        account.unwrap().account().storage().get_item(20)
    );

    // -------------------------------------------------------------------------
    // STEP 5: Initialize the deck
    // -------------------------------------------------------------------------
    println!("\n[STEP 5] Initializing the deck");

    let init_deck_script_path = Path::new("./masm/scripts/init_deck_script.masm");
    let init_deck_script_code = fs::read_to_string(init_deck_script_path).unwrap();

    let init_deck_tx_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_tx_script(init_deck_script_code)
        .unwrap();

    let tx_init_deck_request = TransactionRequestBuilder::new()
        .custom_script(init_deck_tx_script)
        .build()
        .unwrap();

    let tx_init_deck_result = client
        .new_transaction(counter_contract.id(), tx_init_deck_request)
        .await
        .unwrap();

    let _ = client.submit_transaction(tx_init_deck_result).await;
    client.sync_state().await.unwrap();

    let account = client.get_account(counter_contract.id()).await.unwrap();
    println!(
        "Deck card 0 after init: {:?}",
        account.as_ref().unwrap().account().storage().get_item(100)
    );
    println!(
        "Deck card 107 after init: {:?}",
        account.unwrap().account().storage().get_item(207)
    );

    // -------------------------------------------------------------------------
    // STEP 6: Generate the random seed
    // -------------------------------------------------------------------------
    println!("\n[STEP 6] Generating the random seed");

    let generate_seed_script_path = Path::new("./masm/scripts/generate_seed_script.masm");
    let generate_seed_script_code = fs::read_to_string(generate_seed_script_path).unwrap();

    let generate_seed_tx_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_tx_script(generate_seed_script_code)
        .unwrap();

    let tx_generate_seed_request = TransactionRequestBuilder::new()
        .custom_script(generate_seed_tx_script)
        .build()
        .unwrap();

    let tx_generate_seed_result = client
        .new_transaction(counter_contract.id(), tx_generate_seed_request)
        .await
        .unwrap();

    let _ = client.submit_transaction(tx_generate_seed_result).await;
    client.sync_state().await.unwrap();

    let account = client.get_account(counter_contract.id()).await.unwrap();
    println!(
        "Generated game seed: {:?}",
        account.unwrap().account().storage().get_item(2)
    );

    // -------------------------------------------------------------------------
    // STEP 7: Shuffle the deck
    // -------------------------------------------------------------------------
    println!("\n[STEP 7] Shuffling the deck");

    // -------------------------------------------------------------------------
    // STEP 8: Create a NETWORK NOTE to add a game to the registry
    //         This demonstrates the network account + notes pattern.
    // -------------------------------------------------------------------------
    println!("\n[STEP 8] Creating a network note to call add_game");

    // Prepare a simple note script that calls add_game with a sample game id
    // We'll encode the gid as a word [g3,g2,g1,g0], where only g3 carries the 64-bit id
    let gid: u64 = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() & 0xFFFF_FFFF_FFFF_FFFF) as u64;
    let gid_script = format!(
        "use.external_contract::uno_contract\n\nbegin\n    push.0 push.0 push.0 push.{gid}\n    call.uno_contract::add_game\nend",
        gid = gid
    );

    let account_component_lib = create_library(
        assembler.clone(),
        "external_contract::uno_contract",
        &counter_code,
    )
    .unwrap();

    // Compile the note script with UNO library
    let note_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_note_script(&gid_script)
        .unwrap();

    // Create note recipient with empty inputs
    let note_inputs = NoteInputs::new([].to_vec()).unwrap();
    let recipient = NoteRecipient::new(client.rng().inner_mut().draw_word(), note_script, note_inputs);

    // Tag the note with UNO network account id so it gets consumed by network operator
    let tag = NoteTag::from_account_id(counter_contract.id());
    let metadata = NoteMetadata::new(
        counter_contract.id(),
        NoteType::Public,
        tag,
        NoteExecutionHint::none(),
        Felt::new(0),
    )
    .unwrap();

    let network_note = Note::new(NoteAssets::default(), metadata, recipient);

    // Mint the note from the UNO account itself (for demo). In production, mint from user wallet.
    let note_req = TransactionRequestBuilder::new()
        .own_output_notes(vec![OutputNote::Full(network_note)])
        .build()
        .unwrap();

    let note_tx = client
        .new_transaction(counter_contract.id(), note_req)
        .await
        .unwrap();

    let _ = client.submit_transaction(note_tx.clone()).await;
    let note_tx_id = note_tx.executed_transaction().id();
    println!(
        "Network note tx on MidenScan: https://testnet.midenscan.com/tx/{:?}",
        note_tx_id
    );

    // Give the network builder a moment to pick up and execute the note
    println!("Waiting for network operator to consume the note...");
    sleep(Duration::from_secs(6)).await;
    client.sync_state().await.unwrap();

    // Verify the registry has been updated
    if let Some(account) = client.get_account(counter_contract.id()).await.unwrap() {
        let storage = account.account().storage();
        let active_count = storage.get_item(7).unwrap();
        println!("Active games count (slot 7): {:?}", active_count);
        println!(
            "First game slot (slot 60): {:?}",
            storage.get_item(60).unwrap()
        );
    }

    let shuffle_deck_script_path = Path::new("./masm/scripts/shuffle_deck_script.masm");
    let shuffle_deck_script_code = fs::read_to_string(shuffle_deck_script_path).unwrap();

    let shuffle_deck_tx_script = ScriptBuilder::new(true)
        .with_dynamically_linked_library(&account_component_lib)
        .unwrap()
        .compile_tx_script(shuffle_deck_script_code)
        .unwrap();

    let tx_shuffle_deck_request = TransactionRequestBuilder::new()
        .custom_script(shuffle_deck_tx_script)
        .build()
        .unwrap();

    let tx_shuffle_deck_result = client
        .new_transaction(counter_contract.id(), tx_shuffle_deck_request)
        .await
        .unwrap();

    let _ = client.submit_transaction(tx_shuffle_deck_result).await;
    client.sync_state().await.unwrap();

    let account = client.get_account(counter_contract.id()).await.unwrap();
    println!(
        "Deck card 0 after shuffle: {:?}",
        account.as_ref().unwrap().account().storage().get_item(100)
    );
    println!(
        "Deck card 107 after shuffle: {:?}",
        account.unwrap().account().storage().get_item(207)
    );

    Ok(())
}
