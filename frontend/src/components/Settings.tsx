import { useState } from 'react';
import { apiClient } from '../api/client';
import {
  loadModelPresets,
  requiresApiKey,
  saveModelPresets,
  type ModelPreset,
} from '../utils/modelPresets';
import PersonalitySettings from './PersonalitySettings';

const EMPTY_PRESET: Omit<ModelPreset, 'id'> = {
  name: '',
  provider: '',
  model: '',
  apiFormat: 'openai',
  baseUrl: '',
  apiKey: '',
};

export default function Settings() {
  const [presets, setPresets] = useState(loadModelPresets);
  const [form, setForm] = useState(EMPTY_PRESET);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{
    state: 'idle' | 'testing' | 'success' | 'error';
    message?: string;
  }>({ state: 'idle' });

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setTestResult({ state: 'idle' });
  };

  const testConnection = async () => {
    if (!form.model.trim() || !form.baseUrl.trim()) {
      setTestResult({ state: 'error', message: '请先填写模型和 Base URL' });
      return;
    }
    if (requiresApiKey(form.apiFormat, form.baseUrl) && !form.apiKey.trim()) {
      setTestResult({ state: 'error', message: 'Anthropic 远程接口必须填写 API Key' });
      return;
    }
    setTestResult({ state: 'testing' });
    try {
      const result = await apiClient.testModelConnection({
        api_format: form.apiFormat,
        base_url: form.baseUrl,
        model: form.model,
        ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
      });
      setTestResult({
        state: 'success',
        message: `连接成功 · ${result.latency_ms} ms · ${result.usage.total_tokens ?? 0} tokens`,
      });
    } catch (connectionError) {
      setTestResult({
        state: 'error',
        message: connectionError instanceof Error ? connectionError.message : '连接失败',
      });
    }
  };

  const addPreset = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const url = new URL(form.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      setError('URL 必须是有效的 http:// 或 https:// 地址');
      return;
    }
    if (requiresApiKey(form.apiFormat, form.baseUrl) && !form.apiKey.trim()) {
      setError('Anthropic 远程接口必须填写 API Key');
      return;
    }
    const next = [...presets, {
      ...form,
      apiKey: form.apiKey.trim(),
      id: crypto.randomUUID(),
    }];
    saveModelPresets(next);
    setPresets(next);
    setForm(EMPTY_PRESET);
  };

  const removePreset = (preset: ModelPreset) => {
    if (!window.confirm(`删除模型预设“${preset.name}”？`)) return;
    const next = presets.filter((item) => item.id !== preset.id);
    saveModelPresets(next);
    setPresets(next);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-end justify-between border-b border-[#47464b]/30 pb-5">
        <div>
          <p className="font-label text-[10px] uppercase tracking-[0.3em] text-[#e9c400]">
            Backstage controls
          </p>
          <h2 className="mt-1 font-display text-4xl text-[#d3e4fe]">剧场设置</h2>
          <p className="mt-2 text-sm text-[#c8c5cb]/70">管理可复用的模型入口与玩家设定。</p>
        </div>
        <span className="material-symbols-outlined text-[48px] text-[#e9c400]/25">tune</span>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <form onSubmit={addPreset} className="card relative overflow-hidden">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-[#e9c400]/5" />
          <div className="mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-[#ffe16d]">add_circle</span>
            <div>
              <h3 className="text-xl text-[#d3e4fe]">添加模型预设</h3>
              <p className="text-xs text-[#c8c5cb]/55">保存后可在创建游戏时一键应用给全场玩家</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-[#c8c5cb]">
              预设名称
              <input
                required
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="input mt-1.5 w-full"
                placeholder="例如：DeepSeek 低成本"
              />
            </label>
            <label className="text-xs text-[#c8c5cb]">
              提供商
              <input
                required
                value={form.provider}
                onChange={(e) => update('provider', e.target.value)}
                className="input mt-1.5 w-full"
                placeholder="DeepSeek"
              />
            </label>
            <label className="text-xs text-[#c8c5cb]">
              模型
              <input
                required
                value={form.model}
                onChange={(e) => update('model', e.target.value)}
                className="input mt-1.5 w-full"
                placeholder="deepseek-v4-flash"
              />
            </label>
            <label className="text-xs text-[#c8c5cb]">
              接口格式
              <select
                value={form.apiFormat}
                onChange={(e) => update('apiFormat', e.target.value)}
                className="select mt-1.5 w-full"
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block text-xs text-[#c8c5cb]">
            Base URL
            <input
              required
              type="url"
              value={form.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              className="input mt-1.5 w-full"
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="mt-4 block text-xs text-[#c8c5cb]">
            API Key <span className="text-[#64748b]">
              {requiresApiKey(form.apiFormat, form.baseUrl)
                ? '（Anthropic 远程接口必填）'
                : '（可选）'}
            </span>
            <input
              type="password"
              required={requiresApiKey(form.apiFormat, form.baseUrl)}
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              className="input mt-1.5 w-full"
              placeholder="sk-••••••••"
            />
          </label>

          {error && <p className="mt-3 text-xs text-[#ffb3b3]">{error}</p>}
          {testResult.state !== 'idle' && (
            <div className={`mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              testResult.state === 'success'
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                : testResult.state === 'error'
                  ? 'border-[#eb2445]/30 bg-[#eb2445]/10 text-[#ffb3b3]'
                  : 'border-[#e9c400]/30 bg-[#e9c400]/5 text-[#ffe16d]'
            }`}>
              <span className={`material-symbols-outlined text-[16px] ${
                testResult.state === 'testing' ? 'animate-spin' : ''
              }`}>
                {testResult.state === 'success' ? 'check_circle' : testResult.state === 'error' ? 'error' : 'progress_activity'}
              </span>
              {testResult.state === 'testing' ? '正在向模型发送最小请求…' : testResult.message}
            </div>
          )}
          <p className="mt-3 flex gap-1.5 text-[11px] leading-4 text-[#c8c5cb]/45">
            <span className="material-symbols-outlined text-[14px]">lock_open</span>
            Key 仅保存在当前浏览器的 localStorage 中，但仍是明文数据，请勿在公共设备保存。
          </p>
          <div className="mt-5 grid grid-cols-[0.8fr_1.2fr] gap-2">
            <button
              className="btn-secondary"
              type="button"
              disabled={testResult.state === 'testing'}
              onClick={testConnection}
            >
              {testResult.state === 'testing' ? '测试中…' : '测试连接'}
            </button>
            <button className="btn-primary" type="submit">
              保存模型预设
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#c8c5cb]/40">
            测试会生成最多 8 个 token，可能产生极少量 API 费用
          </p>
        </form>

        <div className="space-y-4">
          <div className="glass-panel rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl text-[#d3e4fe]">我的模型</h3>
                <p className="text-xs text-[#c8c5cb]/50">{presets.length} 个本地预设</p>
              </div>
              <span className="font-display text-3xl text-[#e9c400]/30">{String(presets.length).padStart(2, '0')}</span>
            </div>

            {presets.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#47464b] px-4 py-10 text-center">
                <span className="material-symbols-outlined mb-2 block text-3xl text-[#64748b]">deployed_code</span>
                <p className="text-sm text-[#c8c5cb]/60">幕后台架还是空的</p>
              </div>
            ) : (
              <div className="space-y-2">
                {presets.map((preset) => (
                  <div key={preset.id} className="group rounded-md border border-[#47464b]/50 bg-[#102034]/80 p-3">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5 text-[18px] text-[#e9c400]">memory</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base text-[#d3e4fe]">{preset.name}</p>
                        <p className="truncate font-label text-[10px] uppercase tracking-wider text-[#c8c5cb]/55">
                          {preset.provider} · {preset.model}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-[#64748b]">{preset.baseUrl}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePreset(preset)}
                        aria-label={`删除 ${preset.name}`}
                        className="rounded p-1 text-[#64748b] transition-colors hover:bg-[#eb2445]/10 hover:text-[#ffb3b3]"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
      <PersonalitySettings />
    </div>
  );
}
