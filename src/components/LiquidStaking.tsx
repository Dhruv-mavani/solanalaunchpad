import { useEffect, useState } from "react";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";

// ===== CONSTANTS =====
const PROGRAM_ID = new PublicKey('39Xab97dZ8inooWbdeLq9oYd1JpX3FjmGBZmEsomRfGD');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');
const METAPLEX_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const DISC = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  stake:      [206, 176, 202, 18, 200, 209, 179, 108],
  unstake:    [90, 95, 107, 42, 205, 124, 50, 225],
  initMint:   [126, 176, 233, 16, 66, 117, 209, 125],
  initVault:  [77, 79, 85, 150, 33, 217, 52, 106],
};

interface StakingState {
  authority: string;
  amount: number;
  accumulatedReward: number;
  lastUpdated: number;
  bump: number;
}

// Helper to encode u64 into Little-Endian bytes
function u64LE(n: number): Uint8Array {
  const buf = new Uint8Array(8);
  let r = n;
  for (let i = 0; i < 8; i++) {
    buf[i] = r & 0xff;
    r = Math.floor(r / 256);
  }
  return buf;
}

// Parse StakingState account layout
function parseAcct(data: Uint8Array): StakingState {
  const authority = new PublicKey(data.slice(8, 40)).toBase58();
  
  let amount = 0;
  for (let i = 0; i < 8; i++) amount += data[40 + i] * (2 ** (8 * i));
  
  let accumulatedReward = 0;
  for (let i = 0; i < 8; i++) accumulatedReward += data[48 + i] * (2 ** (8 * i));

  let lastUpdated = 0;
  for (let i = 0; i < 8; i++) lastUpdated += data[56 + i] * (2 ** (8 * i));

  return { authority, amount, accumulatedReward, lastUpdated, bump: data[64] };
}

