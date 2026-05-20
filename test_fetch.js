import { Connection, PublicKey } from "@solana/web3.js";
import { unpackAccount, getMint } from "@solana/spl-token";
import dotenv from "dotenv";

dotenv.config();

const connection = new Connection(process.env.VITE_ALCHEMY_DEVNET_RPC || "https://api.devnet.solana.com", "confirmed");
const publicKey = new PublicKey("2RBMiA9L4iE8F6oQy7zF8d5r3RZh2s8XoJv4N6Hw8VqE"); // using a random public key, but we can read theirs from local storage or just test if Alchemy supports getTokenAccountsByOwner

async function run() {
    try {
        console.log("Fetching token accounts...");
        const response = await connection.getTokenAccountsByOwner(
            publicKey,
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
