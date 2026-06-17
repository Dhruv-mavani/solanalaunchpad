const anchor = require("@anchor-lang/core");
const { SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } = anchor.web3;
const { assert } = require("chai");

describe("staking-cpi", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StakingCpi;
  const payer = provider.wallet;

  let pdaAccount;
  let pdaBump;
  let vaultAccount;
  let vaultBump;
  let mintAddress;
  let mintBump;
  let metadataAddress;
  let userTokenAccount;

  const STAKE_AMOUNT = 100000000; // 0.1 SOL (in lamports)
  const REWARD_POOL = 1000000000; // 1 SOL (in lamports)

  const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ASSOCIATED_TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const METAPLEX_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  function section(title) {
    console.log("\n");
    console.log("=================================");
    console.log(title);
    console.log("=================================");
  }

  before(() => {
    [pdaAccount, pdaBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("client1"), payer.publicKey.toBuffer()],
      program.programId
    );

    [vaultAccount, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [mintAddress, mintBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      program.programId
    );

    [metadataAddress] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METAPLEX_METADATA_PROGRAM_ID.toBuffer(),
        mintAddress.toBuffer(),
      ],
      METAPLEX_METADATA_PROGRAM_ID
    );

    [userTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        payer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  });

  it("initializes the vault account", async () => {
    section("INITIALIZE VAULT");

    const tx = await program.methods
      .initVault()
      .accounts({
        payer: payer.publicKey,
        vaultAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.vaultAccount.fetch(vaultAccount);
    console.log("Vault Address :", vaultAccount.toBase58());
    assert.equal(account.bump, vaultBump);
  });

  it("initializes the DSOL Mint and Metadata", async () => {
    section("INITIALIZE MINT");

    const tx = await program.methods
      .initMint()
      .accounts({
        payer: payer.publicKey,
        mint: mintAddress,
        vaultAccount,
        metadata: metadataAddress,
        tokenMetadataProgram: METAPLEX_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Mint Address :", mintAddress.toBase58());
    console.log("Metadata Address :", metadataAddress.toBase58());
  });

  it("initializes the staking account", async () => {
    section("INITIALIZE USER STAKING");

    const tx = await program.methods
      .initialize()
      .accounts({
        payer: payer.publicKey,
        pdaAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.stakingAccount.fetch(pdaAccount);
    console.log("Staking PDA Address :", pdaAccount.toBase58());
    assert.equal(account.bump, pdaBump);
  });

  it("funds the reward pool into vault", async () => {
    section("FUND REWARD POOL");

    const balanceBefore = await provider.connection.getBalance(vaultAccount);

    const tx = await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: vaultAccount,
          lamports: REWARD_POOL,
        })
      )
    );

    const balanceAfter = await provider.connection.getBalance(vaultAccount);
    assert.equal(balanceAfter - balanceBefore, REWARD_POOL);
  });

  it("stakes tokens into vault and mints DSOL", async () => {
    section("STAKE");

    const amount = new anchor.BN(STAKE_AMOUNT);
    const vaultBalanceBefore = await provider.connection.getBalance(vaultAccount);

    const tx = await program.methods
      .stake(amount)
      .accounts({
        payer: payer.publicKey,
        pdaAccount,
        vaultAccount,
        mint: mintAddress,
        userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const vaultBalanceAfter = await provider.connection.getBalance(vaultAccount);
    const stakingAccount = await program.account.stakingAccount.fetch(pdaAccount);

    // Fetch user token account balance
    const tokenAccountBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);

    assert.equal(vaultBalanceAfter - vaultBalanceBefore, STAKE_AMOUNT);
    assert.equal(stakingAccount.amount.toNumber(), STAKE_AMOUNT);
    assert.equal(tokenAccountBalance.value.amount, STAKE_AMOUNT.toString());
    console.log("Staked successfully, user DSOL balance:", tokenAccountBalance.value.uiAmount);
  });

  it("unstakes tokens, burns DSOL, and claims accrued reward", async () => {
    section("UNSTAKE");

    const vaultBalanceBefore = await provider.connection.getBalance(vaultAccount);
    const payerBalanceBefore = await provider.connection.getBalance(payer.publicKey);

    const tx = await program.methods
      .unstake()
      .accounts({
        payer: payer.publicKey,
        pdaAccount,
        vaultAccount,
        mint: mintAddress,
        userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultBalanceAfter = await provider.connection.getBalance(vaultAccount);
    const stakingAccount = await program.account.stakingAccount.fetch(pdaAccount);

    // Fetch user token account balance (should be 0 or empty)
    const tokenAccountBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);

    assert.equal(vaultBalanceBefore - vaultBalanceAfter, STAKE_AMOUNT); // amount + reward (which is 0 in fast tests)
    assert.equal(stakingAccount.amount.toNumber(), 0);
    assert.equal(stakingAccount.accumulatedReward.toNumber(), 0);
    assert.equal(tokenAccountBalance.value.amount, "0");
    console.log("Unstaked successfully, user DSOL balance is now 0");
  });
});
