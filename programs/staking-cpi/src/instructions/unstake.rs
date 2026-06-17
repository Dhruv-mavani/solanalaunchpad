use crate::state::{StakingAccount, VaultAccount};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Burn, Token, TokenAccount};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"client1", payer.key().as_ref()],
        bump = pda_account.bump,
    )]
    pub pda_account: Account<'info, StakingAccount>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault_account.bump,
    )]
    pub vault_account: Account<'info, VaultAccount>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Unstake>) -> Result<()> {
    // 1. Update the lazy rewards first
    let clock = Clock::get()?;
    crate::instructions::reward::update_rewards(&mut ctx.accounts.pda_account, &clock)?;

    let amount = ctx.accounts.pda_account.amount;
    let reward = ctx.accounts.pda_account.accumulated_reward;
    let payout = amount + reward;

    if amount > 0 {
        // 2. Burn the user's DSOL tokens
        let burn_cpi_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let burn_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            burn_cpi_accounts,
        );
        token::burn(burn_cpi_ctx, amount)?;

        // 3. Transfer SOL (principal + rewards) from Vault to the user
        let vault_info = ctx.accounts.vault_account.to_account_info();
        let payer_info = ctx.accounts.payer.to_account_info();

        **vault_info.try_borrow_mut_lamports()? -= payout;
        **payer_info.try_borrow_mut_lamports()? += payout;
    }

    // 4. Reset the user's staking state
    ctx.accounts.pda_account.amount = 0;
    ctx.accounts.pda_account.accumulated_reward = 0;

    msg!("Unstaked. Burned {} DSOL. Paid out {} lamports.", amount, payout);
    Ok(())
}
