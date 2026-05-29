---
title: Hello
date: '2025-06-03'
categories:
  - introduction
tags:
  - welcome
  - jekyll
  - setup
  - github-pages
  - arch-linux
excerpt: Fighting Ruby, erb, and PATH at 2am to set up a blog.
---

I decided to make this blog at some absurd hour of the night, mostly cause I had nothing better to do. Took me a bit to figure out how [GitHub Pages](https://pages.github.com/) and [Jekyll](https://jekyllrb.com/) actually fit together, but the gist is Jekyll generates static HTML and GitHub Pages hosts it for free.

First step was `paru ruby` on Arch, then `gem install --user-install bundler jekyll`. I've never touched Ruby before and hopefully I won't have to for a while, the whole ecosystem feels like one of those things where you either know it or you don't and I clearly don't. After install I got hit with the classic PATH warning:

```bash
WARNING: You don't have /.../.local/share/gem/ruby/3.4.0/bin in your PATH, gem executables (jekyll) will not run.
```

Fix on fish is `set -U fish_user_paths $fish_user_paths /.../.local/share/gem/ruby/3.4.0/bin`. Cool. Run `jekyll new notesbymihuu` and immediately get this:

```bash
<internal:/usr/lib/ruby/3.4.0/rubygems/core_ext/kernel_require.rb>:136:in 'Kernel#require': cannot load such file -- erb (LoadError)
from /.../.local/share/gem/ruby/3.4.0/gems/jekyll-4.4.1/lib/jekyll/commands/new.rb:3:in '<top (required)>'
from /.../.local/share/gem/ruby/3.4.0/gems/jekyll-4.4.1/lib/jekyll.rb:13:in 'block in Object#require_all'
from /.../.local/share/gem/ruby/3.4.0/gems/jekyll-4.4.1/lib/jekyll.rb:188:in '<top (required)>'
```

Turns out `erb` is not bundled with the base ruby package on Arch, even though jekyll has it as a dependency. `paru ruby-erb` and we're back. From here it's just `cd notesbymihuu`, `bundle config set --local path 'vendor/bundle'`, `bundle install`, `bundle exec jekyll serve` and the site is up locally. Should have taken five minutes, took closer to forty.

Quick about me since this is the first post. I spend most of my time studying or programming but my actual passion is music. I learn by breaking things and figuring out what went wrong, which is how I ended up at 2am fighting `erb` instead of sleeping. I'll be writing here about random stuff I figure out along the way, if it helps someone great, if not at least I have notes.
