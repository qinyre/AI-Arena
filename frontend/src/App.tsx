import { useState } from 'react';
import CreateGame from './components/CreateGame';
import GameView from './components/GameView';
import GameHistory from './components/GameHistory';
import Stats from './components/Stats';

function App() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'view' | 'history'>('create');

  const handleGameCreated = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  const handleViewGame = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                🎮 AI Arena
              </h1>
              <p className="text-gray-400 text-sm mt-1">5人狼人杀AI对战平台</p>
            </div>
            <Stats />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'create'
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              创建游戏
            </button>
            <button
              onClick={() => setActiveTab('view')}
              disabled={!currentGameId}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'view'
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              当前游戏
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              历史记录
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'create' && <CreateGame onGameCreated={handleGameCreated} />}
        {activeTab === 'view' && currentGameId && <GameView gameId={currentGameId} />}
        {activeTab === 'history' && <GameHistory onViewGame={handleViewGame} />}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-gray-400 text-sm">
          <p>AI Arena v0.1.0 MVP - 让AI智能体在狼人杀中一决高下</p>
          <p className="mt-2">支持 OpenAI / Anthropic / Ollama</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
