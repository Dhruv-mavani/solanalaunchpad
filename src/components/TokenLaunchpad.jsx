import { useState, useRef } from 'react';
import {
    MINT_SIZE,
    TOKEN_PROGRAM_ID,
    createInitializeMintInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction
} from '@solana/spl-token'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Keypair, SystemProgram, Transaction, PublicKey } from '@solana/web3.js'
import {
    createCreateMetadataAccountV3Instruction
} from "@metaplex-foundation/mpl-token-metadata";
import { Buffer } from 'buffer';
import { Toast } from './Toast';

export function TokenLaunchpad({ network = 'devnet' }) {
    const wallet = useWallet();
    const { connection } = useConnection();

    // Form State
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        description: '',
        supply: '',
    });
    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    const [toast, setToast] = useState(null);
    const [successData, setSuccessData] = useState(null);

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
                wallet.publicKey
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
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.partialSign(mintKeypair);

            const signature = await wallet.sendTransaction(transaction, connection);

            setLoadingMsg('Confirming Transaction on network...');
            await connection.confirmTransaction(signature);

            // Success
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

                <div className="bg-surface-100 dark:bg-surface-900/50 p-4 rounded-xl mb-6 relative group border border-transparent dark:border-surface-700">
                    <p className="text-xs text-surface-500 dark:text-surface-300 font-medium mb-1 uppercase tracking-wider">Mint Address</p>
                    <p className="font-mono text-sm break-all dark:text-white">{successData.address}</p>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(successData.address);
                            showToast("Address copied!", "success");
                        }}
                        className="absolute top-4 right-4 p-2 bg-white dark:bg-surface-800 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>

                <div className="flex gap-4 justify-center">
                    <a
                        href={`https://explorer.solana.com/address/${successData.address}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-6 py-3 bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-white rounded-xl font-medium hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors"
                    >
                        View on Explorer
                    </a>
                    <button
                        onClick={resetForm}
                        className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                    >
                        Create Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full relative">
            {toast && (
                <div className="absolute -top-16 left-0 right-0 z-50 flex justify-center">
                    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
                </div>
            )}

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
    )
}