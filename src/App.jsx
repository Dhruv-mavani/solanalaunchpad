import { useState } from 'react'
import ActionDropdown from './ActionDropdown'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
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
  const [network, setNetwork] = useState('devnet')
  const [view, setView] = useState('create_token')

  return (
    <ConnectionProvider endpoint={clusterApiUrl(network)}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <div className="min-h-screen bg-gradient-animated flex flex-col font-sans text-surface-900 dark:text-white">

            {/* Top Navigation Bar */}
            <nav className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600 to-sol-purple flex items-center justify-center shadow-lg animate-pulse-glow">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <ActionDropdown onAction={(action) => setView(action)} />
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  onClick={() => setNetwork(n => n === 'devnet' ? 'mainnet-beta' : 'devnet')}
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
            <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
              {view === 'create_token' ? (
                <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-12 items-center justify-center animate-slide-in-right">
                  {/* Hero / Copy Section */}
                  <div className="flex-1 text-center lg:text-left space-y-8">

                    <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]  text-gray-500">
                      Launch your <span className="text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-sol-purple dark:to-brand-300">SPL Token</span> in minutes.
                    </h2>

                    <p className="text-xl text-gray-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                      The most advanced token launchpad on Solana. Define tokenomics, upload metadata, and deploy in seconds—no coding required.
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

                  {/* Launchpad Form Component */}
                  <div className="w-full max-w-md">
                    <TokenLaunchpad network={network} />
                  </div>
                </div>
              ) : (
                <LiquidityPool />
              )}

            </main>


            {/* Footer */}
            <footer className="py-6 text-center text-sm text-surface-500 dark:text-surface-400 border-t border-surface-200 dark:border-surface-800">
              <p>Built with 💜 for the 100xDevs Cohort</p>
            </footer>

          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default App
