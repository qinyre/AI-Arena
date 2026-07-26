import { useState } from 'react';
import CreateGame from './components/CreateGame';
import GameView from './components/GameView';
import GameHistory from './components/GameHistory';
import Stats from './components/Stats';
import Settings from './components/Settings';

function App() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'view' | 'history' | 'settings'>('create');

  const handleGameCreated = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  const handleViewGame = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  return (
    <div className="min-h-screen bg-[#031427] text-[#d3e4fe]">
      {/* Header */}
      <header className="bg-[#0b1c30]/80 backdrop-blur-sm border-b border-[#47464b]/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 面具图标：贴合 Nocturne Stage 面具剧场主题 */}
              <span
                className="material-symbols-outlined text-[34px]"
                style={{ color: '#e9c400', textShadow: '0 0 18px rgba(233,196,0,0.45)' }}
              >
                theater_comedy
              </span>
              <div>
                <h1
                  className="font-display text-3xl font-semibold"
                  style={{
                    background: 'linear-gradient(90deg, #ffe16d 0%, #e9c400 50%, #eb2445 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  AI Arena
                </h1>
                <p className="text-[#c8c5cb] text-xs mt-0.5 font-label tracking-wider uppercase">
                  面具剧场 · 5人狼人杀 AI 对战
                </p>
              </div>
            </div>
            <Stats />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-[#0b1c30]/60 border-b border-[#47464b]/20">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 font-label text-sm tracking-wide transition-colors border-b-2 ${
                activeTab === 'create'
                  ? 'text-[#ffe16d] border-[#e9c400] bg-[#e9c400]/5'
                  : 'text-[#c8c5cb] hover:text-[#d3e4fe] border-transparent hover:bg-[#1b2b3f]/40'
              }`}
            >
              创建游戏
            </button>
            <button
              onClick={() => setActiveTab('view')}
              disabled={!currentGameId}
              className={`px-6 py-3 font-label text-sm tracking-wide transition-colors border-b-2 ${
                activeTab === 'view'
                  ? 'text-[#ffe16d] border-[#e9c400] bg-[#e9c400]/5'
                  : 'text-[#c8c5cb] hover:text-[#d3e4fe] border-transparent hover:bg-[#1b2b3f]/40'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              当前游戏
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-label text-sm tracking-wide transition-colors border-b-2 ${
                activeTab === 'history'
                  ? 'text-[#ffe16d] border-[#e9c400] bg-[#e9c400]/5'
                  : 'text-[#c8c5cb] hover:text-[#d3e4fe] border-transparent hover:bg-[#1b2b3f]/40'
              }`}
            >
              历史记录
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`ml-auto flex items-center gap-1.5 px-5 py-3 font-label text-sm tracking-wide transition-colors border-b-2 ${
                activeTab === 'settings'
                  ? 'text-[#ffe16d] border-[#e9c400] bg-[#e9c400]/5'
                  : 'text-[#c8c5cb] hover:text-[#d3e4fe] border-transparent hover:bg-[#1b2b3f]/40'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">settings</span>
              设置
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'create' && <CreateGame onGameCreated={handleGameCreated} />}
        {activeTab === 'view' && currentGameId && <GameView gameId={currentGameId} />}
        {activeTab === 'history' && <GameHistory onViewGame={handleViewGame} />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#47464b]/20 mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-[#64748b] text-sm">
          <p>AI Arena v0.1.0 MVP — 让 AI 智能体在面具剧场中一决高下</p>
          <p className="mt-2 font-label tracking-wide">
            支持 DeepSeek / OpenAI / Anthropic / Gemini / Qwen / SiliconFlow / Ollama
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
