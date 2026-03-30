import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trace AI — Verifiable Wallet Intelligence',
  description: 'Trace the money. Expose the truth. AI-powered wallet analysis with OpenGradient TEE verification.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="dot-grid min-h-screen antialiased" style={{ background: '#06060f' }}>

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <header
          className="fixed top-0 left-0 right-0 z-50 px-5 py-3.5"
          style={{
            background: 'rgba(6,6,15,0.88)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid #1e1b3a',
          }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">

            {/* Logo */}
            <a href="/" className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg,#7f5af0,#5f3dc4)',
                  boxShadow: '0 0 18px rgba(127,90,240,0.4)',
                }}
              >
                {/* Magnifying glass icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4" stroke="white" strokeWidth="1.7" />
                  <line x1="9.8" y1="9.8" x2="13.5" y2="13.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-display font-bold text-white text-[17px] tracking-tight">
                Trace<span style={{ color: '#7f5af0' }}>AI</span>
              </span>
            </a>

            {/* TEE badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px]"
              style={{
                background: 'rgba(45,212,191,0.07)',
                border: '1px solid rgba(45,212,191,0.18)',
                color: '#2dd4bf',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: '#2dd4bf' }}
              />
              TEE Verified
            </div>
          </div>
        </header>

        <main>{children}</main>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer style={{ borderTop: '1px solid #1e1b3a', marginTop: 80, padding: '28px 24px' }}>
          <div
            className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-[12px]"
            style={{ color: '#475569' }}
          >
            <p>Trace AI — Read-only wallet analysis. No wallet connection required.</p>
            <p>
              AI runs on{' '}
              <a
                href="https://opengradient.ai"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#475569' }}
                className="hover:opacity-80 transition-opacity"
              >
                OpenGradient
              </a>
              {' '}with Trusted Execution Environment proofs.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}