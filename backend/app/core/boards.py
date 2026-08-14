"""狼人杀板型配置与角色分组常量。"""
from typing import Any, Dict, Optional

from app.core.models import Role

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
