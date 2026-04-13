<script lang="ts">
	import type { PageData } from "./$types";
	import me from "$lib/data/me.json";
	import PostCard from "$lib/components/PostCard.svelte";

	const { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>MihaiStreames</title>
	<meta name="description" content="Personal site and blog of MihaiStreames." />

	<!-- open graph (facebook, discord, slack, etc.) -->
	<meta content="website" property="og:type" />
	<meta content="MihaiStreames" property="og:title" />
	<meta content="Personal site and blog of MihaiStreames." property="og:description" />
	<meta content="https://mihaistreames.github.io/" property="og:url" />
	<meta content="https://mihaistreames.github.io/og-image.png" property="og:image" />
	<meta content="1200" property="og:image:width" />
	<meta content="630" property="og:image:height" />
	<meta content="MihaiStreames" property="og:site_name" />

	<!-- twitter/x card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="MihaiStreames" />
	<meta name="twitter:description" content="Personal site and blog of MihaiStreames." />
	<meta name="twitter:image" content="https://mihaistreames.github.io/og-image.png" />

	<!-- discord uses OG tags primarily, theme-color helps with embed accent -->
	<meta name="theme-color" content="#f5e0dc" />

	<!-- additional seo -->
	<link href="https://mihaistreames.github.io/" rel="canonical" />
</svelte:head>

<section>
	<div class="code-block">
		<p>
			<span class="py-keyword">class</span>
			<span class="py-func">{me.handle}</span>:
		</p>
		<div class="indent">
			<p>
				<span class="py-keyword">def</span>
				<span class="py-func">__init__</span>(<span class="py-self">self</span>):
			</p>
			<div class="indent">
				<p>
					<span class="py-self">self</span>.role = <span class="py-string"
						>"{me.role}"</span
					>
				</p>
				<p>
					<span class="py-self">self</span>.focus = <span class="py-string"
						>"{me.focus}"</span
					>
				</p>
				<p>
					<span class="py-self">self</span>.languages = [{#each me.languages as lang, i (lang)}{#if i > 0},{" "}{/if}<span
							class="py-string">"{lang}"</span
						>{/each}]
				</p>
				<p>
					<span class="py-self">self</span>.also = <span class="py-string"
						>"{me.also}"</span
					>
				</p>
			</div>
		</div>
	</div>
</section>

<section>
	<p class="section-header"><span class="py-comment"># projects</span></p>
	{#each me.projects as project (project.name)}
		<div class="project">
			{#if project.org}
				<p>
					<span class="py-decorator">@org</span>(<span class="py-string"
						>"{project.org}"</span
					>)
				</p>
			{/if}
			<p>
				{#if project.org}
					<span class="py-keyword">class</span>
				{/if}
				{#if project.url}
					<a href={project.url}><span class="py-func">{project.name}</span></a>
				{:else}
					<span class="py-func">{project.name}</span>
				{/if}{#if project.org}:{/if}
				<span class="py-comment"
					># {project.description}{#if project.collaborators}{" "}
						{#each project.collaborators as collab (collab.name)}
							with <a href={collab.url}>@{collab.name}</a>{/each}{/if}</span
				>
			</p>
			{#if project.children}
				<div class="indent">
					{#each project.children as child (child.name)}
						<p>
							{#if child.url}
								<a href={child.url}><span class="py-param">{child.name}</span></a>
							{:else}
								<span class="py-param">{child.name}</span>
							{/if}:
							<span class="py-comment">{child.description}</span>
						</p>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</section>

<section>
	<p class="section-header"><span class="py-comment"># find me elsewhere</span></p>
	{#each me.links as link (link.label)}
		<p>
			<span class="py-param">{link.label}</span> =
			<a href={link.url}><span class="py-string">"{link.display}"</span></a>
		</p>
	{/each}
</section>

{#if data.recentPosts.length > 0}
	<section>
		<p class="section-header"><span class="py-comment"># recent posts</span></p>
		{#each data.recentPosts as post (post.slug)}
			<PostCard compact {post} />
		{/each}
	</section>
{/if}

<style>
	section {
		margin-bottom: var(--space-lg);
	}

	section p {
		margin-bottom: var(--space-xs);
	}

	.section-header {
		margin-bottom: var(--space-sm);
	}

	.code-block {
		background-color: var(--ctp-mantle);
		border: 1px solid var(--ctp-surface0);
		border-radius: 6px;
		padding: var(--space-lg);
	}

	.code-block p {
		margin-bottom: var(--space-xs);
	}

	.indent {
		padding-left: 2rem;
	}

	.project {
		margin-bottom: var(--space-sm);
	}

	.project:last-child {
		margin-bottom: 0;
	}
</style>
