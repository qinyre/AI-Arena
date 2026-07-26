"""狼人杀核心规则。"""
import random
from typing import List, Dict, Optional, Any
from app.core.game import BaseGame
from app.core.models import (
    GameAction, GameState, Player, GameResult,
    GamePhase, Role, ActionType, GameEvent
)

WOLF_ROLES = {Role.WEREWOLF, Role.WHITE_WOLF_KING, Role.WOLF_KING}
GOD_ROLES = {Role.SEER, Role.WITCH, Role.HUNTER, Role.IDIOT, Role.GUARD}

# 单一板型数据源；顺序只用于构成，发牌前会洗牌。
BOARD_PRESETS = {
    "5p": {
        "name": "5人极简场",
        "roles": [Role.WEREWOLF, Role.SEER] + [Role.VILLAGER] * 3,
        "win_rule": "parity",
    },
    "9p": {
        "name": "9人标准场（三狼三神三民）",
        "roles": [Role.WEREWOLF] * 3
        + [Role.SEER, Role.WITCH, Role.HUNTER]
        + [Role.VILLAGER] * 3,
        "win_rule": "edge",
    },
    "12p_idiot": {
        "name": "12人预女猎白",
        "roles": [Role.WEREWOLF] * 4
        + [Role.SEER, Role.WITCH, Role.HUNTER, Role.IDIOT]
        + [Role.VILLAGER] * 4,
        "win_rule": "edge",
    },
    "12p_white_wolf_guard": {
        "name": "12人白狼王守卫",
        "roles": [Role.WEREWOLF] * 3
        + [Role.WHITE_WOLF_KING, Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD]
        + [Role.VILLAGER] * 4,
        "win_rule": "edge",
    },
    "12p_wolf_king_guard": {
        "name": "12人狼王守卫",
        "roles": [Role.WEREWOLF] * 3
        + [Role.WOLF_KING, Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD]
        + [Role.VILLAGER] * 4,
        "win_rule": "edge",
    },
}


