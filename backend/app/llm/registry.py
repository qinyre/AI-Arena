"""
Provider Registry — 从 config/models.yaml 加载 provider 配置的单一数据源。

让 models.yaml 从"死文件"变成"活数据源"：
  - 新增 provider 只改 yaml，不改代码（orchestrator 按 protocol 路由到 client）
  - 成本/上下文窗口等元数据集中管理，client 不再各自硬编码

典型用法：
    from app.llm.registry import get_registry, get_model_info

    registry = get_registry()
    prov = registry["deepseek"]               # ProviderConfig
    info = get_model_info("deepseek", "deepseek-chat")  # ModelInfo
    print(info.cost_in, info.cost_out)        # 每 1M token 美元成本
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

import yaml

# yaml 默认路径：backend/config/models.yaml
_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "models.yaml"

# 模块级单例，懒加载（启动时读一次）
_registry: Optional["Registry"] = None


@dataclass
class ModelInfo:
    """单个模型的元数据。成本单位：每 1M token 美元。"""
    cost_in: float   # 输入成本 / 1M tokens
    cost_out: float  # 输出成本 / 1M tokens
    context: int     # 上下文窗口大小


@dataclass
class ProviderConfig:
    """单个 provider 的配置。"""
    name: str
    protocol: str           # "openai" 或 "anthropic"，决定用哪个 client
    api_base: str
    api_key_env: str        # 读取 key 的环境变量名；空字符串表示无需 key
    models: Dict[str, ModelInfo]


class Registry:
    """所有 provider 配置的集合。"""

    def __init__(self, providers: Dict[str, ProviderConfig], default: Dict[str, str]):
        self.providers = providers
        self.default_provider = default.get("provider", "")
        self.default_model = default.get("model", "")

    def __getitem__(self, provider: str) -> ProviderConfig:
        return self.providers[provider]

    def __contains__(self, provider: str) -> bool:
        return provider in self.providers

    def get_model_info(self, provider: str, model: str) -> Optional[ModelInfo]:
        """查询某 provider 下某模型的元数据；不存在返回 None。"""
        prov = self.providers.get(provider)
        if prov is None:
            return None
        return prov.models.get(model)


def load_registry(path: Optional[Path] = None) -> Registry:
    """
    从 yaml 加载 registry（每次调用都重新读盘）。

    一般代码应调用 get_registry() 用单例；此函数供测试覆盖路径用。
    """
    config_path = path or _DEFAULT_CONFIG_PATH
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    providers: Dict[str, ProviderConfig] = {}
    for prov_name, prov_data in (data.get("providers") or {}).items():
        models: Dict[str, ModelInfo] = {}
        for model_name, model_data in (prov_data.get("models") or {}).items():
            models[model_name] = ModelInfo(
                cost_in=float(model_data.get("cost_in", 0.0)),
                cost_out=float(model_data.get("cost_out", 0.0)),
                context=int(model_data.get("context", 0)),
            )
        providers[prov_name] = ProviderConfig(
            name=prov_name,
            protocol=prov_data.get("protocol", "openai"),
            api_base=prov_data.get("api_base", ""),
            api_key_env=prov_data.get("api_key_env", ""),
            models=models,
        )

    return Registry(providers=providers, default=data.get("default") or {})


def get_registry() -> Registry:
    """获取 registry 单例（首次调用时懒加载）。"""
    global _registry
    if _registry is None:
        _registry = load_registry()
    return _registry


def get_model_info(provider: str, model: str) -> Optional[ModelInfo]:
    """便捷查询：某 provider 下某模型的元数据。"""
    return get_registry().get_model_info(provider, model)
