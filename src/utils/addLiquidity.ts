import {
    makeDepositCpmmInInstruction,
    CpmmPoolInfoLayout,
    getPdaPoolAuthority,
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

export async function addLiquidity(
    connection: Connection,
    wallet: any, // WalletContextState from @solana/wallet-adapter-react
    poolIdStr: string,
    amountA: number,
    amountB: number
) {
    if (!wallet.publicKey) throw new Error('Wallet not connected');

    const creator = wallet.publicKey;
    const poolId = new PublicKey(poolIdStr);

    // 1. Fetch pool account info and decode using CpmmPoolInfoLayout
    const poolAccountInfo = await connection.getAccountInfo(poolId);
    if (!poolAccountInfo) throw new Error('Pool not found on this network');
    
    const poolState = CpmmPoolInfoLayout.decode(poolAccountInfo.data);
    const {
        mintA,
        mintB,
        mintLp,
        vaultA,
        vaultB,
        mintProgramA,
        mintProgramB,
    } = poolState;

    // 2. Fetch current balances to compute exact LP amount
    const vaultABalance = await connection.getTokenAccountBalance(vaultA);
    const vaultBBalance = await connection.getTokenAccountBalance(vaultB);
    const lpSupply = await connection.getTokenSupply(mintLp);

    const poolBaseAmount = new BN(vaultABalance.value.amount);
    const poolQuoteAmount = new BN(vaultBBalance.value.amount);
    const totalLpSupply = new BN(lpSupply.value.amount);

    // Get decimals
    const decimalsA = vaultABalance.value.decimals;
    const decimalsB = vaultBBalance.value.decimals;

    // Convert UI amounts to BN using token decimals
    const depositAmountA = new BN(Math.floor(amountA * Math.pow(10, decimalsA)));
    const depositAmountB = new BN(Math.floor(amountB * Math.pow(10, decimalsB)));

    // Calculate LP amount based on A's ratio to pool base amount
    // lpAmount = totalLpSupply * depositAmountA / poolBaseAmount
    const lpAmount = totalLpSupply.mul(depositAmountA).div(poolBaseAmount);

    // Add a 1% slippage buffer for max amounts
    const amountMaxA = depositAmountA.muln(101).divn(100);
    const amountMaxB = depositAmountB.muln(101).divn(100);

    // Derive pool authority PDA
    const programId = poolAccountInfo.owner;
    const authority = getPdaPoolAuthority(programId).publicKey;

    // Check if either token is native SOL (needs WSOL wrapping)
    const isANativeSol = mintA.equals(NATIVE_MINT);
    const isBNativeSol = mintB.equals(NATIVE_MINT);

    // Compute user's Associated Token Accounts
    const userAtaA = getAssociatedTokenAddressSync(mintA, creator, true, mintProgramA);
    const userAtaB = getAssociatedTokenAddressSync(mintB, creator, true, mintProgramB);
    const userLpAta = getAssociatedTokenAddressSync(mintLp, creator, true, TOKEN_PROGRAM_ID);

    // Build instructions array
    const instructions = [];

    // Ensure ATAs exist (idempotent)
    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            creator, userAtaA, creator, mintA, mintProgramA
        )
    );
    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            creator, userAtaB, creator, mintB, mintProgramB
        )
    );
    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            creator, userLpAta, creator, mintLp, TOKEN_PROGRAM_ID
        )
    );

    // If native SOL is involved, wrap it into WSOL
    if (isANativeSol) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: creator,
                toPubkey: userAtaA,
                lamports: depositAmountA.toNumber(),
            })
        );
        instructions.push(createSyncNativeInstruction(userAtaA));
    }
    if (isBNativeSol) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: creator,
                toPubkey: userAtaB,
                lamports: depositAmountB.toNumber(),
            })
        );
        instructions.push(createSyncNativeInstruction(userAtaB));
    }

    // Build deposit instruction
    const depositIx = makeDepositCpmmInInstruction(
        programId,
        creator,
        authority,
        poolId,
        userLpAta,
        userAtaA,
        userAtaB,
        vaultA,
        vaultB,
        mintA,
        mintB,
        mintLp,
        lpAmount,
        amountMaxA,
        amountMaxB
    );
    instructions.push(depositIx);

    // If we wrapped SOL, close the WSOL account to reclaim rent
    if (isANativeSol) {
        instructions.push(createCloseAccountInstruction(userAtaA, creator, creator));
    }
    if (isBNativeSol) {
        instructions.push(createCloseAccountInstruction(userAtaB, creator, creator));
    }

    // Build VersionedTransaction (v0)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
        payerKey: creator,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    // Simulate first to get detailed error info
    const simResult = await connection.simulateTransaction(transaction);
    if (simResult.value.err) {
        console.error('Simulation failed:', JSON.stringify(simResult.value.err));
        console.error('Simulation logs:', simResult.value.logs);
        throw new Error(
            `Transaction simulation failed: ${JSON.stringify(simResult.value.err)}\nLogs: ${simResult.value.logs?.join('\n')}`
        );
    }
    console.log('Add Liquidity Simulation succeeded! Logs:', simResult.value.logs);

    // Send via wallet adapter
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
        lpAmount: lpAmount.toString(),
        mintA: mintA.toBase58(),
        mintB: mintB.toBase58(),
    };
}
