"""
Game API Routes — 游戏管理端点。

对应前端 frontend/src/api/client.ts 的全部调用。
路由前缀 /api/games(在 main.py 中 include 时设定)。

⚠️ 路由顺序: /stats 必须在 /{game_id} 前注册,否则 "stats" 被当 game_id。
"""
from fastapi import APIRouter, HTTPException

from app.api.schemas import (
    CreateGameRequest,
    CreateGameResponse,
    GameStatusResponse,
    GameResultResponse,
    ListGamesResponse,
    StatsResponse,
    DeleteResponse,
    GameEventResponse,
    GameReview,
    GameReviewRequest,
)
from app.api.game_manager import game_manager

router = APIRouter()


@router.post("", response_model=CreateGameResponse)
async def create_game(request: CreateGameRequest):
    """创建并启动一局游戏(后台运行)。"""
    player_configs = [c.model_dump() for c in request.player_configs]
    try:
        result = await game_manager.create_game(
            player_configs=player_configs,
            board_id=request.board_id,
            seed=request.seed,
            enable_sheriff=request.enable_sheriff,
        )
    except ValueError as e:
        # 5 人校验等业务错误 → 422
        raise HTTPException(status_code=422, detail=str(e))
    return result


# ⚠️ stats 必须在 {game_id} 路由前
@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """获取全部游戏的汇总统计。"""
    return game_manager.get_stats()


@router.get("", response_model=ListGamesResponse)
async def list_games():
    """列出所有游戏(按创建时间倒序)。"""
    return game_manager.list_games()


@router.get("/{game_id}/status", response_model=GameStatusResponse)
async def get_game_status(game_id: str):
    """获取游戏实时状态(前端每 3 秒轮询)。"""
    status = game_manager.get_status(game_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    return status


@router.get("/{game_id}/result", response_model=GameResultResponse)
async def get_game_result(game_id: str):
    """获取游戏最终结果(仅 completed 有意义)。"""
    result = game_manager.get_result(game_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    return result


@router.post("/{game_id}/review", response_model=GameReview)
async def generate_game_review(game_id: str, request: GameReviewRequest):
    """调用用户选择的模型生成并保存终局复盘。"""
    if not request.base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Base URL 必须以 http:// 或 https:// 开头")
    try:
        return await game_manager.generate_review(game_id, request.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        detail = str(exc)
        if request.api_key:
            detail = detail.replace(request.api_key, "***")
        raise HTTPException(status_code=502, detail=detail[:400]) from exc


@router.get("/{game_id}/events", response_model=GameEventResponse)
async def get_game_events(game_id: str):
    """获取游戏的完整事件流（包含 AI 推理过程）。"""
    events = game_manager.get_events(game_id)
    if events is None:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 的事件流不存在")
    return {
        "game_id": game_id,
        "events": events,
        "total": len(events)
    }


@router.delete("/{game_id}", response_model=DeleteResponse)
async def delete_game(game_id: str):
    """删除游戏(取消运行中的 + 删除记录)。"""
    deleted = await game_manager.delete_game(game_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    return {"message": f"游戏 {game_id} 已删除"}
