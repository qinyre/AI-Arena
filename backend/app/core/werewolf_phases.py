"""狼人杀阶段推进与结算:advance_phase 状态机、夜晚结算、警长竞选、放逐投票。

从 werewolf.py 拆出。胜负判定(check_win_condition/_edge_completed)仍在
werewolf.py 主类中,由这些方法经 self 调用。
"""
from typing import Any, Dict, List, Optional

from app.core.models import GameEvent, GamePhase, Role
from app.core.boards import WOLF_ROLES


class PhaseFlowMixin:
    """advance_phase 及全部阶段转换 / 结算辅助方法。"""

    def advance_phase(self) -> List[Dict]:
        """推进游戏阶段"""
        events = []

        if (
            self.day_interrupted
            and self.state.phase in (
                GamePhase.DAY,
                GamePhase.SHERIFF_SUMMARY,
                GamePhase.TIEBREAK_SPEECH,
                GamePhase.SHERIFF_CAMPAIGN,
                GamePhase.SHERIFF_WITHDRAWAL,
                GamePhase.SHERIFF_TIEBREAK_SPEECH,
            )
        ):
            from_phase = self.state.phase.value
            self.day_interrupted = False
            if self.state.phase in (
                GamePhase.SHERIFF_CAMPAIGN,
                GamePhase.SHERIFF_WITHDRAWAL,
                GamePhase.SHERIFF_TIEBREAK_SPEECH,
            ):
                self.sheriff_election_done = True
                self.sheriff_id = None
                events.append({
                    "event_type": "sheriff_election_result",
                    "data": {
                        "result": "cancelled_by_self_destruct",
                        "round": self.state.round,
                    },
                    "visibility": "public",
                })
                self._resolve_deferred_first_night(
                    events, from_phase, GamePhase.NIGHT
                )
            else:
                if self._has_pending_resolution():
                    self.resume_phase = GamePhase.NIGHT
                    self._start_next_death_skill_or_resume(events, from_phase)
                else:
                    self._begin_next_night(events, from_phase)

        elif self.state.phase in (
            GamePhase.DEATH_SKILL,
            GamePhase.BADGE_TRANSFER,
            GamePhase.LAST_WORDS,
        ):
            self._start_next_death_skill_or_resume(events)

        elif self.state.phase == GamePhase.SHERIFF_CAMPAIGN:
            self._change_phase(
                events, self.state.phase.value, GamePhase.SHERIFF_WITHDRAWAL
            )

        elif self.state.phase == GamePhase.SHERIFF_WITHDRAWAL:
            self.sheriff_voters = [
                player_id
                for player_id in self.state.alive_players
                if player_id not in self.sheriff_runners
                and self.state.players[player_id].can_vote
            ]
            if len(self.sheriff_candidates) == 1:
                self._finish_sheriff_election(
                    events, self.sheriff_candidates[0], "unopposed"
                )
            elif not self.sheriff_candidates:
                self._finish_sheriff_election(events, None, "no_candidates")
            elif not self.sheriff_voters:
                self._finish_sheriff_election(events, None, "no_voters")
            else:
                from_phase = self.state.phase.value
                self.current_votes = {}
                self._change_phase(events, from_phase, GamePhase.SHERIFF_VOTING)

        elif self.state.phase == GamePhase.SHERIFF_VOTING:
            result = self._process_sheriff_votes()
            events.append(result)
            if result["data"]["result"] == "tie":
                self.sheriff_tie_candidates = result["data"]["candidates"]
                from_phase = self.state.phase.value
                self._change_phase(
                    events, from_phase, GamePhase.SHERIFF_TIEBREAK_SPEECH
                )
            else:
                self._finish_sheriff_election(
                    events,
                    result["data"].get("sheriff"),
                    result["data"]["result"],
                    announce=False,
                )

        elif self.state.phase == GamePhase.SHERIFF_TIEBREAK_SPEECH:
            from_phase = self.state.phase.value
            self.current_votes = {}
            self._change_phase(
                events, from_phase, GamePhase.SHERIFF_TIEBREAK_VOTING
            )

        elif self.state.phase == GamePhase.SHERIFF_TIEBREAK_VOTING:
            result = self._process_sheriff_votes(tiebreak=True)
            events.append(result)
            self._finish_sheriff_election(
                events,
                result["data"].get("sheriff"),
                result["data"]["result"],
                announce=False,
            )

        elif self.state.phase == GamePhase.TIEBREAK_SPEECH:
            from_phase = self.state.phase.value
            self.state.phase = GamePhase.TIEBREAK_VOTING
            self.current_votes = {}
            self.acted_players = set()
            events.append({"event_type": "phase_change", "data": {"from": from_phase, "to": "tiebreak_voting", "phase": "tiebreak_voting", "round": self.state.round, "candidates": self.tie_candidates}, "visibility": "public"})

        elif self.state.phase == GamePhase.TIEBREAK_VOTING:
            vote_result = self._process_votes(tiebreak=True)
            events.append(vote_result)
            self._finish_voting(events, vote_result)

        elif self.state.phase == GamePhase.KNIGHT_DUEL:
            from_phase = self.state.phase.value
            continue_phase = (
                GamePhase.SHERIFF_SUMMARY
                if self.sheriff_id in self.state.alive_players
                else GamePhase.VOTING
            )
            next_phase = (
                GamePhase.NIGHT if self.knight_duel_ends_day else continue_phase
            )
            self.knight_duel_ends_day = False
            if self._has_pending_resolution():
                self.resume_phase = next_phase
                self._start_next_death_skill_or_resume(events, from_phase)
            elif next_phase == GamePhase.NIGHT:
                self._begin_next_night(events, from_phase)
            else:
                self.current_votes = {}
                self._change_phase(events, from_phase, next_phase)

        elif self.state.phase == GamePhase.NIGHT:
            if (
                self.sheriff_enabled
                and not self.sheriff_election_done
                and self.state.round == 1
            ):
                from_phase = self.state.phase.value
                self._change_phase(
                    events, from_phase, GamePhase.SHERIFF_CAMPAIGN
                )
                for event_data in events:
                    self.state.events.append(GameEvent(**event_data))
                return events

            deaths = []
            if self.last_night_kill:
                protected = self.guarded_target == self.last_night_kill
                # 同守同救会抵消两种保护，狼刀仍然生效。
                survives = protected ^ self.witch_healed
                if not survives:
                    deaths.append((self.last_night_kill, "werewolf_kill"))
            if self.witch_poison_target:
                deaths.append((self.witch_poison_target, "poison"))

            self._resolve_night_deaths(events, deaths)

            from_phase = self.state.phase.value
            self.guard_last_target = self.guarded_target
            self._reset_night_actions()
            next_phase = GamePhase.SPEECH_ORDER
            if self._has_pending_resolution():
                self.resume_phase = next_phase
                self._start_next_death_skill_or_resume(events, from_phase)
            else:
                self._change_phase(events, from_phase, next_phase)

        elif self.state.phase == GamePhase.SPEECH_ORDER:
            if not self.day_speech_order:
                direction = self.rng.choice(("clockwise", "counterclockwise"))
                order, anchor, anchor_type = self._build_day_speech_order(direction)
                self.speech_direction = direction
                self.day_speech_order = order
                events.append({
                    "event_type": "speech_order_decided",
                    "data": {
                        "chooser": "judge",
                        "direction": direction,
                        "anchor": anchor,
                        "anchor_type": anchor_type,
                        "order": order,
                        "night_deaths": list(self.last_night_deaths),
                        "round": self.state.round,
                    },
                    "visibility": "public",
                })
            self._change_phase(
                events, self.state.phase.value, GamePhase.DAY
            )

        elif self.state.phase == GamePhase.DAY:
            from_phase = self.state.phase.value
            knight_can_duel = (
                not self.knight_duel_used
                and any(
                    player.is_alive and player.role == Role.KNIGHT
                    for player in self.state.players.values()
                )
            )
            next_phase = GamePhase.KNIGHT_DUEL if knight_can_duel else (
                GamePhase.SHERIFF_SUMMARY
                if self.sheriff_id in self.state.alive_players
                else GamePhase.VOTING
            )
            if next_phase == GamePhase.VOTING:
                self.current_votes = {}
            self._change_phase(events, from_phase, next_phase)

        elif self.state.phase == GamePhase.SHERIFF_SUMMARY:
            from_phase = self.state.phase.value
            self.current_votes = {}
            self._change_phase(events, from_phase, GamePhase.VOTING)

        elif self.state.phase == GamePhase.VOTING:
            # 投票结束，处理投票结果
            vote_result = self._process_votes()
            events.append(vote_result)
            if vote_result["data"].get("result") == "tie":
                from_phase = self.state.phase.value
                self.tie_candidates = vote_result["data"]["candidates"]
                self.state.phase = GamePhase.TIEBREAK_SPEECH
                self.acted_players = set()
                events.append({"event_type": "phase_change", "data": {"from": from_phase, "to": "tiebreak_speech", "phase": "tiebreak_speech", "round": self.state.round, "candidates": self.tie_candidates}, "visibility": "public"})
                for event_data in events:
                    self.state.events.append(GameEvent(**event_data))
                return events
            self._finish_voting(events, vote_result)

        # 将阶段推进产生的事件追加到游戏状态事件流
        # (apply_action 内部已有 append，但 advance_phase 此前遗漏，导致
        #  phase_change / 夜晚 player_death / vote_result 全部丢失)
        for event_data in events:
            self.state.events.append(GameEvent(**event_data))

        return events

    def _resolve_deferred_first_night(
        self,
        events: List[Dict],
        from_phase: str,
        next_phase: GamePhase,
    ) -> None:
        """警长竞选结束后公布首夜死讯，再进入白天或下一夜。"""
        deaths = []
        if self.last_night_kill:
            protected = self.guarded_target == self.last_night_kill
            if not (protected ^ self.witch_healed):
                deaths.append((self.last_night_kill, "werewolf_kill"))
        if self.witch_poison_target:
            deaths.append((self.witch_poison_target, "poison"))

        self._resolve_night_deaths(events, deaths)

        self.guard_last_target = self.guarded_target
        self._reset_night_actions()
        if self._has_pending_resolution():
            self.resume_phase = next_phase
            self._start_next_death_skill_or_resume(events, from_phase)
        elif next_phase == GamePhase.NIGHT:
            self._begin_next_night(events, from_phase)
        else:
            self._change_phase(events, from_phase, next_phase)

    def _resolve_night_deaths(self, events: List[Dict], deaths: List[tuple]) -> None:
        """按规则顺序结算，按座位顺序公布，避免用公告顺序泄露死因。"""
        resolved = []
        for victim, cause in deaths:
            if victim not in self.state.alive_players:
                continue
            self._kill_player(victim, cause)
            resolved.append((victim, cause))
            if cause == "werewolf_kill" and self._edge_completed():
                # 竞技屠边局采用狼刀在先：狼刀完成屠边后，毒药不反转胜负。
                self._force_winner("werewolf", "werewolf_kill_completed_edge")

        resolved.sort(key=lambda item: self.seat_order.index(item[0]))
        self.last_night_deaths = [victim for victim, _ in resolved]
        if self.state.round == 1:
            self.pending_last_words.extend(self.last_night_deaths)
        events.extend({
            "event_type": "player_death",
            "data": {"player": victim, "cause": cause, "round": self.state.round},
            "visibility": "public",
        } for victim, cause in resolved)

    def _process_sheriff_votes(self, tiebreak: bool = False) -> Dict:
        vote_detail = {
            voter: ("abstain" if target is None else target)
            for voter, target in self.current_votes.items()
        }
        counts: Dict[str, int] = {}
        for target in self.current_votes.values():
            if target is not None:
                counts[target] = counts.get(target, 0) + 1

        data: Dict[str, Any] = {
            "round": self.state.round,
            "phase": self.state.phase.value,
            "votes": counts,
            "vote_detail": vote_detail,
        }
        if not counts:
            data.update(result="no_sheriff", reason="no_votes")
        else:
            highest = max(counts.values())
            pool = (
                self.sheriff_tie_candidates
                if tiebreak else self.sheriff_candidates
            )
            winners = [pid for pid in pool if counts.get(pid) == highest]
            if len(winners) == 1:
                data.update(result="elected", sheriff=winners[0])
            elif tiebreak:
                data.update(
                    result="no_sheriff",
                    reason="second_tie",
                    candidates=winners,
                )
            else:
                data.update(result="tie", candidates=winners)
        return {
            "event_type": "sheriff_election_result",
            "data": data,
            "visibility": "public",
        }

    def _finish_sheriff_election(
        self,
        events: List[Dict],
        sheriff_id: Optional[str],
        reason: str,
        announce: bool = True,
    ) -> None:
        from_phase = self.state.phase.value
        self.sheriff_election_done = True
        self.sheriff_id = sheriff_id
        if announce:
            events.append({
                "event_type": "sheriff_election_result",
                "data": {
                    "result": "elected" if sheriff_id else "no_sheriff",
                    "sheriff": sheriff_id,
                    "reason": reason,
                    "round": self.state.round,
                },
                "visibility": "public",
            })
        self.current_votes = {}
        self.sheriff_tie_candidates = []
        self._resolve_deferred_first_night(
            events, from_phase, GamePhase.SPEECH_ORDER
        )

    def _finish_voting(self, events: List[Dict], vote_result: Dict) -> None:
        if vote_result["data"].get("result") == "eliminated":
            eliminated = vote_result["data"]["eliminated"]
            self.pending_last_words.append(eliminated)
            events.append({"event_type": "player_death", "data": {"player": eliminated, "cause": "voted_out", "round": self.state.round}, "visibility": "public"})
            if self.state.players[eliminated].role == Role.WOLF_BEAUTY:
                self._resolve_wolf_beauty_charm(events, eliminated)
        self.tie_candidates = []
        from_phase = self.state.phase.value
        if self._has_pending_resolution():
            self.resume_phase = GamePhase.NIGHT
            self._start_next_death_skill_or_resume(events, from_phase)
        else:
            self._begin_next_night(events, from_phase)

    def _resolve_wolf_beauty_charm(
        self,
        events: List[Dict],
        wolf_beauty: str,
    ) -> None:
        """本版型仅在狼美人被白天放逐时结算上一夜魅惑。"""
        target = self.charmed_target
        self.charmed_target = None
        if not target or target not in self.state.alive_players:
            return
        self._kill_player(target, "wolf_beauty_charm")
        events.extend([
            {
                "event_type": "wolf_beauty_charm_triggered",
                "data": {
                    "wolf_beauty": wolf_beauty,
                    "target": target,
                    "round": self.state.round,
                },
                "visibility": "public",
            },
            {
                "event_type": "player_death",
                "data": {
                    "player": target,
                    "cause": "wolf_beauty_charm",
                    "round": self.state.round,
                },
                "visibility": "public",
            },
        ])
        if self._edge_completed():
            self._force_winner("werewolf", "wolf_beauty_charm_completed_edge")

    def finalize_wolf_vote(self) -> None:
        """狼队按多数票形成唯一刀口；同票按座位顺序确定，保证种子可复现。"""
        if not self.wolf_votes:
            self.last_night_kill = None
            return
        counts: Dict[str, int] = {}
        for target in self.wolf_votes.values():
            counts[target] = counts.get(target, 0) + 1
        highest = max(counts.values())
        self.last_night_kill = next(
            pid for pid in self.state.alive_players if counts.get(pid) == highest
        )

    def _reset_night_actions(self) -> None:
        self.last_night_kill = None
        self.wolf_votes = {}
        self.guarded_target = None
        self.witch_healed = False
        self.witch_poison_target = None
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in self.board["roles"]
            else "guard" if Role.GUARD in self.board["roles"]
            else "wolves"
        )
        self.acted_players = set()

    def _change_phase(
        self, events: List[Dict], from_phase: str, phase: GamePhase
    ) -> None:
        self.state.phase = phase
        if phase != GamePhase.NIGHT:
            self.night_stage = None
        self.acted_players = set()
        events.append({
            "event_type": "phase_change",
            "data": {
                "from": from_phase,
                "to": phase.value,
                "phase": phase.value,
                "round": self.state.round,
            },
            "visibility": "public",
        })

    def _begin_next_night(self, events: List[Dict], from_phase: str) -> None:
        if self.check_win_condition():
            return
        if self.state.round >= self.max_rounds:
            self.round_limit_reached = True
            return
        self.state.round += 1
        self.current_votes = {}
        self.last_night_deaths = []
        self.day_speech_order = []
        self.speech_direction = None
        self.sheriff_nomination = None
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in self.board["roles"]
            else "guard" if Role.GUARD in self.board["roles"]
            else "wolves"
        )
        self._change_phase(events, from_phase, GamePhase.NIGHT)

    def _start_next_death_skill_or_resume(
        self, events: List[Dict], from_phase: Optional[str] = None
    ) -> None:
        previous = from_phase or self.state.phase.value
        if self.badge_transfer_actor:
            self._change_phase(events, previous, GamePhase.BADGE_TRANSFER)
            return
        if self.pending_death_skills:
            self.death_skill_actor = self.pending_death_skills.pop(0)
            self._change_phase(events, previous, GamePhase.DEATH_SKILL)
            return
        self.death_skill_actor = None
        if self.pending_last_words:
            self.last_words_actor = self.pending_last_words.pop(0)
            self._change_phase(events, previous, GamePhase.LAST_WORDS)
            return

        self.last_words_actor = None
        target_phase = self.resume_phase or GamePhase.DAY
        self.resume_phase = None
        if target_phase == GamePhase.NIGHT:
            self._begin_next_night(events, previous)
        else:
            self._change_phase(events, previous, target_phase)

    def _build_day_speech_order(
        self, direction: str
    ) -> tuple[List[str], Optional[str], str]:
        """按固定座位表生成本轮白天发言顺序。"""
        alive = set(self.state.alive_players)
        if not alive:
            return [], None, "none"

        step = 1 if direction == "clockwise" else -1
        if len(self.last_night_deaths) == 1:
            anchor = self.last_night_deaths[0]
            anchor_type = "single_death"
            start_offset = step
        elif self.sheriff_id in alive:
            anchor = self.sheriff_id
            anchor_type = "sheriff"
            start_offset = step
        else:
            anchor = self.rng.choice(self.state.alive_players)
            anchor_type = "judge"
            start_offset = 0

        anchor_index = self.seat_order.index(anchor)
        order = []
        for offset in range(len(self.seat_order)):
            player_id = self.seat_order[
                (anchor_index + start_offset + offset * step) % len(self.seat_order)
            ]
            if player_id in alive and player_id not in order:
                order.append(player_id)

        if anchor_type == "sheriff" and anchor in order:
            order.remove(anchor)
            order.append(anchor)
        return order, anchor, anchor_type

    def _has_pending_resolution(self) -> bool:
        return bool(
            self.badge_transfer_actor
            or self.pending_death_skills
            or self.pending_last_words
            or self.last_words_actor
        )

    def _kill_player(self, player_id: str, cause: str = "unknown"):
        """杀死玩家"""
        if player_id in self.state.alive_players:
            self.state.alive_players.remove(player_id)
            self.state.dead_players.append(player_id)
            self.state.players[player_id].is_alive = False
            role = self.state.players[player_id].role
            # 本项目采用：猎人仅在狼刀或放逐出局时开枪；白狼王带走属于技能死亡。
            can_trigger = (
                role == Role.HUNTER
                and cause in {"werewolf_kill", "voted_out"}
            ) or (
                role == Role.WOLF_KING
                and cause in {"werewolf_kill", "voted_out", "hunter_shot"}
                and any(
                    p.is_alive and p.role in WOLF_ROLES
                    for p in self.state.players.values()
                )
            )
            if can_trigger:
                self.pending_death_skills.append(player_id)
            if player_id == self.sheriff_id:
                self.badge_transfer_actor = player_id

    def _process_votes(self, tiebreak: bool = False) -> Dict:
        """处理投票结果。

        投票明细 voter→target 对所有玩家公开（投票结束后才广播，投票进行中
        各玩家是盲投互不可见）。reasoning 不包含在此（属内心独白，已剥离）。
        """
        # 投票明细：voter -> target（弃票者为 None，记为 abstain 便于展示）
        vote_detail = {
            voter: (
                target if target is not None and self._can_be_exiled(target) else "abstain"
            )
            for voter, target in self.current_votes.items()
        }
        cast_votes = [target for target in vote_detail.values() if target != "abstain"]
        if not cast_votes:
            return {
                "event_type": "vote_result",
                "data": {
                    "result": "no_votes",
                    "round": self.state.round,
                    "phase": self.state.phase.value,
                    "vote_detail": vote_detail,
                },
                "visibility": "public"
            }

        # 统计票数（仅统计有效投票，不含弃票）
        vote_counts: Dict[str, float] = {}
        for voter, target in vote_detail.items():
            if target == "abstain":
                continue
            weight = 1.5 if voter == self.sheriff_id else 1.0
            vote_counts[target] = vote_counts.get(target, 0.0) + weight

        # 找到最高票数
        max_votes = max(vote_counts.values())
        candidates = [
            p for p in self.state.alive_players
            if self._can_be_exiled(p) and vote_counts.get(p) == max_votes
        ]

        # 平票处理：无人出局
        if len(candidates) > 1:
            return {
                "event_type": "vote_result",
                "data": {
                    "result": "no_elimination" if tiebreak else "tie",
                    "candidates": candidates,
                    "votes": vote_counts,
                    "vote_detail": vote_detail,
                    "round": self.state.round,
                    "phase": self.state.phase.value,
                },
                "visibility": "public"
            }

        # 有人获得最高票。白痴仅在白天首次被放逐时翻牌免死，并失去投票权。
        eliminated = candidates[0]
        player = self.state.players[eliminated]
        if player.role == Role.IDIOT and player.can_vote:
            player.can_vote = False
            return {
                "event_type": "vote_result",
                "data": {
                    "result": "idiot_revealed",
                    "player": eliminated,
                    "votes": vote_counts,
                    "vote_detail": vote_detail,
                    "round": self.state.round,
                    "phase": self.state.phase.value,
                },
                "visibility": "public",
            }

        self._kill_player(eliminated, "voted_out")

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
                "vote_detail": vote_detail,
                "round": self.state.round,
                "phase": self.state.phase.value,
            },
            "visibility": "public"
        }

    def _can_be_exiled(self, player_id: str) -> bool:
        player = self.state.players.get(player_id)
        return bool(
            player
            and player.is_alive
            and not (player.role == Role.IDIOT and not player.can_vote)
        )
