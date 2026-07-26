/**
 * 观战主页面:剧场环绕式布局(借鉴稿 Nocturne Stage)。
 * 顶栏(GameHeader) + [左玩家栏 | 中央时间线 | 右玩家栏]。
 * 对局复盘放在整个页面底部(三栏下方,页面级区块),不挤压三栏;
 * 整个页面可滚动,三栏保持固定高度内部滚动,复盘自然出现在页面下方。
 *
 * 玩家按 index 分两半环绕舞台。AI 推理不再常驻右栏,改为时间线事件内点击展开。
 * 数据由单一 hook useGameStream 提供(合并 status+events 轮询 + 聚合 derived)。
 * 上帝视角:开局即从 status.role_assignment 显示所有人身份。
 */
import { useState } from 'react';
import { useGameStream } from '../hooks/useGameStream';
import GameHeader from './game/GameHeader';
import PlayerTable from './game/PlayerTable';
import EventFeed from './game/EventFeed';
import ResultPanel from './game/ResultPanel';
import ActionCinematics from './game/ActionCinematics';

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
      <div className="glass-panel rounded-lg p-12 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#e9c400] animate-spin inline-block mb-3">
          progress_activity
        </span>
        <p className="font-body text-body-md text-[#c8c5cb]">连接对局...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-center gap-2 bg-[#eb2445]/10 border border-[#eb2445]/40 text-[#ffb3b3] px-4 py-3 rounded-md">
          <span className="material-symbols-outlined">error</span>
          <span className="font-body">{error}</span>
        </div>
      </div>
    );
  }

  // 玩家分两半:前一半左栏,后一半右栏(结束后仍保留,方便复盘)
  const mid = Math.ceil(players.length / 2);
  const leftPlayers = players.slice(0, mid);
  const rightPlayers = players.slice(mid);

  const isCompleted = status?.status === 'completed';

  return (
    <div className="flex flex-col gap-3">
      <ActionCinematics events={events} completed={isCompleted} />

      {/* 顶栏 */}
      <GameHeader gameId={gameId} status={status} />

      {/* 剧场环绕:左玩家栏 | 中央时间线 | 右玩家栏
          三栏固定高度、各自内部滚动,不被下方复盘挤压 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,2fr)_1fr] gap-4 h-[calc(100vh-180px)] min-h-[480px]">
        {/* 左栏:参与者(前一半) */}
        <aside className="glass-panel rounded-lg p-4 overflow-hidden hidden lg:flex flex-col">
          <PlayerTable
            players={leftPlayers}
            currentSpeaker={currentSpeaker}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={setSelectedPlayer}
            side="left"
          />
        </aside>

        {/* 中栏:事件时间线(主舞台) */}
        <main className="glass-panel rounded-lg p-4 overflow-hidden">
          <EventFeed events={events} rounds={rounds} status={status} />
        </main>

        {/* 右栏:参与者(后一半) */}
        <aside className="glass-panel rounded-lg p-4 overflow-hidden hidden lg:flex flex-col">
          <PlayerTable
            players={rightPlayers}
            currentSpeaker={currentSpeaker}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={setSelectedPlayer}
            side="right"
          />
        </aside>
      </div>

      {/* 对局复盘:整个页面底部,页面级区块。往下滚整个页面即可看到,不挤压三栏 */}
      {isCompleted && <ResultPanel result={result} status={status} />}
    </div>
  );
}
