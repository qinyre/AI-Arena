import { useState } from 'react';
import CreateGame from './components/CreateGame';
import GameView from './components/GameView';
import GameHistory from './components/GameHistory';
import Stats from './components/Stats';
import Settings from './components/Settings';
import ArenaAnalytics from './components/ArenaAnalytics';
import SeriesArena from './components/SeriesArena';

type Tab = 'create' | 'series' | 'view' | 'history' | 'analytics' | 'settings';
const CURRENT_SERIES_KEY = 'ai-arena-current-series';

function App() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [currentSeriesId, setCurrentSeriesId] = useState<string | null>(() => (
    window.localStorage.getItem(CURRENT_SERIES_KEY)
  ));
  const [activeTab, setActiveTab] = useState<Tab>('create');

  const handleGameCreated = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  const handleViewGame = (gameId: string) => {
    setCurrentGameId(gameId);
    setActiveTab('view');
  };

  const handleSeriesCreated = (seriesId: string | null) => {
    setCurrentSeriesId(seriesId);
    if (seriesId) window.localStorage.setItem(CURRENT_SERIES_KEY, seriesId);
    else window.localStorage.removeItem(CURRENT_SERIES_KEY);
  };

  const tabClass = (tab: Tab) => (
    `nav-tab ${activeTab === tab ? 'is-active' : ''}`
  );

  return (
    <div className="app-shell">
      <header className="site-masthead">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-5 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="brand-seal shrink-0" aria-hidden="true">幕</div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="m-0 truncate font-display text-[25px] leading-none tracking-[0.02em] text-[#e6dfd2] sm:text-[30px]">
                  AI 狼人杀剧场
                </h1>
                <span className="hidden font-label text-[9px] tracking-[0.28em] text-[#b99758]/70 sm:inline">
                  NIGHT TRIBUNAL
                </span>
              </div>
              <p className="mt-1 truncate font-body text-[11px] tracking-[0.06em] text-[#aaa79f]/60">
                每个判断都留下痕迹，每张票都改变结局
              </p>
            </div>
          </div>
          <Stats />
        </div>
      </header>

      <nav className="site-nav">
        <div className="mx-auto flex max-w-[1600px] overflow-x-auto px-2 sm:px-4">
          <button type="button" onClick={() => setActiveTab('create')} className={tabClass('create')}>
            创建对局
          </button>
          <button type="button" onClick={() => setActiveTab('series')} className={tabClass('series')}>
            AI 赛事
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            disabled={!currentGameId}
            className={tabClass('view')}
          >
            当前对局
          </button>
          <button type="button" onClick={() => setActiveTab('history')} className={tabClass('history')}>
            对局档案
          </button>
          <button type="button" onClick={() => setActiveTab('analytics')} className={tabClass('analytics')}>
            模型排行
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`${tabClass('settings')} ml-auto`}
          >
            模型与性格
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'create' && <CreateGame onGameCreated={handleGameCreated} />}
        {activeTab === 'series' && (
          <SeriesArena
            seriesId={currentSeriesId}
            onSeriesCreated={handleSeriesCreated}
            onViewGame={handleViewGame}
          />
        )}
        {activeTab === 'view' && currentGameId && (
          <GameView gameId={currentGameId} onGameCreated={handleGameCreated} />
        )}
        {activeTab === 'history' && <GameHistory onViewGame={handleViewGame} />}
        {activeTab === 'analytics' && <ArenaAnalytics />}
        {activeTab === 'settings' && <Settings />}
      </main>

      <footer className="mt-14 border-t border-[#e6dfd2]/[0.07]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-6 py-6 text-[11px] text-[#aaa79f]/45 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display tracking-[0.12em]">AI ARENA · 面具审判场</span>
          <span className="font-body">夜晚行动、白昼陈词、放逐票型，完整留档。</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
