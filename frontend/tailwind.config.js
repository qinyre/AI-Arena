/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 面具剧场主题色（保留供旧组件使用）
        stage: {
          deep: '#0a0a0f',
          spot: '#1a1620',
        },
        mask: {
          white: '#f8f6f4',
          shadow: '#3d2f4a',
        },
        truth: '#ffd700',
        lie: '#dc143c',
        neutral: '#64748b',
        // 灰色中间色阶：卡片内嵌套区块用（介于 gray-700 #374151 与 gray-800 #1f2937）
        // Tailwind 默认无 750，观战组件需要这个层级表现深度。
        gray: {
          750: '#2a323c',
        },
        // 角色语义色（观战界面统一配色，供将来语义化引用）
        werewolf: '#dc143c',
        seer: '#f5c518',
        villager: '#2dd4bf',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['Source Sans Pro', 'sans-serif'],
        label: ['DM Sans', 'sans-serif'],
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 215, 0, 0.6)' },
        },
        maskSplit: {
          '0%': {
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
          },
          '100%': {
            clipPath: 'polygon(0 0, 48% 0, 48% 100%, 0 100%)',
          },
        },
        curtainRise: {
          '0%': {
            transform: 'scaleY(0)',
            transformOrigin: 'top',
          },
          '100%': {
            transform: 'scaleY(1)',
            transformOrigin: 'top',
          },
        },
        spotlightPulse: {
          '0%, 100%': {
            boxShadow: '0 0 40px rgba(255, 215, 0, 0.15)',
          },
          '50%': {
            boxShadow: '0 0 60px rgba(255, 215, 0, 0.25)',
          },
        },
      },
      boxShadow: {
        'stage': '0 8px 32px rgba(0, 0, 0, 0.6)',
        'mask': '0 2px 8px rgba(61, 47, 74, 0.5)',
        'truth': '0 0 20px rgba(255, 215, 0, 0.4)',
        'lie': '0 0 20px rgba(220, 20, 60, 0.4)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
