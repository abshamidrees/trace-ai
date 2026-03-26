'use client'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#06060f] text-white px-4">
      <div className="text-center max-w-xl">
        <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-[#7f5af0] to-[#2dd4bf] bg-clip-text text-transparent">
          Trace AI
        </h1>
        <p className="text-2xl mb-8">Your tool is now LIVE on Vercel! 🚀</p>
        <p className="text-[#94a3b8]">
          Backend connected → <span className="font-mono text-[#2dd4bf]">https://trace-ai-production.up.railway.app</span>
        </p>
        <div className="mt-12 text-sm text-[#64748b]">
          Paste any wallet address below to test (once we restore the full page)
        </div>
      </div>
    </div>
  )
}