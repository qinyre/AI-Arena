"""
Game API Routes — 游戏管理端点。

对应前端 frontend/src/api/client.ts 的全部调用。
路由前缀 /api/games(在 main.py 中 include 时设定)。

⚠️ 路由顺序: /stats 必须在 /{game_id} 前注册,否则 "stats" 被当 game_id。
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

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
            custom_board=(
                request.custom_board.model_dump() if request.custom_board else None
            ),
            seed=request.seed,
            enable_sheriff=request.enable_sheriff,
            budget_tier=request.budget_tier,
            max_rounds=request.max_rounds,
            parent_game_id=request.parent_game_id,
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
    """获取游戏状态快照（首屏加载与手动刷新使用）。"""
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


@router.post("/{game_id}/pause")
async def pause_game(game_id: str):
    try:
        return await game_manager.pause_game(game_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{game_id}/resume")
async def resume_game(game_id: str):
    try:
        return await game_manager.resume_game(game_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
async def get_game_events(game_id: str, after: int = Query(default=0, ge=0)):
    """按事件索引增量读取；after=0 兼容完整历史读取。"""
    status = game_manager.get_status(game_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    all_events = game_manager.get_events(game_id) or []
    start = min(after, len(all_events))
    terminal = status["status"] in {"completed", "error"}
    return {
        "game_id": game_id,
        "events": all_events[start:],
        "from_index": start,
        "next_index": len(all_events),
        "total": len(all_events),
        "terminal": terminal,
    }


@router.get("/{game_id}/events/stream")
async def stream_game_events(
    game_id: str,
    request: Request,
    after: int = Query(default=0, ge=0),
):
    """以 SSE 推送新增事件和状态；事件 ID 即下一游标。"""
    if game_manager.get_status(game_id) is None:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    last_event_id = request.headers.get("last-event-id", "")
    cursor = max(after, int(last_event_id) if last_event_id.isdigit() else 0)

    async def event_stream():
        nonlocal cursor
        previous_status = ""
        last_sent = asyncio.get_running_loop().time()
        while not await request.is_disconnected():
            status = game_manager.get_status(game_id)
            if status is None:
                return
            all_events = game_manager.get_events(game_id) or []
            cursor = min(cursor, len(all_events))
            new_events = all_events[cursor:]
            status_key = json.dumps(status, ensure_ascii=False, sort_keys=True)
            terminal = status["status"] in {"completed", "error"}
            if new_events or status_key != previous_status:
                start = cursor
                cursor = len(all_events)
                payload = {
                    "game_id": game_id,
                    "events": new_events,
                    "from_index": start,
                    "next_index": cursor,
                    "total": len(all_events),
                    "terminal": terminal,
                    "status": status,
                }
                yield (
                    f"id: {cursor}\n"
                    "event: update\n"
                    f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                )
                previous_status = status_key
                last_sent = asyncio.get_running_loop().time()
            if terminal:
                yield f"id: {cursor}\nevent: end\ndata: {{\"next_index\":{cursor}}}\n\n"
                return
            if asyncio.get_running_loop().time() - last_sent >= 15:
                yield ": keepalive\n\n"
                last_sent = asyncio.get_running_loop().time()
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{game_id}", response_model=DeleteResponse)
async def delete_game(game_id: str):
    """删除游戏(取消运行中的 + 删除记录)。"""
    deleted = await game_manager.delete_game(game_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"游戏 {game_id} 不存在")
    return {"message": f"游戏 {game_id} 已删除"}
