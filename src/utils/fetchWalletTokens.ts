import { Connection, PublicKey } from "@solana/web3.js";
import { TokenData } from "../types/token";
import { getTokenMetadata } from "./getTokenMetadata";

export async function fetchWalletTokens(
    connection: Connection,
    publicKey: PublicKey
): Promise<TokenData[]> {
    let activeConnection = connection;
    let tokenAccounts;

    try {
        // Try the primary connection first
        tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            {
                programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            }
        );
    } catch (err) {
        console.warn("Primary RPC token fetch failed, retrying with public Solana RPCs...", err);
        const isDevnet = connection.rpcEndpoint.includes("devnet") || connection.rpcEndpoint.includes("alchemy");
        
        const fallbackUrls = isDevnet ? [
            "https://api.devnet.solana.com",
            "https://devnet.solana.com",
            "https://rpc.ankr.com/solana_devnet"
        ] : [
            "https://api.mainnet-beta.solana.com"
        ];

        let success = false;
        for (const url of fallbackUrls) {
            try {
                activeConnection = new Connection(url, "confirmed");
                tokenAccounts = await activeConnection.getParsedTokenAccountsByOwner(
                    publicKey,
                    {
                        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
                    }
                );
                success = true;
                break;
            } catch (fallbackErr) {
                console.log(`Fallback ${url} failed...`);
            }
        }

        if (!success || !tokenAccounts) {
            console.error("All token account fetch attempts failed.");
            return [];
        }
    }

    const tokens: TokenData[] = [];

    // Fetch native SOL balance
    try {
        const solBalance = await activeConnection.getBalance(publicKey);
        if (solBalance > 0) {
            tokens.push({
                mint: "So11111111111111111111111111111111111111112",
                symbol: "SOL",
                name: "Solana",
                image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
                balance: solBalance / 1e9,
                decimals: 9,
                description: "Native Solana Token"
            });
        }
    } catch (e) {
        console.error("Failed to fetch SOL balance", e);
    }

    for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        const balance = parsedInfo.tokenAmount.uiAmount;
        const decimals = parsedInfo.tokenAmount.decimals;

        // Skip empty balances
        if (!balance || balance <= 0) continue;

        // Fetch Metaplex metadata
        const metadata = await getTokenMetadata(activeConnection, parsedInfo.mint);

        let image = "";
        let description = "";

        // Fetch metadata JSON
        if (metadata?.uri) {
            try {
                let metadataUri = metadata.uri;
                let hash = "";

                if (metadataUri.startsWith("ipfs://")) {
                    hash = metadataUri.replace("ipfs://", "");
                } else if (metadataUri.includes("/ipfs/")) {
                    hash = metadataUri.split("/ipfs/")[1];
                }

                const gateways = [
                    "https://gateway.ipfscdn.io/ipfs/",
                    "https://cf-ipfs.com/ipfs/",
                    "https://gateway.pinata.cloud/ipfs/",
                    "https://ipfs.io/ipfs/",
                    "https://dweb.link/ipfs/",
                    "https://cloudflare-ipfs.com/ipfs/"
                ];

                let json = null;

                // Try direct HTTP fetch first (upgrading to HTTPS)
                try {
                    const secureUri = metadataUri.startsWith("http://")
                        ? metadataUri.replace("http://", "https://")
                        : metadataUri;
                    const response = await fetch(secureUri);
                    if (response.ok) {
                        json = await response.json();
                    }
                } catch (e) {
                    console.log("Direct metadata fetch failed, retrying fallbacks...");
                }

                if (!json && hash) {
                    for (const gateway of gateways) {
                        try {
                            const response = await fetch(`${gateway}${hash}`);
                            if (response.ok) {
                                json = await response.json();
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }

                if (json) {
                    if (json.image) {
                        // Upgrade http to https to avoid Vercel mixed content block
                        image = json.image.startsWith("http://")
                            ? json.image.replace("http://", "https://")
                            : json.image;
                    }
                    description = json.description || "";
                }
            } catch (err) {
                console.log("Failed to fetch JSON metadata");
            }
        }

        tokens.push({
            mint: parsedInfo.mint,
            symbol: metadata?.symbol?.trim() || parsedInfo.mint.slice(0, 4),
            name: metadata?.name?.trim() || parsedInfo.mint.slice(0, 8),
            image,
            description,
            balance,
            decimals
        });
    }

    return tokens;
}