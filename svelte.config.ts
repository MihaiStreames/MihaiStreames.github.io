import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";
import { createHighlighter } from "shiki";

const highlighter = await createHighlighter({
  themes: ["catppuccin-mocha"],
  langs: [
    "python",
    "bash",
    "javascript",
    "typescript",
    "rust",
    "c",
    "cpp",
    "java",
    "json",
    "yaml",
    "toml",
    "html",
    "css",
    "lua",
    "sql",
    "text",
  ],
});

const mdsvexOptions = {
  extensions: [".md"],
  highlight: {
    highlighter: (code: string, lang: string | null | undefined) => {
      const html = highlighter.codeToHtml(code, {
        lang: lang ?? "text",
        theme: "catppuccin-mocha",
      });
      // strip shiki's wrapping <pre> so mdsvex doesn't double-wrap
      return `{@html \`${html.replaceAll("`", "\\`")}\`}`;
    },
  },
};

const config = {
  extensions: [".svelte", ".md"],
  preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],

  kit: {
    adapter: adapter(),
  },
};

export default config;
