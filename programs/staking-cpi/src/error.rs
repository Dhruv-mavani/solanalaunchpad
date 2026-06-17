use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Enter Valid Amount!")]
    InvalidAmount,

    #[msg("Insufficient Balance!")]
    InsufficientBalance,
}
