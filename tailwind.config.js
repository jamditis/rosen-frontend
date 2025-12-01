/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.{html,js}",
    "./components/**/*.js",
    "./services/**/*.js",
    "./comparison-tool/**/*.{html,js}",
    "./glossary/**/*.{html,js}",
    "./context-1986/**/*.{html,js}",
    "./timeline/**/*.{html,js}",
    "./annotated-excerpts/**/*.{html,js}",
    "./faq/**/*.{html,js}",
    "./future-features/**/*.{html,js}"
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['"Roboto Mono"', 'monospace'],
        display: ['"Special Elite"', 'cursive'],
      },
      colors: {
        paper: '#fdfbf7',
        card: '#ffffff',
        stone: {
          850: '#1c1917',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.6s ease-out forwards',
        'slide-in-right': 'slideInRight 0.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        }
      }
    }
  },
  plugins: [],
}
