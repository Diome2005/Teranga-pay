export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--c-bg) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        "card-2": "rgb(var(--c-card-2) / <alpha-value>)",
        band: "rgb(var(--c-band) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-fg) / <alpha-value>)",
        "ink-muted": "rgb(var(--c-fg-muted) / <alpha-value>)",
        "ink-subtle": "rgb(var(--c-fg-subtle) / <alpha-value>)",
        "ink-faint": "rgb(var(--c-fg-faint) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        overlay: "rgb(var(--c-overlay) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
