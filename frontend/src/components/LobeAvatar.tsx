import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../utils/cn';
import { avatarColor, playerInitial } from './game/roleConfig';

const avatarFiles = import.meta.glob(
  '/node_modules/@lobehub/icons-static-avatar/avatars/{openai,claude,anthropic,gemini,gemma,palm,deepmind,mistral,cohere,grok,xai,perplexity,meta,ai21,alephalpha,arcee,liquid,nousresearch,inflection,pi,ai2,essentialai,dbrx,nova,aya,openchat,deepseek,qwen,doubao,kimi,moonshot,minimax,chatglm,zhipu,glmv,hunyuan,wenxin,baichuan,yi,zeroone,internlm,longcat,stepfun,tiangong,skywork,sensenova,xuanyuan,yuanbao,ai360,baai}.webp',
  { eager: true, import: 'default', query: '?url' },
) as Record<string, string>;

const PREFERRED_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Anthropic（Claude 厂商）',
  gemini: 'Gemini',
  gemma: 'Gemma',
  palm: 'PaLM',
  deepmind: 'Google DeepMind',
  mistral: 'Mistral',
  cohere: 'Cohere（Command）',
  grok: 'Grok',
  xai: 'xAI（Grok 厂商）',
  perplexity: 'Perplexity',
  meta: 'Meta（Llama）',
  ai21: 'AI21 Labs',
  alephalpha: 'Aleph Alpha',
  arcee: 'Arcee',
  liquid: 'Liquid AI',
  nousresearch: 'Nous Research（Hermes）',
  inflection: 'Inflection AI',
  pi: 'Pi',
  ai2: 'Allen AI',
  essentialai: 'Essential AI',
  dbrx: 'DBRX（Databricks）',
  nova: 'Amazon Nova',
  aya: 'Aya',
  openchat: 'OpenChat',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  doubao: '豆包',
  kimi: 'Kimi',
  moonshot: '月之暗面（Moonshot）',
  minimax: 'MiniMax',
  chatglm: 'ChatGLM',
  zhipu: '智谱 AI',
  glmv: '智谱 GLM-V',
  hunyuan: '腾讯混元',
  wenxin: '百度文心一言',
  baichuan: '百川智能',
  yi: '零一万物 Yi',
  zeroone: '零一万物',
  internlm: '书生·浦语',
  longcat: 'LongCat',
  stepfun: '阶跃星辰',
  tiangong: '天工',
  skywork: '昆仑万维 Skywork',
  sensenova: '商汤日日新',
  xuanyuan: '轩辕',
  yuanbao: '腾讯元宝',
  ai360: '360 智脑',
  baai: '智源研究院',
};

const AI_PLAYER_AVATAR_IDS = new Set([
  'openai', 'claude', 'anthropic', 'gemini', 'gemma', 'palm', 'deepmind',
  'mistral', 'cohere', 'grok', 'xai', 'perplexity', 'meta', 'ai21',
  'alephalpha', 'arcee', 'liquid', 'nousresearch', 'inflection', 'pi', 'ai2',
  'essentialai', 'dbrx', 'nova', 'aya', 'openchat', 'deepseek', 'qwen',
  'doubao', 'kimi', 'moonshot', 'minimax', 'chatglm', 'zhipu', 'glmv',
  'hunyuan', 'wenxin', 'baichuan', 'yi', 'zeroone', 'internlm', 'longcat',
  'stepfun', 'tiangong', 'skywork', 'sensenova', 'xuanyuan', 'yuanbao',
  'ai360', 'baai',
]);

export const LOBE_AVATARS = Object.entries(avatarFiles)
  .map(([path, url]) => {
    const id = path.split('/').pop()!.replace('.webp', '');
    const label = PREFERRED_LABELS[id] ?? id.replace(/-/g, ' ');
    return { id, label, url };
  })
  .filter(({ id }) => AI_PLAYER_AVATAR_IDS.has(id))
  .sort((a, b) => {
    const preferred = Number(b.id in PREFERRED_LABELS) - Number(a.id in PREFERRED_LABELS);
    return preferred || a.label.localeCompare(b.label, 'zh-CN');
  });

const avatarUrlById = new Map(LOBE_AVATARS.map((avatar) => [avatar.id, avatar.url]));

export function LobeAvatar({
  avatarId,
  playerId,
  className,
}: {
  avatarId?: string;
  playerId: string;
  className?: string;
}) {
  const url = avatarId ? avatarUrlById.get(avatarId) : undefined;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden text-xs font-semibold text-[#e6dfd2]',
        !url && avatarColor(playerId),
        className,
      )}
    >
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
        : playerInitial(playerId)}
    </span>
  );
}

export function AvatarPicker({
  value,
  playerId,
  onSelect,
  onClose,
}: {
  value?: string;
  playerId: string;
  onSelect: (avatarId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(
    () => normalized
      ? LOBE_AVATARS.filter(({ id, label }) => (
          id.includes(normalized) || label.toLocaleLowerCase().includes(normalized)
        ))
      : LOBE_AVATARS,
    [normalized],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[80] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-4 backdrop:bg-[#05080b]/80 backdrop:backdrop-blur-sm open:grid open:place-items-center"
      aria-labelledby="avatar-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden border border-antique-gold/30 bg-[#10161a] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="font-label text-[9px] tracking-[0.22em] text-antique-gold/60">LOBE ICONS</p>
            <h3 id="avatar-picker-title" className="mt-1 font-display text-xl text-paper">
              为 {playerId} 选择头像
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center border border-white/10 text-ink-muted transition-colors hover:border-antique-gold/45 hover:text-paper"
            aria-label="关闭头像选择器"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </header>

        <div className="border-b border-white/[0.08] p-4">
          <label className="relative block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-muted">
              search
            </span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 OpenAI、Claude、DeepSeek、通义千问……"
              className="input w-full pl-10"
              aria-label="搜索头像"
            />
          </label>
          <p className="mt-2 font-label text-[10px] text-ink-muted">
            {matches.length} / {LOBE_AVATARS.length} 个头像
          </p>
        </div>

        <div className="custom-scrollbar grid flex-1 grid-cols-4 gap-2 overflow-y-auto p-4 sm:grid-cols-6 md:grid-cols-8">
          {matches.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => onSelect(avatar.id)}
              title={avatar.label}
              aria-label={`选择 ${avatar.label}`}
              aria-pressed={value === avatar.id}
              className={cn(
                'group flex min-w-0 flex-col items-center gap-2 border p-2 transition-colors',
                value === avatar.id
                  ? 'border-antique-gold bg-antique-gold/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-antique-gold/40 hover:bg-white/[0.05]',
              )}
            >
              <img
                src={avatar.url}
                alt=""
                loading="lazy"
                className="h-12 w-12 rounded-lg object-cover"
                draggable={false}
              />
              <span className="w-full truncate text-center font-label text-[9px] text-paper/65">
                {avatar.label}
              </span>
            </button>
          ))}
          {matches.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-ink-muted">
              没找到匹配头像
            </p>
          )}
        </div>
      </section>
    </dialog>
  );
}
