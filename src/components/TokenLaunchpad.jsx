import { useState, useRef, useEffect } from 'react';
import {
    MINT_SIZE,
    TOKEN_PROGRAM_ID,
    createInitializeMintInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
    createTransferInstruction,
    createFreezeAccountInstruction,
    createThawAccountInstruction
} from '@solana/spl-token'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Keypair, SystemProgram, Transaction, PublicKey } from '@solana/web3.js'
import {
    createCreateMetadataAccountV3Instruction
} from "@metaplex-foundation/mpl-token-metadata";
import { Buffer } from 'buffer';
import { Toast } from './Toast';
import { 
    ShieldCheck, 
    Lock, 
    Unlock, 
    Copy, 
    ExternalLink, 
    Check, 
    AlertCircle, 
    RefreshCw, 
    X,
    Snowflake
} from 'lucide-react';

function getSafeIPFSUrl(url) {
    if (!url) return "";
    
    // 1. If it's a standard ipfs:// URI
    if (url.startsWith("ipfs://")) {
        return `https://cloudflare-ipfs.com/ipfs/${url.replace("ipfs://", "")}`;
    }
    
    // 2. If it contains pinata or ipfs.io gateways
    if (url.includes("gateway.pinata.cloud/ipfs/")) {
        return url.replace("https://gateway.pinata.cloud/ipfs/", "https://cloudflare-ipfs.com/ipfs/");
    }
    if (url.includes("ipfs.io/ipfs/")) {
        return url.replace("https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/");
    }
    
    // Return original url as fallback
    return url;
}

function SafeTokenImage({ src, alt, className }) {
    let ipfsHash = "";
    if (src) {
        if (src.startsWith("ipfs://")) {
            ipfsHash = src.replace("ipfs://", "");
        } else {
            const match = src.match(/\/ipfs\/([a-zA-Z0-9]+)/);
            if (match && match[1]) {
                ipfsHash = match[1];
            }
        }
    }

    const gateways = [];
    if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
        const secureSrc = src.startsWith("http://") ? src.replace("http://", "https://") : src;
        // Always try the original URL first - it's the most accurate and usually resolved instantly or cached by the browser
        gateways.push(secureSrc);
    }
    
    if (ipfsHash) {
        // High-resilience gateways that avoid "ipfs" ISP blocklists and rate limits
        gateways.push(`https://gateway.ipfscdn.io/ipfs/${ipfsHash}`);
        gateways.push(`https://ipfs.crossbell.io/ipfs/${ipfsHash}`);
        gateways.push(`https://ipfs.near.social/ipfs/${ipfsHash}`);
        gateways.push(`https://w3s.link/ipfs/${ipfsHash}`);
        gateways.push(`https://4everland.io/ipfs/${ipfsHash}`);
        gateways.push(`https://hardbin.com/ipfs/${ipfsHash}`);
        gateways.push(`https://cf-ipfs.com/ipfs/${ipfsHash}`);
        gateways.push(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
    }

    const [gatewayIndex, setGatewayIndex] = useState(0);
    const [hasError, setHasError] = useState(false);
    
    const currentSrc = gateways.length > 0 && gatewayIndex < gateways.length 
        ? gateways[gatewayIndex] 
        : src;
    
    const handleError = () => {
        if (gateways.length > 0 && gatewayIndex < gateways.length - 1) {
            setGatewayIndex(prev => prev + 1);
        } else {
            setHasError(true);
        }
    };
    
    if (!src || hasError) {
        return (
            <div className={`${className} bg-brand-500/10 border border-brand-500/20 flex items-center justify-center font-bold text-brand-400`}>
                {alt ? alt.slice(0, 2).toUpperCase() : "TK"}
            </div>
        );
    }
    
    return (
        <img 
            src={currentSrc} 
            alt={alt} 
            className={className} 
            onError={handleError}
        />
    );
}

async function pollSignatureStatus(connection, signature, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const status = await connection.getSignatureStatus(signature);
            const value = status?.value;
            if (value) {
                if (value.err) {
                    throw new Error(`Transaction failed on-chain: ${JSON.stringify(value.err)}`);
                }
                const statusStr = value.confirmationStatus;
                if (statusStr === 'confirmed' || statusStr === 'finalized') {
                    return true;
                }
            }
        } catch (err) {
            if (err.message && err.message.includes("Transaction failed on-chain")) {
                throw err;
            }
            console.warn("Polling signature error:", err);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return false;
}

