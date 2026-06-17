use anchor_lang::prelude::*;
use crate::state::StakingAccount;

#[derive(Accounts)]
pub struct Reward {}

pub fn handler(_ctx: Context<Reward>) -> Result<()> {
    msg!("Reward placeholder");
    Ok(())
}

pub fn update_rewards(account: &mut StakingAccount, clock: &Clock) -> Result<()> {
    if account.amount > 0 {
        let elapsed_time = clock.unix_timestamp.saturating_sub(account.last_updated);
        // Using SECONDS_PER_DAY = 86400. 
        // reward = (amount * elapsed_days) / 2
        let elapsed_days = elapsed_time as u64 / 86400;
        let reward = (account.amount * elapsed_days) / 2;
        account.accumulated_reward = account.accumulated_reward.saturating_add(reward);
    }
    account.last_updated = clock.unix_timestamp;
    Ok(())
}
