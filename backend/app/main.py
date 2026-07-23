"""
FastAPI Application Main Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from app.llm.registry import get_registry

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("🚀 AI Arena Backend Starting...")

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
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
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "True") == "True"
    )
