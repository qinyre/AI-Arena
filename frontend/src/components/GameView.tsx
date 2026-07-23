/**
 * 观战主页面：三栏控制台布局。
 * 顶栏(GameHeader) + 左(玩家圆桌) | 中(事件流) | 右(AI推理) + 结果面板。
 *
 * 数据由单一 hook useGameStream 提供(合并 status+events 轮询 + 聚合 derived)。
 * 上帝视角：开局即从 status.role_assignment 显示所有人身份。
 */
import { useState } from 'react';
import { useGameStream } from '../hooks/useGameStream';
import GameHeader from './game/GameHeader';
import PlayerTable from './game/PlayerTable';
import EventFeed from './game/EventFeed';
import ReasoningSidebar from './game/ReasoningSidebar';
import ResultPanel from './game/ResultPanel';

interface Props {
  gameId: string;
}

export default function GameView({ gameId }: Props) {
  const { status, result, events, players, rounds, currentSpeaker, loading, error } =
    useGameStream(gameId);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // 首次加载
  if (loading && !status) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-gray-400">连接对局...</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <strong>错误:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = status?.status === 'completed';

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* 顶栏 */}
      <GameHeader gameId={gameId} status={status} />

      {/* 三栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-3 h-[calc(100vh-220px)] min-h-[500px]">
        {/* 左栏：玩家圆桌 */}
        <aside className="card p-4 overflow-y-auto custom-scrollbar">
          <PlayerTable
            players={players}
            currentSpeaker={currentSpeaker}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={setSelectedPlayer}
          />
        </aside>

        {/* 中栏：事件流(主视觉) */}
        <main className="card p-4 overflow-hidden">
          <EventFeed events={events} rounds={rounds} status={status} />
        </main>

        {/* 右栏：AI 推理 */}
        <aside className="card p-4 overflow-hidden">
          <ReasoningSidebar
            events={events}
            status={status}
            players={players}
            selectedPlayer={selectedPlayer}
            currentSpeaker={currentSpeaker}
          />
        </aside>
      </div>

      {/* 结果面板(结束后) */}
      {isCompleted && <ResultPanel result={result} status={status} />}
    </div>
  );
}