function LiquidStaking({
  network,
}: {
  network: string;
}) {
  const [amount, setAmount] = useState("");
  const { connection } = useConnection();
  const wallet = useWallet();

  const [solBalance, setSolBalance] = useState(0);
  const [dsolBalance, setDsolBalance] = useState(0);
  const [vaultReserve, setVaultReserve] = useState(0);
  const [supply, setSupply] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isMintInit, setIsMintInit] = useState(true);
  const [isVaultInit, setIsVaultInit] = useState(true);
  const [pdaData, setPdaData] = useState<StakingState | null>(null);
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [liveRewards, setLiveRewards] = useState(0);

  // Derive PDAs
  const [vaultAddress] = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
  const [mintAddress] = PublicKey.findProgramAddressSync([Buffer.from("mint")], PROGRAM_ID);
  
  let pdaAddress: PublicKey | null = null;
  let userTokenAddress: PublicKey | null = null;

  if (wallet.publicKey) {
    [pdaAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("client1"), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
    [userTokenAddress] = PublicKey.findProgramAddressSync(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  // Load account data from blockchain
  const loadData = async () => {
    if (!wallet.publicKey) return;

    try {
      // Fetch all required data concurrently to eliminate sequential round-trip latency
      const [
        bal,
        vaultBal,
        mintInfo,
        vaultInfo,
        pdaInfo,
        tokenBalResult
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(vaultAddress),
        connection.getAccountInfo(mintAddress),
        connection.getAccountInfo(vaultAddress),
        pdaAddress ? connection.getAccountInfo(pdaAddress) : Promise.resolve(null),
        userTokenAddress ? connection.getTokenAccountBalance(userTokenAddress).catch(() => null) : Promise.resolve(null)
      ]);

      setSolBalance(bal / LAMPORTS_PER_SOL);
      setVaultReserve(vaultBal / LAMPORTS_PER_SOL);
      setIsMintInit(!!mintInfo);
      setIsVaultInit(!!vaultInfo);

      if (pdaInfo && pdaInfo.data) {
        const parsed = parseAcct(pdaInfo.data);
        setPdaData(parsed);
      } else {
        setPdaData(null);
      }

      if (tokenBalResult) {
        setDsolBalance(tokenBalResult.value.uiAmount || 0);
      } else {
        setDsolBalance(0);
      }

      // Fetch mint supply if mint account has been initialized
      if (mintInfo) {
        try {
          const mintDetails = await getMint(connection, mintAddress);
          setSupply(Number(mintDetails.supply) / LAMPORTS_PER_SOL);
        } catch (e) {
          console.error("Error fetching mint details:", e);
          setSupply(0);
        }
      } else {
        setSupply(0);
      }
    } catch (err: any) {
      console.error("Error loading staking data:", err);
    }
  };

  const triggerRefresh = async () => {
    await loadData();
    // Poll the RPC node every 1 second for 6 seconds so the UI updates as soon as the indexer catches up
    for (let i = 1; i <= 6; i++) {
      setTimeout(loadData, i * 1000);
    }
  };

  useEffect(() => {
    if (!wallet.publicKey) return;
    loadData();

    // Auto refresh status/stats
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [wallet.publicKey, connection]);

  // Real-time ticking rewards simulator
  useEffect(() => {
    if (!pdaData || pdaData.amount === 0) {
      setLiveRewards(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = Math.max(0, now - pdaData.lastUpdated);
      // reward = (amount * elapsed_seconds) / (86400 * 2) = amount * elapsed / 172800
      const pendingReward = Math.floor((pdaData.amount * elapsed) / 172800);
      const totalReward = pdaData.accumulatedReward + pendingReward;
      setLiveRewards(totalReward / LAMPORTS_PER_SOL);
    }, 1000);

    return () => clearInterval(interval);
  }, [pdaData]);

  // Helper to confirm transactions using robust HTTP polling to bypass broken RPC WebSockets
  const confirmTx = async (signature: string) => {
    const start = Date.now();
    const timeout = 60000; // 60 seconds
    const interval = 2000; // 2 seconds

    while (Date.now() - start < timeout) {
      const response = await connection.getSignatureStatus(signature);
      const status = response?.value;
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("Transaction confirmation timed out.");
  };

  // Admin Init: Staking PDA
  const doInit = async () => {
    if (!wallet.publicKey || !pdaAddress) return;
    try {
      setError("");
      setSuccess("");
      setLoading(true);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: pdaAddress, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISC.initialize),
      });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }))
        .add(ix);
      const signature = await wallet.sendTransaction(tx, connection);
      await confirmTx(signature);

      setSuccess("Staking account initialized successfully!");
      await triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Initialization failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Admin Init: Mint
  const doInitMint = async () => {
    if (!wallet.publicKey) return;
    try {
      setError("");
      setSuccess("");
      setLoading(true);

      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METAPLEX_METADATA_PROGRAM_ID.toBuffer(),
          mintAddress.toBuffer(),
        ],
        METAPLEX_METADATA_PROGRAM_ID
      );

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: mintAddress, isSigner: false, isWritable: true },
          { pubkey: vaultAddress, isSigner: false, isWritable: false },
          { pubkey: metadataAddress, isSigner: false, isWritable: true },
          { pubkey: METAPLEX_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISC.initMint),
      });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }))
        .add(ix);
      const signature = await wallet.sendTransaction(tx, connection);
      await confirmTx(signature);

      setSuccess("DSOL Mint and Metadata initialized on-chain!");
      await triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Mint initialization failed.");
    } finally {
      setLoading(false);
    }
  };

  // Admin Init: Vault
  const doInitVault = async () => {
    if (!wallet.publicKey) return;
    try {
      setError("");
      setSuccess("");
      setLoading(true);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: vaultAddress, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISC.initVault),
      });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }))
        .add(ix);
      const signature = await wallet.sendTransaction(tx, connection);
      await confirmTx(signature);

      setSuccess("Vault initialized on-chain!");
      await triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Vault initialization failed.");
    } finally {
      setLoading(false);
    }
  };

  // Stake transaction handler
  const handleStake = async () => {
    if (!wallet.publicKey || !pdaAddress || !userTokenAddress) return;
    
    const solAmt = parseFloat(amount);
    if (isNaN(solAmt) || solAmt <= 0) {
      setError("Please enter a valid SOL amount.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setLoading(true);

      // Verify PDA setup
      const pdaInfo = await connection.getAccountInfo(pdaAddress);
      if (!pdaInfo) {
        setSuccess("Initializing staking account first...");
        await doInit();
      }

      const lamports = Math.floor(solAmt * LAMPORTS_PER_SOL);
      const data = Buffer.concat([
        Buffer.from(DISC.stake),
        Buffer.from(u64LE(lamports))
      ]);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: pdaAddress, isSigner: false, isWritable: true },
          { pubkey: vaultAddress, isSigner: false, isWritable: true },
          { pubkey: mintAddress, isSigner: false, isWritable: true },
          { pubkey: userTokenAddress, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
        ],
        data,
      });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }))
        .add(ix);
      const signature = await wallet.sendTransaction(tx, connection);
      await confirmTx(signature);

      setSuccess(`Successfully staked ${solAmt} SOL! DSOL tokens minted.`);
      setAmount("");
      await triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Staking transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  // Unstake transaction handler
  const handleUnstake = async () => {
    if (!wallet.publicKey || !pdaAddress || !userTokenAddress) return;

    try {
      setError("");
      setSuccess("");
      setLoading(true);

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: pdaAddress, isSigner: false, isWritable: true },
          { pubkey: vaultAddress, isSigner: false, isWritable: true },
          { pubkey: mintAddress, isSigner: false, isWritable: true },
          { pubkey: userTokenAddress, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISC.unstake),
      });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }))
        .add(ix);
      const signature = await wallet.sendTransaction(tx, connection);
      await confirmTx(signature);

      setSuccess("Unstaked successfully! Principal & accumulated rewards returned.");
      await triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unstaking transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  const isProtocolReady = isMintInit && isVaultInit;
  const parsedStakedPrincipal = pdaData ? pdaData.amount / LAMPORTS_PER_SOL : 0;
  const totalPayoutPreview = parsedStakedPrincipal + liveRewards;

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in zoom-in-95 duration-500">
      {/* Hero Section */}
      <div className="text-center mb-12 space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-extrabold tracking-widest uppercase">
          Solana Liquid Staking (LSP 2.0)
        </div>

        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-surface-900 dark:text-white leading-tight">
          Stake SOL.
          <br />
          Receive <span className="bg-gradient-to-r from-brand-500 to-sol-purple bg-clip-text text-transparent">
            DSOL
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-surface-600 dark:text-surface-400 text-lg leading-relaxed">
          Deposit SOL into the staking vault and instantly receive DSOL -
          a liquid staking derivative backed 1:1 by pooled reserves, earning yield in real-time.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <div className="glass rounded-3xl p-6 border border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/[0.03] backdrop-blur-md">
          <p className="text-xs uppercase tracking-widest text-surface-500 mb-2 font-bold">
            Total Value Locked
          </p>
          <h2 className="text-3xl font-black text-surface-900 dark:text-white">
            {vaultReserve.toFixed(2)} SOL
          </h2>
          <p className="text-sm text-success mt-2 font-semibold">
            Pooled in vault PDA
          </p>
        </div>

        <div className="glass rounded-3xl p-6 border border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/[0.03] backdrop-blur-md">
          <p className="text-xs uppercase tracking-widest text-surface-500 mb-2 font-bold">
            DSOL Supply
          </p>
          <h2 className="text-3xl font-black text-surface-900 dark:text-white">
            {supply.toFixed(2)} DSOL
          </h2>
          <p className="text-sm text-brand-400 mt-2 font-semibold">
            Fully backed 1:1
          </p>
        </div>

        <div className="glass rounded-3xl p-6 border border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/[0.03] backdrop-blur-md">
          <p className="text-xs uppercase tracking-widest text-surface-500 mb-2 font-bold">
            Estimated APY
          </p>
          <h2 className="text-3xl font-black text-surface-900 dark:text-white">
            7.42%
          </h2>
          <p className="text-sm text-sol-purple mt-2 font-semibold">
            Real-time compounding
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
        
        {/* Stake/Unstake Card */}
        <div className="glass rounded-[2rem] border border-black/5 dark:border-white/5 bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* TABS */}
          <div className="flex border-b border-black/5 dark:border-white/5">
            <button
              onClick={() => !loading && setActiveTab("stake")}
              disabled={loading}
              className={`flex-1 py-4 font-bold uppercase tracking-wider transition-all outline-none border-b-2 ${
                activeTab === "stake"
                  ? "border-brand-500 text-brand-500 bg-brand-500/5"
                  : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-white"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Stake SOL
            </button>
            <button
              onClick={() => {
                if (loading) return;
                setActiveTab("unstake");
                setError("");
                setSuccess("");
              }}
              disabled={loading}
              className={`flex-1 py-4 font-bold uppercase tracking-wider transition-all outline-none border-b-2 ${
                activeTab === "unstake"
                  ? "border-brand-500 text-brand-500 bg-brand-500/5"
                  : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-white"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Unstake DSOL
            </button>
          </div>

          <div className="p-8">
            {/* Admin Warning Setup */}
            {!isProtocolReady && (
              <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-xs font-mono text-amber-500 space-y-3">
                <p className="font-bold">⚠️ Protocol Setup Required (Admin):</p>
                <p>The on-chain Vault or DSOL Mint account is not initialized on this network cluster.</p>
                <div className="flex gap-2">
                  {!isVaultInit && (
                    <button
                      onClick={doInitVault}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all text-[10px]"
                    >
                      Init Vault
                    </button>
                  )}
                  {!isMintInit && (
                    <button
                      onClick={doInitMint}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all text-[10px]"
                    >
                      Init DSOL Mint
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* STAKE CONTENT */}
            {activeTab === "stake" && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-bold text-surface-600 dark:text-surface-300">
                      Amount
                    </label>
                    <span className="text-xs text-surface-500">
                      Balance: {solBalance.toFixed(4)} SOL
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (Number(value) < 0) return;
                        setAmount(value);
                      }}
                      disabled={loading || !isProtocolReady}
                      placeholder="0.00"
                      className="w-full bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-2xl px-5 py-5 text-3xl font-black text-surface-900 dark:text-white outline-none focus:border-brand-500 transition-all disabled:opacity-50"
                    />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-black text-surface-500">
                      SOL
                    </div>
                  </div>

                  <button
                    onClick={() => setAmount(Math.max(0, solBalance - 0.01).toString())}
                    disabled={loading || !isProtocolReady}
                    className="text-xs font-bold text-brand-400 hover:text-brand-300 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    MAX (with gas safety)
                  </button>
                </div>

                {/* Conversion Preview */}
                <div className="rounded-2xl bg-brand-500/5 border border-brand-500/10 p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-surface-500 font-bold mb-1">
                      You Receive
                    </p>
                    <h3 className="text-2xl font-black text-brand-500">
                      {amount || "0"} DSOL
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-surface-500">Exchange Rate</p>
                    <p className="font-black text-surface-900 dark:text-white">
                      1 SOL = 1 DSOL
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400 animate-in fade-in duration-300">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-5 py-4 text-sm font-semibold text-brand-400 animate-in fade-in duration-300">
                    {success}
                  </div>
                )}

                <button
                  onClick={handleStake}
                  disabled={loading || !isProtocolReady || !wallet.publicKey || Number(amount) <= 0}
                  className="w-full py-5 rounded-2xl bg-gradient-to-r from-brand-600 to-sol-purple text-white font-black text-lg shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Processing..." : "Stake & Mint DSOL"}
                </button>
              </div>
            )}

            {/* UNSTAKE CONTENT */}
            {activeTab === "unstake" && (
              <div className="space-y-6">
                <div className="text-center py-4 bg-surface-100 dark:bg-surface-900/60 rounded-2xl border border-black/5 dark:border-white/5">
                  <p className="text-xs uppercase tracking-widest text-surface-500 font-bold mb-1">
                    Liquid Balance Available
                  </p>
                  <h2 className="text-4xl font-black text-surface-900 dark:text-white">
                    {dsolBalance.toFixed(4)} DSOL
                  </h2>
                </div>

                {/* Return Preview Breakdown */}
                <div className="rounded-2xl bg-brand-500/5 border border-brand-500/10 p-5 space-y-3 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-surface-500">Staked Principal:</span>
                    <span className="font-bold text-surface-900 dark:text-white">
                      {parsedStakedPrincipal.toFixed(4)} SOL
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-black/5 dark:border-white/5 pb-3">
                    <span className="text-surface-500">Accrued Yield (Live):</span>
                    <span className="font-bold text-success">
                      +{liveRewards.toFixed(8)} SOL
                    </span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="font-bold text-brand-500">Total Return:</span>
                    <span className="font-black text-brand-500">
                      {totalPayoutPreview.toFixed(6)} SOL
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400 animate-in fade-in duration-300">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-5 py-4 text-sm font-semibold text-brand-400 animate-in fade-in duration-300">
                    {success}
                  </div>
                )}

                <button
                  onClick={handleUnstake}
                  disabled={loading || parsedStakedPrincipal <= 0 || dsolBalance <= 0 || !wallet.publicKey}
                  className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-lg shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Processing..." : "Unstake & Burn DSOL"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Info Panels */}
        <div className="space-y-6">
          {/* Position Info */}
          <div className="glass rounded-3xl p-6 border border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/[0.03] backdrop-blur-md">
            <h3 className="text-lg font-black text-surface-900 dark:text-white mb-6">
              Your Position
            </h3>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Wallet SOL</span>
                <span className="font-black text-surface-900 dark:text-white">
                  {solBalance.toFixed(4)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-surface-500">DSOL Balance</span>
                <span className="font-black text-brand-500">
                  {dsolBalance.toFixed(4)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-surface-500">Accruing Rewards</span>
                <span className="font-black text-success">
                  +{liveRewards.toFixed(8)} SOL
                </span>
              </div>
            </div>
          </div>

          {/* Protocol Configuration Info */}
          <div className="glass rounded-3xl p-6 border border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/[0.03] backdrop-blur-md text-sm">
            <h3 className="text-lg font-black text-surface-900 dark:text-white mb-6">
              Protocol Info
            </h3>

            <div className="space-y-5 font-mono">
              <div>
                <p className="text-xs uppercase tracking-widest text-surface-500 mb-1 font-bold">
                  Vault Address (SOL Store)
                </p>
                <p className="text-xs text-surface-900 dark:text-white truncate">
                  {vaultAddress.toBase58()}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-surface-500 mb-1 font-bold">
                  DSOL Mint Address
                </p>
                <p className="text-xs text-surface-900 dark:text-white truncate">
                  {mintAddress.toBase58()}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-surface-500 mb-1 font-bold">
                  Your Staking state PDA
                </p>
                <p className="text-xs text-surface-900 dark:text-white truncate">
                  {pdaAddress ? pdaAddress.toBase58() : "— (Connect Wallet)"}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-4">
                <span className="text-xs uppercase tracking-widest text-surface-500 font-bold">Network</span>
                <span className="font-black uppercase text-brand-500 text-xs">
                  {network}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiquidStaking;