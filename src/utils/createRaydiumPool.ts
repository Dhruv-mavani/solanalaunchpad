import {
    makeCreateCpmmPoolInInstruction,
    getCreatePoolKeys,
    CREATE_CPMM_POOL_FEE_ACC,
    CREATE_CPMM_POOL_PROGRAM,
    DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import {
    Connection,
    PublicKey,
    TransactionMessage,
    VersionedTransaction,
    SystemProgram,
} from '@solana/web3.js';
import {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    createSyncNativeInstruction,
    createCloseAccountInstruction,
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
} from '@solana/spl-token';
import BN from 'bn.js';
import { TokenData } from '../types/token';

// Fee config ID (0.25% trade fee)
// Devnet index 0 config: 5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy
// Mainnet index 0 config: D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2
const DEVNET_FEE_CONFIG = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
const MAINNET_FEE_CONFIG = new PublicKey('D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2');

function getNetworkConstants(network: 'devnet' | 'mainnet-beta') {
    if (network === 'devnet') {
        return {
            programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
            feeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
            configId: DEVNET_FEE_CONFIG,
        };
    }
    return {
        programId: CREATE_CPMM_POOL_PROGRAM,
        feeAccount: CREATE_CPMM_POOL_FEE_ACC,
        configId: MAINNET_FEE_CONFIG,
    };
}

export async function createRaydiumPool(
    connection: Connection,
    wallet: any, // WalletContextState from @solana/wallet-adapter-react
    tokenA: TokenData,
    tokenB: TokenData,
    amountA: number,
    amountB: number,
    network: 'devnet' | 'mainnet-beta' = 'devnet'
) {
    if (!wallet.publicKey) throw new Error('Wallet not connected');

    const creator = wallet.publicKey;
    const { programId, feeAccount, configId } = getNetworkConstants(network);

    // Convert UI amounts to BN using token decimals
    let initAmountA = new BN(Math.floor(amountA * Math.pow(10, tokenA.decimals)));
    let initAmountB = new BN(Math.floor(amountB * Math.pow(10, tokenB.decimals)));

    // Sort mints deterministically (Raydium requires mintA < mintB by buffer comparison)
    let mintA = new PublicKey(tokenA.mint);
    let mintB = new PublicKey(tokenB.mint);

    if (mintA.toBuffer().compare(mintB.toBuffer()) > 0) {
        [mintA, mintB] = [mintB, mintA];
        [initAmountA, initAmountB] = [initAmountB, initAmountA];
    }

    // Derive all required PDAs using the SDK's helper
    const poolKeys = getCreatePoolKeys({
        programId,
        configId,
        mintA,
        mintB,
    });

    // Check if either token is native SOL (needs WSOL wrapping)
    const isANativeSol = mintA.equals(NATIVE_MINT);
    const isBNativeSol = mintB.equals(NATIVE_MINT);

    // Compute user's Associated Token Accounts
    const userAtaA = getAssociatedTokenAddressSync(mintA, creator, true, TOKEN_PROGRAM_ID);
    const userAtaB = getAssociatedTokenAddressSync(mintB, creator, true, TOKEN_PROGRAM_ID);
    const userLpAta = getAssociatedTokenAddressSync(poolKeys.lpMint, creator, true, TOKEN_PROGRAM_ID);

    // Build instructions array
    const instructions = [];

    // 1. Ensure ATAs exist (idempotent — no-ops if they already exist)
    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            creator, userAtaA, creator, mintA, TOKEN_PROGRAM_ID
        )
    );
    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            creator, userAtaB, creator, mintB, TOKEN_PROGRAM_ID
        )
    );
    // Note: LP mint ATA is NOT pre-created — the CPMM program creates it during pool init

    // 2. If native SOL is involved, wrap it into WSOL
    if (isANativeSol) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: creator,
                toPubkey: userAtaA,
                lamports: initAmountA.toNumber(),
            })
        );
        instructions.push(createSyncNativeInstruction(userAtaA));
    }
    if (isBNativeSol) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: creator,
                toPubkey: userAtaB,
                lamports: initAmountB.toNumber(),
            })
        );
        instructions.push(createSyncNativeInstruction(userAtaB));
    }

    // 3. Create the CPMM pool instruction
    const createPoolIx = makeCreateCpmmPoolInInstruction(
        programId,                   // programId (network-specific)
        creator,                     // creator
        configId,                    // configId
        poolKeys.authority,          // authority PDA
        poolKeys.poolId,             // poolId PDA
        mintA,                       // mintA
        mintB,                       // mintB
        poolKeys.lpMint,             // lpMint PDA
        userAtaA,                    // userVaultA (user's token A account)
        userAtaB,                    // userVaultB (user's token B account)
        userLpAta,                   // userLpAccount
        poolKeys.vaultA,             // vaultA PDA (pool's token A vault)
        poolKeys.vaultB,             // vaultB PDA (pool's token B vault)
        feeAccount,                  // createPoolFeeAccount (network-specific)
        TOKEN_PROGRAM_ID,            // mintProgramA
        TOKEN_PROGRAM_ID,            // mintProgramB
        poolKeys.observationId,      // observationId PDA
        initAmountA,                 // amountMaxA
        initAmountB,                 // amountMaxB
        new BN(0),                   // openTime (0 = immediately)
    );
    instructions.push(createPoolIx);

    // 4. If we wrapped SOL, close the WSOL account to reclaim rent
    if (isANativeSol) {
        instructions.push(createCloseAccountInstruction(userAtaA, creator, creator));
    }
    if (isBNativeSol) {
        instructions.push(createCloseAccountInstruction(userAtaB, creator, creator));
    }

    // 5. Build a VersionedTransaction (v0)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
        payerKey: creator,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    // 6. Simulate first to get detailed error info
    const simResult = await connection.simulateTransaction(transaction);
    if (simResult.value.err) {
        console.error('Simulation failed:', JSON.stringify(simResult.value.err));
        console.error('Simulation logs:', simResult.value.logs);
        throw new Error(
            `Transaction simulation failed: ${JSON.stringify(simResult.value.err)}\nLogs: ${simResult.value.logs?.join('\n')}`
        );
    }
    console.log('Simulation succeeded! Logs:', simResult.value.logs);

    // 7. Send via the user's wallet adapter (skip preflight since we already simulated)
    const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: true,
    });
    
    try {
        await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            'confirmed'
        );
    } catch (err) {
        // Fallback: Check if the transaction was actually successful on-chain
        const status = await connection.getSignatureStatus(signature);
        if (
            status &&
            status.value &&
            (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') &&
            !status.value.err
        ) {
            console.log('Transaction confirmed via signature status fallback');
        } else {
            throw err;
        }
    }

    return {
        signature,
        poolId: poolKeys.poolId.toBase58(),
    };
}
