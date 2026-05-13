import { useState } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import {
  WalletModalProvider,
  WalletMultiButton,
} from '@solana/wallet-adapter-react-ui'
import { TokenLaunchpad } from './components/TokenLaunchpad'
import { ThemeToggle } from './components/ThemeToggle'
import '@solana/wallet-adapter-react-ui/styles.css'
import { clusterApiUrl } from '@solana/web3.js'

function App() {
  const [network, setNetwork] = useState('devnet')

  return (
    <ConnectionProvider endpoint={clusterApiUrl(network)}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <div className="min-h-screen bg-gradient-animated flex flex-col font-sans">

            {/* Top Navigation Bar */}
            {/* Top Navigation Bar */}
            <nav className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm transition-colors duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600 to-sol-purple flex items-center justify-center shadow-lg animate-pulse-glow">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-sol-purple hidden sm:block">
                  Solana Launchpad
                </h1>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  onClick={() => setNetwork(n => n === 'devnet' ? 'mainnet-beta' : 'devnet')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-sm font-medium hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-surface-900 dark:text-surface-50"
                >
                  <div className={`w-2 h-2 rounded-full ${network === 'devnet' ? 'bg-brand-500' : 'bg-success'} animate-pulse`}></div>
                  <span className="hidden sm:inline">{network === 'devnet' ? 'Devnet' : 'Mainnet'}</span>
                  <span className="sm:hidden">{network === 'devnet' ? 'Dev' : 'Main'}</span>
                </button>
                <ThemeToggle />
                <WalletMultiButton />
              </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
              <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-12 items-center justify-center">

                {/* Hero / Copy Section */}
                <div className="flex-1 text-center md:text-left space-y-6">
                  <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white">
                    Launch your <span className="text-transparent bg-clip-text bg-gradient-to-r from-sol-green to-sol-purple dark:to-brand-300">SPL Token</span> in minutes.
                  </h2>
                  <p className="text-lg text-surface-600 dark:text-surface-100 max-w-lg mx-auto md:mx-0">
                    No coding required. Define your tokenomics, upload your metadata, and deploy directly to the Solana network of your choice.
                  </p>

                  <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-surface-500 dark:text-surface-400">
                      <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                      Instant Minting
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-surface-500 dark:text-surface-400">
                      <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                      IPFS Metadata
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-surface-500 dark:text-surface-400">
                      <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"></path></svg>
                      Secure
                    </div>
                  </div>
                </div>

                {/* Launchpad Form Component */}
                <div className="w-full max-w-md animate-slide-in-right">
                  <TokenLaunchpad network={network} />
                </div>

              </div>
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
