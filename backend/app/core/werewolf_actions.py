"""狼人杀动作目录与合法性校验。

从 werewolf.py 拆出:按阶段/角色枚举 available_actions,
并严格校验 AI 提交的动作(类型/目标/参数)。
"""
from typing import Dict, List

from app.core.models import GameAction, GamePhase, Role, ActionType
from app.core.boards import GOD_ROLES, WOLF_ROLES


class AvailableActionsMixin:
    """get_available_actions / _pass_action / is_valid_action。"""

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
