import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17343a",
        paper: "#f2f8f6",
        sage: "#69877b",
        coral: "#df665d",
        teal: "#168c82",
        plum: "#536a73"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(35, 83, 79, 0.09), 0 2px 8px rgba(35, 83, 79, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
