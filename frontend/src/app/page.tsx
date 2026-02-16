import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-6 md:p-8 bg-[#0B0F0E]">
      {/* Hero Section */}
      <div className="text-center max-w-3xl animate-fadeIn">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#2EFF7B] mb-6 leading-tight">
          Intelligent Coding Agent
        </h1>
        <p className="text-lg md:text-xl text-[#8FAEA2] mb-8 max-w-2xl mx-auto">
          Your AI-powered coding assistant. Chat about code, analyze repositories,
          execute programs, and automate workflows — all from one place.
        </p>

        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-8 py-4 bg-[#2EFF7B] hover:bg-[#1ED760] text-[#0B0F0E] font-semibold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-[#2EFF7B]/20"
        >
          <span>Start Chatting</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-12 md:mt-16 w-full max-w-5xl">
        <FeatureCard
          icon="💬"
          title="AI Chat"
          description="Ask questions, get explanations, and generate code"
        />
        <FeatureCard
          icon="📁"
          title="Repository Intelligence"
          description="Upload repos and ask context-aware questions"
        />
        <FeatureCard
          icon="▶️"
          title="Code Execution"
          description="Run code safely in sandboxed environments"
        />
        <FeatureCard
          icon="⚙️"
          title="Task Automation"
          description="Automate workflows with scheduled tasks"
        />
      </div>

      {/* Footer Tag */}
      <div className="mt-16 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#111917] border border-[#1F2D28] rounded-full text-xs text-[#5A7268]">
          <span className="w-2 h-2 rounded-full bg-[#2EFF7B] animate-pulse" />
          Powered by Gemini AI
        </span>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-6 hover:border-[#2EFF7B]/50 transition-all group">
      <div className="w-12 h-12 rounded-xl bg-[#1A2420] flex items-center justify-center text-2xl mb-4 group-hover:bg-[#2EFF7B]/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-[#E6F1EC] mb-2">{title}</h3>
      <p className="text-sm text-[#5A7268]">{description}</p>
    </div>
  );
}
