"""
Registry & multi-provider 单元测试 — 不依赖真实 API。

验证：
1. registry 能从 yaml 正确加载 7 个 provider
2. 每个 provider 的 protocol / api_base / 模型元数据正确
3. 成本计算用 per_1m 单位正确
4. orchestrator 的 client 工厂能正确路由所有 provider
5. 错误配置（未知 provider / 未配模型 / 缺 key）能给出清晰报错
6. 向后兼容：OpenAIClient 别名仍可用
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.llm.registry import load_registry, get_registry, get_model_info
from app.llm.openai_client import OpenAICompatibleClient, OpenAIClient, OllamaClient
from app.llm.claude_client import ClaudeClient


@pytest.fixture(scope="module")
def registry():
    """每个测试模块用同一个 registry 实例"""
    return load_registry()


class TestRegistryLoading:
    """registry 加载"""

    def test_all_seven_providers_loaded(self, registry):
        """7 个 provider 全部加载"""
        expected = {"deepseek", "openai", "anthropic", "gemini", "qwen", "siliconflow", "ollama"}
        assert set(registry.providers.keys()) == expected

    def test_default_is_deepseek(self, registry):
        """默认 provider 应为 deepseek（开发期推荐）"""
        assert registry.default_provider == "deepseek"
        assert registry.default_model == "deepseek-v4-flash"

    def test_protocol_routing(self, registry):
        """只有 anthropic 是 anthropic 协议，其余都是 openai 兼容"""
        for name, prov in registry.providers.items():
            if name == "anthropic":
                assert prov.protocol == "anthropic", f"{name} 应为 anthropic 协议"
            else:
                assert prov.protocol == "openai", f"{name} 应为 openai 兼容协议"

    def test_gemini_base_url_has_trailing_slash(self, registry):
        """Gemini base_url 结尾斜杠是硬性要求"""
        assert registry["gemini"].api_base.endswith("/"), \
            "Gemini base_url 必须以 / 结尾，否则 OpenAI SDK 会报错"


class TestModelInfo:
    """模型元数据查询"""

    def test_get_model_info_returns_correct_costs(self, registry):
        """成本字段正确（每 1M token）"""
        info = get_model_info("deepseek", "deepseek-v4-flash")
        assert info.cost_in == 0.28
        assert info.cost_out == 0.42
        assert info.context == 64000

    def test_get_model_info_nonexistent_returns_none(self, registry):
        """查询不存在的模型返回 None"""
        assert get_model_info("deepseek", "nonexistent-model") is None
        assert get_model_info("nonexistent-provider", "any") is None

    def test_every_provider_has_at_least_one_model(self, registry):
        """每个 provider 至少有一个模型"""
        for name, prov in registry.providers.items():
            assert len(prov.models) > 0, f"{name} 没有配置任何模型"

    def test_ollama_has_zero_cost(self, registry):
        """Ollama 本地模型成本为 0"""
        info = get_model_info("ollama", "llama3.3")
        assert info.cost_in == 0.0
        assert info.cost_out == 0.0


class TestCostCalculation:
    """成本计算（per 1M token 单位）"""

    def test_openai_compatible_cost(self):
        """OpenAICompatibleClient 成本按 1M token 计算"""
        client = OpenAICompatibleClient(
            api_key="fake", model="gpt-4.1-mini",
            cost_per_1m_input=0.4, cost_per_1m_output=1.6
        )
        # 1000 input + 500 output tokens
        # = 0.4 * 1000/1e6 + 1.6 * 500/1e6 = 0.0004 + 0.0008 = 0.0012
        cost = client.estimate_cost(1000, 500)
        assert abs(cost - 0.0012) < 1e-9

    def test_claude_cost(self):
        """ClaudeClient 成本按 1M token 计算"""
        client = ClaudeClient(
            api_key="fake", model="claude-sonnet-4-5",
            cost_per_1m_input=3.0, cost_per_1m_output=15.0
        )
        # 1M input + 1M output = 3.0 + 15.0 = 18.0
        cost = client.estimate_cost(1_000_000, 1_000_000)
        assert abs(cost - 18.0) < 1e-6

    def test_ollama_client_is_free(self):
        """OllamaClient 成本恒为 0"""
        client = OllamaClient(model="llama3.3")
        assert client.estimate_cost(10_000_000, 10_000_000) == 0.0


class TestClientFactory:
    """orchestrator client 工厂路由"""

    @pytest.fixture
    def orchestrator(self):
        """构造一个不触发 initialize 的 orchestrator 实例"""
        from app.core.orchestrator import GameOrchestrator
        orch = GameOrchestrator.__new__(GameOrchestrator)
        return orch

    @pytest.fixture(autouse=True)
    def _fake_keys(self, monkeypatch):
        """为所有 provider 注入 fake key，避免缺 key 报错"""
        for env in ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                    "GEMINI_API_KEY", "DASHSCOPE_API_KEY", "SILICONFLOW_API_KEY"]:
            monkeypatch.setenv(env, f"fake-{env.lower()}")

    def test_all_openai_compatible_providers_route_correctly(self, orchestrator, registry):
        """6 个 openai 协议 provider 都路由到 OpenAICompatibleClient"""
        cases = [
            ("deepseek", "deepseek-v4-flash"),
            ("openai", "gpt-4.1-mini"),
            ("gemini", "gemini-2.5-flash"),
            ("qwen", "qwen-plus"),
            ("siliconflow", "Qwen/Qwen2.5-72B-Instruct"),
            ("ollama", "llama3.3"),
        ]
        for prov, model in cases:
            client = orchestrator._create_client({"provider": prov, "model": model}, registry)
            assert isinstance(client, OpenAICompatibleClient), \
                f"{prov} 应路由到 OpenAICompatibleClient"
            assert client.model == model

    def test_anthropic_routes_to_claude_client(self, orchestrator, registry):
        """anthropic 协议路由到 ClaudeClient"""
        client = orchestrator._create_client(
            {"provider": "anthropic", "model": "claude-sonnet-4-5"}, registry
        )
        assert isinstance(client, ClaudeClient)
        assert client.model == "claude-sonnet-4-5"

    def test_base_url_propagates_from_registry(self, orchestrator, registry):
        """provider 的 base_url 从 registry 正确传给 client"""
        client = orchestrator._create_client(
            {"provider": "deepseek", "model": "deepseek-v4-flash"}, registry
        )
        assert "api.deepseek.com" in str(client.client.base_url)

    def test_cost_propagates_from_registry(self, orchestrator, registry):
        """模型成本从 registry 正确传给 client"""
        client = orchestrator._create_client(
            {"provider": "deepseek", "model": "deepseek-v4-flash"}, registry
        )
        info = get_model_info("deepseek", "deepseek-v4-flash")
        assert client.cost_per_1m_input == info.cost_in
        assert client.cost_per_1m_output == info.cost_out

    def test_unknown_provider_raises(self, orchestrator, registry):
        """未知 provider 报错"""
        with pytest.raises(ValueError, match="未知"):
            orchestrator._create_client(
                {"provider": "nonexistent", "model": "x"}, registry
            )

    def test_unknown_model_raises(self, orchestrator, registry):
        """provider 下未配置的模型报错"""
        with pytest.raises(ValueError, match="未配置模型"):
            orchestrator._create_client(
                {"provider": "deepseek", "model": "no-such-model"}, registry
            )

    def test_missing_key_raises(self, orchestrator, registry, monkeypatch):
        """缺 key 的 provider 报错"""
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        with pytest.raises(ValueError, match="环境变量"):
            orchestrator._create_client(
                {"provider": "deepseek", "model": "deepseek-v4-flash"}, registry
            )

    def test_ollama_works_without_key(self, orchestrator, registry):
        """Ollama 无需 key 也能创建 client"""
        client = orchestrator._create_client(
            {"provider": "ollama", "model": "llama3.3"}, registry
        )
        assert isinstance(client, OpenAICompatibleClient)


class TestExplicitConfig:
    """用户直填路径：api_format + base_url + model（不走 yaml 白名单）"""

    @pytest.fixture
    def orchestrator(self):
        from app.core.orchestrator import GameOrchestrator
        return GameOrchestrator.__new__(GameOrchestrator)

    def test_explicit_openai_format_arbitrary_endpoint(self, orchestrator, registry):
        """用户直填任意 OpenAI 格式端点（yaml 里没有的也能用）"""
        client = orchestrator._create_client({
            "api_format": "openai",
            "base_url": "https://my-private-relay.example.com/v1",
            "model": "some-custom-model",
            "api_key": "sk-custom",
        }, registry)
        assert isinstance(client, OpenAICompatibleClient)
        assert client.model == "some-custom-model"
        assert "my-private-relay.example.com" in str(client.client.base_url)

    def test_explicit_anthropic_format(self, orchestrator, registry):
        """用户直填 Anthropic 格式"""
        client = orchestrator._create_client({
            "api_format": "anthropic",
            "base_url": "https://api.anthropic.com",
            "model": "claude-sonnet-4-5",
            "api_key": "sk-ant",
        }, registry)
        assert isinstance(client, ClaudeClient)

    def test_explicit_takes_priority_over_provider(self, orchestrator, registry):
        """base_url 存在时走直填路径，忽略 provider 字段"""
        # 这个 base_url 不在任何 provider 名下，但直填就能用
        client = orchestrator._create_client({
            "provider": "deepseek",  # 故意写 provider
            "base_url": "https://totally-custom.example.com/v1",  # 但给了 base_url
            "model": "whatever",
            "api_key": "sk-x",
        }, registry)
        assert isinstance(client, OpenAICompatibleClient)
        assert "totally-custom.example.com" in str(client.client.base_url)

    def test_explicit_key_env_reads_env(self, orchestrator, registry, monkeypatch):
        """直填路径用 key_env 从环境变量取 key"""
        monkeypatch.setenv("MY_CUSTOM_KEY", "sk-from-env")
        client = orchestrator._create_client({
            "api_format": "openai",
            "base_url": "https://x.example.com/v1",
            "model": "m",
            "key_env": "MY_CUSTOM_KEY",
        }, registry)
        # client 内部存的 api_key 无法直接读，但没抛错即说明 key_env 生效
        assert isinstance(client, OpenAICompatibleClient)

    def test_explicit_key_env_missing_raises(self, orchestrator, registry, monkeypatch):
        """直填路径下 key_env 指向的环境变量不存在时报错"""
        monkeypatch.delenv("NO_SUCH_KEY", raising=False)
        with pytest.raises(ValueError, match="环境变量"):
            orchestrator._create_client({
                "api_format": "openai",
                "base_url": "https://x.example.com/v1",
                "model": "m",
                "key_env": "NO_SUCH_KEY",
            }, registry)

    def test_explicit_without_key_uses_dummy(self, orchestrator, registry):
        """直填路径下不填 key 且无 key_env（如本地端点）用占位符，不报错"""
        client = orchestrator._create_client({
            "api_format": "openai",
            "base_url": "http://localhost:1234/v1",
            "model": "local-model",
        }, registry)
        assert isinstance(client, OpenAICompatibleClient)

    def test_explicit_cost_optional(self, orchestrator, registry):
        """直填路径下 cost 可选，不填默认 0"""
        client = orchestrator._create_client({
            "api_format": "openai",
            "base_url": "https://x.example.com/v1",
            "model": "m",
            "api_key": "sk",
        }, registry)
        assert client.cost_per_1m_input == 0.0
        assert client.cost_per_1m_output == 0.0

    def test_explicit_user_cost_overrides_default(self, orchestrator, registry):
        """直填路径下用户填的 cost 生效"""
        client = orchestrator._create_client({
            "api_format": "openai",
            "base_url": "https://x.example.com/v1",
            "model": "m",
            "api_key": "sk",
            "cost_per_1m_input": 1.5,
            "cost_per_1m_output": 6.0,
        }, registry)
        assert client.cost_per_1m_input == 1.5
        assert client.cost_per_1m_output == 6.0

    def test_explicit_invalid_api_format_raises(self, orchestrator, registry):
        """直填路径下非法 api_format 报错"""
        with pytest.raises(ValueError, match="api_format"):
            orchestrator._create_client({
                "api_format": "gemini-native",  # 不支持
                "base_url": "https://x.example.com/v1",
                "model": "m",
                "api_key": "sk",
            }, registry)


class TestBackwardCompatibility:
    """向后兼容"""

    def test_openai_client_alias_still_works(self):
        """旧代码 import OpenAIClient 仍可用（别名指向 OpenAICompatibleClient）"""
        assert OpenAIClient is OpenAICompatibleClient
        client = OpenAIClient(api_key="fake", model="gpt-4.1-mini")
        assert isinstance(client, OpenAICompatibleClient)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
