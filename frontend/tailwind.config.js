/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Nocturne Stage 色板(借鉴稿 DESIGN.md)──
        // 深海军蓝底 + 容器层级 + 金/绯红/蓝灰角色语义色
        nocturne: {
          // 基础舞台
          stage: '#090d10',
          'stage-bright': '#222a2f',
          // 容器层级(深→浅,做深度感)
          'container-lowest': '#070a0c',
          'container-low': '#0d1216',
          'container': '#12181c',
          'container-high': '#182126',
          'container-highest': '#202b31',
          // 文字
          'on-surface': '#e6dfd2',
          'on-surface-variant': '#aaa79f',
          // 描边
          'outline': '#6f7472',
          'outline-variant': '#343b3d',
          // ── 角色语义色(对齐借鉴稿)──
          // 金 = 预言家 / 真相
          gold: '#b99758',
          'gold-bright': '#d7bd8b',
          // 绯红 = 狼人 / 危险
          crimson: '#b8463d',
          'crimson-soft': '#d28c85',
          // 蓝灰 = 村民 / 中性
          neutral: '#6f7c83',
        },
        // ── 旧色板保留(向后兼容,现有组件迁移期间用)──
        stage: {
          deep: '#031427',
          spot: '#0b1c30',
        },
        mask: {
          white: '#d3e4fe',
          shadow: '#47464b',
        },
        truth: '#e9c400',
        lie: '#eb2445',
        gray: {
          750: '#1b2b3f',
        },
        // 角色语义色(旧 key,对齐新值)
        werewolf: '#eb2445',
        seer: '#e9c400',
        villager: '#64748b',
      },
      fontFamily: {
        // 三套字体系统(借鉴稿)
        display: ['"Noto Serif SC"', '"EB Garamond"', 'serif'],
        body: ['"Noto Sans SC"', 'sans-serif'],
        label: ['"Noto Sans SC"', 'sans-serif'],
      },
      fontSize: {
        // 借鉴稿字号刻度
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '500' }],
        'title-md': ['24px', { lineHeight: '32px', fontWeight: '500' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '700' }],
      },
      borderRadius: {
        // 借鉴稿圆角(比默认小,更建筑感)
        DEFAULT: '0.125rem',
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-once': 'pulseOnce 2s ease-in-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'mask-split': 'maskSplit 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'curtain-rise': 'curtainRise 0.4s ease-out',
        'spotlight': 'spotlightPulse 3s ease-in-out infinite',
        // 借鉴稿推理面板扫描线
        'scanline': 'scanline 3s linear infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseOnce: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(233, 196, 0, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(233, 196, 0, 0.6)' },
        },
        maskSplit: {
          '0%': { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' },
          '100%': { clipPath: 'polygon(0 0, 48% 0, 48% 100%, 0 100%)' },
        },
        curtainRise: {
          '0%': { transform: 'scaleY(0)', transformOrigin: 'top' },
          '100%': { transform: 'scaleY(1)', transformOrigin: 'top' },
        },
        spotlightPulse: {
          '0%, 100%': { boxShadow: '0 0 40px rgba(233, 196, 0, 0.15)' },
          '50%': { boxShadow: '0 0 60px rgba(233, 196, 0, 0.25)' },
        },
        // 推理面板扫描线:横线从顶部下移到底部
        scanline: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(2000%)', opacity: '0' },
        },
      },
      boxShadow: {
        'stage': '0 8px 32px rgba(0, 0, 0, 0.6)',
        'mask': '0 2px 8px rgba(71, 70, 75, 0.5)',
        // 角色 glow
        'truth': '0 0 20px rgba(233, 196, 0, 0.4)',
        'lie': '0 0 20px rgba(235, 36, 69, 0.4)',
        'wolf-glow': 'inset 0 0 20px rgba(235, 36, 69, 0.1), 0 0 15px rgba(235, 36, 69, 0.2)',
        'gold-glow': 'inset 0 0 20px rgba(233, 196, 0, 0.1), 0 0 15px rgba(233, 196, 0, 0.2)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
