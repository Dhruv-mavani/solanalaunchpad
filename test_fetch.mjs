import { Connection, PublicKey } from "@solana/web3.js";
import { unpackAccount, getMint } from "@solana/spl-token";

const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/tvZsjk3La9-EAc1OTsV4s", "confirmed");

async function run() {
    try {
        // Find a token account for Devnet USDC
        const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
        const largestAccounts = await connection.getTokenLargestAccounts(usdcMint);
        if (largestAccounts.value.length === 0) {
            console.log("No accounts found for USDC");
            return;
        }
        
        const largestAccountPubkey = largestAccounts.value[0].address;
        const accountInfo = await connection.getAccountInfo(largestAccountPubkey);
        const unpackedAccount = unpackAccount(largestAccountPubkey, accountInfo);
        
        const ownerPublicKey = unpackedAccount.owner;
        console.log("Found owner:", ownerPublicKey.toBase58());

        console.log("Fetching token accounts for owner...");
        const response = await connection.getTokenAccountsByOwner(
            ownerPublicKey,
            { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
        );
        console.log(`Found ${response.value.length} token accounts.`);
        
        if (response.value.length > 0) {
            const firstAccount = response.value[0];
            const accountData = unpackAccount(firstAccount.pubkey, firstAccount.account);
            console.log("Unpacked amount:", accountData.amount);
            
            console.log("Fetching mint info for:", accountData.mint.toBase58());
            const mintInfo = await getMint(connection, accountData.mint);
            console.log("Decimals:", mintInfo.decimals);
        }
    } catch (e) {
        console.error("Test failed:", e);
    }
}
run();
