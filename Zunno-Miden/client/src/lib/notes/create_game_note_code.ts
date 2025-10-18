const createGameNoteCode = `
use.miden::note
use.external_contract::game_contract

# Inputs: [game_id_felt_3, game_id_felt_2, game_id_felt_1, game_id_felt_0]
begin
    push.0 exec.note::get_inputs
    # => [num_inputs, inputs_ptr]
    
    eq.4 assert
    # => [inputs_ptr]
    
    padw movup.4 mem_loadw drop drop
    # => [game_id_felt_3, game_id_felt_2, game_id_felt_1, game_id_felt_0]

    call.game_contract::add_game
    # => []

    dropw
end
`;

export default createGameNoteCode;
