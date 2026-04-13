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

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
  extensions: [".md"],
  highlight: {
    highlighter: (code, lang) => {
      const html = highlighter.codeToHtml(code, {
        lang: lang || "text",
        theme: "catppuccin-mocha",
      });
      // strip shiki's wrapping <pre> so mdsvex doesn't double-wrap
      return `{@html \`${html.replaceAll("`", "\\`")}\`}`;
    },
  },
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: [".svelte", ".md"],
  preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],

  kit: {
    adapter: adapter(),
  },
};

export default config;
