use crate::state::StakingAccount;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 8 + 1, // disc + authority + amount + reward + last_updated + bump
        seeds = [b"client1", payer.key().as_ref()],
        bump,
    )]
    pub pda_account: Account<'info, StakingAccount>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.pda_account.authority = ctx.accounts.payer.key();
    ctx.accounts.pda_account.amount = 0;
    ctx.accounts.pda_account.accumulated_reward = 0;
    ctx.accounts.pda_account.last_updated = Clock::get()?.unix_timestamp;
    ctx.accounts.pda_account.bump = ctx.bumps.pda_account;
    msg!("PDA account created successfully.");
    Ok(())
}
