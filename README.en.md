# AI Arena

**English** · [中文](README.md)

A multi-agent werewolf (Mafia) arena where multiple LLMs play against each other in a single game — and you get to watch every player's reasoning and decisions in real time.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev/)

---

## What is this

AI Arena is an open-source platform for multi-agent LLM game-playing experiments. Several large language models face off in a game of werewolf — wolves bluff, seers investigate, villagers reason — and every decision (who to kill at night, whether to claim a role by day, who to vote out) is made by an independent LLM, each with its own inner monologue (chain of thought). You spectate from an omniscient view, free to compare any player's public statements against what they're actually thinking.

A few angles worth observing:
- **Do AIs lie?** A wolf's inner monologue might say "I need to hide my identity," while its public speech plays at being a villager.
- **How do AIs reason?** How does the seer prioritize investigations? How do villagers spot wolves from contradictory statements?
- **Cross-model matches:** DeepSeek, GPT, Claude, Gemini and more in the same game — compare strategies across models.
- **Transparent cost:** real-time per-game token usage and spending stats.

---

## Core features

- **10 LLM providers:** DeepSeek / OpenAI / Anthropic / Gemini / Qwen / Kimi / Xiaomi MiMo / MiniMax / Zhipu GLM / SiliconFlow — plus any custom OpenAI-compatible endpoint.
- **Deterministic rules engine:** AIs may only choose from legal actions; the backend validates strictly, so no "a villager hallucinates it's the seer" or "a wolf votes twice."
- **Strict information isolation:** Wolves can't see seer results, villagers can't see night actions; voting-phase inner monologues are never leaked to opponents.
- **Theater-style spectator UI:** players flank a central stage in two columns; a vertical timeline with colored event dots; inline expand of any AI's reasoning panel — with pause/resume, step-by-step replay, event-type filtering, and turning-point jumps.
- **Blind voting:** votes resolve concurrently and are mutually hidden during voting; the "who voted for whom" breakdown is only revealed once voting closes.
- **Series & prompt experiments:** fair-rotation series play (same lineup across multiple games); A/B mirror-crossover prompt experiments — run the same setup under different prompts and compare AI performance head-to-head.
- **AI review & quality checks:** post-game AI finale review (turning points / key decisions); deterministic quality checks (no model calls) covering 6 categories — rule legality, information isolation, flow/endgame, behavioral coherence, personality expression, and model reliability — with one-click jump from any issue to the timeline event.
- **Personality system:** 6 built-in personality presets that shape an AI's tone and decision tendencies, assignable per seat at game creation.
- **Budget & cost control:** economy / standard / premium tiers; set per-game and per-player token caps with circuit-breaking that auto-stops on overrun.
- **Fully reproducible:** every game records role assignments, the event stream, model versions, random seed, and token cost, persisted as JSON.
- **Stability built in:** LLM calls retry with exponential backoff (network blips / rate limits handled automatically); semantic-validation failures auto-correct; the fallback rate trends toward zero.

---

## Game rules

Multiple board presets are supported (selected at game creation); each preset auto-determines the player count and role setup:

| Board | Role setup |
|---|---|
| 5p Minimal | 1 Wolf · 1 Seer · 3 Villagers |
| 9p Standard | 3 Wolves · Seer / Witch / Hunter · 3 Villagers |
| 12p Seer-Witch-Hunter-Idiot | 4 Wolves · Seer / Witch / Hunter / Idiot · 4 Villagers |
| 12p White Wolf King + Guard | 3 Wolves + White Wolf King · Seer / Witch / Hunter / Guard · 4 Villagers |
| 12p Wolf King + Guard | 3 Wolves + Wolf King · Seer / Witch / Hunter / Guard · 4 Villagers |
| 12p Wolf Beauty + Knight | 3 Wolves + Wolf Beauty · Seer / Witch / Guard / Knight · 4 Villagers |
| Custom | freely combine existing roles for 5–18 players, with kill-side or headcount win conditions |

All boards can optionally enable the **Sheriff** mechanic (sheriff election + post-death badge transfer).

