import { Alchemy, Network } from "alchemy-sdk";

export function getAlchemy(
    network: "devnet" | "mainnet-beta"
) {

    return new Alchemy({

        apiKey:
            process.env.VITE_ALCHEMY_API_KEY,

        network:
            network === "devnet"
                ? Network.SOLANA_DEVNET
                : Network.SOLANA_MAINNET

    });

}