import { useState } from 'react'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import {
  WalletModalProvider,
  WalletMultiButton,
} from '@solana/wallet-adapter-react-ui'
import { TokenLaunchpad } from './components/TokenLaunchpad'
import { LiquidityPool } from './components/LiquidityPool'
import { ThemeToggle } from './components/ThemeToggle'
import '@solana/wallet-adapter-react-ui/styles.css'
import { clusterApiUrl } from '@solana/web3.js'

function App() {
  const [network, setNetwork] = useState(() => localStorage.getItem('solana_launchpad_network') || 'devnet')
  const [view, setView] = useState(() => localStorage.getItem('solana_launchpad_view') || 'create_token')

  const handleSetNetwork = (nextValOrFn) => {
    const nextVal = typeof nextValOrFn === 'function' ? nextValOrFn(network) : nextValOrFn;
    setNetwork(nextVal);
    localStorage.setItem('solana_launchpad_network', nextVal);
  };

  const handleSetView = (nextVal) => {
    setView(nextVal);
    localStorage.setItem('solana_launchpad_view', nextVal);
  };

  const endpoint =
    network === "devnet"
      ? import.meta.env.VITE_ALCHEMY_DEVNET_RPC
      : import.meta.env.VITE_ALCHEMY_MAINNET_RPC;

  return (
    <ConnectionProvider endpoint={endpoint} config={{ disableWebSockets: true }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <MainAppContent
            network={network}
            handleSetNetwork={handleSetNetwork}
            view={view}
            handleSetView={handleSetView}
          />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

function MainAppContent({ network, handleSetNetwork, view, handleSetView }) {
  const { publicKey } = useWallet();

  return (
    <div className="min-h-screen bg-gradient-animated flex flex-col font-sans text-surface-900 dark:text-white">

      {/* Top Navigation Bar */}
      <nav className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600 to-sol-purple flex items-center justify-center shadow-lg animate-pulse-glow flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {publicKey && (
            <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-1 rounded-xl border border-surface-200 dark:border-white/5 backdrop-blur-md">
              <button
                onClick={() => handleSetView('create_token')}
                className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 ${
                  view === 'create_token'
                    ? 'bg-gradient-to-r from-brand-600 to-sol-purple text-white shadow-md'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-white/5'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden xs:inline">Token Dashboard</span>
                <span className="xs:hidden">Tokens</span>
              </button>
              <button
                onClick={() => handleSetView('liquidity')}
                className={`px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 ${
                  view === 'liquidity'
                    ? 'bg-gradient-to-r from-brand-600 to-sol-purple text-white shadow-md'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-white/5'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="hidden xs:inline">Liquidity Pools</span>
                <span className="xs:hidden">Pools</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => handleSetNetwork(n => n === 'devnet' ? 'mainnet-beta' : 'devnet')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-sm font-medium hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            <div className={`w-2 h-2 rounded-full ${network === 'devnet' ? 'bg-brand-500' : 'bg-success'} animate-pulse`}></div>
            <span className="hidden sm:inline font-bold">{network === 'devnet' ? 'Devnet' : 'Mainnet'}</span>
            <span className="sm:hidden font-bold">{network === 'devnet' ? 'Dev' : 'Main'}</span>
          </button>
          <ThemeToggle />
          <WalletMultiButton />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {!publicKey ? (
          /* STUNNING WALLET GATE SCREEN */
          <div className="max-w-4xl w-full flex flex-col items-center justify-center text-center space-y-12 animate-in fade-in zoom-in-95 duration-500 my-auto">
            {/* Pulsing neon shield/logo */}
            <div className="relative">
              <div className="absolute inset-0 bg-brand-500/20 blur-[120px] rounded-full"></div>
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-brand-600 to-sol-purple flex items-center justify-center shadow-[0_0_50px_rgba(153,50,204,0.3)] animate-bounce-slow">
                <svg className="w-12 h-12 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
              </div>
            </div>

            {/* Glowing Brand Copy */}
            <div className="space-y-4 max-w-2xl">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-brand-400 bg-brand-500/10 px-4 py-1.5 rounded-full border border-brand-500/20">
                Solana Safe-Launch Portal
              </span>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight">
                Access Token Launchpad & AMM Suite
              </h2>
              <p className="text-lg text-surface-600 dark:text-surface-400 leading-relaxed">
                Connect your Solana wallet to deploy verified tokens, lock mint/freeze authorities, establish AMM liquidity reserves, and simulate live pricing.
              </p>
            </div>

            {/* Dynamic Card Previews */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl text-left">
              {[
                {
                  title: "1. Create SPL Assets",
                  desc: "Configure name, symbol, supply, and upload visual identity to IPFS in three quick steps.",
                  color: "from-brand-500/10 to-brand-500/5 border-brand-500/20 text-brand-400"
                },
                {
                  title: "2. Lock Authorities",
                  desc: "Revoke Mint & Freeze permissions on-chain to rug-proof your coin and earn verified badges.",
                  color: "from-sol-green/10 to-sol-green/5 border-sol-green/20 text-sol-green"
                },
                {
                  title: "3. Establish Pools",
                  desc: "Initialize Constant Product pools and simulate dynamic swaps using live AMM physical levers.",
                  color: "from-sol-purple/10 to-sol-purple/5 border-sol-purple/20 text-sol-purple"
                }
              ].map((item, i) => (
                <div key={i} className="glass rounded-3xl p-5 border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent shadow-sm flex flex-col gap-2 hover:border-white/10 transition-colors">
                  <h4 className="font-extrabold text-white text-sm">{item.title}</h4>
                  <p className="text-xs text-surface-500 leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Glowing Big Button Container */}
            <div className="relative group scale-110">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-sol-purple rounded-2xl blur-lg opacity-60 group-hover:opacity-100 transition duration-300"></div>
              <div className="relative">
                <WalletMultiButton className="!bg-gradient-to-r !from-brand-500 !to-sol-purple hover:!scale-[1.02] !transition-all !duration-200 !rounded-2xl !py-4.5 !px-8 !h-auto !text-base !font-extrabold !shadow-xl !border-0" />
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED ACCESS */
          view === 'create_token' ? (
            <TokenLaunchpad network={network} />
          ) : (
            <LiquidityPool network={network} />
          )
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-surface-500 dark:text-surface-400 border-t border-surface-200 dark:border-surface-800">
        <p>Built with 💜 for the 100xDevs Cohort</p>
      </footer>

    </div>
  );
}

export default App
