"""狼人杀信息可见性:按角色过滤玩家视野,并生成公开事件档案。

从 werewolf.py 拆出。Mixin 内方法通过 self 访问 WerewolfGame 的状态,
组合后行为与拆分前完全一致。
"""
from typing import Any, Dict, List

from app.core.models import GamePhase, Role
from app.core.boards import WOLF_ROLES


class VisibilityMixin:
    """get_visible_state / 公开事件过滤 / 长期局势档案。"""

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
            "board_id": self.board_id,
            "board_name": self.board["name"],
            "win_rule": self.board["win_rule"],
            "sheriff_enabled": self.sheriff_enabled,
            "sheriff_id": self.sheriff_id,
            "sheriff_candidates": list(self.sheriff_candidates),
            "sheriff_withdrawn": list(self.sheriff_withdrawn),
            "last_night_deaths": list(self.last_night_deaths),
            "day_speech_order": list(self.day_speech_order),
            "speech_direction": self.speech_direction,
            "sheriff_nomination": self.sheriff_nomination,
            # 明确告诉 AI 它是几号玩家（之前缺失，导致自我指代混乱）
            "your_player_id": player_id,
            "your_role": player.role.value,
            "your_status": "alive" if player.is_alive else "dead",
            "alive_players": alive,
            "dead_players": list(self.state.dead_players),
            "public_dossier": self._build_public_dossier(),
            "public_events": self._filter_public_events(limit=20)
        }

        # 角色特定信息
        if player.role in WOLF_ROLES:
            team = [
                pid for pid, member in self.state.players.items()
                if member.role in WOLF_ROLES
            ]
            alive_team = [pid for pid in team if pid in self.state.alive_players]
            visible["werewolf_team"] = team
            visible["werewolf_count"] = len(team)
            visible["alive_werewolves"] = alive_team
            visible["alive_werewolf_count"] = len(alive_team)
            visible["alive_werewolf_teammates"] = [
                pid for pid in alive_team if pid != player_id
            ]
            # 兼容旧客户端：该字段仍表示开局完整队友名单；AI 协作应使用
            # alive_werewolf_teammates，避免把已死亡狼人当作当前队友。
            visible["werewolf_teammates"] = [p for p in team if p != player_id]
            visible["werewolf_discussion"] = [
                {
                    "speaker": event.data.get("speaker"),
                    "content": event.data.get("content"),
                }
                for event in self.state.events
                if event.event_type == "wolf_discussion"
                and event.data.get("round") == self.state.round
            ]
            if player.role == Role.WOLF_BEAUTY:
                visible["charmed_target"] = self.charmed_target

        elif player.role == Role.SEER:
            # 预言家看到查验历史
            visible["investigation_results"] = list(player.investigation_results)

        elif player.role == Role.WITCH:
            visible["antidote_available"] = self.witch_antidote_available
            visible["poison_available"] = self.witch_poison_available
            if self.night_stage == "witch":
                visible["werewolf_target"] = self.last_night_kill

        elif player.role == Role.GUARD:
            visible["last_guard_target"] = self.guard_last_target

        elif player.role == Role.KNIGHT:
            visible["duel_available"] = not self.knight_duel_used

        if self.state.phase == GamePhase.DEATH_SKILL:
            visible["death_skill_actor"] = self.death_skill_actor
        elif self.state.phase == GamePhase.LAST_WORDS:
            visible["last_words_actor"] = self.last_words_actor
        elif self.state.phase == GamePhase.BADGE_TRANSFER:
            visible["badge_transfer_actor"] = self.badge_transfer_actor

        # 村民没有额外信息

        # 白天发言阶段：明确告诉 AI 发言顺序与自己的位置
        # （之前缺失，导致末位玩家误说"看后面玩家发言"）
        if self.state.phase in (
            GamePhase.DAY,
            GamePhase.TIEBREAK_SPEECH,
            GamePhase.SHERIFF_CAMPAIGN,
            GamePhase.SHERIFF_TIEBREAK_SPEECH,
        ):
            # orchestrator 按 alive_players 顺序依次发言
            if self.state.phase == GamePhase.DAY:
                order = list(self.day_speech_order or alive)
            elif self.state.phase == GamePhase.SHERIFF_CAMPAIGN:
                order = list(alive)
            elif self.state.phase == GamePhase.TIEBREAK_SPEECH:
                order = list(self.tie_candidates)
            else:
                order = list(self.sheriff_tie_candidates)
            speeches_this_round = {
                e.data.get("speaker")
                for e in self.state.events
                if e.event_type == "player_speech"
                and e.visibility == "public"
                and isinstance(e.data, dict)
                and e.data.get("round") == self.state.round
                and e.data.get("phase") == self.state.phase.value
            }
            if self.state.phase == GamePhase.SHERIFF_CAMPAIGN:
                speeches_this_round.update(
                    e.data.get("player")
                    for e in self.state.events
                    if e.event_type == "sheriff_campaign_pass"
                    and e.data.get("round") == self.state.round
                )
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

    def _filter_public_events(self, limit: int = 20) -> List[Dict]:
        """过滤出公开事件(喂给玩家 LLM 的可见状态)。

        关键:player_vote / player_speech 的 reasoning 是玩家内心独白,
        绝不能泄露给其他玩家(否则狼人的"我作为狼人"等自爆思维链会被
        好人看到,游戏直接破坏)。这里剥离 reasoning,只保留公开行为:
        发言保留 content/claim_role,投票保留 voter→target。
        完整 reasoning 仍存在 state.events 里供上帝视角观战。
        """
        result = []
        public_index = 0
        for e in self.state.events:
            if e.visibility != "public":
                continue
            d = e.to_dict()
            d["event_index"] = public_index
            public_index += 1
            et = d.get("event_type")
            if et in (
                "player_vote",
                "player_speech",
                "sheriff_vote",
                "sheriff_abstain",
                "sheriff_withdrawal",
                "badge_transferred",
                "badge_destroyed",
                "speech_order_decided",
            ) and isinstance(d.get("data"), dict):
                # 深拷贝 data 再删 reasoning,避免污染 state 里的事件原文
                data = dict(d["data"])
                data.pop("reasoning", None)
                d["data"] = data
            elif et == "player_death" and isinstance(d.get("data"), dict):
                data = dict(d["data"])
                if data.get("cause") in {"werewolf_kill", "poison"}:
                    data["cause"] = "night_death"
                d["data"] = data
            result.append(d)
        return result[-limit:]

    def _build_public_dossier(self) -> Dict[str, Any]:
        """从完整公开事件流生成长期局势档案，不依赖模型总结。"""
        # ponytail: 每次决策线性扫描事件；单局达到数千事件后再改为增量缓存。
        claim_history: Dict[str, List[Dict[str, Any]]] = {}
        statement_history: Dict[str, List[Dict[str, Any]]] = {}
        vote_history: List[Dict[str, Any]] = []
        death_history: List[Dict[str, Any]] = []
        sheriff_history: List[Dict[str, Any]] = []
        stance_history: Dict[str, List[Dict[str, Any]]] = {}

        public_index = 0
        for event in self.state.events:
            if event.visibility != "public":
                continue
            event_index = public_index
            public_index += 1
            data = event.data
            if event.event_type == "player_speech":
                speaker = data.get("speaker")
                if not speaker:
                    continue
                statement_history.setdefault(speaker, []).append({
                    "event_index": event_index,
                    "round": data.get("round"),
                    "phase": data.get("phase"),
                    "content": data.get("content", ""),
                })
                claim = data.get("claim_role")
                if claim and claim != "none":
                    entries = claim_history.setdefault(speaker, [])
                    if not entries or entries[-1]["role"] != claim:
                        entries.append({
                            "event_index": event_index,
                            "round": data.get("round"),
                            "phase": data.get("phase"),
                            "role": claim,
                        })
                stance = {
                    "event_index": event_index,
                    "round": data.get("round"),
                    "phase": data.get("phase"),
                    "suspects": list(data.get("suspects") or []),
                    "trusted": list(data.get("trusted") or []),
                    "intended_vote": data.get("intended_vote"),
                    "role_reads": dict(data.get("role_reads") or {}),
                    "evidence_event_indexes": list(
                        data.get("evidence_event_indexes") or []
                    ),
                }
                # 新版事件即使全部为空，也代表玩家公开撤回了此前立场；旧存档
                # 没有这些键时才跳过，避免把历史观点错误保留为“当前立场”。
                if any(key in data for key in (
                    "suspects",
                    "trusted",
                    "intended_vote",
                    "role_reads",
                    "evidence_event_indexes",
                )):
                    stance_history.setdefault(speaker, []).append(stance)
            elif event.event_type in {"vote_result", "sheriff_election_result"}:
                if data.get("vote_detail"):
                    vote_history.append({
                        "round": data.get("round"),
                        "phase": data.get("phase"),
                        "result": data.get("result"),
                        "vote_detail": dict(data["vote_detail"]),
                        "eliminated": data.get("eliminated"),
                        "candidates": data.get("candidates", []),
                    })
                if event.event_type == "sheriff_election_result":
                    sheriff_history.append({
                        key: data.get(key)
                        for key in ("round", "result", "sheriff", "reason", "candidates")
                        if data.get(key) is not None
                    })
            elif event.event_type == "player_death":
                cause = data.get("cause")
                death_history.append({
                    "player": data.get("player"),
                    "round": data.get("round"),
                    "cause": "night_death" if cause in {"werewolf_kill", "poison"} else cause,
                })
            elif event.event_type == "sheriff_withdrawal":
                sheriff_history.append({
                    "round": data.get("round"),
                    "result": "withdrew",
                    "player": data.get("player"),
                })
            elif event.event_type in {"badge_transferred", "badge_destroyed"}:
                sheriff_history.append({
                    "round": data.get("round"),
                    "result": event.event_type,
                    "from": data.get("from") or data.get("player"),
                    "to": data.get("to"),
                })

        latest_claims = {
            player: entries[-1]["role"]
            for player, entries in claim_history.items()
        }
        claimants: Dict[str, List[str]] = {}
        for player, role in latest_claims.items():
            if role != "villager" and player in self.state.alive_players:
                claimants.setdefault(role, []).append(player)

        return {
            "latest_claims": latest_claims,
            "claim_history": claim_history,
            "claim_conflicts": {
                role: players for role, players in claimants.items() if len(players) > 1
            },
            "claim_changes": {
                player: [entry["role"] for entry in entries]
                for player, entries in claim_history.items()
                if len(entries) > 1
            },
            "recent_statements_by_player": {
                player: entries[-2:]
                for player, entries in statement_history.items()
            },
            "current_stances": {
                player: entries[-1] for player, entries in stance_history.items()
            },
            # 完整历史已在公开事件中持久化；给模型的长期档案仅保留最近三次，
            # 防止长局结构化立场无限膨胀提示词。
            "stance_history": {
                player: entries[-3:] for player, entries in stance_history.items()
            },
            "vote_history": vote_history,
            "death_history": death_history,
            "sheriff_history": sheriff_history,
        }
