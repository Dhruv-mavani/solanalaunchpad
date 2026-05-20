import { useState, useEffect, useRef } from "react";
import type { TokenData } from "../types/token";


type TokenSelectorProps = {
    selectedToken: TokenData | null;
    setSelectedToken: (token: TokenData) => void;
    excludeToken?: TokenData | null;
    isOpen: boolean;
    setIsOpen: (Open: boolean) => void;
    network: "devnet" | "mainnet-beta";
    tokens: TokenData[];


};

export const TokenSelector = ({
    selectedToken,
    setSelectedToken,
    excludeToken,
    isOpen,
    setIsOpen,
    tokens,
}: TokenSelectorProps) => {

    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {

        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {

            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }

        }

        document.addEventListener(
            "mousedown",
            handleClickOutside
        );

        return () => {
            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );
        };

    }, [isOpen, setIsOpen]);





    const filteredTokens = tokens.filter((token) => {

        const matchesSearch =
            token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
            token.name.toLowerCase().includes(searchTerm.toLowerCase());

        const isExcluded =
            excludeToken?.mint === token.mint;

        return matchesSearch && !isExcluded;

    });

    return (
        <div ref={dropdownRef} className="w-full relative">

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-4 rounded-xl bg-surface-800 border border-surface-700 text-white flex items-center justify-between"
            >

                {selectedToken ? (
                    <div className="flex items-center gap-3">

                        <img
                            src={
                                selectedToken.image?.trim()
                                    ? selectedToken.image
                                    : `https://ui-avatars.com/api/?name=${selectedToken.symbol || '?'}&background=111827&color=fff&rounded=true`
                            }
                            alt={selectedToken.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.onerror = null;
                                target.src = `https://ui-avatars.com/api/?name=${selectedToken.symbol || '?'}&background=111827&color=fff&rounded=true`;
                            }}
                        />

                        <div className="flex flex-col items-start">

                            <span className="font-semibold">
                                {selectedToken.symbol}
                            </span>

                            <span className="text-sm text-surface-400">
                                {selectedToken.name}
                            </span>

                        </div>

                    </div>
                ) : (
                    <span>Select Token</span>
                )}

            </button>

            {isOpen && (

                <div className="absolute left-0 mt-2 w-[320px] rounded-2xl bg-surface-900 border border-surface-700 overflow-hidden z-50 shadow-2xl">

                    <div className="p-3 border-b border-surface-700">

                        <input
                            type="text"
                            placeholder="Search token..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surface-800 border border-surface-700 rounded-xl p-3 text-white outline-none"
                        />

                    </div>

                    <div className="max-h-50 overflow-y-auto">

                        {filteredTokens.map((token) => (

                            <button
                                key={token.mint}
                                onClick={(e) => {

                                    e.stopPropagation();

                                    setSelectedToken(token);

                                    setIsOpen(false);

                                    setSearchTerm("");

                                }}
                                className="w-full p-4 hover:bg-surface-800 transition-colors flex items-center justify-between"
                            >

                                <div className="flex items-center gap-3">

                                    <img
                                        src={
                                            token.image?.trim()
                                                ? token.image
                                                : `https://ui-avatars.com/api/?name=${token.symbol || '?'}&background=111827&color=fff&rounded=true`
                                        }
                                        onError={(e) => {
                                            const target = e.currentTarget as HTMLImageElement;
                                            target.onerror = null;
                                            target.src = `https://ui-avatars.com/api/?name=${token.symbol || '?'}&background=111827&color=fff&rounded=true`;
                                        }}
                                        alt={token.symbol}
                                        className="w-8 h-8 rounded-full"
                                    />

                                    <div className="flex flex-col items-start">

                                        <span className="font-semibold text-white">
                                            {token.symbol}
                                        </span>

                                        <span className="text-sm text-surface-400">
                                            {token.name}
                                        </span>

                                    </div>
                                </div>
                                <div className="text-right min-w-[70px]">

                                    <span className="text-white font-medium">

                                        {token.balance.toFixed(2)}

                                    </span>

                                </div>

                            </button>

                        ))}
                    </div>

                </div>

            )}

        </div>
    );
};