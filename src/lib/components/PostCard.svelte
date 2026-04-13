<script lang="ts">
  import type { PostMeta } from "$lib/posts";
  import { resolve } from "$app/paths";

  const { post, compact = false }: { post: PostMeta; compact?: boolean } = $props();
</script>

<article class:compact>
  <div class="body">
    <a href={resolve("/blog/[slug]", { slug: post.slug })}>
      <span class="post-title">{post.title}</span>
    </a>
    <span class="py-comment"> # {post.date}</span>
    {#if !compact}
      <p class="excerpt">{post.excerpt}</p>
      {#if post.categories.length > 0}
        <p class="tags">
          {#each post.categories as cat, i (cat)}
            {#if i > 0}{" "}{/if}<span class="py-decorator">@{cat}</span>
          {/each}
        </p>
      {/if}
    {/if}
  </div>
  {#if !compact && post.image}
    <a
      class="thumb"
      aria-hidden="true"
      href={resolve("/blog/[slug]", { slug: post.slug })}
      tabindex="-1"
    >
      <img alt="" loading="lazy" src={post.image} />
    </a>
  {/if}
</article>

<style>
  article {
    padding: var(--space-md) 0;
    border-bottom: 1px solid var(--ctp-surface0);
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
  }

  article:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  article.compact {
    padding: var(--space-xs) 0;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .post-title {
    font-size: 1.1rem;
  }

  .excerpt {
    color: var(--ctp-subtext0);
    font-size: 0.9rem;
    margin-top: var(--space-xs);
  }

  .tags {
    font-size: 0.85rem;
    margin-top: var(--space-xs);
  }

  .thumb {
    flex-shrink: 0;
    width: 120px;
    height: 80px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--ctp-surface0);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
