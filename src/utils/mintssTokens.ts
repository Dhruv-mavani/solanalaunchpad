import {
  Connection,
  Keypair,
  PublicKey
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  mintTo
} from "@solana/spl-token";



export async function mintssSOL(
  receiver: string,
  amount: number
) {
  const connection = new Connection(
    "https://api.devnet.solana.com"
  );

  // Wallet that owns mint authority
  const secret = JSON.parse(
    process.env.PRIVATE_KEY!
  );

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(process.env.PRIVATE_KEY!)
    )
  );

  // Your ssSOL mint address
  const mint = new PublicKey(
    process.env.SS_SOL_MINT!
  );

  const receiverPubkey = new PublicKey(receiver);

  // Create ATA if needed
  const tokenAccount =
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      receiverPubkey
    );

  // Mint tokens
  const sig = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer,
    amount * 1_000_000_000
  );

  console.log("Minted ssSOL!");
  console.log(sig);
}