import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";
import { createHighlighter } from "shiki";

const highlighter = await createHighlighter({
  themes: ["catppuccin-mocha"],
  langs: [
    "asm",
    "bash",
    "c",
    "cmd",
    "console",
    "cpp",
    "html",
    "ini",
    "javascript",
    "json",
    "makefile",
    "python",
    "rust",
    "text",
    "toml",
    "typescript",
    "yaml",
  ],
});

const mdsvexOptions = {
  extensions: [".md"],
  highlight: {
    highlighter: (code, lang) => {
      const resolvedLang = highlighter.getLoadedLanguages().includes(String(lang))
        ? String(lang)
        : "text";
      const html = highlighter.codeToHtml(String(code), {
        lang: resolvedLang,
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
