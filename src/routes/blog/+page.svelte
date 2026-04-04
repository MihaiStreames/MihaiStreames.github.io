<script lang="ts">
  import type { PageData } from "./$types";
  import PostCard from "$lib/components/PostCard.svelte";

  const { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Blog - MihaiStreames</title>
  <meta name="description" content="Blog posts by MihaiStreames." />

  <!-- open graph (facebook, discord, slack, etc.) -->
  <meta content="website" property="og:type" />
  <meta content="Blog - MihaiStreames" property="og:title" />
  <meta content="Blog posts by MihaiStreames." property="og:description" />
  <meta content="https://mihaistreames.github.io/blog" property="og:url" />
  <meta content="https://mihaistreames.github.io/og-image.png" property="og:image" />
  <meta content="1200" property="og:image:width" />
  <meta content="630" property="og:image:height" />
  <meta content="MihaiStreames" property="og:site_name" />

  <!-- twitter/x card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Blog - MihaiStreames" />
  <meta name="twitter:description" content="Blog posts by MihaiStreames." />
  <meta name="twitter:image" content="https://mihaistreames.github.io/og-image.png" />

  <!-- discord uses OG tags primarily, theme-color helps with embed accent -->
  <meta name="theme-color" content="#f5e0dc" />

  <!-- additional seo -->
  <link href="https://mihaistreames.github.io/blog" rel="canonical" />
</svelte:head>

<h1><span class="py-keyword">def</span> <span class="py-func">blog</span>():</h1>

<div class="post-list">
  {#each data.posts as post (post.slug)}
    <PostCard {post} />
  {/each}
</div>

<style>
  h1 {
    margin-bottom: var(--space-sm);
  }
</style>
