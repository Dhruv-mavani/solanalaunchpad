import { Connection, PublicKey } from "@solana/web3.js";
import { fetchWalletTokens } from "../src/utils/fetchWalletTokens.js";

async function main() {
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/tvZsjk3La9-EAc1OTsV4s");
    // Get pubkey from user's env or just any pubkey. Wait, how do I know the user's pubkey?
    // Let's just grep the recent tokens or use getTokenMetadata with mint.
}
main();
