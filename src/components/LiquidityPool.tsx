import { Plus, X, Loader2, AlertTriangle, AlertCircle, Copy, ExternalLink, Check, Layers, Coins, Sparkles, RefreshCw, Eye, ArrowLeftRight, TrendingUp, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { TokenSelector } from "./TokenSelector";
import { TokenData } from "../types/token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchWalletTokens } from "../utils/fetchWalletTokens";
import { createRaydiumPool } from "../utils/createRaydiumPool";
import { addLiquidity } from "../utils/addLiquidity";
import { Toast } from "./Toast";
import { CpmmPoolInfoLayout, DEVNET_PROGRAM_ID, CREATE_CPMM_POOL_PROGRAM, CREATE_CPMM_POOL_FEE_ACC, getPdaPoolId } from "@raydium-io/raydium-sdk-v2";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";

interface CreatedPoolData {
    poolId: string;
    tokenA: {
        mint: string;
        symbol: string;
        image?: string;
        amount: number;
    };
    tokenB: {
        mint: string;
        symbol: string;
        image?: string;
        amount: number;
    };
    signature: string;
    network: 'devnet' | 'mainnet-beta';
    createdAt: number;
}

const DEVNET_FEE_CONFIG = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
const MAINNET_FEE_CONFIG = new PublicKey('D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2');

function getNetworkConstants(network: 'devnet' | 'mainnet-beta') {
    if (network === 'devnet') {
        return {
            programId: new PublicKey(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM),
            feeAccount: new PublicKey(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC),
            configId: DEVNET_FEE_CONFIG,
        };
    }
    return {
        programId: new PublicKey(CREATE_CPMM_POOL_PROGRAM),
        feeAccount: new PublicKey(CREATE_CPMM_POOL_FEE_ACC),
        configId: MAINNET_FEE_CONFIG,
    };
}

export const LiquidityPool = ({ network }: { network: "devnet" | "mainnet-beta" }) => {
    const [isInitModalOpen, setIsInitModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedTokenA, setSelectedTokenA] = useState<TokenData | null>(null);
    const [selectedTokenB, setSelectedTokenB] = useState<TokenData | null>(null);

    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [isInitializing, setIsInitializing] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);

    const [openSelector, setOpenSelector] = useState<"tokenA" | "tokenB" | null>(null);
    const { publicKey } = useWallet();
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenData[]>([]);

    // New persistent state & success states
    const [createdPools, setCreatedPools] = useState<CreatedPoolData[]>([]);
    const [successPool, setSuccessPool] = useState<CreatedPoolData | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProgramAccountsSupported, setIsProgramAccountsSupported] = useState(true);
    const [showPoolsConsole, setShowPoolsConsole] = useState(false);

    // View pool simulator states
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingPool, setViewingPool] = useState<CreatedPoolData | null>(null);
    const [simSwapAmount, setSimSwapAmount] = useState<number>(0);
    const [simSwapDirection, setSimSwapDirection] = useState<'A_to_B' | 'B_to_A'>('A_to_B');

    // Add liquidity state
    const [addLiquidityPoolId, setAddLiquidityPoolId] = useState("");
    const [addAmountA, setAddAmountA] = useState("");
    const [addAmountB, setAddAmountB] = useState("");
    const [isAddingLiquidity, setIsAddingLiquidity] = useState(false);
    const [poolDetails, setPoolDetails] = useState<{
        mintA: PublicKey;
        mintB: PublicKey;
        tokenA: TokenData;
        tokenB: TokenData;
        vaultA: PublicKey;
        vaultB: PublicKey;
        reserveA: number;
        reserveB: number;
    } | null>(null);
    const [isFetchingPool, setIsFetchingPool] = useState(false);

    // Import pool state
    const [importPoolId, setImportPoolId] = useState("");
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Existing pool detection states
    const [existingPoolAddress, setExistingPoolAddress] = useState<string | null>(null);
    const [isCheckingExisting, setIsCheckingExisting] = useState(false);

    const getSavedPools = (): CreatedPoolData[] => {
        if (!publicKey) return [];
        const saved = localStorage.getItem(`solana_launchpad_pools_${publicKey.toBase58()}_${network}`);
        if (!saved) return [];
        try {
            const parsed: CreatedPoolData[] = JSON.parse(saved);
            const valid = parsed.filter(p => p && p.poolId && p.poolId.length >= 32 && p.poolId !== "...");
            localStorage.setItem(`solana_launchpad_pools_${publicKey.toBase58()}_${network}`, JSON.stringify(valid));
            return valid;
        } catch (e) {
            return [];
        }
    };

    const handleImportPool = async (poolIdToImport?: string) => {
        if (!publicKey) return;
        const targetId = poolIdToImport || importPoolId;
        if (!targetId || targetId.length < 32 || targetId.length > 44) {
            showToast("Please enter a valid Solana address", "error");
            return;
        }

        setIsImporting(true);
        try {
            const poolId = new PublicKey(targetId);
            const accountInfo = await connection.getAccountInfo(poolId);
            if (!accountInfo) {
                showToast("Pool account not found on this network", "error");
                return;
            }

            const state = CpmmPoolInfoLayout.decode(accountInfo.data);
            const vaultABal = await connection.getTokenAccountBalance(state.vaultA);
            const vaultBBal = await connection.getTokenAccountBalance(state.vaultB);

            const resolveToken = (mint: PublicKey): TokenData => {
                const mintStr = mint.toBase58();
                const known = tokens.find(t => t.mint === mintStr);
                if (known) return known;
                const symbol = mintStr === 'So11111111111111111111111111111111111111112' ? 'SOL' : mintStr.slice(0, 4) + '..' + mintStr.slice(-4);
                return {
                    mint: mintStr,
                    symbol,
                    name: symbol,
                    balance: 0,
                    decimals: mint.equals(NATIVE_MINT) ? 9 : 6
                };
            };

            const tokenA = resolveToken(state.mintA);
            const tokenB = resolveToken(state.mintB);

            const newPool: CreatedPoolData = {
                poolId: targetId,
                tokenA: {
                    mint: state.mintA.toBase58(),
                    symbol: tokenA.symbol,
                    image: tokenA.image,
                    amount: vaultABal.value.uiAmount || 0
                },
                tokenB: {
                    mint: state.mintB.toBase58(),
                    symbol: tokenB.symbol,
                    image: tokenB.image,
                    amount: vaultBBal.value.uiAmount || 0
                },
                signature: "synced",
                network,
                createdAt: Date.now()
            };

            let poolsList = getSavedPools();
            poolsList = poolsList.filter(p => p.poolId !== targetId);
            poolsList.unshift(newPool);

            localStorage.setItem(
                `solana_launchpad_pools_${publicKey.toBase58()}_${network}`,
                JSON.stringify(poolsList)
            );

            setCreatedPools(poolsList);
            setIsImportModalOpen(false);
            setImportPoolId("");
            showToast("Pool successfully imported to dashboard!", "success");
        } catch (e) {
            console.error("Failed to import pool:", e);
            showToast("Failed to decode or query pool details", "error");
        } finally {
            setIsImporting(false);
        }
    };

    const handleRemovePool = (poolIdToRemove: string) => {
        if (!publicKey) return;
        const parsed = getSavedPools();
        const updated = parsed.filter(p => p && p.poolId !== poolIdToRemove);
        localStorage.setItem(
            `solana_launchpad_pools_${publicKey.toBase58()}_${network}`,
            JSON.stringify(updated)
        );
        setCreatedPools(updated);
        showToast("Pool removed from dashboard", "info");
    };

    function handleInitializePoolClick() {
        if (!publicKey) {
            showToast("Please connect your wallet first", "error");
            return;
        }
        setModalError(null);
        setIsInitModalOpen(true);
    }

    function handleAddLiquidityClick(poolId?: string) {
        if (!publicKey) {
            showToast("Please connect your wallet first", "error");
            return;
        }
        setModalError(null);
        if (poolId) {
            setAddLiquidityPoolId(poolId);
        } else {
            setAddLiquidityPoolId("");
        }
        setAddAmountA("");
        setAddAmountB("");
        setPoolDetails(null);
        setIsAddModalOpen(true);
    }

    const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
        setToast({ message, type });
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        showToast("Copied to clipboard!", "success");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const { connection } = useConnection();

    // Helper to find native SOL balance
    const getSolBalance = (): number => {
        const solToken = tokens.find(t => t.symbol === "SOL" || t.mint === "So11111111111111111111111111111111111111112");
        return solToken ? solToken.balance : 0;
    };

    // Auto sync creator pools from on-chain data
    const syncExistingPools = async (isManual = false) => {
        if (!publicKey) return;

        // If programAccounts is restricted, silently skip background checks to prevent dev console 400 errors
        if (!isProgramAccountsSupported && !isManual) {
            return;
        }

        setIsSyncing(true);
        try {
            const { programId } = getNetworkConstants(network);
            const poolAccounts = await connection.getProgramAccounts(programId, {
                filters: [
                    {
                        memcmp: {
                            offset: 40,
                            bytes: publicKey.toBase58()
                        }
                    }
                ]
            });

            const synced: CreatedPoolData[] = [];
            for (const account of poolAccounts) {
                try {
                    const state = CpmmPoolInfoLayout.decode(account.account.data);
                    
                    // Fetch reserves
                    const vaultABal = await connection.getTokenAccountBalance(state.vaultA);
                    const vaultBBal = await connection.getTokenAccountBalance(state.vaultB);

                    const resolveToken = (mint: PublicKey): TokenData => {
                        const mintStr = mint.toBase58();
                        const known = tokens.find(t => t.mint === mintStr);
                        if (known) return known;
                        const symbol = mintStr === 'So11111111111111111111111111111111111111112' ? 'SOL' : mintStr.slice(0, 4) + '..' + mintStr.slice(-4);
                        return {
                            mint: mintStr,
                            symbol,
                            name: symbol,
                            balance: 0,
                            decimals: mint.equals(NATIVE_MINT) ? 9 : 6
                        };
                    };

                    const tokenA = resolveToken(state.mintA);
                    const tokenB = resolveToken(state.mintB);

                    synced.push({
                        poolId: account.pubkey.toBase58(),
                        tokenA: {
                            mint: state.mintA.toBase58(),
                            symbol: tokenA.symbol,
                            image: tokenA.image,
                            amount: vaultABal.value.uiAmount || 0
                        },
                        tokenB: {
                            mint: state.mintB.toBase58(),
                            symbol: tokenB.symbol,
                            image: tokenB.image,
                            amount: vaultBBal.value.uiAmount || 0
                        },
                        signature: "synced",
                        network,
                        createdAt: Date.now()
                    });
                } catch (err) {
                    console.error("Failed to decode synced pool:", err);
                }
            }

            const localPools = getSavedPools();
            
            // Merge lists cleanly, avoiding duplicates
            const combined = [...synced];
            for (const lp of localPools) {
                if (!combined.some(cp => cp.poolId === lp.poolId)) {
                    combined.push(lp);
                }
            }

            localStorage.setItem(
                `solana_launchpad_pools_${publicKey.toBase58()}_${network}`,
                JSON.stringify(combined)
            );
            setCreatedPools(combined);
            if (isManual) {
                showToast(`Synced ${synced.length} pools from the blockchain!`, "success");
            }
        } catch (e: any) {
            // Automatically capture restricted RPC tier and switch silent bypass mode on
            const errorStr = JSON.stringify(e);
            if (errorStr.includes("getProgramAccounts") || (e?.message && e.message.includes("getProgramAccounts"))) {
                setIsProgramAccountsSupported(false);
            }
            console.warn("Failed to sync pools from blockchain due to RPC limits:", e);
            if (isManual) {
                showToast("Sync failed. Public RPC is rate-limited. Please retry shortly.", "error");
            }
        } finally {
            setIsSyncing(false);
        }
    };

    // Calculate dynamic warnings and errors for initialization
    const getValidationState = () => {
        if (!publicKey) {
            return { isValid: false, message: "Please connect your wallet", type: "error" as const };
        }
        if (!selectedTokenA || !selectedTokenB) {
            return { isValid: false, message: "Select base and quote tokens to continue", type: "info" as const };
        }
        if (selectedTokenA.mint === selectedTokenB.mint) {
            return { isValid: false, message: "Base and Quote tokens cannot be the same", type: "error" as const };
        }

        const numA = Number(amountA);
        const numB = Number(amountB);

        if (!amountA || !amountB || isNaN(numA) || isNaN(numB)) {
            return { isValid: false, message: "Enter deposit amounts for both tokens", type: "info" as const };
        }
        if (numA <= 0 || numB <= 0) {
            return { isValid: false, message: "Amounts must be strictly greater than 0", type: "error" as const };
        }
        if (numA > selectedTokenA.balance) {
            return { isValid: false, message: `Insufficient ${selectedTokenA.symbol} balance (Available: ${selectedTokenA.balance})`, type: "error" as const };
        }
        if (numB > selectedTokenB.balance) {
            return { isValid: false, message: `Insufficient ${selectedTokenB.symbol} balance (Available: ${selectedTokenB.balance})`, type: "error" as const };
        }

        // Calculate SOL requirements: 0.17 SOL creation fee + rent + any deposited SOL
        const solBalance = getSolBalance();
        let solRequired = 0.17; 
        if (selectedTokenA.symbol === "SOL" || selectedTokenA.mint === "So11111111111111111111111111111111111111112") {
            solRequired += numA;
        }
        if (selectedTokenB.symbol === "SOL" || selectedTokenB.mint === "So11111111111111111111111111111111111111112") {
            solRequired += numB;
        }

        if (solBalance < solRequired) {
            return { 
                isValid: false, 
                message: `Insufficient SOL. Pool creation requires deposit amount + ~0.17 SOL for Raydium fee & rent (Required: ${solRequired.toFixed(4)} SOL, Wallet: ${solBalance.toFixed(4)} SOL)`, 
                type: "error" as const 
            };
        }

        return { isValid: true, message: "Ready to initialize pool! 🚀", type: "success" as const };
    };

    // Calculate warnings and errors for adding liquidity
    const getAddValidationState = () => {
        if (!publicKey) {
            return { isValid: false, message: "Connect wallet to proceed", type: "error" as const };
        }
        if (!addLiquidityPoolId) {
            return { isValid: false, message: "Enter Pool ID", type: "info" as const };
        }
        if (addLiquidityPoolId.length < 32 || addLiquidityPoolId.length > 44) {
            return { isValid: false, message: "Invalid Solana Address format", type: "error" as const };
        }
        if (isFetchingPool) {
            return { isValid: false, message: "Validating pool details...", type: "info" as const };
        }
        if (!poolDetails) {
            return { isValid: false, message: "Pool account not resolved. Please verify the Pool ID is correct.", type: "error" as const };
        }

        const numA = Number(addAmountA);
        const numB = Number(addAmountB);

        if (!addAmountA || !addAmountB || isNaN(numA) || isNaN(numB)) {
            return { isValid: false, message: "Enter deposit amounts", type: "info" as const };
        }
        if (numA <= 0 || numB <= 0) {
            return { isValid: false, message: "Amounts must be greater than 0", type: "error" as const };
        }

        if (numA > poolDetails.tokenA.balance) {
            return { isValid: false, message: `Insufficient ${poolDetails.tokenA.symbol} balance (Available: ${poolDetails.tokenA.balance})`, type: "error" as const };
        }

        if (numB > poolDetails.tokenB.balance) {
            return { isValid: false, message: `Insufficient ${poolDetails.tokenB.symbol} balance (Available: ${poolDetails.tokenB.balance})`, type: "error" as const };
        }

        // Native SOL gas check
        const solBalance = getSolBalance();
        let solRequired = 0.01; 
        if (poolDetails.tokenA.mint === NATIVE_MINT.toBase58()) {
            solRequired += numA;
        }
        if (poolDetails.tokenB.mint === NATIVE_MINT.toBase58()) {
            solRequired += numB;
        }
        if (solBalance < solRequired) {
            return { isValid: false, message: `Insufficient SOL balance to cover fee & deposit (Required: ${solRequired} SOL, Wallet: ${solBalance} SOL)`, type: "error" as const };
        }

        return { isValid: true, message: "Ready to deposit liquidity! 💸", type: "success" as const };
    };

    const handleInitializePool = async () => {
        const validation = getValidationState();
        if (!validation.isValid) {
            setModalError(validation.message);
            return;
        }

        setModalError(null);
        setIsInitializing(true);
        try {
            const { signature, poolId } = await createRaydiumPool(
                connection,
                wallet,
                selectedTokenA!,
                selectedTokenB!,
                Number(amountA),
                Number(amountB),
                network
            );
            
            const newPool: CreatedPoolData = {
                poolId,
                tokenA: {
                    mint: selectedTokenA!.mint,
                    symbol: selectedTokenA!.symbol,
                    image: selectedTokenA!.image,
                    amount: Number(amountA)
                },
                tokenB: {
                    mint: selectedTokenB!.mint,
                    symbol: selectedTokenB!.symbol,
                    image: selectedTokenB!.image,
                    amount: Number(amountB)
                },
                signature,
                network,
                createdAt: Date.now()
            };

            let poolsList = getSavedPools();
            poolsList.unshift(newPool);

            localStorage.setItem(
                `solana_launchpad_pools_${publicKey?.toBase58()}_${network}`,
                JSON.stringify(poolsList)
            );

            setCreatedPools(poolsList);
            setSuccessPool(newPool);
            showToast(`Pool Created Successfully!`, "success");
            
            setIsInitModalOpen(false);
            setAmountA("");
            setAmountB("");
            setSelectedTokenA(null);
            setSelectedTokenB(null);
        } catch (error) {
            console.error("Failed to initialize pool:", error);
            const msg = error instanceof Error ? error.message : "Failed to initialize pool";
            if (msg.includes('insufficient lamports')) {
                setModalError("Insufficient SOL balance. Pool creation requires your deposit amount + ~0.17 SOL for rent and Raydium's pool creation fee. Please reduce the amount or airdrop more devnet SOL.");
            } else {
                setModalError(`Transaction Failed: ${msg.slice(0, 150)}...`);
            }
            showToast("Failed to initialize pool", "error");
        } finally {
            setIsInitializing(false);
        }
    };

    const handleAddLiquiditySubmit = async () => {
        const validation = getAddValidationState();
        if (!validation.isValid) {
            setModalError(validation.message);
            return;
        }

        setModalError(null);
        setIsAddingLiquidity(true);
        try {
            const { signature, lpAmount, mintA, mintB } = await addLiquidity(
                connection,
                wallet,
                addLiquidityPoolId,
                Number(addAmountA),
                Number(addAmountB)
            );

            const resolvedA = poolDetails?.tokenA || { symbol: 'TOKEN A', mint: mintA };
            const resolvedB = poolDetails?.tokenB || { symbol: 'TOKEN B', mint: mintB };

            const newPool: CreatedPoolData = {
                poolId: addLiquidityPoolId,
                tokenA: {
                    mint: mintA,
                    symbol: resolvedA.symbol,
                    image: resolvedA.image,
                    amount: Number(addAmountA)
                },
                tokenB: {
                    mint: mintB,
                    symbol: resolvedB.symbol,
                    image: resolvedB.image,
                    amount: Number(addAmountB)
                },
                signature,
                network,
                createdAt: Date.now()
            };

            const saved = localStorage.getItem(`solana_launchpad_pools_${publicKey?.toBase58()}_${network}`);
            let poolsList: CreatedPoolData[] = saved ? JSON.parse(saved) : [];
            poolsList = poolsList.filter(p => p.poolId !== addLiquidityPoolId);
            poolsList.unshift(newPool);

            localStorage.setItem(
                `solana_launchpad_pools_${publicKey?.toBase58()}_${network}`,
                JSON.stringify(poolsList)
            );

            setCreatedPools(poolsList);
            setSuccessPool(newPool);
            
            setIsAddModalOpen(false);
            setAddLiquidityPoolId("");
            setAddAmountA("");
            setAddAmountB("");
            setPoolDetails(null);

            showToast("Liquidity Added successfully!", "success");
        } catch (error) {
            console.error("Failed to add liquidity:", error);
            const msg = error instanceof Error ? error.message : "Failed to add liquidity";
            setModalError(`Transaction Failed: ${msg.slice(0, 150)}...`);
            showToast("Failed to add liquidity", "error");
        } finally {
            setIsAddingLiquidity(false);
        }
    };

    // Dynamic reserve calculator when user changes Add Liquidity inputs
    const handleAddAmountAChange = (val: string) => {
        setAddAmountA(val);
        if (!poolDetails || poolDetails.reserveA === 0) return;
        const num = Number(val);
        if (isNaN(num) || num <= 0) {
            setAddAmountB("");
            return;
        }
        const computedB = (num * poolDetails.reserveB) / poolDetails.reserveA;
        setAddAmountB(computedB.toFixed(6));
    };

    const handleAddAmountBChange = (val: string) => {
        setAddAmountB(val);
        if (!poolDetails || poolDetails.reserveB === 0) return;
        const num = Number(val);
        if (isNaN(num) || num <= 0) {
            setAddAmountA("");
            return;
        }
        const computedA = (num * poolDetails.reserveA) / poolDetails.reserveB;
        setAddAmountA(computedA.toFixed(6));
    };

    // Check if derived pool already exists on-chain
    useEffect(() => {
        async function checkExistingPool() {
            if (!selectedTokenA || !selectedTokenB || selectedTokenA.mint === selectedTokenB.mint) {
                setExistingPoolAddress(null);
                return;
            }
            setIsCheckingExisting(true);
            try {
                const { programId, configId } = getNetworkConstants(network);
                const mintA = new PublicKey(selectedTokenA.mint);
                const mintB = new PublicKey(selectedTokenB.mint);

                const [orderMintA, orderMintB] = mintA.toBuffer().compare(mintB.toBuffer()) < 0 
                    ? [mintA, mintB] 
                    : [mintB, mintA];

                const derivedPoolId = getPdaPoolId(
                    programId,
                    configId,
                    orderMintA,
                    orderMintB
                ).publicKey;

                const accountInfo = await connection.getAccountInfo(derivedPoolId);
                if (accountInfo) {
                    setExistingPoolAddress(derivedPoolId.toBase58());
                } else {
                    setExistingPoolAddress(null);
                }
            } catch (err) {
                console.error("Error checking existing pool PDA:", err);
                setExistingPoolAddress(null);
            } finally {
                setIsCheckingExisting(false);
            }
        }
        checkExistingPool();
    }, [selectedTokenA, selectedTokenB, network, connection]);

    // Load created pools from local storage and trigger automatic blockchain scan
    useEffect(() => {
        if (!publicKey) {
            setCreatedPools([]);
            return;
        }
        setCreatedPools(getSavedPools());
        
        // Automatic blockchain sync on load/wallet change (silently checks once)
        syncExistingPools(false);
    }, [publicKey, network]);

    // Live fetching of pool reserves for Add Liquidity
    useEffect(() => {
        async function getPoolDetails() {
            if (!isAddModalOpen || !addLiquidityPoolId || addLiquidityPoolId.length < 32) {
                setPoolDetails(null);
                return;
            }
            setIsFetchingPool(true);
            try {
                const poolId = new PublicKey(addLiquidityPoolId);
                const accountInfo = await connection.getAccountInfo(poolId);
                if (!accountInfo) {
                    setPoolDetails(null);
                    return;
                }
                const state = CpmmPoolInfoLayout.decode(accountInfo.data);
                const { mintA, mintB, vaultA, vaultB } = state;

                // Fetch vault balances
                const balA = await connection.getTokenAccountBalance(vaultA);
                const balB = await connection.getTokenAccountBalance(vaultB);

                const reserveA = balA.value.uiAmount || 0;
                const reserveB = balB.value.uiAmount || 0;

                const resolveToken = (mint: PublicKey): TokenData => {
                    const mintStr = mint.toBase58();
                    const known = tokens.find(t => t.mint === mintStr);
                    if (known) return known;
                    
                    const symbol = mintStr === 'So11111111111111111111111111111111111111112' ? 'SOL' : mintStr.slice(0, 4) + '..' + mintStr.slice(-4);
                    return {
                        mint: mintStr,
                        symbol,
                        name: symbol,
                        balance: 0,
                        decimals: mint.equals(NATIVE_MINT) ? 9 : 6
                    };
                };

                setPoolDetails({
                    mintA,
                    mintB,
                    tokenA: resolveToken(mintA),
                    tokenB: resolveToken(mintB),
                    vaultA,
                    vaultB,
                    reserveA,
                    reserveB
                });
            } catch (e) {
                console.error('Error fetching pool details:', e);
                setPoolDetails(null);
            } finally {
                setIsFetchingPool(false);
            }
        }

        getPoolDetails();
    }, [addLiquidityPoolId, isAddModalOpen, tokens, connection]);

    useEffect(() => {
        async function loadTokens() {
            if (!publicKey) return;
            const fetchedTokens = await fetchWalletTokens(connection, publicKey);
            setTokens(fetchedTokens);
        }
        loadTokens();
    }, [publicKey, network]);

    // SUCCESS CELEBRATION VIEW
    if (successPool) {
        return (
            <div className="w-full max-w-2xl mx-auto text-center space-y-8 animate-slide-in-right py-8">
                <div className="glass p-8 md:p-10 rounded-3xl border border-sol-green/30 shadow-2xl relative overflow-hidden flex flex-col items-center gap-6">
                    {/* Glowing effect */}
                    <div className="absolute -top-40 -left-40 w-80 h-80 bg-sol-green/10 rounded-full blur-[100px] pointer-events-none"></div>
                    <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="w-20 h-20 bg-sol-green/10 border border-sol-green/20 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-sol-green/10">
                        <Sparkles size={40} className="text-sol-green" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-brand-500">
                            Transaction Successful!
                        </h2>
                        <p className="text-surface-600 dark:text-surface-300 text-sm md:text-base font-medium">
                            Your CPMM liquidity pool has been updated on the Solana network.
                        </p>
                    </div>

                    {/* Pair Icons and symbols */}
                    <div className="flex items-center gap-6 bg-surface-200/10 dark:bg-white/5 border border-white/10 px-6 py-4 rounded-2xl w-full justify-center">
                        <div className="flex items-center -space-x-3">
                            <div className="w-12 h-12 rounded-full border-2 border-surface-900 bg-surface-800 flex items-center justify-center font-bold text-sol-green shadow">
                                {successPool.tokenA.image ? (
                                    <img src={successPool.tokenA.image} alt={successPool.tokenA.symbol} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    successPool.tokenA.symbol[0]
                                )}
                            </div>
                            <div className="w-12 h-12 rounded-full border-2 border-surface-900 bg-surface-800 flex items-center justify-center font-bold text-brand-500 shadow">
                                {successPool.tokenB.image ? (
                                    <img src={successPool.tokenB.image} alt={successPool.tokenB.symbol} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    successPool.tokenB.symbol[0]
                                )}
                            </div>
                        </div>
                        <div className="text-left">
                            <span className="text-xl font-extrabold text-surface-500 dark:text-surface-100 uppercase tracking-wide">
                                {successPool.tokenA.symbol} / {successPool.tokenB.symbol}
                            </span>
                            <div className="text-xs text-surface-500 font-medium mt-0.5">Constant Product Pair</div>
                        </div>
                    </div>

                    {/* Pool Details list */}
                    <div className="w-full space-y-3 bg-surface-200/5 dark:bg-black/20 border border-white/5 p-5 rounded-2xl text-left text-sm">
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="text-surface-500">Pool ID</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-surface-400 font-medium">
                                    {successPool.poolId.slice(0, 8)}...{successPool.poolId.slice(-8)}
                                </span>
                                <button 
                                    onClick={() => handleCopy(successPool.poolId, 'success-pool')}
                                    className="p-1 hover:bg-white/10 rounded transition-colors text-surface-500"
                                >
                                    {copiedId === 'success-pool' ? <Check size={16} className="text-sol-green" /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="text-surface-500">Deposited {successPool.tokenA.symbol}</span>
                            <span className="font-bold text-surface-400">
                                {successPool.tokenA.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="text-surface-500">Deposited {successPool.tokenB.symbol}</span>
                            <span className="font-bold text-surface-400">
                                {successPool.tokenB.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-surface-500">Transaction Signature</span>
                            {successPool.signature === "synced" ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-surface-400">On-Chain Synced</span>
                            ) : (
                                <a 
                                    href={`https://explorer.solana.com/tx/${successPool.signature}?cluster=${network}`}
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="flex items-center gap-1 font-mono text-brand-500 hover:text-brand-400 font-bold"
                                >
                                    {successPool.signature.slice(0, 6)}...{successPool.signature.slice(-6)}
                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="w-full flex flex-col md:flex-row gap-4 mt-2">
                        <button
                            onClick={() => handleAddLiquidityClick(successPool.poolId)}
                            className="flex-1 py-4 font-bold text-white bg-gradient-to-r from-brand-500 to-sol-purple rounded-xl shadow-lg shadow-brand-500/20 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            Add More Liquidity
                        </button>
                        <button
                            onClick={() => setSuccessPool(null)}
                            className="flex-1 py-4 font-bold text-surface-400 hover:text-surface-500 glass rounded-xl border border-white/10 hover:border-white/20 transition-all"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-slide-in-right">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sol-green/10 border border-sol-green/20 text-sol-green text-sm font-bold uppercase tracking-widest">
                Development Mode
            </div>
            <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-gray-500">
                Liquidity <span className="text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-brand-500">Pool Builder</span>
            </h2>
            <p className="text-xl text-surface-600 dark:text-surface-300 max-w-2xl mx-auto leading-relaxed">
                Seamlessly launch constant product liquidity pools or supply additional liquidity to existing pairs on Solana's Raydium protocol.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                <button onClick={handleInitializePoolClick} className="glass p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 group hover:border-sol-green/80! transition-all duration-300">
                    <Plus size={32} className="text-sm font-bold opacity-50 text-gray-500 group-hover:text-sol-green group-hover:opacity-100 transition-all"></Plus>
                    <span className="font-bold text-lg text-surface-400 group-hover:text-surface-200 transition-colors">Initialize Pool</span>
                </button>
                <button onClick={() => handleAddLiquidityClick()} className="glass p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 group hover:border-brand-500/80! transition-all duration-300">
                    <Plus size={32} className="text-sm font-bold opacity-50 text-gray-500 group-hover:text-brand-500 group-hover:opacity-100 transition-all"></Plus>
                    <span className="font-bold text-lg text-surface-400 group-hover:text-surface-200 transition-colors">Add Liquidity</span>
                </button>
            </div>

            {publicKey && (
                <div className="mt-8 flex justify-center animate-in fade-in duration-300">
                    <button
                        onClick={() => setShowPoolsConsole(!showPoolsConsole)}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border transition-all font-extrabold text-sm shadow-lg ${
                            showPoolsConsole
                                ? 'bg-gradient-to-r from-brand-600 to-sol-purple text-white border-brand-500/20 shadow-brand-500/10'
                                : 'bg-white/5 hover:bg-white/10 text-brand-400 border-white/5 hover:border-white/10'
                        }`}
                    >
                        <Layers className="w-5 h-5 text-brand-500 animate-pulse" />
                        <span>{showPoolsConsole ? 'Hide Your Liquidity Pools' : 'View Your Liquidity Pools'}</span>
                        <span className="bg-brand-500/20 px-2 py-0.5 rounded-full text-xs font-bold text-white">
                            {createdPools.length}
                        </span>
                    </button>
                </div>
            )}

            {/* MY CREATED POOLS LIST SECTION */}
            {showPoolsConsole && (
                <div className="pt-10 text-left space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-surface-300 to-surface-500 flex items-center gap-2">
                        <Layers size={22} className="text-brand-500" />
                        My Liquidity Pools
                    </h3>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            disabled={!publicKey}
                            className="p-2 rounded-xl border border-white/10 glass hover:border-brand-500/30 transition-all text-surface-400 hover:text-brand-500 flex items-center gap-1.5 text-xs font-bold"
                            title="Import an existing pool by address"
                        >
                            <Plus size={14} />
                            Import Pool
                        </button>
                        <button 
                            onClick={() => syncExistingPools(true)}
                            disabled={isSyncing || !publicKey}
                            className="p-2 rounded-xl border border-white/10 glass hover:border-white/20 transition-all text-surface-400 hover:text-surface-350 disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold"
                            title="Scan blockchain for your pools"
                        >
                            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                            Sync Pools
                        </button>
                        <span className="text-xs font-semibold px-3 py-1 bg-surface-200/10 dark:bg-white/5 border border-white/10 rounded-full text-surface-500">
                            {createdPools.length} Active {createdPools.length === 1 ? 'Pool' : 'Pools'}
                        </span>
                    </div>
                </div>

                {createdPools.length === 0 ? (
                    <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 py-12">
                        <Coins size={48} className="text-surface-500 opacity-40 animate-pulse" />
                        <div className="space-y-1">
                            <h4 className="font-bold text-surface-500">No pools created yet</h4>
                            <p className="text-sm text-surface-600 dark:text-surface-400 max-w-md">
                                Connect your wallet and click <span className="text-sol-green font-bold">Initialize Pool</span> to launch your first persistent Raydium constant product market maker pool.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {createdPools.map((pool) => (
                            <div key={pool.poolId} className="glass p-6 rounded-2xl border border-white/10 hover:border-brand-500/30 transition-all duration-300 flex flex-col gap-4 shadow-lg hover:shadow-brand-500/5 group relative">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center -space-x-2.5">
                                            <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center font-bold text-sol-green text-xs">
                                                {pool.tokenA.image ? (
                                                    <img src={pool.tokenA.image} alt={pool.tokenA.symbol} className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    pool.tokenA.symbol[0]
                                                )}
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center font-bold text-brand-500 text-xs">
                                                {pool.tokenB.image ? (
                                                    <img src={pool.tokenB.image} alt={pool.tokenB.symbol} className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    pool.tokenB.symbol[0]
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="font-extrabold text-surface-500 dark:text-surface-200 tracking-wide uppercase text-sm">
                                                {pool.tokenA.symbol} / {pool.tokenB.symbol}
                                            </span>
                                            <div className="text-[10px] text-surface-500 tracking-widest font-bold uppercase mt-0.5">Raydium CPMM</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 capitalize font-bold">
                                            {pool.network}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2 bg-black/5 dark:bg-black/10 p-3.5 rounded-xl text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-surface-500 font-semibold">Pool ID</span>
                                        <div className="flex items-center gap-1.5 font-mono">
                                            <span className="text-gray-500 dark:text-surface-400 font-semibold">{pool.poolId.slice(0, 6)}...{pool.poolId.slice(-6)}</span>
                                            <button 
                                                onClick={() => handleCopy(pool.poolId, pool.poolId)}
                                                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded text-surface-500 transition-colors"
                                            >
                                                {copiedId === pool.poolId ? <Check size={12} className="text-sol-green" /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-surface-500 font-semibold">Deposited {pool.tokenA.symbol}</span>
                                        <span className="font-bold text-gray-500 dark:text-surface-400">{pool.tokenA.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-surface-500 font-semibold">Deposited {pool.tokenB.symbol}</span>
                                        <span className="font-bold text-gray-500 dark:text-surface-400">{pool.tokenB.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            setViewingPool(pool);
                                            setSimSwapAmount(0);
                                            setSimSwapDirection('A_to_B');
                                            setIsViewModalOpen(true);
                                        }}
                                        className="flex-1 py-2 rounded-lg font-bold text-xs text-surface-500 dark:text-surface-400 hover:text-gray-900 dark:hover:text-white bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-1"
                                    >
                                        <Eye size={13} className="text-sol-green" />
                                        View Pool
                                    </button>
                                    <button 
                                        onClick={() => handleAddLiquidityClick(pool.poolId)}
                                        className="flex-1 py-2 rounded-lg font-bold text-xs text-white bg-brand-500/80 hover:bg-brand-500 shadow shadow-brand-500/10 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Plus size={13} />
                                        Add Liquidity
                                    </button>
                                    <a 
                                        href={`https://explorer.solana.com/address/${pool.poolId}?cluster=${network}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-shrink-0 px-2 py-2 rounded-lg font-bold text-xs text-surface-500 dark:text-surface-400 hover:text-gray-900 dark:hover:text-white bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-1"
                                        title="View on Explorer"
                                    >
                                        <ExternalLink size={13} />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}

            {/* INITIALIZE LIQUIDITY POOL MODAL */}
            {isInitModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="glass w-full max-w-2xl p-6 md:p-8 rounded-3xl border border-white/10 flex flex-col gap-6 shadow-2xl overflow-visible">
                        
                        <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-xl text-surface-500">Initialize Liquidity Pool</span>
                            <button onClick={() => setIsInitModalOpen(false)} className="p-2 rounded-full hover:bg-surface-200/20 transition-colors">
                                <X size={20} className="text-surface-500"></X>
                            </button>
                        </div>
                        
                        <div className="w-full flex flex-col md:flex-row gap-6">
                            {/* BASE TOKEN COLUMN */}
                            <div className="flex-1 flex flex-col gap-3">
                                <h1 className="font-bold text-sm text-surface-500 uppercase tracking-wider">
                                    Base Token
                                </h1>

                                <TokenSelector
                                    selectedToken={selectedTokenA}
                                    setSelectedToken={setSelectedTokenA}
                                    excludeToken={selectedTokenB}
                                    network={network}
                                    tokens={tokens}
                                    isOpen={openSelector === "tokenA"}
                                    setIsOpen={(open) => setOpenSelector(open ? "tokenA" : null)}
                                />

                                <div className="bg-transparent border border-surface-500/20 rounded-xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-medium text-surface-500">Amount</span>
                                        <span className="text-xs font-medium text-surface-500">
                                            Balance: {selectedTokenA ? selectedTokenA.balance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={amountA}
                                            onChange={(e) => setAmountA(e.target.value)}
                                            placeholder="0.00" 
                                            className="w-full bg-transparent border-none text-surface-500 text-lg font-medium focus:outline-none focus:ring-0 placeholder-surface-400"
                                            min="0"
                                        />
                                        <button 
                                            onClick={() => setAmountA(selectedTokenA?.balance.toString() || "")}
                                            disabled={!selectedTokenA}
                                            className="px-3 py-1 text-xs font-bold bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                                        >
                                            MAX
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* QUOTE TOKEN COLUMN */}
                            <div className="flex-1 flex flex-col gap-3">
                                <h1 className="font-bold text-sm text-surface-500 uppercase tracking-wider">
                                    Quote Token
                                </h1>

                                <TokenSelector
                                    selectedToken={selectedTokenB}
                                    setSelectedToken={setSelectedTokenB}
                                    excludeToken={selectedTokenA}
                                    network={network}
                                    tokens={tokens}
                                    isOpen={openSelector === "tokenB"}
                                    setIsOpen={(open) => setOpenSelector(open ? "tokenB" : null)}
                                />

                                <div className="bg-transparent border border-surface-500/20 rounded-xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-medium text-surface-500">Amount</span>
                                        <span className="text-xs font-medium text-surface-500">
                                            Balance: {selectedTokenB ? selectedTokenB.balance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={amountB}
                                            onChange={(e) => setAmountB(e.target.value)}
                                            placeholder="0.00" 
                                            className="w-full bg-transparent border-none text-surface-500 text-lg font-medium focus:outline-none focus:ring-0 placeholder-surface-400"
                                            min="0"
                                        />
                                        <button 
                                            onClick={() => setAmountB(selectedTokenB?.balance.toString() || "")}
                                            disabled={!selectedTokenB}
                                            className="px-3 py-1 text-xs font-bold bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                                        >
                                            MAX
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* INITIAL PRICE SUMMARY */}
                        {selectedTokenA && selectedTokenB && Number(amountA) > 0 && Number(amountB) > 0 && (
                            <div className="w-full bg-transparent border border-surface-500/20 rounded-xl p-4 flex flex-col gap-2 mt-2">
                                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Initial Price (Ratio)</h4>
                                <div className="flex justify-between items-center">
                                    <span className="text-surface-500 font-medium">1 {selectedTokenA.symbol} =</span>
                                    <span className="text-brand-500 font-bold text-lg">
                                        {(Number(amountB) / Number(amountA)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {selectedTokenB.symbol}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-surface-500">1 {selectedTokenB.symbol} =</span>
                                    <span className="text-surface-500 font-medium">
                                        {(Number(amountA) / Number(amountB)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {selectedTokenA.symbol}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* EXISTING POOL WARNING & IMPORT CTA */}
                        {existingPoolAddress && (
                            <div className="w-full flex flex-col gap-3 p-4 rounded-xl border border-sol-green/20 bg-sol-green/10 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-start gap-2.5">
                                    <Sparkles className="w-5 h-5 text-sol-green mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-bold uppercase tracking-wider text-sol-green">
                                            Pool Already Created!
                                        </span>
                                        <p className="text-sm font-medium text-surface-400 leading-relaxed mt-0.5 break-all">
                                            A constant product pool for {selectedTokenA?.symbol} / {selectedTokenB?.symbol} already exists on-chain at:
                                            <span className="flex items-center justify-between font-mono text-[11px] font-bold text-white mt-1.5 bg-black/35 px-3 py-1.5 rounded border border-white/5">
                                                <span className="break-all">{existingPoolAddress}</span>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopy(existingPoolAddress, 'existing-pool-alert');
                                                    }}
                                                    className="p-1 hover:bg-white/10 rounded text-surface-400 hover:text-white transition-colors ml-2 flex-shrink-0"
                                                    title="Copy full Pool ID"
                                                >
                                                    {copiedId === 'existing-pool-alert' ? <Check size={14} className="text-sol-green" /> : <Copy size={14} />}
                                                </button>
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleImportPool(existingPoolAddress)}
                                    disabled={isImporting}
                                    className="w-full py-2.5 rounded-lg font-bold text-xs text-white bg-sol-green/80 hover:bg-sol-green shadow transition-colors flex items-center justify-center gap-1.5"
                                >
                                    {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers size={14} />}
                                    Import Pool & Close
                                </button>
                            </div>
                        )}

                        {/* LIVE DYNAMIC VALIDATION / ERROR SYSTEM */}
                        {(() => {
                            const validation = getValidationState();
                            const errorToShow = modalError || (!validation.isValid && validation.message !== "Select base and quote tokens to continue" && validation.message !== "Enter deposit amounts for both tokens" ? validation.message : null);
                            
                            if (!errorToShow) return null;
                            
                            const isFatal = modalError || validation.type === "error";

                            return (
                                <div className={`w-full flex items-start gap-3 p-4 rounded-xl border mt-2 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 ${
                                    isFatal 
                                        ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                }`}>
                                    {isFatal ? (
                                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                        <span className="text-xs font-bold uppercase tracking-wider">
                                            {isFatal ? "Validation Error" : "System Warning"}
                                        </span>
                                        <p className="text-sm font-medium leading-relaxed break-all md:break-words">{errorToShow}</p>
                                    </div>
                                    {modalError && (
                                        <button 
                                            onClick={() => setModalError(null)}
                                            className="p-1 rounded hover:bg-white/10 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ACTION BUTTON */}
                        <button 
                            onClick={handleInitializePool}
                            disabled={isInitializing || !getValidationState().isValid || !!existingPoolAddress}
                            className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-500 to-sol-purple hover:from-brand-600 hover:to-sol-purple-dark shadow-lg shadow-brand-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                        >
                            {isInitializing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Initializing Pool...
                                </>
                            ) : existingPoolAddress ? "Pool Already Exists" :
                             (!selectedTokenA || !selectedTokenB) ? "Select Tokens" :
                             (!amountA || !amountB || Number(amountA) <= 0 || Number(amountB) <= 0) ? "Enter Amounts" :
                             (Number(amountA) > selectedTokenA.balance || Number(amountB) > selectedTokenB.balance) ? "Insufficient Balance" :
                             "Initialize Pool"}
                        </button>
                    </div>
                </div>
            )}

            {/* ADD LIQUIDITY MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="glass w-full max-w-2xl p-6 md:p-8 rounded-3xl border border-white/10 flex flex-col gap-6 shadow-2xl overflow-visible">
                        
                        <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-xl text-surface-500">Deposit Liquidity (CPMM)</span>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-full hover:bg-surface-200/20 transition-colors">
                                <X size={20} className="text-surface-500"></X>
                            </button>
                        </div>

                        {/* Pool address input */}
                        <div className="w-full flex flex-col gap-2 text-left">
                            <label className="text-xs font-bold text-surface-500 uppercase tracking-wider px-1">Raydium Pool Address (ID)</label>
                            <input 
                                type="text"
                                value={addLiquidityPoolId}
                                onChange={(e) => {
                                    setAddLiquidityPoolId(e.target.value);
                                    setModalError(null);
                                }}
                                placeholder="Paste Raydium Pool Account Address..."
                                className="w-full bg-transparent border border-surface-500/20 rounded-xl p-3.5 text-sm font-medium text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-0 placeholder-surface-600 transition-colors"
                            />
                        </div>

                        {/* Loading State or Resolved Pool Details */}
                        {isFetchingPool && (
                            <div className="w-full flex items-center justify-center gap-2 py-4 text-surface-500 font-semibold text-sm">
                                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                                Querying Raydium Pool on-chain state...
                            </div>
                        )}

                        {!isFetchingPool && poolDetails && (
                            <div className="w-full space-y-5 animate-in fade-in duration-200">
                                {/* Pool info card */}
                                <div className="flex items-center justify-between p-4 bg-surface-200/10 dark:bg-white/5 border border-white/5 rounded-2xl text-left">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center -space-x-2">
                                            <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center font-bold text-sol-green text-xs">
                                                {poolDetails.tokenA.symbol[0]}
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center font-bold text-brand-500 text-xs">
                                                {poolDetails.tokenB.symbol[0]}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="font-bold text-surface-400 text-sm uppercase">
                                                {poolDetails.tokenA.symbol} / {poolDetails.tokenB.symbol}
                                            </span>
                                            <div className="text-[10px] text-surface-500 font-bold tracking-wider mt-0.5">Ratio: 1 {poolDetails.tokenA.symbol} = {(poolDetails.reserveB / poolDetails.reserveA).toLocaleString(undefined, { maximumFractionDigits: 6 })} {poolDetails.tokenB.symbol}</div>
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] text-surface-500 font-bold uppercase">
                                        Active Reserves
                                        <div className="text-xs text-surface-400 font-semibold mt-0.5">
                                            {poolDetails.reserveA.toLocaleString(undefined, { maximumFractionDigits: 2 })} A : {poolDetails.reserveB.toLocaleString(undefined, { maximumFractionDigits: 2 })} B
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full flex flex-col md:flex-row gap-6">
                                    {/* AMOUNT A COLUMN */}
                                    <div className="flex-1 flex flex-col gap-3 text-left">
                                        <span className="font-bold text-xs text-surface-500 uppercase tracking-wider px-1">
                                            Input {poolDetails.tokenA.symbol}
                                        </span>
                                        <div className="bg-transparent border border-surface-500/20 rounded-xl p-3 flex flex-col gap-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-medium text-surface-500">Amount</span>
                                                <span className="text-xs font-medium text-surface-500">
                                                    Balance: {poolDetails.tokenA.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" 
                                                    value={addAmountA}
                                                    onChange={(e) => handleAddAmountAChange(e.target.value)}
                                                    placeholder="0.00" 
                                                    className="w-full bg-transparent border-none text-surface-500 text-lg font-medium focus:outline-none focus:ring-0 placeholder-surface-400"
                                                    min="0"
                                                />
                                                <button 
                                                    onClick={() => handleAddAmountAChange(poolDetails.tokenA.balance.toString())}
                                                    className="px-3 py-1 text-xs font-bold bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500/20 transition-colors"
                                                >
                                                    MAX
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* AMOUNT B COLUMN */}
                                    <div className="flex-1 flex flex-col gap-3 text-left">
                                        <span className="font-bold text-xs text-surface-500 uppercase tracking-wider px-1">
                                            Input {poolDetails.tokenB.symbol}
                                        </span>
                                        <div className="bg-transparent border border-surface-500/20 rounded-xl p-3 flex flex-col gap-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-medium text-surface-500">Amount</span>
                                                <span className="text-xs font-medium text-surface-500">
                                                    Balance: {poolDetails.tokenB.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" 
                                                    value={addAmountB}
                                                    onChange={(e) => handleAddAmountBChange(e.target.value)}
                                                    placeholder="0.00" 
                                                    className="w-full bg-transparent border-none text-surface-500 text-lg font-medium focus:outline-none focus:ring-0 placeholder-surface-400"
                                                    min="0"
                                                />
                                                <button 
                                                    onClick={() => handleAddAmountBChange(poolDetails.tokenB.balance.toString())}
                                                    className="px-3 py-1 text-xs font-bold bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500/20 transition-colors"
                                                >
                                                    MAX
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LIVE DYNAMIC VALIDATION / ERROR SYSTEM FOR ADD LIQUIDITY */}
                        {(() => {
                            const validation = getAddValidationState();
                            const errorToShow = modalError || (!validation.isValid && validation.message !== "Enter Pool ID" && validation.message !== "Enter valid deposit amounts" ? validation.message : null);
                            
                            if (!errorToShow) return null;
                            
                            const isFatal = modalError || validation.type === "error";

                            return (
                                <div className={`w-full flex items-start gap-3 p-4 rounded-xl border mt-2 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 ${
                                    isFatal 
                                        ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                }`}>
                                    {isFatal ? (
                                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                        <span className="text-xs font-bold uppercase tracking-wider">
                                            {isFatal ? "Validation Error" : "System Warning"}
                                        </span>
                                        <p className="text-sm font-medium leading-relaxed break-all md:break-words">{errorToShow}</p>
                                    </div>
                                    {modalError && (
                                        <button 
                                            onClick={() => setModalError(null)}
                                            className="p-1 rounded hover:bg-white/10 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* SUBMIT BUTTON */}
                        <button 
                            onClick={handleAddLiquiditySubmit}
                            disabled={isAddingLiquidity || !getAddValidationState().isValid}
                            className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-500 to-sol-purple hover:from-brand-600 hover:to-sol-purple-dark shadow-lg shadow-brand-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                        >
                            {isAddingLiquidity ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Depositing Liquidity...
                                </>
                            ) : !addLiquidityPoolId ? "Enter Raydium Pool ID" :
                              !poolDetails ? "Loading Pool reserves..." :
                              (!addAmountA || !addAmountB || Number(addAmountA) <= 0 || Number(addAmountB) <= 0) ? "Enter Amounts" :
                              (Number(addAmountA) > poolDetails.tokenA.balance || Number(addAmountB) > poolDetails.tokenB.balance) ? "Insufficient Balance" :
                              "Deposit Liquidity"}
                        </button>
                    </div>
                </div>
            )}

            {/* IMPORT POOL MODAL */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="glass w-full max-w-lg p-6 md:p-8 rounded-3xl border border-white/10 flex flex-col gap-6 shadow-2xl overflow-visible">
                        
                        <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-xl text-surface-500">Import Existing Pool</span>
                            <button onClick={() => setIsImportModalOpen(false)} className="p-2 rounded-full hover:bg-surface-200/20 transition-colors">
                                <X size={20} className="text-surface-500"></X>
                            </button>
                        </div>

                        <div className="w-full flex flex-col gap-2 text-left">
                            <label className="text-xs font-bold text-surface-500 uppercase tracking-wider px-1">Raydium Pool ID (Address)</label>
                            <input 
                                type="text"
                                value={importPoolId}
                                onChange={(e) => setImportPoolId(e.target.value)}
                                placeholder="Paste Raydium Pool Account Address..."
                                className="w-full bg-transparent border border-surface-500/20 rounded-xl p-3.5 text-sm font-medium text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-0 placeholder-surface-600 transition-colors"
                            />
                            <p className="text-[11px] text-surface-500 px-1 leading-relaxed mt-1">
                                Simply paste the Pool ID created on-chain. This performs a simple, non-rate-limited <code>getAccountInfo</code> query to decode the pool's tokens and vault details instantly.
                            </p>
                        </div>

                        <button 
                            onClick={handleImportPool}
                            disabled={isImporting || !importPoolId || importPoolId.length < 32 || importPoolId.length > 44}
                            className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-500 to-sol-purple hover:from-brand-600 hover:to-sol-purple-dark shadow-lg shadow-brand-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isImporting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Importing Pool Details...
                                </>
                            ) : "Import Pool"}
                        </button>
                    </div>
                </div>
            )}

            {/* VIEW INTERACTIVE POOL MODAL */}
            {isViewModalOpen && viewingPool && (() => {
                const resA = viewingPool.tokenA.amount;
                const resB = viewingPool.tokenB.amount;
                const k = resA * resB;
                
                // Active calculations based on simulation input
                let simResA = resA;
                let simResB = resB;
                let outputAmount = 0;
                let priceImpact = 0;
                
                if (simSwapAmount > 0) {
                    if (simSwapDirection === 'A_to_B') {
                        simResA = resA + simSwapAmount;
                        simResB = k / simResA;
                        outputAmount = resB - simResB;
                        
                        const currentSpotPrice = resB / resA; // B per A
                        const executionPrice = outputAmount / simSwapAmount;
                        priceImpact = ((currentSpotPrice - executionPrice) / currentSpotPrice) * 100;
                    } else {
                        simResB = resB + simSwapAmount;
                        simResA = k / simResB;
                        outputAmount = resA - simResA;
                        
                        const currentSpotPrice = resA / resB; // A per B
                        const executionPrice = outputAmount / simSwapAmount;
                        priceImpact = ((currentSpotPrice - executionPrice) / currentSpotPrice) * 100;
                    }
                }
                
                // Let's cap price impact cleanly between 0 and 100
                priceImpact = Math.max(0, Math.min(100, priceImpact));

                // Tilt angle for the physical balance beam
                const ratioShift = (simResA / resA) / ((simResA / resA) + (simResB / resB));
                const tiltAngle = (ratioShift - 0.5) * 50; // max +/- 25 degrees

                // Spot prices
                const simPriceA = simResB / simResA;
                const simPriceB = simResA / simResB;
                
                return (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="glass w-full max-w-xl p-6 md:p-8 rounded-3xl border border-white/10 flex flex-col gap-6 shadow-2xl relative">
                            
                            <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-sol-green/10 border border-sol-green/20">
                                        <TrendingUp size={20} className="text-sol-green" />
                                    </div>
                                    <div className="text-left">
                                        <span className="font-bold text-lg text-white">Interactive Pool Viewer</span>
                                        <p className="text-[10px] text-surface-500 uppercase tracking-widest font-bold mt-0.5">Constant Product AMM (x * y = k)</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        setIsViewModalOpen(false);
                                        setViewingPool(null);
                                    }} 
                                    className="p-2 rounded-full hover:bg-surface-200/20 transition-colors"
                                >
                                    <X size={20} className="text-surface-500"></X>
                                </button>
                            </div>

                            {/* DYNAMIC METRIC CARDS */}
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-black/20 border border-white/5 rounded-2xl p-3 flex flex-col justify-center">
                                    <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Spot Price</span>
                                    <span className="font-mono text-xs font-bold text-white mt-1 break-all">
                                        1 {viewingPool.tokenA.symbol} = {simPriceA.toLocaleString(undefined, { maximumFractionDigits: 5 })} {viewingPool.tokenB.symbol}
                                    </span>
                                </div>
                                <div className="bg-brand-500/5 border border-brand-500/10 rounded-2xl p-3 flex flex-col justify-center">
                                    <span className="text-[10px] text-brand-500 font-bold uppercase tracking-wider">Product K</span>
                                    <span className="font-mono text-xs font-extrabold text-brand-400 mt-1 break-all">
                                        {k.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-2xl p-3 flex flex-col justify-center">
                                    <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Opposite Price</span>
                                    <span className="font-mono text-xs font-bold text-white mt-1 break-all">
                                        1 {viewingPool.tokenB.symbol} = {simPriceB.toLocaleString(undefined, { maximumFractionDigits: 5 })} {viewingPool.tokenA.symbol}
                                    </span>
                                </div>
                            </div>

                            {/* INTERACTIVE VISUAL DONUT / RATIO BAR */}
                            <div className="bg-black/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 text-center">
                                <span className="text-xs font-bold text-surface-500 uppercase tracking-wider">
                                    Reserve Distribution (Live State)
                                </span>

                                {/* THE TILTING BALANCE SCALE SVG */}
                                <div className="relative h-28 w-full flex flex-col items-center justify-end overflow-visible mt-2">
                                    <svg viewBox="0 0 400 120" className="w-full max-w-sm overflow-visible">
                                        {/* Ground Base */}
                                        <path d="M 180 110 L 220 110 L 200 70 Z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                                        
                                        {/* Pivot Pin */}
                                        <circle cx="200" cy="70" r="4.5" fill="#14F195" />

                                        {/* Tilting Lever Beam */}
                                        <g style={{ transform: `rotate(${tiltAngle}deg)`, transformOrigin: '200px 70px', transition: 'transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28)' }}>
                                            {/* Lever Arm */}
                                            <line x1="50" y1="70" x2="350" y2="70" stroke="rgba(255,255,255,0.3)" strokeWidth="4" strokeLinecap="round" />
                                            <circle cx="200" cy="70" r="3" fill="#000" />

                                            {/* Left Hanger Plate */}
                                            <line x1="75" y1="70" x2="75" y2="90" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                                            <path d="M 50 90 L 100 90 A 25 12 0 0 1 50 90" fill="rgba(20, 241, 149, 0.1)" stroke="#14F195" strokeWidth="1.5" />
                                            
                                            {/* Right Hanger Plate */}
                                            <line x1="325" y1="70" x2="325" y2="90" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                                            <path d="M 300 90 L 350 90 A 25 12 0 0 1 300 90" fill="rgba(153, 69, 228, 0.1)" stroke="#9945E8" strokeWidth="1.5" />

                                            {/* Left Weight Indicator (Token A Reserve) */}
                                            <g transform="translate(75, 84)">
                                                <circle r="9" fill="#14F195" opacity="0.9" />
                                                <text textAnchor="middle" y="3" fontSize="8" fontWeight="bold" fill="#000">A</text>
                                            </g>

                                            {/* Right Weight Indicator (Token B Reserve) */}
                                            <g transform="translate(325, 84)">
                                                <circle r="9" fill="#9945E8" opacity="0.9" />
                                                <text textAnchor="middle" y="3" fontSize="8" fontWeight="bold" fill="#FFF">B</text>
                                            </g>
                                        </g>
                                    </svg>

                                    {/* Indicator details under plates */}
                                    <div className="absolute inset-x-0 bottom-0 flex justify-between px-6 text-[10px] font-mono font-extrabold uppercase tracking-wide">
                                        <div className="text-sol-green text-left">
                                            <div>{viewingPool.tokenA.symbol} Reserve</div>
                                            <div className="text-white text-xs mt-0.5">{simResA.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                                        </div>
                                        <div className="text-sol-purple text-right">
                                            <div>{viewingPool.tokenB.symbol} Reserve</div>
                                            <div className="text-white text-xs mt-0.5">{simResB.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dynamic Fill Balance Bar */}
                                <div className="w-full mt-2">
                                    <div className="h-2 w-full rounded-full bg-white/5 flex overflow-hidden border border-white/5">
                                        <div 
                                            style={{ width: `${ratioShift * 100}%`, transition: 'width 0.25s ease' }} 
                                            className="h-full bg-sol-green shadow-[0_0_8px_rgba(20,241,149,0.5)]" 
                                        />
                                        <div 
                                            style={{ width: `${(1 - ratioShift) * 100}%`, transition: 'width 0.25s ease' }} 
                                            className="h-full bg-sol-purple shadow-[0_0_8px_rgba(153,69,228,0.5)]" 
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] text-surface-500 font-bold uppercase mt-1 px-1">
                                        <span>{Math.round(ratioShift * 100)}% {viewingPool.tokenA.symbol}</span>
                                        <span>{Math.round((1 - ratioShift) * 100)}% {viewingPool.tokenB.symbol}</span>
                                    </div>
                                </div>
                            </div>

                            {/* DYNAMIC SWAP SIMULATOR CONTROLS */}
                            <div className="bg-black/25 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 text-left">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                        <ArrowLeftRight size={13} className="text-brand-500" />
                                        AMM Price Impact & Swap Simulator
                                    </span>
                                    
                                    {/* Swap Direction Toggle */}
                                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5 text-[10px] font-bold">
                                        <button 
                                            onClick={() => {
                                                setSimSwapDirection('A_to_B');
                                                setSimSwapAmount(0);
                                            }}
                                            className={`px-2.5 py-1 rounded-md transition-colors ${simSwapDirection === 'A_to_B' ? 'bg-sol-green text-black' : 'text-surface-400 hover:text-white'}`}
                                        >
                                            Sell {viewingPool.tokenA.symbol}
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSimSwapDirection('B_to_A');
                                                setSimSwapAmount(0);
                                            }}
                                            className={`px-2.5 py-1 rounded-md transition-colors ${simSwapDirection === 'B_to_A' ? 'bg-sol-purple text-white' : 'text-surface-400 hover:text-white'}`}
                                        >
                                            Sell {viewingPool.tokenB.symbol}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold text-surface-500 px-0.5">
                                        <span>Simulate Input Amount</span>
                                        <span className="font-mono text-white">
                                            {simSwapAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {simSwapDirection === 'A_to_B' ? viewingPool.tokenA.symbol : viewingPool.tokenB.symbol}
                                        </span>
                                    </div>
                                    
                                    <input 
                                        type="range"
                                        min="0"
                                        max={simSwapDirection === 'A_to_B' ? resA * 0.5 : resB * 0.5}
                                        step={simSwapDirection === 'A_to_B' ? resA * 0.005 : resB * 0.005}
                                        value={simSwapAmount}
                                        onChange={(e) => setSimSwapAmount(Number(e.target.value))}
                                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/10 accent-brand-500 focus:outline-none"
                                    />
                                    
                                    <div className="flex justify-between text-[9px] text-surface-500 font-bold uppercase px-0.5">
                                        <span>0.00</span>
                                        <span>Max Simulation (50% of Pool)</span>
                                    </div>
                                </div>

                                {simSwapAmount > 0 ? (
                                    <div className="grid grid-cols-2 gap-3 bg-black/35 p-3.5 rounded-xl border border-white/5 text-xs font-medium animate-in fade-in zoom-in-95 duration-200">
                                        <div className="space-y-1">
                                            <span className="text-surface-500">You Will Receive</span>
                                            <div className="font-mono font-extrabold text-white text-sm">
                                                {outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {simSwapDirection === 'A_to_B' ? viewingPool.tokenB.symbol : viewingPool.tokenA.symbol}
                                            </div>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <span className="text-surface-500">Price Impact</span>
                                            <div className={`font-mono font-extrabold text-sm ${priceImpact < 1 ? 'text-sol-green' : priceImpact < 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {priceImpact.toFixed(3)}%
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 text-xs text-surface-500">
                                        <Info size={14} className="text-brand-500 flex-shrink-0" />
                                        <span>Drag the slider to simulate swaps and view real-time balance tilts, output amounts, and AMM price impact!</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* TOAST CONTAINER */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 duration-300">
                    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
                </div>
            )}
        </div>
    );
};