```
Night   Guard protects · Wolves pick a kill target · Witch uses heal/poison · Seer checks identity
  ↓
Day     Living players speak in turn (claim roles, share investigations, accuse/defend)
  ↓
Vote    Blind vote → results announced → the top vote-getter is banished
  ↓ (on a tie)
Runoff  Tied candidates speak another round → re-vote among candidates only → still tied = no one leaves
  ↓
Loop until a win condition:
  · Headcount rule: wolves ≥ good players → wolves win
  · Kill-side rule: wolves wipe out all villagers OR all gods → wolves win
  · All wolves eliminated → good players win
```

---

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- An API key for at least one LLM (DeepSeek recommended — direct, affordable)

### 1. Clone & install

```bash
git clone https://github.com/qinyre/AI-Arena.git
cd AI-Arena

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # macOS/Linux
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure API keys

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in only the providers you'll actually use (leave the rest empty — they won't be called):

```env
DEEPSEEK_API_KEY=sk-...        # recommended, default provider
OPENAI_API_KEY=sk-...          # optional
ANTHROPIC_API_KEY=sk-ant-...   # optional
# GEMINI_API_KEY / DASHSCOPE_API_KEY / SILICONFLOW_API_KEY ...
```

The model list and pricing live in `backend/config/models.yaml` (single source of truth) — adding a provider is just a matter of editing this file, no code changes. You can also enter `base_url + api_format + model` directly at game creation to use any compatible endpoint.

### 3. Run

```bash
# Terminal 1: backend
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: frontend
cd frontend
npm run dev
```

Open http://localhost:5173 , create a multiplayer game, and watch the AIs play.

---

## Architecture

```
Frontend   React 18 + TS + Vite + Tailwind
           Theater-style spectator UI; first-screen snapshot + SSE incremental event sync
                       │  REST API (JSON) + SSE
                       ▼
Backend    Python 3.11 + FastAPI
           ├─ Game engine   Werewolf rules · action validation · info isolation
           ├─ AI agent      LLM decisions · retry/backoff · semantic validation
           └─ Registry      Multi-provider · cost tracking
                       │
                       ▼
           ModelClient      OpenAI-compatible + Anthropic dual protocol

Persistence   backend/data/games.db (SQLite game records) + backend/data/game-*_events.json (event streams)
```

### Key design

- **Structured action protocol:** AIs never operate via free text. Every step they pick from `available_actions`. The backend's `is_valid_action` strictly validates action_type / target / phase legality; illegal actions are blocked and retried.
- **Information filtering:** `get_visible_state` returns a different view per role; `_filter_public_events` strips other players' inner monologues before feeding them to a player's LLM (preventing a wolf's "as a wolf, I…" chain of thought from leaking to opponents).
- **Omniscient spectator view:** the spectator UI shows the full truth (role assignments, night actions, all reasoning), strictly separated from the player view.
- **Blind voting:** votes execute concurrently; `player_vote` events during voting are never fed to other players in the same phase; only after voting closes is `vote_result` broadcast (with `vote_detail`: who voted for whom).

### Project structure

```
backend/
├── app/
│   ├── api/          # FastAPI routes + Pydantic schemas + game_manager
│   ├── core/         # Game engine: werewolf (rules) / orchestrator / agent (AI) / quality / models
│   └── llm/          # ModelClient abstraction + OpenAI/Claude impls + registry
├── config/models.yaml   # provider & model list (single source of truth)
├── scripts/          # batch sim / smoke test / behavior eval (simulate_boards / smoke_boards / evaluate_ai_scenarios)
└── data/             # runtime game data: games.db (SQLite records) + game-*_events.json (event streams), gitignored

frontend/
├── src/
│   ├── components/   # CreateGame / GameView / GameHistory / Stats / SeriesArena / PromptExperimentLab / ArenaAnalytics
│   │   └── game/     # Theater-style spectator components (PlayerTable/EventFeed/Timeline/...)
│   ├── hooks/useGameStream.ts   # single data source: first-screen snapshot + SSE incremental events
│   └── types/api.ts  # front-back data contract (strict one-to-one correspondence)
└── tailwind.config.js  # Nocturne Stage color tokens
```

---

## Contributing

Issues and PRs welcome. Some directions worth contributing:
- New personality templates (`frontend/src/utils/personalityPresets.ts`)
- Adapters for more LLM providers
- New game modes
- Spectator UI polish

---

## License

[MIT License](LICENSE)
