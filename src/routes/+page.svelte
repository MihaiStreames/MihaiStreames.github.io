<script lang="ts">
	import type { PageData } from "./$types";
	import { resolve } from "$app/paths";
	import me from "$lib/data/me.json";

	let { data }: { data: PageData } = $props();
</script>

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
			<p>
				<a href={resolve("/blog/[slug]", { slug: post.slug })}>{post.title}</a>
				<span class="py-comment"> # {post.date}</span>
			</p>
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
