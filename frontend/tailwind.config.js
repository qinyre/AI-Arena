/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-once': 'pulseOnce 2s ease-in-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(147, 51, 234, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(147, 51, 234, 0.6)' },
        },
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(147, 51, 234, 0.5)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.5)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.5)',
        'inner-glow': 'inset 0 0 20px rgba(147, 51, 234, 0.1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
