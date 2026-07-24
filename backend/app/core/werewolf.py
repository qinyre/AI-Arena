"""
Werewolf Game Implementation
5-player minimal werewolf game: 1 werewolf, 1 seer, 3 villagers
"""
import random
from typing import List, Dict, Optional, Any
from app.core.game import BaseGame
from app.core.models import (
    GameAction, GameState, Player, GameResult,
    GamePhase, Role, ActionType, GameEvent
)


class WerewolfGame(BaseGame):
    """狼人杀游戏实现（5人极简版）"""

    def __init__(self):
        self.game_id: str = ""
        self.state: Optional[GameState] = None
        self.config: Dict = {}
        self.last_night_kill: Optional[str] = None
        self.current_votes: Dict[str, str] = {}  # voter_id -> target_id

    def initialize(self, players: List[str], config: Dict) -> None:
        """初始化游戏"""
        if len(players) != 5:
            raise ValueError("MVP版本需要恰好5名玩家")

        self.game_id = config.get("game_id", "")
        self.config = config

        # 设置随机种子（可复现性）
        seed = config.get("seed")
        if seed is not None:
            random.seed(seed)

        # 分配角色：1狼人 + 1预言家 + 3村民
        roles = [Role.WEREWOLF, Role.SEER] + [Role.VILLAGER] * 3
        random.shuffle(roles)

        # 创建玩家对象
        player_objs = {}
        for player_id, role in zip(players, roles):
            player_objs[player_id] = Player(id=player_id, role=role)

        # 初始化游戏状态
        self.state = GameState(
            game_id=self.game_id,
            phase=GamePhase.NIGHT,
            round=1,
            players=player_objs,
            alive_players=players.copy(),
            dead_players=[]
        )

        # 记录角色分配事件
        role_assignment = {pid: p.role.value for pid, p in player_objs.items()}
        self.state.events.append(GameEvent(
            event_type="game_start",
            data={
                "game_id": self.game_id,
                "players": players,
                "role_assignment": role_assignment
            },
            visibility="private",
            visible_to=["admin"]  # 只有管理员能看到完整角色分配
        ))

    def get_visible_state(self, player_id: str) -> Dict[str, Any]:
        """获取玩家可见的游戏状态（信息过滤）"""
        if not self.state:
            return {}

        player = self.state.players.get(player_id)
        if not player:
            return {}

        alive = list(self.state.alive_players)

        # 所有人可见的公开信息
        visible = {
            "game_id": self.state.game_id,
            "phase": self.state.phase.value,
            "round": self.state.round,
            "total_players": len(self.state.players),
            # 明确告诉 AI 它是几号玩家（之前缺失，导致自我指代混乱）
            "your_player_id": player_id,
            "your_role": player.role.value,
            "your_status": "alive" if player.is_alive else "dead",
            "alive_players": alive,
            "dead_players": list(self.state.dead_players),
            "public_events": self._filter_public_events()
        }

        # 角色特定信息
        if player.role == Role.WEREWOLF:
            # 狼人能看到同阵营队友；5人局只有 1 个狼人 → team 仅含自己
            team = [player_id]
            visible["werewolf_team"] = team
            visible["werewolf_count"] = len(team)
            visible["werewolf_teammates"] = [p for p in team if p != player_id]

        elif player.role == Role.SEER:
            # 预言家看到查验历史
            visible["investigation_results"] = list(player.investigation_results)

        # 村民没有额外信息

        # 白天发言阶段：明确告诉 AI 发言顺序与自己的位置
        # （之前缺失，导致末位玩家误说"看后面玩家发言"）
        if self.state.phase == GamePhase.DAY:
            # orchestrator 按 alive_players 顺序依次发言
            order = list(alive)
            speeches_this_round = {
                e.data.get("speaker")
                for e in self.state.events
                if e.event_type == "player_speech"
                and e.visibility == "public"
                and isinstance(e.data, dict)
                and e.data.get("round") == self.state.round
            }
            already = [p for p in order if p in speeches_this_round]
            remaining = [p for p in order if p not in speeches_this_round]
            visible["speak_order"] = order
            visible["speakers_already_spoke"] = already
            visible["speakers_remaining"] = remaining
            if player_id in order:
                pos = order.index(player_id) + 1
                visible["your_speak_position"] = pos
                visible["total_speakers"] = len(order)
                visible["is_first_speaker"] = (pos == 1)
                visible["is_last_speaker"] = (pos == len(order))

        return visible

    def get_available_actions(self, player_id: str) -> List[Dict]:
        """获取玩家可执行的动作"""
        if not self.state:
            return []

        player = self.state.players.get(player_id)
        if not player or not player.is_alive:
            return []

        actions = []

        if self.state.phase == GamePhase.NIGHT:
            # 夜晚阶段
            if player.role == Role.WEREWOLF:
                # 狼人可以杀人
                targets = [p for p in self.state.alive_players if p != player_id]
                actions.append({
                    "action_type": "kill",
                    "description": "选择一个玩家杀死",
                    "target_required": True,
                    "valid_targets": targets,
                    "parameters": {
                        "reasoning": {
                            "type": "string",
                            "description": "选择该目标的理由（内部推理）"
                        }
                    }
                })

            elif player.role == Role.SEER:
                # 预言家可以查验
                targets = [p for p in self.state.alive_players if p != player_id]
                actions.append({
                    "action_type": "investigate",
                    "description": "查验一个玩家的身份",
                    "target_required": True,
                    "valid_targets": targets,
                    "parameters": {
                        "reasoning": {
                            "type": "string",
                            "description": "选择该目标的理由（内部推理）"
                        }
                    }
                })

        elif self.state.phase == GamePhase.DAY:
            # 白天发言阶段
            actions.append({
                "action_type": "speak",
                "description": "发言",
                "target_required": False,
                "parameters": {
                    "content": {
                        "type": "string",
                        "description": "发言内容"
                    },
                    "claim_role": {
                        "type": "string",
                        "enum": ["none", "seer", "villager"],
                        "description": "是否跳身份（狼人不能跳狼人）"
                    }
                }
            })

        elif self.state.phase == GamePhase.VOTING:
            # 投票阶段
            targets = [p for p in self.state.alive_players if p != player_id]
            actions.append({
                "action_type": "vote",
                "description": "投票放逐一个玩家",
                "target_required": True,
                "valid_targets": targets,
                "parameters": {
                    "reasoning": {
                        "type": "string",
                        "description": "投票理由（公开）"
                    }
                }
            })

        return actions

    def is_valid_action(self, action: GameAction) -> bool:
        """验证动作是否合法"""
        if not self.state:
            return False

        player = self.state.players.get(action.actor_id)
        if not player or not player.is_alive:
            return False

        # 获取可选动作列表
        available = self.get_available_actions(action.actor_id)

        # 检查动作类型是否允许
        action_type_str = action.action_type.value
        valid_types = [a["action_type"] for a in available]
        if action_type_str not in valid_types:
            return False

        # 检查目标是否合法
        if action.target_id:
            for avail_action in available:
                if avail_action["action_type"] == action_type_str:
                    if avail_action.get("target_required"):
                        valid_targets = avail_action.get("valid_targets", [])
                        if action.target_id not in valid_targets:
                            return False

        return True

    def apply_action(self, action: GameAction) -> List[Dict]:
        """应用动作，返回事件列表"""
        if not self.is_valid_action(action):
            raise ValueError(f"Invalid action: {action}")

        events = []

        if action.action_type == ActionType.KILL:
            # 狼人杀人
            self.last_night_kill = action.target_id
            events.append({
                "event_type": "werewolf_kill",
                "data": {
                    "killer": action.actor_id,
                    "target": action.target_id,
                    "reasoning": action.parameters.get("reasoning", "")
                },
                "visibility": "private",
                "visible_to": [action.actor_id]
            })

        elif action.action_type == ActionType.INVESTIGATE:
            # 预言家查验
            target = self.state.players[action.target_id]
            is_werewolf = (target.role == Role.WEREWOLF)

            result = {
                "target": action.target_id,
                "is_werewolf": is_werewolf,
                "round": self.state.round
            }

            # 记录到预言家的查验历史
            self.state.players[action.actor_id].investigation_results.append(result)

            events.append({
                "event_type": "seer_investigate",
                "data": {
                    "seer": action.actor_id,
                    "target": action.target_id,
                    "result": "狼人" if is_werewolf else "好人",
                    "reasoning": action.parameters.get("reasoning", "")
                },
                "visibility": "private",
                "visible_to": [action.actor_id]
            })

        elif action.action_type == ActionType.SPEAK:
            # 发言
            speech = {
                "speaker": action.actor_id,
                "content": action.parameters.get("content", ""),
                "claim_role": action.parameters.get("claim_role", "none"),
                "reasoning": action.parameters.get("reasoning", ""),
                "round": self.state.round
            }
            self.state.speeches.append(speech)

            events.append({
                "event_type": "player_speech",
                "data": speech,
                "visibility": "public"
            })

        elif action.action_type == ActionType.VOTE:
            # 投票
            self.current_votes[action.actor_id] = action.target_id

            events.append({
                "event_type": "player_vote",
                "data": {
                    "voter": action.actor_id,
                    "target": action.target_id,
                    "reasoning": action.parameters.get("reasoning", ""),
                    "round": self.state.round
                },
                "visibility": "public"
            })

        # 将事件添加到游戏状态
        for event_data in events:
            self.state.events.append(GameEvent(**event_data))

        return events

    def advance_phase(self) -> List[Dict]:
        """推进游戏阶段"""
        events = []

        if self.state.phase == GamePhase.NIGHT:
            # 夜晚结束，进入白天
            # 处理狼人杀人
            if self.last_night_kill:
                self._kill_player(self.last_night_kill)
                events.append({
                    "event_type": "player_death",
                    "data": {
                        "player": self.last_night_kill,
                        "cause": "werewolf_kill",
                        "round": self.state.round
                    },
                    "visibility": "public"
                })
                self.last_night_kill = None

            from_phase = self.state.phase.value
            self.state.phase = GamePhase.DAY
            events.append({
                "event_type": "phase_change",
                "data": {"from": from_phase, "to": "day", "phase": "day", "round": self.state.round},
                "visibility": "public"
            })

        elif self.state.phase == GamePhase.DAY:
            # 白天发言结束，进入投票
            from_phase = self.state.phase.value
            self.state.phase = GamePhase.VOTING
            self.current_votes = {}
            events.append({
                "event_type": "phase_change",
                "data": {"from": from_phase, "to": "voting", "phase": "voting", "round": self.state.round},
                "visibility": "public"
            })

        elif self.state.phase == GamePhase.VOTING:
            # 投票结束，处理投票结果
            vote_result = self._process_votes()
            events.append(vote_result)
            # 投票放逐补发死亡事件（原 vote_result 只声明结果，无独立 player_death）
            if vote_result["data"].get("result") == "eliminated":
                eliminated = vote_result["data"]["eliminated"]
                events.append({
                    "event_type": "player_death",
                    "data": {
                        "player": eliminated,
                        "cause": "voted_out",
                        "round": self.state.round
                    },
                    "visibility": "public"
                })

            # 进入下一轮夜晚
            from_phase = self.state.phase.value
            self.state.round += 1
            self.state.phase = GamePhase.NIGHT
            events.append({
                "event_type": "phase_change",
                "data": {"from": from_phase, "to": "night", "phase": "night", "round": self.state.round},
                "visibility": "public"
            })

        # 将阶段推进产生的事件追加到游戏状态事件流
        # (apply_action 内部已有 append，但 advance_phase 此前遗漏，导致
        #  phase_change / 夜晚 player_death / vote_result 全部丢失)
        for event_data in events:
            self.state.events.append(GameEvent(**event_data))

        return events

    def check_win_condition(self) -> Optional[GameResult]:
        """检查胜利条件"""
        if not self.state:
            return None

        # 统计存活的狼人和好人数量
        werewolves_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role == Role.WEREWOLF
        )
        good_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role != Role.WEREWOLF
        )

        # 狼人获胜：狼人数量 >= 好人数量
        if werewolves_alive >= good_alive and werewolves_alive > 0:
            return GameResult(
                game_id=self.game_id,
                winner="werewolf",
                final_round=self.state.round,
                reason="werewolves_outnumber_villagers",
                duration_seconds=0.0  # TODO: 计算实际时间
            )

        # 好人获胜：狼人全部出局
        if werewolves_alive == 0:
            return GameResult(
                game_id=self.game_id,
                winner="good",
                final_round=self.state.round,
                reason="all_werewolves_eliminated",
                duration_seconds=0.0
            )

        return None

    def get_game_summary(self) -> Dict:
        """获取游戏总结"""
        if not self.state:
            return {}

        return {
            "game_id": self.game_id,
            "total_rounds": self.state.round,
            "total_events": len(self.state.events),
            "total_speeches": len(self.state.speeches),
            "survivors": self.state.alive_players,
            "casualties": self.state.dead_players
        }

    def is_ended(self) -> bool:
        """检查游戏是否结束"""
        return self.check_win_condition() is not None

    def record_game_end(self, result) -> Dict:
        """
        对局终结时追加 game_end 事件（含胜负/轮次/时长），并写入事件流。
        返回事件字典，供 orchestrator 广播给所有智能体记忆。
        """
        end_event = {
            "event_type": "game_end",
            "data": {
                "winner": result.winner,
                "reason": result.reason,
                "final_round": result.final_round,
                "duration_seconds": result.duration_seconds,
            },
            "visibility": "public",
        }
        self.state.events.append(GameEvent(**end_event))
        return end_event

    def _kill_player(self, player_id: str):
        """杀死玩家"""
        if player_id in self.state.alive_players:
            self.state.alive_players.remove(player_id)
            self.state.dead_players.append(player_id)
            self.state.players[player_id].is_alive = False

    def _process_votes(self) -> Dict:
        """处理投票结果"""
        if not self.current_votes:
            return {
                "event_type": "vote_result",
                "data": {"result": "no_votes", "round": self.state.round},
                "visibility": "public"
            }

        # 统计票数
        vote_counts = {}
        for target in self.current_votes.values():
            vote_counts[target] = vote_counts.get(target, 0) + 1

        # 找到最高票数
        max_votes = max(vote_counts.values())
        candidates = [p for p, v in vote_counts.items() if v == max_votes]

        # 平票处理：无人出局
        if len(candidates) > 1:
            return {
                "event_type": "vote_result",
                "data": {
                    "result": "tie",
                    "candidates": candidates,
                    "votes": vote_counts,
                    "round": self.state.round
                },
                "visibility": "public"
            }

        # 有人获得最高票，放逐
        eliminated = candidates[0]
        self._kill_player(eliminated)

        self.state.vote_results.append({
            "round": self.state.round,
            "eliminated": eliminated,
            "votes": vote_counts
        })

        return {
            "event_type": "vote_result",
            "data": {
                "result": "eliminated",
                "eliminated": eliminated,
                "votes": vote_counts,
                "round": self.state.round
            },
            "visibility": "public"
        }

    def _filter_public_events(self) -> List[Dict]:
        """过滤出公开事件(喂给玩家 LLM 的可见状态)。

        关键:player_vote / player_speech 的 reasoning 是玩家内心独白,
        绝不能泄露给其他玩家(否则狼人的"我作为狼人"等自爆思维链会被
        好人看到,游戏直接破坏)。这里剥离 reasoning,只保留公开行为:
        发言保留 content/claim_role,投票保留 voter→target。
        完整 reasoning 仍存在 state.events 里供上帝视角观战。
        """
        result = []
        for e in self.state.events:
            if e.visibility != "public":
                continue
            d = e.to_dict()
            et = d.get("event_type")
            if et in ("player_vote", "player_speech") and isinstance(d.get("data"), dict):
                # 深拷贝 data 再删 reasoning,避免污染 state 里的事件原文
                data = dict(d["data"])
                data.pop("reasoning", None)
                d["data"] = data
            result.append(d)
        return result
