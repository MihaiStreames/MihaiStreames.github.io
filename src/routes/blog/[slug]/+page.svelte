<script lang="ts">
  import type { PageData } from "./$types";
  import { resolve } from "$app/paths";

  const { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.meta.title} - MihaiStreames</title>
  <meta name="description" content={data.meta.excerpt} />

  <!-- open graph (facebook, discord, slack, etc.) -->
  <meta content="article" property="og:type" />
  <meta content={data.meta.title} property="og:title" />
  <meta content={data.meta.excerpt} property="og:description" />
  <meta content={data.meta.url} property="og:url" />
  <meta content={data.meta.image} property="og:image" />
  <meta content="1200" property="og:image:width" />
  <meta content="630" property="og:image:height" />
  <meta content="MihaiStreames" property="og:site_name" />

  <!-- twitter/x card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.meta.title} />
  <meta name="twitter:description" content={data.meta.excerpt} />
  <meta name="twitter:image" content={data.meta.image} />

  <!-- discord uses OG tags primarily, theme-color helps with embed accent -->
  <meta name="theme-color" content="#f5e0dc" />

  <!-- additional seo -->
  <link href={data.meta.url} rel="canonical" />
</svelte:head>

<article>
  <header>
    {#if data.meta.image && !data.meta.image.endsWith("/og-image.png")}
      <img class="hero" alt="" src={data.meta.image} />
    {/if}
    <h1>{data.meta.title}</h1>
    <p class="meta">
      <span class="py-comment"># {data.meta.date}</span>
      {#if data.meta.categories.length > 0}
        <span class="categories">
          {#each data.meta.categories as cat, i (cat)}
            {#if i > 0}{" "}{/if}<span class="py-decorator">@{cat}</span>
          {/each}
        </span>
      {/if}
    </p>
  </header>

  <div class="prose">
    <data.content />
  </div>

  <footer>
    <a href={resolve("/blog")}
      ><span class="py-keyword">return</span> <span class="py-func">blog</span>()</a
    >
  </footer>
</article>

<style>
  header {
    margin-bottom: var(--space-lg);
  }

  .hero {
    width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid var(--ctp-surface0);
    margin-bottom: var(--space-md);
    display: block;
  }

  .meta {
    margin-top: var(--space-sm);
    font-size: 0.9rem;
  }

  .categories {
    margin-left: var(--space-sm);
  }

  footer {
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid var(--ctp-surface0);
  }
</style>