export function TokenLaunchpad({ network = 'devnet' }) {
    const wallet = useWallet();
    const { connection } = useConnection();

    // Form State
    const [step, setStep] = useState(() => {
        const saved = localStorage.getItem('solana_launchpad_form_step');
        return saved ? parseInt(saved, 10) : 1;
    });
    const [formData, setFormData] = useState(() => {
        const saved = localStorage.getItem('solana_launchpad_form_data');
        return saved ? JSON.parse(saved) : {
            name: '',
            symbol: '',
            description: '',
            supply: '',
        };
    });
    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    // Created tokens & security state
    const [createdTokens, setCreatedTokens] = useState([]);
    const [revokingMintId, setRevokingMintId] = useState(null);
    const [revokingFreezeId, setRevokingFreezeId] = useState(null);
    const [securityError, setSecurityError] = useState({});

    // Dashboard Interactive States
    const [viewingToken, setViewingToken] = useState(null);
    const [mintAmountInput, setMintAmountInput] = useState('');
    const [isMintingReserves, setIsMintingReserves] = useState(false);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [transferAmountInput, setTransferAmountInput] = useState('');
    const [isDistributing, setIsDistributing] = useState(false);
    const [dashboardError, setDashboardError] = useState(null);
    const [freezeTargetAddress, setFreezeTargetAddress] = useState('');
    const [isFreezingThawing, setIsFreezingThawing] = useState(false);
    const [showTokensConsole, setShowTokensConsole] = useState(false);

    // Sync form inputs to local storage
    useEffect(() => {
        localStorage.setItem('solana_launchpad_form_step', step.toString());
    }, [step]);

    useEffect(() => {
        localStorage.setItem('solana_launchpad_form_data', JSON.stringify(formData));
    }, [formData]);

    async function handleMintReserves() {
        if (!wallet.publicKey || !connection || !viewingToken) return;
        if (!mintAmountInput || Number(mintAmountInput) <= 0) {
            setDashboardError("Please enter a valid mint amount.");
            return;
        }

        setIsMintingReserves(true);
        setDashboardError(null);

        try {
            const mintPubkey = new PublicKey(viewingToken.mint);
            const associatedToken = await getAssociatedTokenAddress(
                mintPubkey,
                wallet.publicKey,
                true
            );

            // Check SOL balance for transaction fees & rent exemption
            const solBalance = await connection.getBalance(wallet.publicKey);
            const solBalanceUi = solBalance / 1e9;
            const accountInfo = await connection.getAccountInfo(associatedToken);
            const requiredSol = accountInfo ? 0.0001 : 0.0021; // 0.002 SOL for ATA creation rent
            
            if (solBalanceUi < requiredSol) {
                throw new Error(`Insufficient SOL balance! You need at least ${requiredSol} SOL to pay for transaction fees and account rent, but you only have ${solBalanceUi.toFixed(4)} SOL. Please top up your wallet.`);
            }

            const transaction = new Transaction();
            if (!accountInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        wallet.publicKey,
                        associatedToken,
                        wallet.publicKey,
                        mintPubkey
                    )
                );
            }

            transaction.add(
                createMintToInstruction(
                    mintPubkey,
                    associatedToken,
                    wallet.publicKey,
                    Number(mintAmountInput) * Math.pow(10, 9)
                )
            );

            transaction.feePayer = wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;

            const signature = await wallet.sendTransaction(transaction, connection, {
                skipPreflight: true
            });
            const confirmed = await pollSignatureStatus(connection, signature);
            if (!confirmed) {
                throw new Error("Transaction confirmation timed out. Please check Solana Explorer to see if it went through.");
            }

            const updatedSupply = Number(viewingToken.supply) + Number(mintAmountInput);
            const updatedToken = { ...viewingToken, supply: updatedSupply };
            const savedTokensKey = `solana_launchpad_created_tokens_${wallet.publicKey.toBase58()}_${network}`;
            const updatedList = createdTokens.map(t => t.mint === viewingToken.mint ? updatedToken : t);
            
            localStorage.setItem(savedTokensKey, JSON.stringify(updatedList));
            setCreatedTokens(updatedList);
            setViewingToken(updatedToken);
            setMintAmountInput('');
            showToast(`Minted ${Number(mintAmountInput).toLocaleString()} more tokens successfully!`, "success");
        } catch (err) {
            console.error(err);
            setDashboardError(err?.message || "Failed to mint more reserves");
        } finally {
            setIsMintingReserves(false);
        }
    }

    async function handleDistributeTokens() {
        if (!wallet.publicKey || !connection || !viewingToken) return;
        if (!recipientAddress) {
            setDashboardError("Please enter a recipient wallet address.");
            return;
        }
        if (!transferAmountInput || Number(transferAmountInput) <= 0) {
            setDashboardError("Please enter a valid transfer amount.");
            return;
        }

        setIsDistributing(true);
        setDashboardError(null);

        try {
            const mintPubkey = new PublicKey(viewingToken.mint);
            const recipientPubkey = new PublicKey(recipientAddress);
            const sourceAccount = await getAssociatedTokenAddress(
                mintPubkey,
                wallet.publicKey,
                true
            );
            // Fetch recipient account info to see if they provided a token account (ATA) directly
            const recipientInfo = await connection.getAccountInfo(recipientPubkey);
            const isAtaDirect = recipientInfo && (
                recipientInfo.owner.equals(TOKEN_PROGRAM_ID) || 
                recipientInfo.owner.equals(new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXt75mJR6"))
            );

            let destinationAccount;
            let destInfo;

            if (isAtaDirect) {
                destinationAccount = recipientPubkey;
                destInfo = recipientInfo;
            } else {
                destinationAccount = await getAssociatedTokenAddress(
                    mintPubkey,
                    recipientPubkey,
                    true
                );
                destInfo = await connection.getAccountInfo(destinationAccount);
            }

            // 1. Check SOL balance for transaction fees & rent exemption
            const solBalance = await connection.getBalance(wallet.publicKey);
            const solBalanceUi = solBalance / 1e9;
            const requiredSol = destInfo ? 0.0001 : 0.0021; // 0.002 SOL for ATA creation rent
            
            if (solBalanceUi < requiredSol) {
                throw new Error(`Insufficient SOL balance! You need at least ${requiredSol} SOL to pay for transaction fees and account rent, but you only have ${solBalanceUi.toFixed(4)} SOL. Please top up your wallet.`);
            }

            // 2. Check token balance
            let sourceBalance = 0;
            try {
                const balanceResponse = await connection.getTokenAccountBalance(sourceAccount);
                sourceBalance = balanceResponse.value.uiAmount || 0;
            } catch (balanceErr) {
                sourceBalance = 0;
            }

            if (sourceBalance < Number(transferAmountInput)) {
                throw new Error(`Insufficient token balance! Your wallet only holds ${sourceBalance.toLocaleString()} ${viewingToken.symbol}, but you are trying to send ${Number(transferAmountInput).toLocaleString()} ${viewingToken.symbol}. Please mint more reserves first.`);
            }

            const transaction = new Transaction();
            // If they provided a standard SOL wallet address and the ATA doesn't exist, create it
            if (!isAtaDirect && !destInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        wallet.publicKey,
                        destinationAccount,
                        recipientPubkey,
                        mintPubkey
                    )
                );
            }

            transaction.add(
                createTransferInstruction(
                    sourceAccount,
                    destinationAccount,
                    wallet.publicKey,
                    Number(transferAmountInput) * Math.pow(10, 9)
                )
            );

            transaction.feePayer = wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;

            const signature = await wallet.sendTransaction(transaction, connection, {
                skipPreflight: true
            });
            const confirmed = await pollSignatureStatus(connection, signature);
            if (!confirmed) {
                throw new Error("Transaction confirmation timed out. Please check Solana Explorer to see if it went through.");
            }

            setTransferAmountInput('');
            setRecipientAddress('');
            showToast(`Transferred ${Number(transferAmountInput).toLocaleString()} tokens successfully!`, "success");
        } catch (err) {
            console.error(err);
            setDashboardError(err?.message || "Failed to distribute tokens. Ensure target wallet is valid.");
        } finally {
            setIsDistributing(false);
        }
    }

    const handleFreezeThawAction = async (action) => {
        if (!wallet.publicKey || !viewingToken) return;
        setIsFreezingThawing(true);
        setDashboardError(null);

        try {
            let targetPublicKey;
            try {
                targetPublicKey = new PublicKey(freezeTargetAddress);
            } catch (err) {
                throw new Error("Invalid target wallet address. Please check and try again.");
            }

            // Resolve Associated Token Account (ATA)
            const targetAta = await getAssociatedTokenAddress(
                new PublicKey(viewingToken.mint),
                targetPublicKey,
                true
            );

            const transaction = new Transaction();

            if (action === 'freeze') {
                transaction.add(
                    createFreezeAccountInstruction(
                        targetAta,
                        new PublicKey(viewingToken.mint),
                        wallet.publicKey
                    )
                );
            } else {
                transaction.add(
                    createThawAccountInstruction(
                        targetAta,
                        new PublicKey(viewingToken.mint),
                        wallet.publicKey
                    )
                );
            }

            const signature = await wallet.sendTransaction(transaction, connection, {
                skipPreflight: true
            });
            showToast(`${action === 'freeze' ? 'Freezing' : 'Thawing'} account transaction sent...`, "info");

            const confirmed = await pollSignatureStatus(connection, signature);
            if (!confirmed) {
                throw new Error("Transaction confirmation timed out. Please check Solana Explorer to see if it went through.");
            }

            showToast(`Account successfully ${action === 'freeze' ? 'frozen' : 'thawed'}!`, "success");
            setFreezeTargetAddress('');
        } catch (err) {
            console.error("Freeze/Thaw failed:", err);
            setDashboardError(err.message || `Failed to execute ${action} transaction.`);
        } finally {
            setIsFreezingThawing(false);
        }
    };

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    const [toast, setToast] = useState(null);
    const [successData, setSuccessData] = useState(null);

    // Load created tokens
    useEffect(() => {
        if (!wallet.publicKey) {
            setCreatedTokens([]);
            return;
        }
        const savedTokensKey = `solana_launchpad_created_tokens_${wallet.publicKey.toBase58()}_${network}`;
        const existingTokensStr = localStorage.getItem(savedTokensKey);
        if (existingTokensStr) {
            try {
                setCreatedTokens(JSON.parse(existingTokensStr));
            } catch (e) {
                console.error(e);
                setCreatedTokens([]);
            }
        } else {
            setCreatedTokens([]);
        }
    }, [wallet.publicKey, network]);

    async function handleRevokeAuthority(tokenMintStr, type) {
        if (!wallet.publicKey || !connection) {
            showToast("Please connect your wallet first", "error");
            return;
        }

        const isMint = type === 'mint';
        const setAction = isMint ? setRevokingMintId : setRevokingFreezeId;
        
        setAction(tokenMintStr);
        setSecurityError(prev => {
            const copy = { ...prev };
            delete copy[tokenMintStr];
            return copy;
        });

        try {
            const mintPublicKey = new PublicKey(tokenMintStr);
            
            const transaction = new Transaction().add(
                createSetAuthorityInstruction(
                    mintPublicKey,
                    wallet.publicKey,
                    isMint ? AuthorityType.MintTokens : AuthorityType.FreezeAccount,
                    null
                )
            );

            transaction.feePayer = wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;

            const signature = await wallet.sendTransaction(transaction, connection, {
                skipPreflight: true
            });
            const confirmed = await pollSignatureStatus(connection, signature);
            if (!confirmed) {
                throw new Error("Transaction confirmation timed out. Please check Solana Explorer to see if it went through.");
            }

            const savedTokensKey = `solana_launchpad_created_tokens_${wallet.publicKey.toBase58()}_${network}`;
            const updated = createdTokens.map(token => {
                if (token.mint === tokenMintStr) {
                    const nextToken = {
                        ...token,
                        mintAuthority: isMint ? null : token.mintAuthority,
                        freezeAuthority: !isMint ? null : token.freezeAuthority
                    };
                    if (viewingToken && viewingToken.mint === tokenMintStr) {
                        setViewingToken(nextToken);
                    }
                    return nextToken;
                }
                return token;
            });

            localStorage.setItem(savedTokensKey, JSON.stringify(updated));
            setCreatedTokens(updated);
            showToast(`${isMint ? 'Mint' : 'Freeze'} Authority Revoked successfully!`, "success");
        } catch (err) {
            console.error("Revoke failed:", err);
            const errorMsg = err?.message || "Authority revocation failed";
            setSecurityError(prev => ({
                ...prev,
                [tokenMintStr]: errorMsg
            }));
            if (viewingToken && viewingToken.mint === tokenMintStr) {
                setDashboardError(errorMsg);
            }
        } finally {
            setAction(null);
        }
    }

    const fileInputRef = useRef(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0] || e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            showToast('Please upload a valid image file', 'error');
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const nextStep = () => {
        if (step === 1 && (!formData.name || !formData.symbol)) {
            showToast('Name and Symbol are required', 'error');
            return;
        }
        if (step === 2 && !imageFile) {
            showToast('Token image is required', 'error');
            return;
        }
        if (step === 3 && (!formData.supply || isNaN(formData.supply) || Number(formData.supply) <= 0)) {
            showToast('Please enter a valid supply greater than 0', 'error');
            return;
        }
        setStep(s => Math.min(s + 1, 3));
    };

    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    async function createToken() {
        if (!wallet.publicKey || !connection) {
            showToast("Please connect your wallet first", 'error');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingMsg('Generating Mint Keypair...');

            const mintKeypair = Keypair.generate();
            const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

            setLoadingMsg('Preparing Transaction...');
            const transaction = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: MINT_SIZE,
                    lamports: lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(
                    mintKeypair.publicKey,
                    9, // decimals
                    wallet.publicKey,
                    wallet.publicKey
                )
            );

            const associatedToken = await getAssociatedTokenAddress(
                mintKeypair.publicKey,
                wallet.publicKey,
                true
            );

            transaction.add(createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                associatedToken,
                wallet.publicKey,
                mintKeypair.publicKey
            ));

            transaction.add(createMintToInstruction(
                mintKeypair.publicKey,
                associatedToken,
                wallet.publicKey,
                Number(formData.supply) * Math.pow(10, 9)
            ));

            // Upload Image
            setLoadingMsg('Uploading Image to IPFS...');
            const pinataFormData = new FormData();
            pinataFormData.append("file", imageFile);

            const imageUploadResponse = await fetch(
                "https://api.pinata.cloud/pinning/pinFileToIPFS",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`
                    },
                    body: pinataFormData
                }
            );

            if (!imageUploadResponse.ok) throw new Error("Image upload failed");
            const imageUploadJSON = await imageUploadResponse.json();
            const imageURI = `https://gateway.pinata.cloud/ipfs/${imageUploadJSON.IpfsHash}`;

            // Upload Metadata
            setLoadingMsg('Uploading Metadata to IPFS...');
            const metadata = {
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                image: imageURI
            };

            const response = await fetch(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`
                    },
                    body: JSON.stringify(metadata)
                }
            );

            if (!response.ok) throw new Error("Metadata upload failed");
            const json = await response.json();
            const metadataURI = `https://gateway.pinata.cloud/ipfs/${json.IpfsHash}`;

            setLoadingMsg('Adding Metadata Instruction...');
            const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
            const metadataPDA = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    METADATA_PROGRAM_ID.toBuffer(),
                    mintKeypair.publicKey.toBuffer(),
                ],
                METADATA_PROGRAM_ID
            )[0];

            transaction.add(
                createCreateMetadataAccountV3Instruction(
                    {
                        metadata: metadataPDA,
                        mint: mintKeypair.publicKey,
                        mintAuthority: wallet.publicKey,
                        payer: wallet.publicKey,
                        updateAuthority: wallet.publicKey,
                    },
                    {
                        createMetadataAccountArgsV3: {
                            data: {
                                name: formData.name,
                                symbol: formData.symbol,
                                uri: metadataURI,
                                sellerFeeBasisPoints: 0,
                                creators: null,
                                collection: null,
                                uses: null,
                            },
                            isMutable: true,
                            collectionDetails: null,
                        },
                    }
                )
            );

            setLoadingMsg('Awaiting Signature...');
            transaction.feePayer = wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            transaction.partialSign(mintKeypair);

            const signature = await wallet.sendTransaction(transaction, connection);

            setLoadingMsg('Confirming Transaction on network...');
            const confirmed = await pollSignatureStatus(connection, signature);
            if (!confirmed) {
                throw new Error("Transaction confirmation timed out. Please check Solana Explorer to see if it went through.");
            }

            // Success
            const newCreatedToken = {
                mint: mintKeypair.publicKey.toBase58(),
                name: formData.name,
                symbol: formData.symbol,
                image: imageURI || "",
                decimals: 9,
                supply: Number(formData.supply),
                mintAuthority: wallet.publicKey.toBase58(),
                freezeAuthority: wallet.publicKey.toBase58(),
                signature,
                network,
                createdAt: Date.now()
            };

            const savedTokensKey = `solana_launchpad_created_tokens_${wallet.publicKey.toBase58()}_${network}`;
            const existingTokensStr = localStorage.getItem(savedTokensKey);
            let createdTokensList = existingTokensStr ? JSON.parse(existingTokensStr) : [];
            createdTokensList.unshift(newCreatedToken);
            localStorage.setItem(savedTokensKey, JSON.stringify(createdTokensList));
            setCreatedTokens(createdTokensList);

            setSuccessData({
                address: mintKeypair.publicKey.toBase58(),
                signature
            });
            showToast("Token created successfully!", "success");

        } catch (err) {
            console.error(err);
            showToast(err?.message || "Token creation failed", "error");
        } finally {
            setIsLoading(false);
        }
    }

    const resetForm = () => {
        setStep(1);
        setFormData({ name: '', symbol: '', description: '', supply: '' });
        setImageFile(null);
        setPreviewUrl(null);
        setSuccessData(null);
        localStorage.removeItem('solana_launchpad_form_step');
        localStorage.removeItem('solana_launchpad_form_data');
    };

    // UI Helper for Input classes
    const inputClasses = "w-full bg-surface-100/0 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-xl px-4 py-3 text-surface-500/100 dark:text-white placeholder-surface-400 dark:placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow";

    if (successData) {
        return (
            <div className="glass rounded-3xl p-8 shadow-xl text-center border-t-4 border-t-success animate-slide-in-right relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-success to-transparent"></div>
                     
                <div className="w-16 h-16 mx-auto bg-success/20 text-success rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 className="text-2xl font-bold mb-2 text-gray-500">Token Launched!</h3>
                <p className="text-surface-600 dark:text-surface-100 mb-6">Your token is live on the Solana {network === 'devnet' ? 'Devnet' : 'Mainnet'}.</p>

                <div className="bg-surface-100 dark:bg-surface-900/50 p-4 rounded-xl mb-6 border border-transparent dark:border-surface-700 text-left space-y-3">
                    <div>
                        <p className="text-[10px] text-surface-500 font-bold uppercase tracking-wider mb-1">Mint Address</p>
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-mono text-xs break-all text-surface-700 dark:text-white leading-relaxed">{successData.address}</p>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(successData.address);
                                    showToast("Address copied!", "success");
                                }}
                                className="p-2 bg-white dark:bg-surface-800 rounded-lg shadow-sm hover:scale-105 transition-transform flex-shrink-0"
                            >
                                <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div className="border-t border-surface-200 dark:border-surface-850 pt-2.5 flex justify-between items-center text-xs">
                        <span className="text-surface-500 font-bold uppercase tracking-wider text-[10px]">Total Supply</span>
                        <span className="font-extrabold text-gray-500 dark:text-white font-mono">{Number(formData.supply).toLocaleString()} {formData.symbol}</span>
                    </div>
                </div>

                <div className="flex gap-3 justify-center flex-wrap">
                    <a
                        href={`https://explorer.solana.com/address/${successData.address}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-5 py-3 bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-white rounded-xl font-medium hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors text-sm"
                    >
                        View on Explorer
                    </a>
                    <button
                        onClick={() => {
                            const newLaunchedToken = {
                                mint: successData.address,
                                name: formData.name,
                                symbol: formData.symbol,
                                description: formData.description,
                                supply: Number(formData.supply),
                                image: previewUrl,
                                mintAuthority: wallet.publicKey.toBase58(),
                                freezeAuthority: wallet.publicKey.toBase58(),
                                signature: successData.signature || 'created',
                                network,
                                createdAt: Date.now()
                            };
                            setViewingToken(newLaunchedToken);
                            resetForm();
                        }}
                        className="px-5 py-3 bg-gradient-to-r from-brand-600 to-sol-purple text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-500/20 text-sm"
                    >
                        Manage Dashboard
                    </button>
                    <button
                        onClick={resetForm}
                        className="px-5 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-medium hover:bg-white/10 transition-colors text-sm"
                    >
                        Create Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-12 relative animate-slide-in-right">
            {toast && (
                <div className="absolute -top-16 left-0 right-0 z-50 flex justify-center">
                    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
                </div>
            )}

            {/* Top Layout Grid: Side-by-side Hero Section & Creation Form */}
            <div className="w-full flex flex-col lg:flex-row gap-12 items-center justify-center">
                
                {/* Hero / Copy Section */}
                <div className="flex-1 text-center lg:text-left space-y-8">
                    <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-gray-500">
                        Launch your <span className="text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-sol-purple dark:to-brand-300">SPL Token</span> in minutes.
                    </h2>
                    <p className="text-xl text-gray-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                        The most advanced token launchpad on Solana. Define tokenomics, upload metadata, and deploy in seconds - no coding required.
                    </p>
                    <div className="flex flex-wrap gap-6 justify-center lg:justify-start pt-4">
                        {[
                            { label: 'Instant Minting', icon: 'M5 13l4 4L19 7' },
                            { label: 'IPFS Metadata', icon: 'M5 13l4 4L19 7' },
                            { label: 'Secure & Verified', icon: 'M5 13l4 4L19 7' }
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2.5 text-sm font-bold text-surface-700 dark:text-surface-400">
                                <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={item.icon}></path>
                                    </svg>
                                </div>
                                {item.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Creation Form Column */}
                <div className="w-full max-w-md flex-shrink-0 relative">
                    <div className="glass rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">

                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-surface-900/80 backdrop-blur-md z-40 flex flex-col items-center justify-center rounded-3xl transition-all">
                        <div className="w-16 h-16 border-4 border-brand-200 dark:border-brand-800 border-t-brand-500 rounded-full animate-spin mb-4"></div>
                        <p className="text-lg font-medium text-surface-900 dark:text-white mb-2">Creating Token</p>
                        <p className="text-sm text-surface-600 dark:text-surface-400 font-mono bg-surface-200/50 dark:bg-surface-800/50 px-3 py-1 rounded-full animate-pulse">{loadingMsg}</p>
                    </div>
                )}

                {/* Progress Indicator */}
                <div className="flex items-center justify-between mb-8 relative">
                    <div className="absolute left-0 right-0 top-1/2 h-1 bg-surface-200 dark:bg-surface-800 -z-10 rounded-full transform -translate-y-1/2"></div>
                    <div className="absolute left-0 top-1/2 h-1 bg-brand-500 -z-10 rounded-full transform -translate-y-1/2 transition-all duration-300" style={{ width: `${((step - 1) / 2) * 100}%` }}></div>

                    {[1, 2, 3].map(num => (
                        <div key={num} className={`w-8 h-8 rounded-full flex items-center justify-center font-medium transition-all duration-300 ${step >= num ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-surface-100 dark:bg-surface-900 text-surface-400 border border-surface-200 dark:border-surface-700'
                            }`}>
                            {step > num ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg> : num}
                        </div>
                    ))}
                </div>

                <div className="min-h-[300px]">
                    {/* STEP 1: Identity */}
                    {step === 1 && (
                        <div className="space-y-5 animate-slide-in-right">
                            <h3 className="text-xl font-bold text-gray-500">Token Identity</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-500">Token Name *</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Solana Launchpad Token" className={inputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Symbol *</label>
                                    <input type="text" name="symbol" value={formData.symbol} onChange={handleInputChange} placeholder="e.g. SLT" className={inputClasses} maxLength={10} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Description *</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Describe your token's utility or vision..." className={`${inputClasses} resize-none h-24`} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Image */}
                    {step === 2 && (
                        <div className="space-y-5 animate-slide-in-right">
                            <h3 className="text-xl font-bold text-gray-500">Visual Identity</h3>

                            <div
                                className="border-2 border-dashed border-brand-300 dark:border-surface-600 rounded-2xl p-8 text-center bg-brand-50/50 dark:bg-surface-900/30 hover:bg-brand-50 dark:hover:bg-surface-600/0 transition-colors cursor-pointer relative group"
                                onDragOver={e => e.preventDefault()}
                                onDrop={handleImageDrop}
                                onClick={() => fileInputRef.current.click()}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageDrop}
                                    accept="image/*"
                                    className="hidden"
                                />

                                {previewUrl ? (
                                    <div className="relative inline-block">
                                        <img src={previewUrl} alt="Token preview" className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-surface-800 shadow-xl" />
                                        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-6">
                                        <div className="w-16 h-16 mx-auto bg-brand-100 dark:bg-brand-900/50 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        </div>
                                        <p className="text-surface-700 dark:text-surface-300 font-medium mb-1">Click to upload or drag and drop</p>
                                        <p className="text-sm text-surface-500">SVG, PNG, JPG or GIF (max. 5MB)</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Supply & Review */}
                    {step === 3 && (
                        <div className="space-y-6 animate-slide-in-right">
                            <h3 className="text-xl font-bold text-gray-500">Tokenomics & Review</h3>

                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1 ">Initial Supply *</label>
                                <input type="number" name="supply" value={formData.supply} onChange={handleInputChange} placeholder="e.g. 1000000" className={inputClasses} min="1" />
                                <p className="text-xs text-gray-500 mt-2">Tokens will be minted to your connected wallet.</p>
                            </div>

                            <div className="bg-surface-100/50 bg-surface-500/0 p-4 rounded-2xl border border-surface-200 dark:border-surface-800">
                                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Summary</h4>
                                <div className="flex items-center gap-4">
                                    <img src={previewUrl} alt="Token icon" className="w-12 h-12 rounded-full object-cover bg-surface-200 dark:bg-surface-700" />
                                    <div>
                                        <p className="font-bold text-gray-500">{formData.name} <span className="text-brand-500 bg-brand-100 dark:bg-surface-700 dark:text-brand-300 px-2 py-0.5 rounded text-xs ml-1">{formData.symbol}</span></p>
                                        <p className="text-sm text-gray-500">Supply: {Number(formData.supply || 0).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center gap-3 mt-8 pt-6 border-t border-surface-200 dark:border-surface-800">
                    {step > 1 && (
                        <button
                            onClick={prevStep}
                            className="px-6 py-3 rounded-xl font-medium text-surface-600 dark:text-surface-100 bg-surface-100 dark:bg-surface-900/50 border border-transparent dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors"
                        >
                            Back
                        </button>
                    )}

                    {step < 3 ? (
                        <button
                            onClick={nextStep}
                            className="flex-1 px-6 py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                        >
                            Continue
                        </button>
                    ) : (
                        <button
                            onClick={createToken}
                            disabled={isLoading}
                            className="flex-1 px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-brand-600 to-sol-purple hover:from-brand-700 hover:to-brand-600 transition-colors shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            Launch Token
                        </button>
                    )}
                </div>

            </div>
                </div>
            </div>

            {/* SECURITY & SAFE-LAUNCH CONSOLE TOGGLE */}
            {wallet.publicKey && createdTokens.length > 0 && (
                <div className="mt-8 flex justify-center animate-in fade-in duration-300">
                    <button
                        onClick={() => setShowTokensConsole(!showTokensConsole)}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border transition-all font-extrabold text-sm shadow-lg ${
                            showTokensConsole
                                ? 'bg-gradient-to-r from-brand-600 to-sol-purple text-white border-brand-500/20 shadow-brand-500/10'
                                : 'bg-white/5 hover:bg-white/10 text-brand-400 border-white/5 hover:border-white/10'
                        }`}
                    >
                        <ShieldCheck className="w-5 h-5 text-sol-green animate-pulse" />
                        <span>{showTokensConsole ? 'Hide Your Tokens' : 'View Your Tokens'}</span>
                        <span className="bg-brand-400/100 px-2 py-0.5 rounded-full text-xs font-bold text-white">
                            {createdTokens.length}
                        </span>
                    </button>
                </div>
            )}

            {/* SECURITY & SAFE-LAUNCH CONSOLE */}
            {wallet.publicKey && createdTokens.length > 0 && showTokensConsole && (
                <div className="mt-8 w-full text-left animate-in fade-in slide-in-from-bottom-5 duration-500">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-500 dark:text-white flex items-center gap-2">
                                <ShieldCheck className="text-sol-green w-6 h-6 animate-pulse" />
                                Your Created Tokens & Security Console
                            </h3>
                            <p className="text-xs text-surface-500 mt-1">Manage authorities, secure your tokenomics, and verify your launched SPL assets.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {createdTokens.map((token) => {
                            const isMintLocked = !token.mintAuthority;
                            const isFreezeLocked = !token.freezeAuthority;

                            return (
                                <div key={token.mint} className="glass rounded-3xl p-5 border border-black/5 dark:border-white/10 flex flex-col gap-4 relative overflow-hidden group shadow-lg">
                                    {/* Glass reflection glow */}
                                    <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-500 to-transparent"></div>

                                    {/* Token identity header */}
                                    <div className="flex items-center justify-between mt-1">
                                        <div className="flex items-center gap-3">
                                            {token.image ? (
                                                <SafeTokenImage src={token.image} alt={token.symbol} className="w-12 h-12 rounded-full object-cover border border-black/5 dark:border-white/10 shadow" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center font-bold text-brand-400 text-lg">
                                                    {token.symbol.slice(0, 2)}
                                                </div>
                                            )}
                                            <div>
                                                <h4 className="font-extrabold text-gray-500 dark:text-white flex items-center gap-1.5">
                                                    {token.name}
                                                    <span className="text-[10px] text-brand-400 font-mono bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/25">{token.symbol}</span>
                                                </h4>
                                                <p className="text-xs text-surface-500 font-medium mt-0.5">Supply: {token.supply.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Safety verification badge */}
                                        {isMintLocked && isFreezeLocked ? (
                                            <span className="text-[9px] font-bold text-sol-green bg-sol-green/10 border border-sol-green/20 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 mr-6">
                                                <ShieldCheck size={11} />
                                                Safe Launch
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 mr-6">
                                                <Unlock size={11} />
                                                Unsecured
                                            </span>
                                        )}
                                    </div>

                                    {/* Copyable address field */}
                                    <div className="bg-black/5 dark:bg-black/10 p-3 rounded-xl text-xs space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-surface-500 font-semibold">Mint Address</span>
                                            <div className="flex items-center gap-1.5 font-mono">
                                                <span className="text-gray-500 dark:text-surface-400 font-semibold">{token.mint.slice(0, 6)}...{token.mint.slice(-6)}</span>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(token.mint);
                                                        showToast("Address copied!", "success");
                                                    }}
                                                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded text-surface-500 transition-colors"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3-Column card Actions */}
                                    <div className="grid grid-cols-2 gap-3 mt-1">
                                        <button
                                            onClick={() => {
                                                setViewingToken(token);
                                                setDashboardError(null);
                                            }}
                                            className="py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-brand-600 to-sol-purple hover:opacity-90 shadow-md shadow-brand-500/10 transition-all flex items-center justify-center gap-1 text-xs"
                                        >
                                            <ShieldCheck size={13} />
                                            Manage Dashboard
                                        </button>
                                        <a
                                            href={`https://explorer.solana.com/address/${token.mint}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="py-2.5 rounded-xl font-bold text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-white bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-1 text-xs"
                                        >
                                            <ExternalLink size={13} />
                                            Explorer
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TOKEN MANAGER MODAL (THE TOKEN DASHBOARD) */}
            {viewingToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="relative w-full max-w-4xl glass rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row max-h-[90vh] md:max-h-none animate-in zoom-in-95 duration-200 text-left">
                        {/* LEFT PANEL: Branding & Visual Spin Coin */}
                        <div className="w-full md:w-2/5 bg-gradient-to-b from-brand-900/40 to-sol-purple/40 p-6 md:p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10 relative overflow-hidden flex-shrink-0">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-500/10 to-transparent blur-3xl"></div>
                            
                            {/* Glowing Slow Spinning 3D Coin representation */}
                            <div className="relative w-40 h-40 mb-6 group flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-500 via-sol-green to-sol-purple animate-spin-slow opacity-30 blur-md"></div>
                                <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-brand-600 to-sol-purple p-1 shadow-lg shadow-brand-500/20">
                                    <div className="w-full h-full rounded-full bg-surface-950 flex items-center justify-center overflow-hidden">
                                        {viewingToken.image ? (
                                            <SafeTokenImage src={viewingToken.image} alt={viewingToken.symbol} className="w-full h-full object-cover rounded-full" />
                                        ) : (
                                            <div className="text-4xl font-black text-brand-400 font-mono">
                                                {viewingToken.symbol.slice(0, 2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Token Identity details */}
                            <div className="text-center space-y-2 z-10 w-full px-2">
                                <h3 className="text-2xl font-black text-white flex items-center justify-center gap-2">
                                    {viewingToken.name}
                                    <span className="text-xs text-brand-500 font-mono bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/25">
                                        {viewingToken.symbol}
                                    </span>
                                </h3>
                                <p className="font-mono text-xs text-surface-300 font-semibold break-all bg-black/20 px-3 py-1 rounded-full border border-white/5 inline-block max-w-full">
                                    {viewingToken.mint}
                                </p>
                            </div>

                            {/* Trust score / Audit list */}
                            <div className="w-full mt-6 space-y-3 z-10">
                                <h5 className="text-[10px] uppercase font-bold text-white tracking-wider">Token Security Audit</h5>
                                <div className="space-y-2 text-xs font-semibold">
                                    <div className="flex justify-between items-center bg-black/10 p-2.5 rounded-xl">
                                        <span className="text-white">Total Supply</span>
                                        <span className="text-white font-extrabold font-mono">
                                            {Number(viewingToken.supply).toLocaleString()} {viewingToken.symbol}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-black/10 p-2.5 rounded-xl">
                                        <span className="text-white">Mint Authority</span>
                                        {!viewingToken.mintAuthority ? (
                                            <span className="text-sol-green flex items-center gap-1">
                                                <Lock size={12} /> Locked (Fixed)
                                            </span>
                                        ) : (
                                            <span className="text-amber-400 flex items-center gap-1">
                                                <Unlock size={12} /> Active (Risky)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center bg-black/10 p-2.5 rounded-xl">
                                        <span className="text-white">Freeze Authority</span>
                                        {!viewingToken.freezeAuthority ? (
                                            <span className="text-sol-green flex items-center gap-1">
                                                <Lock size={12} /> Revoked (Safe)
                                            </span>
                                        ) : (
                                            <span className="text-amber-400 flex items-center gap-1">
                                                <Unlock size={12} /> Active (Risky)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT PANEL: Interactive Management Deck */}
                        <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto max-h-[60vh] md:max-h-[85vh]">
                            {/* Close Modal button */}
                            <button 
                                onClick={() => {
                                    setViewingToken(null);
                                    setDashboardError(null);
                                    setMintAmountInput('');
                                    setRecipientAddress('');
                                    setTransferAmountInput('');
                                    setFreezeTargetAddress('');
                                }}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-surface-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div>
                                <h4 className="text-xl font-extrabold text-gray-500 dark:text-white">Token Management Suite</h4>
                                <p className="text-xs text-surface-500 mt-1">Manage permissions, mint additional reserves, or distribute token supply to recipients.</p>
                            </div>

                            {/* Tab 1: On-Chain Security Locks */}
                            <div className="glass p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3.5">
                                <h5 className="text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <ShieldCheck className="text-sol-green w-4 h-4" />
                                    1. Security & Authority Locks
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Mint Revoke */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Mint Authority</span>
                                        {!viewingToken.mintAuthority ? (
                                            <div className="w-full py-2.5 rounded-xl border border-sol-green/10 bg-sol-green/5 text-sol-green font-bold text-xs text-center flex items-center justify-center gap-1 shadow-[0_0_8px_rgba(20,241,149,0.05)]">
                                                <Lock size={12} /> Locked
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRevokeAuthority(viewingToken.mint, 'mint')}
                                                disabled={revokingMintId === viewingToken.mint}
                                                className="w-full py-2.5 rounded-xl border border-red-500/20 hover:border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-xs transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {revokingMintId === viewingToken.mint ? (
                                                    <RefreshCw size={12} className="animate-spin" />
                                                ) : (
                                                    <Unlock size={12} />
                                                )}
                                                Revoke Mint
                                            </button>
                                        )}
                                    </div>
                                    {/* Freeze Revoke */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">Freeze Authority</span>
                                        {!viewingToken.freezeAuthority ? (
                                            <div className="w-full py-2.5 rounded-xl border border-sol-green/10 bg-sol-green/5 text-sol-green font-bold text-xs text-center flex items-center justify-center gap-1 shadow-[0_0_8px_rgba(20,241,149,0.05)]">
                                                <Lock size={12} /> Revoked
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRevokeAuthority(viewingToken.mint, 'freeze')}
                                                disabled={revokingFreezeId === viewingToken.mint}
                                                className="w-full py-2.5 rounded-xl border border-red-500/20 hover:border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-xs transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {revokingFreezeId === viewingToken.mint ? (
                                                    <RefreshCw size={12} className="animate-spin" />
                                                ) : (
                                                    <Unlock size={12} />
                                                )}
                                                Revoke Freeze
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tab 2: Mint Additional Supply */}
                            <div className="glass p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                                <h5 className="text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <RefreshCw className="text-brand-400 w-4 h-4" />
                                    2. Mint Additional Reserves
                                </h5>
                                {!viewingToken.mintAuthority ? (
                                    <p className="text-xs text-surface-500 bg-black/5 dark:bg-black/10 p-3 rounded-xl border border-black/5 dark:border-white/5 font-semibold text-center">
                                        🔒 Supply is permanently fixed. Additional minting is disabled.
                                    </p>
                                ) : (
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <input 
                                                type="number"
                                                value={mintAmountInput}
                                                onChange={(e) => setMintAmountInput(e.target.value)}
                                                placeholder="Amount of tokens to mint"
                                                className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleMintReserves}
                                            disabled={isMintingReserves || !mintAmountInput}
                                            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            {isMintingReserves ? <RefreshCw size={12} className="animate-spin" /> : null}
                                            Mint More
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Tab 3: Token Distribution (Airdrop/Transfer) */}
                            <div className="glass p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                                <h5 className="text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <ExternalLink className="text-sol-purple w-4 h-4" />
                                    3. Token Distribution & Airdrop
                                </h5>
                                <div className="space-y-3">
                                    <input 
                                        type="text"
                                        value={recipientAddress}
                                        onChange={(e) => setRecipientAddress(e.target.value)}
                                        placeholder="Recipient Solana wallet address"
                                        className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    />
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <input 
                                                type="number"
                                                value={transferAmountInput}
                                                onChange={(e) => setTransferAmountInput(e.target.value)}
                                                placeholder="Amount to send"
                                                className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleDistributeTokens}
                                            disabled={isDistributing || !recipientAddress || !transferAmountInput}
                                            className="px-6 py-2.5 bg-gradient-to-r from-brand-600 to-sol-purple hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            {isDistributing ? <RefreshCw size={12} className="animate-spin" /> : null}
                                            Send Tokens
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Tab 4: Account Freeze & Thaw Controller */}
                            <div className="glass p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                                <h5 className="text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <Snowflake className="text-blue-400 w-4 h-4 animate-pulse" />
                                    4. Account Freeze & Thaw Controller
                                </h5>
                                {!viewingToken.freezeAuthority ? (
                                    <p className="text-xs text-surface-500 bg-black/5 dark:bg-black/10 p-3 rounded-xl border border-black/5 dark:border-white/5 font-semibold text-center">
                                        🔒 Freeze authority has been permanently revoked. Account locking is disabled.
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-xs text-surface-500 leading-normal">
                                            Holders of Freeze Authority can freeze individual user token accounts to block transfers, or thaw (unfreeze) them.
                                        </p>
                                        <input 
                                            type="text"
                                            value={freezeTargetAddress}
                                            onChange={(e) => setFreezeTargetAddress(e.target.value)}
                                            placeholder="User's Solana wallet address"
                                            className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                        />
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleFreezeThawAction('freeze')}
                                                disabled={isFreezingThawing || !freezeTargetAddress}
                                                className="flex-1 py-2.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                            >
                                                {isFreezingThawing ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                                                Freeze Account
                                            </button>
                                            <button
                                                onClick={() => handleFreezeThawAction('thaw')}
                                                disabled={isFreezingThawing || !freezeTargetAddress}
                                                className="flex-1 py-2.5 bg-sol-green/80 hover:bg-sol-green text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                            >
                                                {isFreezingThawing ? <RefreshCw size={12} className="animate-spin" /> : <Unlock size={12} />}
                                                Thaw Account
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal-wide clean wrapped error alerts */}
                            {dashboardError && (
                                <div className="w-full flex items-start gap-2 p-3.5 rounded-xl border bg-red-500/10 border-red-500/20 text-red-400 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 max-w-full overflow-hidden">
                                    <AlertCircle className="w-4.5 h-4.5 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 flex flex-col gap-0.5 min-w-0 overflow-hidden">
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard Action Error</span>
                                        <p className="text-xs font-semibold leading-relaxed break-words whitespace-pre-wrap overflow-hidden">{dashboardError}</p>
                                    </div>
                                    <button 
                                        onClick={() => setDashboardError(null)}
                                        className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}