import { PublicKey } from "@solana/web3.js";

import { getMetadataPointerState } from "@solana/spl-token";

import { Metadata } from "@metaplex-foundation/mpl-token-metadata";

export async function getTokenMetadata(
    connection: any,
    mint: string
) {

    try {

        const mintKey =
            new PublicKey(mint);

        const metadataPDA =
            PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    new PublicKey(
                        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
                    ).toBuffer(),
                    mintKey.toBuffer(),
                ],
                new PublicKey(
                    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
                )
            )[0];

        const metadataAccount =
            await Metadata.fromAccountAddress(
                connection,
                metadataPDA
            );

        return {

            name:
                metadataAccount.data.name.replace(/\0/g, '').trim(),

            symbol:
                metadataAccount.data.symbol.replace(/\0/g, '').trim(),

            uri:
                metadataAccount.data.uri.replace(/\0/g, '').trim(),

        };

    } catch (err) {

        return null;

    }

}