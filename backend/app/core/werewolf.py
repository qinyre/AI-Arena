"""狼人杀核心规则。"""
import random
from typing import List, Dict, Optional, Any
from app.core.game import BaseGame
from app.core.models import (
    GameAction, GameState, Player, GameResult,
    GamePhase, Role, ActionType, GameEvent
)

WOLF_ROLES = {
    Role.WEREWOLF, Role.WHITE_WOLF_KING, Role.WOLF_KING, Role.WOLF_BEAUTY,
}
GOD_ROLES = {
    Role.SEER, Role.WITCH, Role.HUNTER, Role.IDIOT, Role.GUARD, Role.KNIGHT,
}

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
    "12p_wolf_beauty_knight": {
        "name": "12人狼美骑士",
        "roles": [Role.WEREWOLF] * 3
        + [Role.WOLF_BEAUTY, Role.SEER, Role.WITCH, Role.GUARD, Role.KNIGHT]
        + [Role.VILLAGER] * 4,
        "win_rule": "edge",
    },
}


def resolve_board_config(
    board_id: str,
    custom_board: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """将预设或自定义板型规范化为引擎可直接使用的配置。"""
    if board_id != "custom":
        board = BOARD_PRESETS.get(board_id)
        if not board:
            raise ValueError(f"未知板型: {board_id}")
        return {**board, "roles": list(board["roles"])}

    if not custom_board:
        raise ValueError("自定义板型缺少角色配置")
    try:
        roles = [role if isinstance(role, Role) else Role(role) for role in custom_board["roles"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("自定义板型包含未知角色") from exc

    if not 5 <= len(roles) <= 18:
        raise ValueError("自定义板型需要 5—18 名玩家")
    repeatable = {Role.WEREWOLF, Role.VILLAGER}
    duplicated = next(
        (role for role in roles if role not in repeatable and roles.count(role) > 1),
        None,
    )
    if duplicated:
        raise ValueError(f"自定义板型中 {duplicated.value} 只能有一名")

    wolves = sum(role in WOLF_ROLES for role in roles)
    goods = len(roles) - wolves
    if wolves == 0 or goods == 0:
        raise ValueError("自定义板型必须同时包含狼人和好人")
    if wolves >= goods:
        raise ValueError("开局狼人数量必须少于好人数量")

    win_rule = custom_board.get("win_rule", "edge")
    if win_rule not in {"parity", "edge"}:
        raise ValueError("自定义板型胜利规则必须为 parity 或 edge")
    if win_rule == "edge" and (
        Role.VILLAGER not in roles or not any(role in GOD_ROLES for role in roles)
    ):
        raise ValueError("屠边板型必须同时包含平民和神职")

    name = str(custom_board.get("name") or "自定义板型").strip()
    if not name:
        raise ValueError("自定义板型名称不能为空")
    return {"name": name[:30], "roles": roles, "win_rule": win_rule}


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
        self.board = resolve_board_config(self.board_id)
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in self.board["roles"]
            else "guard" if Role.GUARD in self.board["roles"]
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
        self.pending_last_words: List[str] = []
        self.last_words_actor: Optional[str] = None
        self.sheriff_enabled = False
        self.sheriff_election_done = False
        self.sheriff_id: Optional[str] = None
        self.sheriff_runners: List[str] = []
        self.sheriff_candidates: List[str] = []
        self.sheriff_withdrawn: List[str] = []
        self.sheriff_voters: List[str] = []
        self.sheriff_tie_candidates: List[str] = []
        self.badge_transfer_actor: Optional[str] = None
        self.seat_order: List[str] = []
        self.last_night_deaths: List[str] = []
        self.day_speech_order: List[str] = []
        self.speech_direction: Optional[str] = None
        self.sheriff_nomination: Optional[str] = None
        self.resume_phase: Optional[GamePhase] = None
        self.day_interrupted = False
        self.day_interrupt_window = False
        self.forced_winner: Optional[str] = None
        self.forced_win_reason: Optional[str] = None
        self.charmed_target: Optional[str] = None
        self.knight_duel_used = False
        self.knight_duel_ends_day = False
        self.max_rounds = 20
        self.round_limit_reached = False

    def initialize(self, players: List[str], config: Dict) -> None:
        """初始化游戏"""
        self.board_id = config.get("board_id", "5p")
        board = resolve_board_config(self.board_id, config.get("custom_board"))
        self.board = board
        if len(players) != len(board["roles"]):
            raise ValueError(f"{board['name']}需要恰好{len(board['roles'])}名玩家")

        self.game_id = config.get("game_id", "")
        self.config = config
        self.max_rounds = max(1, int(config.get("max_rounds", 20)))
        self.round_limit_reached = False
        self.sheriff_enabled = bool(config.get("enable_sheriff", False))
        self.seat_order = list(players)

        # 设置随机种子（可复现性）
        seed = config.get("seed")
        self.rng = random.Random(seed)

        roles = list(board["roles"])
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in roles
            else "guard" if Role.GUARD in roles
            else "wolves"
        )
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
                "sheriff_enabled": self.sheriff_enabled,
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

    def get_available_actions(self, player_id: str) -> List[Dict]:
        """获取玩家可执行的动作"""
        if not self.state:
            return []

        player = self.state.players.get(player_id)
        may_use_death_skill = (
            self.state.phase == GamePhase.DEATH_SKILL
            and player_id == self.death_skill_actor
        )
        may_transfer_badge = (
            self.state.phase == GamePhase.BADGE_TRANSFER
            and player_id == self.badge_transfer_actor
        )
        may_leave_last_words = (
            self.state.phase == GamePhase.LAST_WORDS
            and player_id == self.last_words_actor
        )
        if (
            not player
            or (
                not player.is_alive
                and not may_use_death_skill
                and not may_transfer_badge
                and not may_leave_last_words
            )
            or player_id in self.acted_players
        ):
            return []

        actions = []

        if self.day_interrupt_window:
            if (
                self.state.phase not in (
                    GamePhase.DAY,
                    GamePhase.SHERIFF_SUMMARY,
                    GamePhase.TIEBREAK_SPEECH,
                    GamePhase.SHERIFF_CAMPAIGN,
                    GamePhase.SHERIFF_TIEBREAK_SPEECH,
                )
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

        if self.state.phase == GamePhase.BADGE_TRANSFER and may_transfer_badge:
            actions.append({
                "action_type": "transfer_badge",
                "description": "将警徽移交给一名存活玩家",
                "target_required": True,
                "valid_targets": list(self.state.alive_players),
                "parameters": {"reasoning": {"type": "string", "description": "移交理由"}},
            })
            actions.append({
                "action_type": "destroy_badge",
                "description": "撕毁警徽，本局不再有警长",
                "target_required": False,
                "parameters": {"reasoning": {"type": "string", "description": "撕徽理由"}},
            })

        elif self.state.phase == GamePhase.LAST_WORDS and may_leave_last_words:
            actions.append({
                "action_type": "speak",
                "description": "发表最后陈词",
                "target_required": False,
                "parameters": {
                    "content": {"type": "string", "description": "留给场上玩家的遗言"},
                    "claim_role": {
                        "type": "string",
                        "enum": ["none", "villager"] + [
                            role.value for role in GOD_ROLES
                            if role in self.board["roles"]
                        ],
                    },
                },
            })
        elif (
            self.state.phase == GamePhase.KNIGHT_DUEL
            and player.role == Role.KNIGHT
            and not self.knight_duel_used
        ):
            actions.append({
                "action_type": "duel",
                "description": "翻牌决斗一名玩家：命中狼人则其出局并立即入夜，命中好人则骑士出局且白天继续",
                "target_required": True,
                "valid_targets": [
                    target for target in self.state.alive_players
                    if target != player_id
                ],
                "parameters": {
                    "reasoning": {"type": "string", "description": "发动决斗及选择目标的公开依据"}
                },
            })
            actions.append(self._pass_action("本轮暂不发动一次性决斗"))
        elif self.state.phase == GamePhase.NIGHT:
            if self.night_stage == "charm" and player.role == Role.WOLF_BEAUTY:
                actions.append({
                    "action_type": "charm",
                    "description": "魅惑一名其他存活玩家（不能连续两晚魅惑同一人）；若你本轮被白天放逐，该玩家随之殉情",
                    "target_required": True,
                    "valid_targets": [
                        target for target in self.state.alive_players
                        if target != player_id and target != self.charmed_target
                    ],
                    "parameters": {
                        "reasoning": {"type": "string", "description": "魅惑目标的内部策略"}
                    },
                })

            elif self.night_stage == "wolf_discussion" and player.role in WOLF_ROLES:
                actions.append({
                    "action_type": "wolf_speak",
                    "description": "仅在能补充新目标、新依据或新风险时向存活狼队友发言",
                    "target_required": False,
                    "parameters": {
                        "content": {
                            "type": "string",
                            "description": "不可复述已有意见；应提供新的刀口信息",
                        }
                    },
                })
                actions.append(self._pass_action("已有意见足够且没有新信息，保持沉默"))

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
                # 狼美骑士口径：狼美人不能成为狼刀目标，因此不能自刀。
                targets = [
                    target for target in self.state.alive_players
                    if self.state.players[target].role != Role.WOLF_BEAUTY
                ]
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
                if (
                    self.witch_antidote_available
                    and self.last_night_kill
                    and self.last_night_kill != player_id
                ):
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

        elif self.state.phase == GamePhase.SHERIFF_CAMPAIGN:
            actions.append(self._pass_action("不上警"))
            actions.append({
                "action_type": "speak",
                "description": "上警并发表竞选警长发言",
                "target_required": False,
                "parameters": {
                    "content": {
                        "type": "string",
                        "description": "竞选发言；预言家应报验人并安排警徽流",
                    },
                    "claim_role": {
                        "type": "string",
                        "enum": ["none", "villager"] + [
                            role.value for role in (
                                Role.SEER, Role.WITCH, Role.HUNTER,
                                Role.IDIOT, Role.GUARD, Role.KNIGHT
                            )
                            if role in self.board["roles"]
                        ],
                        "description": "竞选时公开声明的身份",
                    },
                },
            })
            if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
                is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                actions.append({
                    "action_type": "self_destruct",
                    "description": "在警长竞选中自爆并终止竞选",
                    "target_required": is_white_wolf_king,
                    "valid_targets": (
                        [p for p in self.state.alive_players if p != player_id]
                        if is_white_wolf_king else []
                    ),
                    "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}},
                })

        elif self.state.phase == GamePhase.SHERIFF_WITHDRAWAL:
            if player_id in self.sheriff_candidates:
                actions.append({
                    "action_type": "withdraw",
                    "description": "退出警长竞选",
                    "target_required": False,
                    "parameters": {
                        "reasoning": {"type": "string", "description": "听完全部竞选发言后的退水理由"}
                    },
                })
                actions.append(self._pass_action("继续竞选警长"))
                if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
                    is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                    actions.append({
                        "action_type": "self_destruct",
                        "description": "在退水阶段自爆并终止警长竞选",
                        "target_required": is_white_wolf_king,
                        "valid_targets": (
                            [p for p in self.state.alive_players if p != player_id]
                            if is_white_wolf_king else []
                        ),
                        "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}},
                    })

        elif self.state.phase == GamePhase.SHERIFF_VOTING:
            if player_id in self.sheriff_voters and player.can_vote:
                actions.append({
                    "action_type": "vote",
                    "description": "从未退水的警长候选人中投票",
                    "target_required": True,
                    "valid_targets": list(self.sheriff_candidates),
                    "parameters": {"reasoning": {"type": "string", "description": "警长票理由"}},
                })
                actions.append({
                    "action_type": "abstain",
                    "description": "放弃警长票（必须说明理由）",
                    "target_required": False,
                    "parameters": {"reasoning": {"type": "string", "description": "弃票理由"}},
                })

        elif self.state.phase == GamePhase.SHERIFF_TIEBREAK_SPEECH:
            if player_id in self.sheriff_tie_candidates:
                actions.append({
                    "action_type": "speak",
                    "description": "警长平票候选人进行 PK 发言",
                    "target_required": False,
                    "parameters": {
                        "content": {"type": "string", "description": "公开 PK 发言"},
                        "claim_role": {
                            "type": "string",
                            "enum": ["none", "villager"] + [
                                role.value for role in GOD_ROLES
                                if role in self.board["roles"]
                            ],
                        },
                    },
                })
                if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
                    is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                    actions.append({
                        "action_type": "self_destruct",
                        "description": "在警长 PK 中自爆并终止竞选",
                        "target_required": is_white_wolf_king,
                        "valid_targets": (
                            [p for p in self.state.alive_players if p != player_id]
                            if is_white_wolf_king else []
                        ),
                        "parameters": {"reasoning": {"type": "string", "description": "自爆理由"}},
                    })

        elif self.state.phase == GamePhase.SHERIFF_TIEBREAK_VOTING:
            if player_id in self.sheriff_voters and player.can_vote:
                actions.append({
                    "action_type": "vote",
                    "description": "在警长平票候选人中再次投票",
                    "target_required": True,
                    "valid_targets": list(self.sheriff_tie_candidates),
                    "parameters": {"reasoning": {"type": "string", "description": "警长 PK 票理由"}},
                })
                actions.append({
                    "action_type": "abstain",
                    "description": "放弃警长 PK 票（必须说明理由）",
                    "target_required": False,
                    "parameters": {"reasoning": {"type": "string", "description": "弃票理由"}},
                })

        elif (
            self.state.phase == GamePhase.SPEECH_ORDER
            and player_id == self.sheriff_id
        ):
            actions.extend([
                {
                    "action_type": "order_clockwise",
                    "description": "指定按座位正序发言",
                    "target_required": False,
                    "parameters": {
                        "reasoning": {
                            "type": "string",
                            "description": "选择该方向的公开理由",
                        }
                    },
                },
                {
                    "action_type": "order_counterclockwise",
                    "description": "指定按座位逆序发言",
                    "target_required": False,
                    "parameters": {
                        "reasoning": {
                            "type": "string",
                            "description": "选择该方向的公开理由",
                        }
                    },
                },
            ])

        elif (
            self.state.phase == GamePhase.SHERIFF_SUMMARY
            and player_id == self.sheriff_id
        ):
            actions.append({
                "action_type": "speak",
                "description": "警长总结全场发言并归票",
                "target_required": True,
                "valid_targets": [
                    pid for pid in self.state.alive_players
                    if pid != player_id
                ],
                "parameters": {
                    "content": {
                        "type": "string",
                        "description": "公开总结、站边分析与明确归票理由",
                    },
                    "claim_role": {
                        "type": "string",
                        "enum": ["none", "villager"] + [
                            role.value for role in GOD_ROLES
                            if role in self.board["roles"]
                        ],
                    },
                },
            })
            if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
                is_white_wolf_king = player.role == Role.WHITE_WOLF_KING
                actions.append({
                    "action_type": "self_destruct",
                    "description": "在归票前自爆并立即进入夜晚",
                    "target_required": is_white_wolf_king,
                    "valid_targets": (
                        [p for p in self.state.alive_players if p != player_id]
                        if is_white_wolf_king else []
                    ),
                    "parameters": {
                        "reasoning": {"type": "string", "description": "自爆理由"}
                    },
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
                        "enum": ["none", "villager"] + [
                            role.value for role in (
                                Role.SEER, Role.WITCH, Role.HUNTER,
                                Role.IDIOT, Role.GUARD, Role.KNIGHT
                            )
                            if role in self.board["roles"]
                        ],
                        "description": "是否跳身份（狼人不能跳狼人）"
                    }
                }
            })
            if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
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
            targets = [
                p for p in self.state.alive_players
                if p != player_id and self._can_be_exiled(p)
            ]
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
                if player.role in WOLF_ROLES and player.role != Role.WOLF_BEAUTY:
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
                    "target_required": True,
                    "valid_targets": [p for p in self.tie_candidates if self._can_be_exiled(p)],
                    "parameters": {"reasoning": {"type": "string", "description": "投票理由"}}
                })
                actions.append({
                    "action_type": "abstain",
                    "description": "弃票（必须填写弃票理由）",
                    "target_required": False,
                    "parameters": {"reasoning": {"type": "string", "description": "弃票理由"}}
                })

        # 所有公开发言共用同一份结构化立场字段。字段保持可选，兼容旧存档、
        # 手写测试动作及能力较弱的模型；缺省值由 Agent/事件层归一化。
        stance_targets = [
            target for target in self.state.alive_players if target != player_id
        ]
        public_event_count = sum(
            event.visibility == "public" for event in self.state.events
        )
        visible_event_indexes = list(range(
            max(0, public_event_count - 20),
            public_event_count,
        ))
        stance_parameters = {
            "suspects": {
                "type": "array",
                "items": {"type": "string", "enum": stance_targets},
                "maxItems": 3,
                "description": "本次公开表达中明确怀疑的存活玩家，最多3人",
            },
            "trusted": {
                "type": "array",
                "items": {"type": "string", "enum": stance_targets},
                "maxItems": 3,
                "description": "本次公开表达中明确偏信的存活玩家，最多3人",
            },
            "intended_vote": {
                "type": ["string", "null"],
                "enum": stance_targets + ["abstain", None],
                "description": "当前公开计划放逐的玩家；准备弃票填 abstain，尚未决定填 null",
            },
            "role_reads": {
                "type": "object",
                "maxProperties": 4,
                "allowed_players": stance_targets,
                "allowed_values": ["unknown", "good"] + [
                    role.value for role in Role
                ],
                "description": "最多4项：玩家ID到你公开判断的阵营或身份映射",
            },
            "evidence_event_indexes": {
                "type": "array",
                "available_count": public_event_count,
                "allowed_values": visible_event_indexes,
                "items": {
                    "type": "integer",
                    "enum": visible_event_indexes,
                },
                "maxItems": 5,
                "description": "支撑本次立场的公开事件编号；无可引用证据时留空",
            },
        }
        for action in actions:
            if action.get("action_type") == "speak":
                action.setdefault("parameters", {}).update(stance_parameters)

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
        may_transfer_badge = (
            self.state.phase == GamePhase.BADGE_TRANSFER
            and action.actor_id == self.badge_transfer_actor
        )
        may_leave_last_words = (
            self.state.phase == GamePhase.LAST_WORDS
            and action.actor_id == self.last_words_actor
        )
        if not player or (
            not player.is_alive
            and not may_use_death_skill
            and not may_transfer_badge
            and not may_leave_last_words
        ):
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
                if role in self.board["roles"]
            }
            if action.parameters.get("claim_role", "none") not in claimable:
                return False
            stance_targets = {
                target for target in self.state.alive_players
                if target != action.actor_id
            }
            suspects = action.parameters.get("suspects", [])
            trusted = action.parameters.get("trusted", [])
            for values in (suspects, trusted):
                if (
                    not isinstance(values, list)
                    or len(values) > 3
                    or any(not isinstance(value, str) for value in values)
                    or len(values) != len(set(values))
                    or any(value not in stance_targets for value in values)
                ):
                    return False
            if set(suspects) & set(trusted):
                return False
            intended_vote = action.parameters.get("intended_vote")
            if (
                intended_vote is not None
                and intended_vote != "abstain"
                and intended_vote not in stance_targets
            ):
                return False
            role_reads = action.parameters.get("role_reads", {})
            allowed_reads = {"unknown", "good"} | {role.value for role in Role}
            if (
                not isinstance(role_reads, dict)
                or len(role_reads) > 4
                or any(
                    not isinstance(target, str)
                    or not isinstance(read, str)
                    or target not in stance_targets
                    or read not in allowed_reads
                    for target, read in role_reads.items()
                )
            ):
                return False
            evidence = action.parameters.get("evidence_event_indexes", [])
            public_event_count = sum(
                event.visibility == "public" for event in self.state.events
            )
            visible_event_indexes = set(range(
                max(0, public_event_count - 20),
                public_event_count,
            ))
            if (
                not isinstance(evidence, list)
                or len(evidence) > 5
                or len(evidence) != len(set(evidence))
                or any(
                    isinstance(index, bool)
                    or not isinstance(index, int)
                    or index not in visible_event_indexes
                    for index in evidence
                )
            ):
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

        if self._has_pending_resolution() or self.state.phase in (
            GamePhase.DEATH_SKILL,
            GamePhase.BADGE_TRANSFER,
        ):
            return None

        if self.round_limit_reached:
            return GameResult(
                game_id=self.game_id,
                winner="draw",
                final_round=self.state.round,
                reason="max_rounds_reached",
                duration_seconds=0.0,
            )

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

        if self.board["win_rule"] == "edge":
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
        if self.board["win_rule"] != "edge":
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
            "board_name": self.board["name"],
            "sheriff_enabled": self.sheriff_enabled,
            "final_sheriff": self.sheriff_id,
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
