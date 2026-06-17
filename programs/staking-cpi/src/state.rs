use anchor_lang::prelude::*;

#[account]
pub struct StakingAccount {
    pub authority: Pubkey,
    pub amount: u64,
    pub accumulated_reward: u64,
    pub last_updated: i64,
    pub bump: u8,
}

#[account]
pub struct VaultAccount {
    pub bump: u8,
}
