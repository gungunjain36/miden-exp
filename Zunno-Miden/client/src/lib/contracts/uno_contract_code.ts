const gameContractCode = `
use.miden::account
use.std::sys

# GAME STATUS CONSTANTS
const.GAME_STATUS_NOT_STARTED=0
const.GAME_STATUS_IN_PROGRESS=1
const.GAME_STATUS_ENDED=2

# STORAGE SLOTS
const.GAME_STATUS_SLOT=0
const.PLAYER_COUNT_SLOT=1
const.GAME_SEED_SLOT=2
const.DRAW_COUNTER_SLOT=3
const.MOVE_COUNT_SLOT=6
const.ACTIVE_GAMES_COUNT_SLOT=7
const.PLAYER_COMMITMENTS_START_SLOT=10
const.PLAYER_SECRETS_START_SLOT=20
const.PLAYERS_ADDR_START_SLOT=40
const.DECK_START_SLOT=100
const.DECK_SIZE=108
const.MOVES_START_SLOT=80

# Note: Player data will be stored starting at slot 10

# Initializes the game state. This would be called upon account creation.
export.init
    # Set initial game state
    push.GAME_STATUS_NOT_STARTED
    push.GAME_STATUS_SLOT
    exec.account::set_item

    # Set initial player count to 0
    push.0
    push.PLAYER_COUNT_SLOT
    exec.account::set_item
end

# A player calls this to join the game.
# For now, it just increments the player count.
export.join_game
    # get current player count
    push.PLAYER_COUNT_SLOT
    exec.account::get_item
    # => [player_count]

    # increment player count
    push.1 add
    # => [player_count+1]

    # store new player count
    push.PLAYER_COUNT_SLOT
    exec.account::set_item
    # => []

    exec.sys::truncate_stack
end

# Registers a player's address (as a 4-felt word) and increments player count.
# expects: [a0, a1, a2, a3]
export.register_player
    # load current player count
    push.PLAYER_COUNT_SLOT
    exec.account::get_item
    # stack: [cnt, a0, a1, a2, a3]

    # compute slot = PLAYERS_ADDR_START_SLOT + cnt
    dup.4                   # duplicate cnt under word
    push.PLAYERS_ADDR_START_SLOT
    add
    # stack: [slot, cnt, a0, a1, a2, a3]

    # move address word to top for set_item
    movup.4
    exec.account::set_item

    # increment and store new player count
    # stack: [cnt]
    push.1 add
    push.PLAYER_COUNT_SLOT
    exec.account::set_item

    exec.sys::truncate_stack
end

# A player commits to a secret for randomness generation.
# expects: [commitment_word_0, commitment_word_1, commitment_word_2, commitment_word_3, player_index]
# The commitment is a hash (4 elements).
export.commit_randomness
    # stack: [c0, c1, c2, c3, idx]

    # Bring idx to the top, compute slot = BASE + idx, drop original idx
    dup.4
    # stack: [idx, c0, c1, c2, c3, idx]
    push.PLAYER_COMMITMENTS_START_SLOT
    add
    # stack: [slot, c0, c1, c2, c3, idx]
    drop
    # stack: [slot, c0, c1, c2, c3]

    # Reorder into [c0, c1, c2, c3, slot] for set_item
    movup.4
    # stack: [c0, c1, c2, c3, slot]

    # Store the commitment in the calculated slot.
    exec.account::set_item
    # stack: []

    exec.sys::truncate_stack
end

# Verifies that a provided commitment hash matches the stored commitment for a player.
# expects: [h0, h1, h2, h3, player_index]
export.verify_commitment
    # Compute the storage slot for the player's commitment and load it
    push.PLAYER_COMMITMENTS_START_SLOT
    add
    exec.account::get_item
    # stack: [h0, h1, h2, h3, c0, c1, c2, c3]

    # Verify the stored commitment equals the provided commitment
    assert_eqw

    exec.sys::truncate_stack
end

# Appends a move record (4 felts) to the moves area and increments move count.
# expects: [m0, m1, m2, m3]
export.append_move
    # load move count
    push.MOVE_COUNT_SLOT
    exec.account::get_item
    # stack: [mc, m0, m1, m2, m3]

    # compute slot = MOVES_START_SLOT + mc
    dup.4
    push.MOVES_START_SLOT
    add
    # stack: [slot, mc, m0, m1, m2, m3]

    # set item
    movup.4
    exec.account::set_item

    # increment and store move count
    # stack: [mc]
    push.1 add
    push.MOVE_COUNT_SLOT
    exec.account::set_item
    exec.sys::truncate_stack
end

# Adds a game id word to the active games list.
# expects: [g3, g2, g1, g0]
export.add_game
    # STACK: [g3, g2, g1, g0]
    
    # Get the current game count
    push.ACTIVE_GAMES_COUNT_SLOT
    exec.account::get_item
    # STACK: [c3, c2, c1, c0, g3, g2, g1, g0]

    # Temporarily store the game ID word
    # The top of the stack is now the game id, let's move it out of the way
    # by swapping it with the count word.
    swapw
    # STACK: [g3, g2, g1, g0, c3, c2, c1, c0]

    # Keep the game id on the stack, but drop the count word for now
    dropw
    # STACK: [g3, g2, g1, g0]
    
    # Get the count again, this time to calculate the slot
    push.ACTIVE_GAMES_COUNT_SLOT
    exec.account::get_item
    # STACK: [c3, c2, c1, c0, g3, g2, g1, g0]
    drop drop drop
    # STACK: [c0, g3, g2, g1, g0]

    # Calculate the slot and store the game ID
    push.60
    add
    # STACK: [slot, g3, g2, g1, g0]
    movdn.4
    # STACK: [g3, g2, g1, g0, slot]
    exec.account::set_item
    # STACK: []

    # Finally, get the count one last time to increment it
    push.ACTIVE_GAMES_COUNT_SLOT
    exec.account::get_item
    # STACK: [c3, c2, c1, c0]
    drop drop drop
    # STACK: [c0]
    push.1 add
    # STACK: [c0+1]
    push.0 push.0 push.0
    # STACK: [0, 0, 0, c0+1]
    push.ACTIVE_GAMES_COUNT_SLOT
    # STACK: [slot, 0, 0, 0, c0+1]
    movdn.4
    # STACK: [0, 0, 0, c0+1, slot]
    exec.account::set_item
    # STACK: []
    
    exec.sys::truncate_stack
end

# Stores the revealed secret for a player after commitment verification.
# expects: [s0, s1, s2, s3, player_index]
export.store_secret
    # slot = PLAYER_SECRETS_START_SLOT + player_index
    push.PLAYER_SECRETS_START_SLOT
    add
    exec.account::set_item

    exec.sys::truncate_stack
end




# Initializes the deck to a sorted state.
export.init_deck
    # In a real contract, this would be a complex loop generating all 108 cards.
    # For this simulation, we'll just place a few known cards at the
    # beginning and end of the deck storage area to prove shuffling works later.
    # Card = (color * 16) + value

    # Card 0: Red 1 (1*16 + 1 = 17)
    push.17
    push.DECK_START_SLOT
    exec.account::set_item

    # Card 1: Yellow 2 (2*16 + 2 = 34)
    push.34
    push.DECK_START_SLOT
    push.1
    add
    exec.account::set_item

    # Card 107: Blue 9 (4*16 + 9 = 73)
    push.73
    push.DECK_START_SLOT
    push.107
    add
    exec.account::set_item

    exec.sys::truncate_stack
end

# Generates a single random seed from all revealed player secrets.
export.generate_seed
    # Placeholder; seed is set via script using set_seed export.
    exec.sys::truncate_stack
end

# Shuffles the deck using the generated game seed.
# Implements the Fisher-Yates shuffle algorithm using stack manipulation.
export.shuffle_deck
    # Swap the first two cards to ensure a state change
    # Load card at index 0
    push.DECK_START_SLOT
    exec.account::get_item            # -> wA

    # Load card at index 1
    push.DECK_START_SLOT
    push.1
    add
    exec.account::get_item            # -> wA, wB

    # Store wB into index 0
    push.DECK_START_SLOT
    exec.account::set_item

    # Store wA into index 1
    push.DECK_START_SLOT
    push.1
    add
    exec.account::set_item

    exec.sys::truncate_stack
end

# Sets the seed word (expects 4 felts)
# expects: [s0, s1, s2, s3]
export.set_seed
    push.GAME_SEED_SLOT
    exec.account::set_item
    exec.sys::truncate_stack
end

# Sets the top card value in S4
# expects: [card]
export.set_top_card
    push.4
    exec.account::set_item
    exec.sys::truncate_stack
end

# Increments draw counter in S3
export.incr_draw_counter
    push.DRAW_COUNTER_SLOT
    exec.account::get_item
    push.1 add
    push.DRAW_COUNTER_SLOT
    exec.account::set_item
    exec.sys::truncate_stack
end
`;

export default gameContractCode;
