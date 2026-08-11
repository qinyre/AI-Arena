"""
FastAPI Application Main Entry Point
"""
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os
import time
from dotenv import load_dotenv
from app.api.schemas import ModelConnectionTestRequest
from app.core.orchestrator import GameOrchestrator
from app.llm.registry import get_registry

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("🚀 AI Arena Backend Starting...")

    from app.api.game_manager import game_manager
    interrupted = await game_manager.reconcile_interrupted_games()
    if interrupted:
        print(f"⚠️ 已将 {interrupted} 局不可恢复的旧对局标记为错误")

    # TODO: Initialize database
    # TODO: Start event bus

    yield

    # Shutdown
    print("👋 AI Arena Backend Shutting Down...")

    # TODO: Cleanup resources


# Create FastAPI app
app = FastAPI(
    title="AI Arena",
    description="Multi-agent werewolf game platform",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
# 开发期:用正则放行所有本地地址(localhost / 127.0.0.1,任意端口),
# 这样 Vite 端口被占用跳到 5174/5175,或用 127.0.0.1 访问,都不会触发 400 预检失败。
# 生产环境用 CORS_ORIGINS 环境变量精确覆盖(逗号分隔)。
_cors_origins = os.getenv("CORS_ORIGINS", "").strip()
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AI Arena",
        "version": "0.1.0",
        "status": "running",
        "message": "Welcome to AI Arena - Watch AIs Think, Compete, and Evolve"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/api/providers")
async def list_providers():
    """
    返回所有可用 provider 及其模型，供前端动态渲染选择器。

    数据来源 config/models.yaml（单一数据源）——后端 yaml 更新后，
    前端无需重新部署即可看到新的 provider/模型。

    前端始终可以额外提供“自定义端点”选项（用户直填 base_url + model），
    那条路径不走此白名单，见 orchestrator._create_client。
    """
    registry = get_registry()
    providers = {}
    for name, prov in registry.providers.items():
        providers[name] = {
            "display_name": prov.display_name,
            "protocol": prov.protocol,
            "api_base": prov.api_base,
            "needs_api_key": bool(prov.api_key_env),
            "models": [
                {
                    "id": model_id,
                    "cost_per_1m_input": m.cost_in,
                    "cost_per_1m_output": m.cost_out,
                    "context": m.context,
                }
                for model_id, m in prov.models.items()
            ],
        }
    return {
        "providers": providers,
        "default_provider": registry.default_provider,
        "default_model": registry.default_model,
    }


@app.post("/api/model-connection/test")
async def test_model_connection(request: ModelConnectionTestRequest):
    """用极短生成请求验证自定义模型端点、鉴权和模型名。"""
    if request.base_url and not request.base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Base URL 必须以 http:// 或 https:// 开头")

    started = time.perf_counter()
    try:
        config = request.model_dump(exclude_none=True)
        client = (
            GameOrchestrator._create_client_from_explicit(config)
            if request.base_url
            else GameOrchestrator("connection-test", {})._create_client(
                config,
                get_registry(),
            )
        )
        result = await asyncio.wait_for(
            client.generate(
                "仅回复 OK",
                json_mode=False,
                temperature=0,
                max_tokens=8,
            ),
            timeout=20,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="连接超时（20 秒）") from exc
    except Exception as exc:
        detail = str(exc)
        if request.api_key:
            detail = detail.replace(request.api_key, "***")
        raise HTTPException(status_code=502, detail=detail[:400]) from exc

    return {
        "ok": True,
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "model": result.get("model", request.model),
        "usage": result.get("usage", {}),
    }


# TODO: Include routers
# from app.api import game, websocket
# app.include_router(game.router, prefix="/api/games", tags=["games"])
# app.include_router(websocket.router, prefix="/ws", tags=["websocket"])

# 游戏管理 API(对应前端 client.ts 的全部调用)
from app.api.routes import router as games_router
app.include_router(games_router, prefix="/api/games", tags=["games"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "True") == "True"
    )
