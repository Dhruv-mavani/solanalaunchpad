use crate::state::VaultAccount;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + 1, // Discriminator (8 bytes) + Bump (1 byte).
        seeds = [b"vault"],
        bump,
    )]
    pub vault_account: Account<'info, VaultAccount>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>) -> Result<()> {
    ctx.accounts.vault_account.bump = ctx.bumps.vault_account;
    msg!("Protocol Vault initialized successfully.");
    Ok(())
}
