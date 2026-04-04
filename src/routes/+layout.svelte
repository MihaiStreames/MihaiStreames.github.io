<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";

  const { children }: { children: Snippet } = $props();

  const nav = [
    { path: "/", label: "home" },
    { path: "/blog", label: "blog" },
  ] as const;
</script>

<svelte:head>
  <title>MihaiStreames{page.url.pathname !== "/" ? ` - ${page.url.pathname.slice(1)}` : ""}</title>
</svelte:head>

<div class="site-wrapper">
  <header>
    <nav>
      <span class="py-keyword">from</span>
      <span class="py-func"> site </span>
      <span class="py-keyword">import</span>
      {#each nav as { path, label }, i (path)}
        {#if i > 0}<span class="py-comment">,</span>{/if}
        <a
          class:active={page.url.pathname === path ||
            (path !== "/" && page.url.pathname.startsWith(path))}
          href={resolve(path)}>{label}</a
        >
      {/each}
    </nav>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <span class="py-comment"># built with sveltekit + mdsvex | catppuccin mocha</span>
  </footer>
</div>

<style>
  header {
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--ctp-surface1);
  }

  nav {
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  nav a {
    color: var(--ctp-rosewater);
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
  }

  nav a:hover {
    background-color: var(--ctp-surface0);
    text-decoration: none;
  }

  nav a.active {
    color: var(--ctp-base);
    background-color: var(--ctp-rosewater);
  }

  footer {
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid var(--ctp-surface1);
    font-size: 0.8rem;
  }
</style>