class WerewolfGame(BaseGame):
    """狼人杀游戏实现。"""

    def __init__(self):
        self.game_id: str = ""
        self.state: Optional[GameState] = None
        self.config: Dict = {}
        self.last_night_kill: Optional[str] = None
        self.current_votes: Dict[str, Optional[str]] = {}
        self.tie_candidates: List[str] = []
        self.acted_players = set()
        self.rng = random.Random()
        self.board_id = "5p"
        self.night_stage = (
            "guard"
            if Role.GUARD in BOARD_PRESETS[self.board_id]["roles"]
            else "wolves"
        )
        self.wolf_votes: Dict[str, str] = {}
        self.guarded_target: Optional[str] = None
        self.guard_last_target: Optional[str] = None
        self.witch_healed = False
        self.witch_poison_target: Optional[str] = None
        self.witch_antidote_available = True
        self.witch_poison_available = True
        self.pending_death_skills: List[str] = []
        self.death_skill_actor: Optional[str] = None
        self.resume_phase: Optional[GamePhase] = None
        self.day_interrupted = False
        self.day_interrupt_window = False
        self.forced_winner: Optional[str] = None
        self.forced_win_reason: Optional[str] = None

    def initialize(self, players: List[str], config: Dict) -> None:
        """初始化游戏"""
        self.board_id = config.get("board_id", "5p")
        board = BOARD_PRESETS.get(self.board_id)
        if not board:
            raise ValueError(f"未知板型: {self.board_id}")
        if len(players) != len(board["roles"]):
            raise ValueError(f"{board['name']}需要恰好{len(board['roles'])}名玩家")

        self.game_id = config.get("game_id", "")
        self.config = config

        # 设置随机种子（可复现性）
        seed = config.get("seed")
        self.rng = random.Random(seed)

        roles = list(board["roles"])
        self.night_stage = "guard" if Role.GUARD in roles else "wolves"
        self.rng.shuffle(roles)

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
                "board_id": self.board_id,
                "board_name": board["name"],
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
            "board_id": self.board_id,
            "board_name": BOARD_PRESETS[self.board_id]["name"],
            "win_rule": BOARD_PRESETS[self.board_id]["win_rule"],
            # 明确告诉 AI 它是几号玩家（之前缺失，导致自我指代混乱）
            "your_player_id": player_id,
            "your_role": player.role.value,
            "your_status": "alive" if player.is_alive else "dead",
            "alive_players": alive,
            "dead_players": list(self.state.dead_players),
            "public_events": self._filter_public_events(limit=20)
        }

        # 角色特定信息
        if player.role in WOLF_ROLES:
            team = [
                pid for pid, member in self.state.players.items()
                if member.role in WOLF_ROLES
            ]
            visible["werewolf_team"] = team
            visible["werewolf_count"] = len(team)
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

        if self.state.phase == GamePhase.DEATH_SKILL:
            visible["death_skill_actor"] = self.death_skill_actor

        # 村民没有额外信息

        # 白天发言阶段：明确告诉 AI 发言顺序与自己的位置
        # （之前缺失，导致末位玩家误说"看后面玩家发言"）
        if self.state.phase in (GamePhase.DAY, GamePhase.TIEBREAK_SPEECH):
            # orchestrator 按 alive_players 顺序依次发言
            order = list(alive) if self.state.phase == GamePhase.DAY else list(self.tie_candidates)
            speeches_this_round = {
                e.data.get("speaker")
                for e in self.state.events
                if e.event_type == "player_speech"
                and e.visibility == "public"
                and isinstance(e.data, dict)
                and e.data.get("round") == self.state.round
                and e.data.get("phase") == self.state.phase.value
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
        may_use_death_skill = (
            self.state.phase == GamePhase.DEATH_SKILL
            and player_id == self.death_skill_actor
        )
        if (
            not player
            or (not player.is_alive and not may_use_death_skill)
            or player_id in self.acted_players
        ):
            return []

        actions = []

        if self.day_interrupt_window:
            if (
                self.state.phase not in (GamePhase.DAY, GamePhase.TIEBREAK_SPEECH)
                or player.role != Role.WHITE_WOLF_KING
            ):
                return []
            actions.append({
                "action_type": "self_destruct",
                "description": "立即打断当前白天发言，自爆并带走一名存活玩家",
                "target_required": True,
                "valid_targets": [p for p in self.state.alive_players if p != player_id],
                "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}},
            })
            actions.append(self._pass_action("暂不自爆"))
            return actions

        if self.state.phase == GamePhase.NIGHT:
            if self.night_stage == "wolf_discussion" and player.role in WOLF_ROLES:
                actions.append({
                    "action_type": "wolf_speak",
                    "description": "仅向存活狼队友提出本晚刀人意见",
                    "target_required": False,
                    "parameters": {
                        "content": {
                            "type": "string",
                            "description": "狼队密聊内容，应包含建议刀口及理由",
                        }
                    },
                })

            elif self.night_stage == "guard" and player.role == Role.GUARD:
                targets = [
                    p for p in self.state.alive_players
                    if p != self.guard_last_target
                ]
                actions.append({
                    "action_type": "guard",
                    "description": "守护一名玩家（不能连续两晚守同一人）",
                    "target_required": True,
                    "valid_targets": targets,
                    "parameters": {"reasoning": {"type": "string", "description": "守护理由"}}
                })
                actions.append(self._pass_action("本晚不守护"))

            elif self.night_stage == "wolves" and player.role in WOLF_ROLES:
                targets = list(self.state.alive_players)
                actions.append({
                    "action_type": "kill",
                    "description": "向狼队提交刀人目标（允许自刀或刀狼队友），按狼队多数票统一刀口",
                    "target_required": True,
                    "valid_targets": targets,
                    "parameters": {
                        "reasoning": {
                            "type": "string",
                            "description": "选择该目标的理由（内部推理）"
                        }
                    }
                })

            elif self.night_stage == "witch" and player.role == Role.WITCH:
                if self.witch_antidote_available and self.last_night_kill:
                    actions.append({
                        "action_type": "heal",
                        "description": "使用一次性解药救下狼队刀口",
                        "target_required": True,
                        "valid_targets": [self.last_night_kill],
                        "parameters": {"reasoning": {"type": "string", "description": "用药理由"}}
                    })
                if self.witch_poison_available:
                    actions.append({
                        "action_type": "poison",
                        "description": "使用一次性毒药毒杀一名其他玩家",
                        "target_required": True,
                        "valid_targets": [p for p in self.state.alive_players if p != player_id],
                        "parameters": {"reasoning": {"type": "string", "description": "用药理由"}}
                    })
                actions.append(self._pass_action("本晚不用药"))

            elif self.night_stage == "seer" and player.role == Role.SEER:
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

        elif self.state.phase == GamePhase.DEATH_SKILL and may_use_death_skill:
            targets = list(self.state.alive_players)
            actions.append({
                "action_type": "shoot",
                "description": "发动死亡技能带走一名存活玩家",
                "target_required": True,
                "valid_targets": targets,
                "parameters": {"reasoning": {"type": "string", "description": "开枪/带人理由"}}
            })
            actions.append(self._pass_action("放弃发动死亡技能"))

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
                        "enum": ["none", "villager"] + [
                            role.value for role in (
                                Role.SEER, Role.WITCH, Role.HUNTER,
                                Role.IDIOT, Role.GUARD
                            )
                            if role in BOARD_PRESETS[self.board_id]["roles"]
                        ],
                        "description": "是否跳身份（狼人不能跳狼人）"
                    }
                }
            })
            if player.role in WOLF_ROLES:
                is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                actions.append({
                    "action_type": "self_destruct",
                    "description": (
                        "白天自爆并带走一名其他存活玩家，本轮立即入夜"
                        if is_white_wolf_king else
                        "白天自爆，本轮立即入夜"
                    ),
                    "target_required": is_white_wolf_king,
                    "valid_targets": (
                        [p for p in self.state.alive_players if p != player_id]
                        if is_white_wolf_king else []
                    ),
                    "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}}
                })

        elif self.state.phase == GamePhase.VOTING:
            # 投票阶段。保留弃票选项，但弃票必须有理由（信息严重不足、
            # 避免误投好人等），不能空着 reasoning 偷懒弃票。
            if not player.can_vote:
                return []
            targets = [p for p in self.state.alive_players if p != player_id]
            actions.append({
                "action_type": "vote",
                "description": "投票放逐一名玩家",
                "target_required": True,
                "valid_targets": targets,
                "parameters": {
                    "reasoning": {
                        "type": "string",
                        "description": "投票理由（公开，必须说明投该玩家的依据）"
                    }
                }
            })
            actions.append({
                "action_type": "abstain",
                "description": "弃票（仅在确有正当理由时使用，必须填写弃票理由）",
                "target_required": False,
                "parameters": {
                    "reasoning": {
                        "type": "string",
                        "description": "弃票理由（公开，必须说明为何不投任何人）"
                    }
                }
            })

        elif self.state.phase == GamePhase.TIEBREAK_SPEECH:
            if player_id in self.tie_candidates:
                actions.append({
                    "action_type": "speak", "description": "同票候选人发言",
                    "target_required": False,
                    "parameters": {"content": {"type": "string", "description": "公开发言"}}
                })
                if player.role in WOLF_ROLES:
                    is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                    actions.append({
                        "action_type": "self_destruct",
                        "description": (
                            "自爆并带走一名其他存活玩家"
                            if is_white_wolf_king else "自爆并立即入夜"
                        ),
                        "target_required": is_white_wolf_king,
                        "valid_targets": (
                            [p for p in self.state.alive_players if p != player_id]
                            if is_white_wolf_king else []
                        ),
                        "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}},
                    })

        elif self.state.phase == GamePhase.TIEBREAK_VOTING:
            if player_id not in self.tie_candidates and player.can_vote:
                actions.append({
                    "action_type": "vote", "description": "在同票候选人中投票",
                    "target_required": True, "valid_targets": list(self.tie_candidates),
                    "parameters": {"reasoning": {"type": "string", "description": "投票理由"}}
                })
                actions.append({
                    "action_type": "abstain",
                    "description": "弃票（必须填写弃票理由）",
                    "target_required": False,
                    "parameters": {"reasoning": {"type": "string", "description": "弃票理由"}}
                })

        return actions

    @staticmethod
    def _pass_action(description: str) -> Dict:
        return {
            "action_type": "pass",
            "description": description,
            "target_required": False,
            "parameters": {"reasoning": {"type": "string", "description": "放弃理由"}},
        }

    def is_valid_action(self, action: GameAction) -> bool:
        """验证动作是否合法"""
        if not self.state:
            return False

        player = self.state.players.get(action.actor_id)
        may_use_death_skill = (
            self.state.phase == GamePhase.DEATH_SKILL
            and action.actor_id == self.death_skill_actor
        )
        if not player or (not player.is_alive and not may_use_death_skill):
            return False

        # 获取可选动作列表
        available = self.get_available_actions(action.actor_id)

        # 检查动作类型是否允许
        action_type_str = action.action_type.value
        valid_types = [a["action_type"] for a in available]
        if action_type_str not in valid_types:
            return False

        # 检查目标是否合法
        spec = next(a for a in available if a["action_type"] == action_type_str)
        if spec.get("target_required"):
            if action.target_id not in spec.get("valid_targets", []):
                return False
        elif action.target_id is not None:
            return False

        if not isinstance(action.parameters, dict):
            return False
        if action.action_type in (ActionType.SPEAK, ActionType.WOLF_SPEAK):
            content = action.parameters.get("content")
            if not isinstance(content, str) or not content.strip() or len(content) > 500:
                return False
        if action.action_type == ActionType.SPEAK:
            claimable = {"none", "villager"} | {
                role.value for role in GOD_ROLES
                if role in BOARD_PRESETS[self.board_id]["roles"]
            }
            if action.parameters.get("claim_role", "none") not in claimable:
                return False
        reasoning = action.parameters.get("reasoning", "")
        if not isinstance(reasoning, str) or len(reasoning) > 500:
            return False

        return True

    def apply_action(self, action: GameAction) -> List[Dict]:
        """应用动作，返回事件列表"""
        if not self.is_valid_action(action):
            raise ValueError(f"Invalid action: {action}")

        events = []

        if action.action_type == ActionType.KILL:
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
                "reasoning": action.parameters.get("reasoning", ""),
                "round": self.state.round,
                "phase": self.state.phase.value
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

        elif action.action_type == ActionType.ABSTAIN:
            self.current_votes[action.actor_id] = None
            events.append({
                "event_type": "player_abstain",
                "data": {
                    "voter": action.actor_id,
                    "round": self.state.round,
                    "reasoning": action.parameters.get("reasoning", "")
                },
                "visibility": "public"
            })

        # 将事件添加到游戏状态
        for event_data in events:
            self.state.events.append(GameEvent(**event_data))
        self.acted_players.add(action.actor_id)

        return events

    def advance_phase(self) -> List[Dict]:
        """推进游戏阶段"""
        events = []

        if (
            self.day_interrupted
            and self.state.phase in (GamePhase.DAY, GamePhase.TIEBREAK_SPEECH)
        ):
            from_phase = self.state.phase.value
            self.day_interrupted = False
            if self.pending_death_skills:
                self.resume_phase = GamePhase.NIGHT
                self._start_next_death_skill_or_resume(events, from_phase)
            else:
                self._begin_next_night(events, from_phase)

        elif self.state.phase == GamePhase.DEATH_SKILL:
            self._start_next_death_skill_or_resume(events)

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

        elif self.state.phase == GamePhase.NIGHT:
            deaths = []
            if self.last_night_kill:
                protected = self.guarded_target == self.last_night_kill
                # 同守同救会抵消两种保护，狼刀仍然生效。
                survives = protected ^ self.witch_healed
                if not survives:
                    deaths.append((self.last_night_kill, "werewolf_kill"))
            if self.witch_poison_target:
                deaths.append((self.witch_poison_target, "poison"))

            for victim, cause in deaths:
                if victim not in self.state.alive_players:
                    continue
                self._kill_player(victim, cause)
                if cause == "werewolf_kill" and self._edge_completed():
                    # 竞技屠边局采用狼刀在先：狼刀已经完成屠边时，后续毒药
                    # 即使杀光狼人也不反转本轮胜负。
                    self._force_winner("werewolf", "werewolf_kill_completed_edge")
                events.append({
                    "event_type": "player_death",
                    "data": {
                        "player": victim,
                        "cause": cause,
                        "round": self.state.round
                    },
                    "visibility": "public"
                })

            from_phase = self.state.phase.value
            self.guard_last_target = self.guarded_target
            self._reset_night_actions()
            if self.pending_death_skills:
                self.resume_phase = GamePhase.DAY
                self._start_next_death_skill_or_resume(events, from_phase)
            else:
                self._change_phase(events, from_phase, GamePhase.DAY)

        elif self.state.phase == GamePhase.DAY:
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

            from_phase = self.state.phase.value
            if self.pending_death_skills:
                self.resume_phase = GamePhase.NIGHT
                self._start_next_death_skill_or_resume(events, from_phase)
            else:
                self._begin_next_night(events, from_phase)

        # 将阶段推进产生的事件追加到游戏状态事件流
        # (apply_action 内部已有 append，但 advance_phase 此前遗漏，导致
        #  phase_change / 夜晚 player_death / vote_result 全部丢失)
        for event_data in events:
            self.state.events.append(GameEvent(**event_data))

        return events

    def _finish_voting(self, events: List[Dict], vote_result: Dict) -> None:
        if vote_result["data"].get("result") == "eliminated":
            eliminated = vote_result["data"]["eliminated"]
            events.append({"event_type": "player_death", "data": {"player": eliminated, "cause": "voted_out", "round": self.state.round}, "visibility": "public"})
        self.tie_candidates = []
        from_phase = self.state.phase.value
        if self.pending_death_skills:
            self.resume_phase = GamePhase.NIGHT
            self._start_next_death_skill_or_resume(events, from_phase)
        else:
            self._begin_next_night(events, from_phase)

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
            "guard"
            if Role.GUARD in BOARD_PRESETS[self.board_id]["roles"]
            else "wolves"
        )
        self.acted_players = set()

    def _change_phase(
        self, events: List[Dict], from_phase: str, phase: GamePhase
    ) -> None:
        self.state.phase = phase
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
        self.state.round += 1
        self.current_votes = {}
        self.night_stage = (
            "guard"
            if Role.GUARD in BOARD_PRESETS[self.board_id]["roles"]
            else "wolves"
        )
        self._change_phase(events, from_phase, GamePhase.NIGHT)

    def _start_next_death_skill_or_resume(
        self, events: List[Dict], from_phase: Optional[str] = None
    ) -> None:
        previous = from_phase or self.state.phase.value
        if self.pending_death_skills:
            self.death_skill_actor = self.pending_death_skills.pop(0)
            self._change_phase(events, previous, GamePhase.DEATH_SKILL)
            return

        self.death_skill_actor = None
        target_phase = self.resume_phase or GamePhase.DAY
        self.resume_phase = None
        if target_phase == GamePhase.NIGHT:
            self._begin_next_night(events, previous)
        else:
            self._change_phase(events, previous, target_phase)

    def check_win_condition(self) -> Optional[GameResult]:
        """检查胜利条件"""
        if not self.state:
            return None

        if self.forced_winner:
            return GameResult(
                game_id=self.game_id,
                winner=self.forced_winner,
                final_round=self.state.round,
                reason=self.forced_win_reason or "priority_win",
                duration_seconds=0.0,
            )

        if self.pending_death_skills or self.state.phase == GamePhase.DEATH_SKILL:
            return None

        werewolves_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role in WOLF_ROLES
        )
        good_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role not in WOLF_ROLES
        )

        if werewolves_alive == 0:
            return GameResult(
                game_id=self.game_id,
                winner="good",
                final_round=self.state.round,
                reason="all_werewolves_eliminated",
                duration_seconds=0.0
            )

        if BOARD_PRESETS[self.board_id]["win_rule"] == "edge":
            villagers_alive = sum(
                1 for p in self.state.players.values()
                if p.is_alive and p.role == Role.VILLAGER
            )
            gods_alive = sum(
                1 for p in self.state.players.values()
                if p.is_alive and p.role in GOD_ROLES
            )
            wolf_wins = villagers_alive == 0 or gods_alive == 0
            reason = "all_villagers_or_gods_eliminated"
        else:
            wolf_wins = werewolves_alive >= good_alive
            reason = "werewolves_outnumber_villagers"

        if wolf_wins:
            return GameResult(
                game_id=self.game_id,
                winner="werewolf",
                final_round=self.state.round,
                reason=reason,
                duration_seconds=0.0
            )

        return None

    def _edge_completed(self) -> bool:
        if BOARD_PRESETS[self.board_id]["win_rule"] != "edge":
            return False
        villagers_alive = any(
            p.is_alive and p.role == Role.VILLAGER
            for p in self.state.players.values()
        )
        gods_alive = any(
            p.is_alive and p.role in GOD_ROLES
            for p in self.state.players.values()
        )
        return not villagers_alive or not gods_alive

    def _force_winner(self, winner: str, reason: str) -> None:
        if self.forced_winner is None:
            self.forced_winner = winner
            self.forced_win_reason = reason

    def get_game_summary(self) -> Dict:
        """获取游戏总结"""
        if not self.state:
            return {}

        return {
            "game_id": self.game_id,
            "board_id": self.board_id,
            "board_name": BOARD_PRESETS[self.board_id]["name"],
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

    def _kill_player(self, player_id: str, cause: str = "unknown"):
        """杀死玩家"""
        if player_id in self.state.alive_players:
            self.state.alive_players.remove(player_id)
            self.state.dead_players.append(player_id)
            self.state.players[player_id].is_alive = False
            role = self.state.players[player_id].role
            can_trigger = (
                role == Role.HUNTER
                and cause in {"werewolf_kill", "voted_out"}
            ) or (
                role == Role.WOLF_KING
                and cause in {"werewolf_kill", "voted_out", "hunter_shot"}
            )
            if can_trigger:
                self.pending_death_skills.append(player_id)

    def _process_votes(self, tiebreak: bool = False) -> Dict:
        """处理投票结果。

        投票明细 voter→target 对所有玩家公开（投票结束后才广播，投票进行中
        各玩家是盲投互不可见）。reasoning 不包含在此（属内心独白，已剥离）。
        """
        # 投票明细：voter -> target（弃票者为 None，记为 abstain 便于展示）
        vote_detail = {
            voter: ("abstain" if target is None else target)
            for voter, target in self.current_votes.items()
        }
        cast_votes = [target for target in self.current_votes.values() if target is not None]
        if not cast_votes:
            return {
                "event_type": "vote_result",
                "data": {"result": "no_votes", "round": self.state.round, "vote_detail": vote_detail},
                "visibility": "public"
            }

        # 统计票数（仅统计有效投票，不含弃票）
        vote_counts = {}
        for target in cast_votes:
            vote_counts[target] = vote_counts.get(target, 0) + 1

        # 找到最高票数
        max_votes = max(vote_counts.values())
        candidates = [p for p in self.state.alive_players if vote_counts.get(p) == max_votes]

        # 平票处理：无人出局
        if len(candidates) > 1:
            return {
                "event_type": "vote_result",
                "data": {
                    "result": "no_elimination" if tiebreak else "tie",
                    "candidates": candidates,
                    "votes": vote_counts,
                    "vote_detail": vote_detail,
                    "round": self.state.round
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
                "round": self.state.round
            },
            "visibility": "public"
        }

    def _filter_public_events(self, limit: int = 20) -> List[Dict]:
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
            elif et == "player_death" and isinstance(d.get("data"), dict):
                data = dict(d["data"])
                if data.get("cause") in {"werewolf_kill", "poison"}:
                    data["cause"] = "night_death"
                d["data"] = data
            result.append(d)
        return result[-limit:]
