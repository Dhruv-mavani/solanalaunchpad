import { Plus } from "lucide-react";

export const LiquidityPool = () => {
    return (
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-slide-in-right">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sol-green/10 border border-sol-green/20 text-sol-green text-sm font-bold uppercase tracking-widest">
                Development Mode
            </div>
            <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-gray-500">
                Liquidity <span className="text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-brand-500">Pool Builder</span>
            </h2>
            <p className="text-xl text-surface-600 dark:text-surface-300 max-w-2xl mx-auto leading-relaxed">
                This is where you will implement the liquidity pool creation logic. The UI and state are ready for your custom code.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-12">
                <div className="glass p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 group hover:border-sol-green/50 transition-all duration-300 cursor-not-allowed opacity-50">
                    <Plus size={32} className="text-sm font-bold opacity-50 text-gray-500"></Plus>
                    <span className="font-bold text-lg text-surface-400">Initialize Pool</span>
                </div>
                <div className="glass p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 group hover:border-sol-green/50 transition-all duration-300 cursor-not-allowed opacity-50">
                    <Plus size={32} className="text-sm font-bold opacity-50 text-gray-500"></Plus>
                    <span className="font-bold text-lg text-surface-400">Add Liquidity</span>
                </div>
            </div>
        </div>
    );
};
