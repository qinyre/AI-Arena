import { useState } from 'react';
import {
  BUILT_IN_PERSONALITIES,
  REASONING_LABELS,
  TONE_LABELS,
  loadCustomPersonalityPresets,
  saveCustomPersonalityPresets,
  type PersonalityPreset,
  type PersonalityProfile,
} from '../utils/personalityPresets';

const EMPTY: PersonalityProfile = {
  name: '',
  tone: 'calm',
  reasoning_style: 'evidence',
  risk_tolerance: 3,
  assertiveness: 3,
  verbosity: 3,
};

const LEVEL_LABELS = ['极低', '较低', '适中', '较高', '极高'];

export default function PersonalitySettings() {
  const [custom, setCustom] = useState(loadCustomPersonalityPresets);
  const [form, setForm] = useState<PersonalityProfile>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const update = <K extends keyof PersonalityProfile>(field: K, value: PersonalityProfile[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const preset: PersonalityPreset = {
      ...form,
      id: editingId || crypto.randomUUID(),
      name: form.name.trim(),
    };
    const next = editingId
      ? custom.map((item) => item.id === editingId ? preset : item)
      : [...custom, preset];
    saveCustomPersonalityPresets(next);
    setCustom(next);
    setForm(EMPTY);
    setEditingId(null);
  };

  const edit = (preset: PersonalityPreset) => {
    setEditingId(preset.id);
    setForm({
      name: preset.name,
      tone: preset.tone,
      reasoning_style: preset.reasoning_style,
      risk_tolerance: preset.risk_tolerance,
      assertiveness: preset.assertiveness,
      verbosity: preset.verbosity,
    });
  };

  const remove = (preset: PersonalityPreset) => {
    if (!window.confirm(`删除性格预设“${preset.name}”？`)) return;
    const next = custom.filter((item) => item.id !== preset.id);
    saveCustomPersonalityPresets(next);
    setCustom(next);
    if (editingId === preset.id) {
      setEditingId(null);
      setForm(EMPTY);
    }
  };

  return (
    <section className="mt-6 border-t border-[#47464b]/30 pt-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="font-label text-[10px] uppercase tracking-[0.3em] text-[#c4b5fd]">Character direction</p>
          <h2 className="mt-1 font-display text-3xl text-[#d3e4fe]">玩家性格配置</h2>
          <p className="mt-1 text-sm text-[#c8c5cb]/60">塑造表达和决策倾向，不改变身份规则与信息边界。</p>
        </div>
        <span className="material-symbols-outlined text-[42px] text-[#c4b5fd]/25">psychology</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={save} className="card">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl">{editingId ? '编辑性格' : '创建性格'}</h3>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(EMPTY); }}
                className="font-label text-[10px] text-[#c8c5cb]/50 hover:text-[#d3e4fe]"
              >
                取消编辑
              </button>
            )}
          </div>

          <label className="block text-xs text-[#c8c5cb]">
            性格名称
            <input
              required
              maxLength={30}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              className="input mt-1.5 w-full"
              placeholder="例如：沉默的审判者"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-[#c8c5cb]">
              表达语气
              <select
                value={form.tone}
                onChange={(event) => update('tone', event.target.value as PersonalityProfile['tone'])}
                className="select mt-1.5 w-full"
              >
                {Object.entries(TONE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#c8c5cb]">
              推理偏好
              <select
                value={form.reasoning_style}
                onChange={(event) => update(
                  'reasoning_style',
                  event.target.value as PersonalityProfile['reasoning_style'],
                )}
                className="select mt-1.5 w-full"
              >
                {Object.entries(REASONING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 space-y-4">
            <TraitSlider label="风险偏好" field="risk_tolerance" value={form.risk_tolerance} onChange={update} />
            <TraitSlider label="主导性" field="assertiveness" value={form.assertiveness} onChange={update} />
            <TraitSlider label="表达长度" field="verbosity" value={form.verbosity} onChange={update} />
          </div>

          <button type="submit" className="btn-primary mt-6 w-full">
            {editingId ? '保存修改' : '保存性格预设'}
          </button>
        </form>

        <div className="glass-panel rounded-lg p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl">性格档案</h3>
            <span className="font-label text-[10px] text-[#c8c5cb]/45">
              {BUILT_IN_PERSONALITIES.length} 内置 · {custom.length} 自定义
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...BUILT_IN_PERSONALITIES, ...custom].map((preset) => (
              <article
                key={preset.id}
                className="rounded-md border border-[#47464b]/45 bg-[#102034]/75 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#c4b5fd]">person</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="truncate font-display text-base">{preset.name}</h4>
                      {preset.builtIn && (
                        <span className="rounded bg-[#c4b5fd]/10 px-1.5 py-0.5 font-label text-[8px] text-[#c4b5fd]">内置</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-[#c8c5cb]/50">
                      {TONE_LABELS[preset.tone]} · {REASONING_LABELS[preset.reasoning_style]}
                    </p>
                  </div>
                  {!preset.builtIn && (
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => edit(preset)}
                        aria-label={`编辑 ${preset.name}`}
                        className="rounded p-1 text-[#64748b] hover:text-[#d3e4fe]"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(preset)}
                        aria-label={`删除 ${preset.name}`}
                        className="rounded p-1 text-[#64748b] hover:text-[#ffb3b3]"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center font-label text-[9px] text-[#c8c5cb]/55">
                  <span className="rounded bg-black/15 py-1">风险 {preset.risk_tolerance}</span>
                  <span className="rounded bg-black/15 py-1">主导 {preset.assertiveness}</span>
                  <span className="rounded bg-black/15 py-1">表达 {preset.verbosity}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TraitSlider<K extends 'risk_tolerance' | 'assertiveness' | 'verbosity'>({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: K;
  value: number;
  onChange: (field: K, value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-[#c8c5cb]">
        {label}
        <b className="font-label text-[10px] text-[#c4b5fd]">{value} · {LEVEL_LABELS[value - 1]}</b>
      </span>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={value}
        onChange={(event) => onChange(field, Number(event.target.value))}
        className="mt-2 w-full accent-[#c4b5fd]"
      />
    </label>
  );
}
