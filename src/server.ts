import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import { mintssSOL } from './utils/mintssTokens';

const app = express();
const processed = new Set<string>();



app.use(express.json());

app.post('/helius', async (req, res) => {

  try {

    const signature =
      req.body[0]?.signature;

    if (processed.has(signature)) {
      return res
        .status(200)
        .send("Already processed");
    }

    processed.add(signature);

    console.log(req.body);

    const transfer =
  req.body[0]?.nativeTransfers?.find(
    (t: any) =>
      t.toUserAccount ===
      process.env.TREASURY_WALLET
  );

  console.log("FOUND TRANSFER:", transfer);

    if (!transfer) {
      return res
        .status(200)
        .send("No transfer");
    }

    const sender =
      transfer.fromUserAccount;

    const receiver =
      transfer.toUserAccount;

    const amountLamports =
      transfer.amount;

    const amountSOL =
      amountLamports / 1_000_000_000;

    if (amountSOL < 0.01) {
      return res
        .status(200)
        .send("Amount too small");
    }

    if (
      receiver !== process.env.TREASURY_WALLET
    ) {
      return res
        .status(200)
        .send("Wrong receiver");
    }

    await mintssSOL(
      sender,
      amountSOL
    );

    console.log(
      `Minted ${amountSOL} ssSOL to ${sender}`
    );

    res.status(200).send('OK');

  } catch (err) {

    console.error(err);

    res.status(500).send('Error');
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});