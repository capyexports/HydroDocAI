import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "water-blue": "#1D63B8",
        "gov-red": "#C62127",
        "hydro-success": "#278B45",
        "hydro-bg": "#F8FAFC",
      },
      fontFamily: {
        sans: ["var(--font-inter)", '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
        document: ['"FangSong_GB2312"', '"STFangsong"', "serif"],
      },
      borderRadius: {
        hydro: "4px",
      },
      animation: {
        "breathe": "breathe 2s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(39, 139, 69, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(39, 139, 69, 0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
