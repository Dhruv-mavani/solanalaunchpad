import { Connection, PublicKey } from "@solana/web3.js";
import { TokenData } from "../types/token";
import { getTokenMetadata } from "./getTokenMetadata";

export async function fetchWalletTokens(
    connection: Connection,
    publicKey: PublicKey
): Promise<TokenData[]> {

    const tokenAccounts =
        await connection.getParsedTokenAccountsByOwner(
            publicKey,
            {
                programId:
                    new PublicKey(
                        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                    )
            }
        );

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

    for (const account of tokenAccounts.value) {

        const parsedInfo = account.account.data.parsed.info;
        const balance = parsedInfo.tokenAmount.uiAmount;
        const decimals = parsedInfo.tokenAmount.decimals;

        // Skip empty balances
        if (!balance || balance <= 0) continue;

        // Fetch Metaplex metadata
        const metadata = await getTokenMetadata(connection, parsedInfo.mint);

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
                    "https://gateway.pinata.cloud/ipfs/",
                    "https://ipfs.io/ipfs/",
                    "https://dweb.link/ipfs/",
                    "https://cloudflare-ipfs.com/ipfs/"
                ];

                let json = null;

                if (hash) {
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
                } else {
                    const response = await fetch(metadataUri);
                    if (response.ok) json = await response.json();
                }

                if (!json) throw new Error("Metadata fetch failed from all sources");

                if (json.image) {
                    let imageHash = "";
                    if (json.image.startsWith("ipfs://")) {
                        imageHash = json.image.replace("ipfs://", "");
                    } else if (json.image.includes("/ipfs/")) {
                        imageHash = json.image.split("/ipfs/")[1];
                    }

                    if (imageHash) {
                        image = `https://gateway.pinata.cloud/ipfs/${imageHash}`;
                    } else {
                        image = json.image;
                    }
                }

                description = json.description || "";
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