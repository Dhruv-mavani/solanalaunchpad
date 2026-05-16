import { useState, useRef, useEffect } from 'react';

interface DropdownProps {
    onAction: (action: 'create_token' | 'create_liquidity_pool') => void;
}

const ActionDropdown: React.FC<DropdownProps> = ({ onAction }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (action: 'create_token' | 'create_liquidity_pool') => {
        onAction(action);
        setIsOpen(false);
    };

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center gap-2 px-5 py-2 rounded-xl font-semibold transition-all duration-300 cursor-pointer group w-full
                    ${isOpen
                        ? 'bg-brand-600 text-white shadow-[0_0_20px_rgba(118,40,247,0.4)] scale-[0.98]'
                        : 'bg-surface-100 dark:bg-white/10 hover:bg-surface-200 dark:hover:bg-white/20 text-surface-900 dark:text-white border border-surface-200 dark:border-white/10 hover:border-brand-500/50 hover:shadow-[0_4_12px_rgba(131,71,255,0.15)]'
                    }
                `}
            >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-sol-green to-sol-purple font-bold whitespace-nowrap">
                    Solana Launchpad
                </span>
                <svg
                    className={`w-4 h-4 transition-all duration-300 ${isOpen ? 'rotate-180 text-white' : 'text-surface-500 dark:text-surface-400 group-hover:text-brand-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-full origin-top-left glass rounded-2xl shadow-2xl z-50 overflow-hidden border border-surface-200 dark:border-white/10 animate-slide-in-right !bg-white/95 dark:!bg-surface-950/90 backdrop-blur-xl">

                    <div className="p-1.5 space-y-1" role="menu">
                        <button
                            onClick={() => handleSelect('create_token')}
                            className="group flex items-center gap-2.5 w-full p-2.5 text-left rounded-xl transition-all duration-200 hover:bg-surface-100 dark:hover:bg-white/10"
                        >
                            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-all duration-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-[13px] font-bold text-surface-950 dark:text-white leading-none whitespace-nowrap">Create SL Token</p>
                            </div>
                        </button>

                        <button
                            onClick={() => handleSelect('create_liquidity_pool')}
                            className="group flex items-center gap-2.5 w-full p-2.5 text-left rounded-xl transition-all duration-200 hover:bg-surface-100 dark:hover:bg-white/10"
                        >
                            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-sol-green/10 dark:bg-sol-green/20 flex items-center justify-center text-sol-green group-hover:bg-sol-green group-hover:text-black dark:group-hover:text-black transition-all duration-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-[13px] font-bold text-surface-950 dark:text-white leading-none whitespace-nowrap">Create Liquidity Pool</p>
                            </div>
                        </button>


                    </div>
                </div>
            )}
        </div>
    );
};

export default ActionDropdown;
