"""
FastAPI Application Main Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

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


# TODO: Include routers
# from app.api import game, websocket
# app.include_router(game.router, prefix="/api/games", tags=["games"])
# app.include_router(websocket.router, prefix="/ws", tags=["websocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "True") == "True"
    )
