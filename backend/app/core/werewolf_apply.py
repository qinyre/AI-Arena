"""狼人杀动作执行:apply_action 按动作类型变更状态并产出事件。

从 werewolf.py 拆出。动作合法性由 AvailableActionsMixin.is_valid_action
先行校验,此处只负责执行。
"""
from typing import Dict, List

from app.core.models import GameAction, ActionType, GameEvent, GamePhase, Role
from app.core.boards import WOLF_ROLES


class ApplyActionMixin:
    """apply_action。"""

    def apply_action(self, action: GameAction) -> List[Dict]:
        """应用动作，返回事件列表"""
        if not self.is_valid_action(action):
            raise ValueError(f"Invalid action: {action}")

        events = []

        if action.action_type in (
            ActionType.ORDER_CLOCKWISE,
            ActionType.ORDER_COUNTERCLOCKWISE,
        ):
            direction = (
                "clockwise"
                if action.action_type == ActionType.ORDER_CLOCKWISE
                else "counterclockwise"
            )
            order, anchor, anchor_type = self._build_day_speech_order(direction)
            self.speech_direction = direction
            self.day_speech_order = order
            events.append({
                "event_type": "speech_order_decided",
                "data": {
                    "chooser": action.actor_id,
                    "direction": direction,
                    "anchor": anchor,
                    "anchor_type": anchor_type,
                    "order": order,
                    "night_deaths": list(self.last_night_deaths),
                    "round": self.state.round,
                    "reasoning": action.parameters.get("reasoning", ""),
                },
                "visibility": "public",
            })

        elif action.action_type == ActionType.TRANSFER_BADGE:
            old_sheriff = self.badge_transfer_actor
            self.sheriff_id = action.target_id
            self.badge_transfer_actor = None
            events.append({
                "event_type": "badge_transferred",
                "data": {
                    "from": old_sheriff,
                    "to": action.target_id,
                    "round": self.state.round,
                    "reasoning": action.parameters.get("reasoning", ""),
                },
                "visibility": "public",
            })

        elif action.action_type == ActionType.DESTROY_BADGE:
            old_sheriff = self.badge_transfer_actor
            self.sheriff_id = None
            self.badge_transfer_actor = None
            events.append({
                "event_type": "badge_destroyed",
                "data": {
                    "player": old_sheriff,
                    "round": self.state.round,
                    "reasoning": action.parameters.get("reasoning", ""),
                },
                "visibility": "public",
            })

        elif action.action_type == ActionType.CHARM:
            self.charmed_target = action.target_id
            events.append({
                "event_type": "wolf_beauty_charm",
                "data": {
                    "wolf_beauty": action.actor_id,
                    "target": action.target_id,
                    "reasoning": action.parameters.get("reasoning", ""),
                },
                "visibility": "private",
                "visible_to": [action.actor_id],
            })

        elif action.action_type == ActionType.KILL:
            self.wolf_votes[action.actor_id] = action.target_id
            wolf_team = [
                pid for pid, p in self.state.players.items() if p.role in WOLF_ROLES
            ]
            events.append({
                "event_type": "werewolf_kill",
                "data": {
                    "killer": action.actor_id,
                    "target": action.target_id,
                    "reasoning": action.parameters.get("reasoning", "")
                },
                "visibility": "private",
                "visible_to": wolf_team
            })

        elif action.action_type == ActionType.WOLF_SPEAK:
            wolf_team = [
                pid for pid, p in self.state.players.items()
                if p.is_alive and p.role in WOLF_ROLES
            ]
            events.append({
                "event_type": "wolf_discussion",
                "data": {
                    "speaker": action.actor_id,
                    "content": action.parameters.get("content", ""),
                    "reasoning": action.parameters.get("reasoning", ""),
                    "round": self.state.round,
                },
                "visibility": "private",
                "visible_to": wolf_team,
            })

        elif action.action_type == ActionType.INVESTIGATE:
            # 预言家查验
            target = self.state.players[action.target_id]
            is_werewolf = target.role in WOLF_ROLES

            result = {
                "target": action.target_id,
                "is_werewolf": is_werewolf,
                "round": self.state.round,
                "phase": self.state.phase.value
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

        elif action.action_type == ActionType.GUARD:
            self.guarded_target = action.target_id
            events.append({
                "event_type": "guard_action",
                "data": {"guard": action.actor_id, "target": action.target_id,
                         "reasoning": action.parameters.get("reasoning", "")},
                "visibility": "private",
                "visible_to": [action.actor_id],
            })

        elif action.action_type == ActionType.HEAL:
            self.witch_healed = True
            self.witch_antidote_available = False
            events.append({
                "event_type": "witch_heal",
                "data": {"witch": action.actor_id, "target": action.target_id,
                         "reasoning": action.parameters.get("reasoning", "")},
                "visibility": "private",
                "visible_to": [action.actor_id],
            })

        elif action.action_type == ActionType.POISON:
            self.witch_poison_target = action.target_id
            self.witch_poison_available = False
            events.append({
                "event_type": "witch_poison",
                "data": {"witch": action.actor_id, "target": action.target_id,
                         "reasoning": action.parameters.get("reasoning", "")},
                "visibility": "private",
                "visible_to": [action.actor_id],
            })

        elif action.action_type == ActionType.WITHDRAW:
            self.sheriff_candidates.remove(action.actor_id)
            self.sheriff_withdrawn.append(action.actor_id)
            events.append({
                "event_type": "sheriff_withdrawal",
                "data": {
                    "player": action.actor_id,
                    "reasoning": action.parameters.get("reasoning", ""),
                },
                "visibility": "public",
            })

        elif action.action_type == ActionType.SHOOT:
            victim = action.target_id
            shooter_role = self.state.players[action.actor_id].role
            cause = (
                "hunter_shot" if shooter_role == Role.HUNTER
                else "wolf_king_shot"
            )
            self._kill_player(victim, cause)
            if shooter_role == Role.WOLF_KING and self._edge_completed():
                self._force_winner("werewolf", "wolf_skill_completed_edge")
            events.append({
                "event_type": "player_death",
                "data": {"player": victim, "cause": cause, "round": self.state.round,
                         "shooter": action.actor_id},
                "visibility": "public",
            })

        elif action.action_type == ActionType.DUEL:
            self.knight_duel_used = True
            target_role = self.state.players[action.target_id].role
            hit_werewolf = target_role in WOLF_ROLES
            self.knight_duel_ends_day = hit_werewolf
            victim = action.target_id if hit_werewolf else action.actor_id
            cause = "knight_duel" if hit_werewolf else "knight_failed"
            self._kill_player(victim, cause)
            events.extend([
                {
                    "event_type": "knight_duel",
                    "data": {
                        "knight": action.actor_id,
                        "target": action.target_id,
                        "target_faction": "werewolf" if hit_werewolf else "good",
                        "winner": action.actor_id if hit_werewolf else action.target_id,
                        "reasoning": action.parameters.get("reasoning", ""),
                    },
                    "visibility": "public",
                },
                {
                    "event_type": "player_death",
                    "data": {
                        "player": victim,
                        "cause": cause,
                        "round": self.state.round,
                    },
                    "visibility": "public",
                },
            ])

        elif action.action_type == ActionType.SELF_DESTRUCT:
            actor_role = self.state.players[action.actor_id].role
            self._kill_player(action.actor_id, "self_destruct")
            self.day_interrupted = True
            if actor_role == Role.WHITE_WOLF_KING:
                self._kill_player(action.target_id, "white_wolf_king")
                if self._edge_completed():
                    self._force_winner("werewolf", "wolf_skill_completed_edge")
                events.extend([
                    {
                        "event_type": "white_wolf_king_self_destruct",
                        "data": {"player": action.actor_id, "target": action.target_id},
                        "visibility": "public",
                    },
                    {
                        "event_type": "player_death",
                        "data": {"player": action.target_id, "cause": "white_wolf_king",
                                 "round": self.state.round},
                        "visibility": "public",
                    },
                ])
            else:
                events.append({
                    "event_type": "wolf_self_destruct",
                    "data": {"player": action.actor_id},
                    "visibility": "public",
                })
            events.append(
                {
                    "event_type": "player_death",
                    "data": {"player": action.actor_id, "cause": "self_destruct",
                             "round": self.state.round},
                    "visibility": "public",
                }
            )

        elif action.action_type == ActionType.PASS:
            if (
                self.state.phase == GamePhase.SHERIFF_CAMPAIGN
                and not self.day_interrupt_window
            ):
                events.append({
                    "event_type": "sheriff_campaign_pass",
                    "data": {"player": action.actor_id, "round": self.state.round},
                    "visibility": "public",
                })
            elif self.state.phase == GamePhase.NIGHT and self.night_stage == "guard":
                events.append({
                    "event_type": "guard_pass",
                    "data": {"guard": action.actor_id, "round": self.state.round,
                             "reasoning": action.parameters.get("reasoning", "")},
                    "visibility": "private",
                    "visible_to": [action.actor_id],
                })
            else:
                events.append({
                    "event_type": "player_pass",
                    "data": {"player": action.actor_id, "round": self.state.round,
                             "reasoning": action.parameters.get("reasoning", "")},
                    "visibility": "private",
                    "visible_to": [action.actor_id],
                })

        elif action.action_type == ActionType.SPEAK:
            # 发言
            speech = {
                "speaker": action.actor_id,
                "content": action.parameters.get("content", ""),
                "claim_role": action.parameters.get("claim_role", "none"),
                "suspects": list(action.parameters.get("suspects", [])),
                "trusted": list(action.parameters.get("trusted", [])),
                "intended_vote": action.parameters.get("intended_vote"),
                "role_reads": dict(action.parameters.get("role_reads", {})),
                "evidence_event_indexes": list(
                    action.parameters.get("evidence_event_indexes", [])
                ),
                "reasoning": action.parameters.get("reasoning", ""),
                "round": self.state.round,
                "phase": self.state.phase.value
            }
            if self.state.phase == GamePhase.SHERIFF_CAMPAIGN:
                speech["sheriff_campaign"] = True
                self.sheriff_runners.append(action.actor_id)
                self.sheriff_candidates.append(action.actor_id)
            elif self.state.phase == GamePhase.LAST_WORDS:
                speech["last_words"] = True
            elif self.state.phase == GamePhase.SHERIFF_SUMMARY:
                self.sheriff_nomination = action.target_id
                speech["sheriff_summary"] = True
                speech["nomination"] = action.target_id
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
                "event_type": (
                    "sheriff_vote"
                    if self.state.phase in (
                        GamePhase.SHERIFF_VOTING,
                        GamePhase.SHERIFF_TIEBREAK_VOTING,
                    )
                    else "player_vote"
                ),
                "data": {
                    "voter": action.actor_id,
                    "target": action.target_id,
                    "reasoning": action.parameters.get("reasoning", ""),
                    "round": self.state.round
                },
                "visibility": "public"
            })

        elif action.action_type == ActionType.ABSTAIN:
            self.current_votes[action.actor_id] = None
            events.append({
                "event_type": (
                    "sheriff_abstain"
                    if self.state.phase in (
                        GamePhase.SHERIFF_VOTING,
                        GamePhase.SHERIFF_TIEBREAK_VOTING,
                    )
                    else "player_abstain"
                ),
                "data": {
                    "voter": action.actor_id,
                    "round": self.state.round,
                    "reasoning": action.parameters.get("reasoning", "")
                },
                "visibility": "public"
            })

        # 将事件添加到游戏状态
        for event_data in events:
            # 所有玩家动作共享同一事件坐标，避免前端复盘靠“最近轮次”猜测归属。
            event_data["data"].setdefault("round", self.state.round)
            event_data["data"].setdefault("phase", self.state.phase.value)
            self.state.events.append(GameEvent(**event_data))
        self.acted_players.add(action.actor_id)

        return events
