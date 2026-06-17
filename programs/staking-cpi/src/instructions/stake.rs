use crate::state::{StakingAccount, VaultAccount};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

#[derive(Accounts)]
pub struct Stake<'info> {
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
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    // 1. Transfer SOL to the Vault PDA
    let cpi_accounts = Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.vault_account.to_account_info(),
    };
    let cpi_context = CpiContext::new(ctx.accounts.system_program.key(), cpi_accounts);
    transfer(cpi_context, amount)?;

    // 2. Update the lazy reward accounting
    let clock = Clock::get()?;
    crate::instructions::reward::update_rewards(&mut ctx.accounts.pda_account, &clock)?;

    // 3. Mint DSOL to the user's ATA
    let vault_bump = ctx.accounts.vault_account.bump;
    let seeds = &[b"vault".as_ref(), &[vault_bump]];
    let signer_seeds = &[&seeds[..]];

    let mint_cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_account.to_account_info(),
    };
    let mint_cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        mint_cpi_accounts,
        signer_seeds,
    );
    token::mint_to(mint_cpi_ctx, amount)?;

    // 4. Update the staked amount in staking account
    ctx.accounts.pda_account.amount += amount;

    msg!("Staked {} lamports. Minted {} DSOL.", amount, amount);
    Ok(())
}
