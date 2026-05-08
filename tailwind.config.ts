import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Iowan Old Style", "Charter", "Georgia", "serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#1a1a1a",
        paper: "#fbfaf7",
        muted: "#6b6b6b",
        accent: "#9b6b3f",
      },
    },
  },
  plugins: [typography],
};

export default config;
