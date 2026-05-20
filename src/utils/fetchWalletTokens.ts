import { Connection, PublicKey } from "@solana/web3.js";
import { TokenData } from "../types/token";
import { getTokenMetadata } from "./getTokenMetadata";
import { unpackAccount, getMint } from "@solana/spl-token";

export async function fetchWalletTokens(
    connection: Connection,
    publicKey: PublicKey
): Promise<TokenData[]> {
    let tokenAccounts;

    try {
        // Alchemy natively supports getTokenAccountsByOwner (it only blocks getProgramAccounts/getParsedTokenAccountsByOwner)
        const response = await connection.getTokenAccountsByOwner(
            publicKey,
            {
                programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            }
        );
        tokenAccounts = response.value;
    } catch (err) {
        console.error("Failed to fetch token accounts:", err);
        return [];
    }

    const tokens: TokenData[] = [];

    // Fetch native SOL balance
    try {
        const solBalance = await connection.getBalance(publicKey);
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

    const gateways = [
        "https://gateway.ipfscdn.io/ipfs/",
        "https://ipfs.crossbell.io/ipfs/",
        "https://ipfs.near.social/ipfs/",
        "https://w3s.link/ipfs/",
        "https://4everland.io/ipfs/",
        "https://hardbin.com/ipfs/",
        "https://cf-ipfs.com/ipfs/",
        "https://gateway.pinata.cloud/ipfs/"
    ];

    // Helper for fetching with a strict timeout
    const fetchWithTimeout = async (url: string, timeoutMs = 800) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    };

    // Parse all token accounts in parallel
    const tokenPromises = tokenAccounts.map(async (accountInfo) => {
        try {
            const accountData = unpackAccount(accountInfo.pubkey, accountInfo.account);
            
            // Skip empty balances immediately to save RPC calls
            if (accountData.amount <= BigInt(0)) return null;

            // Fetch Mint Info to get the decimals (getAccountInfo is supported on Alchemy free tier)
            const mintInfo = await getMint(connection, accountData.mint);
            const decimals = mintInfo.decimals;
            
            // Calculate UI balance
            const balance = Number(accountData.amount) / Math.pow(10, decimals);

            // Fetch Metaplex metadata
            const metadata = await getTokenMetadata(connection, accountData.mint.toBase58());

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

                    let json = null;

                    try {
                        let secureUri = metadataUri.startsWith("http://")
                            ? metadataUri.replace("http://", "https://")
                            : metadataUri;
                        
                        // Route around known blocked hostnames
                        if (secureUri.includes("gateway.pinata.cloud") || secureUri.includes("ipfs.io") || secureUri.includes("cloudflare-ipfs")) {
                            secureUri = `https://gateway.ipfscdn.io/ipfs/${hash}`;
                        }

                        const response = await fetchWithTimeout(secureUri, 1000);
                        if (response.ok) {
                            json = await response.json();
                        }
                    } catch (e) {
                        // Direct metadata fetch failed or timed out
                    }

                    if (!json && hash) {
                        for (const gateway of gateways) {
                            try {
                                const response = await fetchWithTimeout(`${gateway}${hash}`, 800);
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

            return {
                mint: accountData.mint.toBase58(),
                symbol: metadata?.symbol?.trim() || accountData.mint.toBase58().slice(0, 4),
                name: metadata?.name?.trim() || accountData.mint.toBase58().slice(0, 8),
                image,
                description,
                balance,
                decimals
            };
        } catch (innerErr) {
            console.error("Failed to parse individual token account:", innerErr);
            return null;
        }
    });

    const parsedTokens = await Promise.all(tokenPromises);

    for (const t of parsedTokens) {
        if (t) {
            tokens.push(t);
        }
    }

    return tokens;
}