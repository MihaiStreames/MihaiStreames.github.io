---
title: How tokount earns its speed
date: "2026-04-20"
categories:
  - engineering
tags:
  - rust
  - tokount
  - performance
  - simd
  - command-line
excerpt: How a shim around tokei turned into a ground-up SIMD line counter.
---

## Why another one

I didn't set out to replace `tokei`. The path here was longer than that.

It started with `cloc`. I just liked running it on my own projects. There's something genuinely satisfying about a tool that walks a directory and spits out a clean breakdown: 1,200 lines of Python, 300 lines of Markdown, 80 lines of YAML, this is the shape of the thing you made. That was the whole hook for me. I even showed it to my friends.

At some point I wanted the same information as a picture I could drop into READMEs and profile pages, similar to what `github-readme-stats` does, so I learnt how the API worked. Got something nice, but I also wanted actual LOC on top of GitHub's byte-weighted language counter. That turned into [`ghlang`](https://github.com/velox-sh/ghlang). It's still a work in progress (despite being at v2.5.5), still figuring out how to make the charts animated and drop-in for profiles in a style that feels mine and not copy-paste. (the pixel art style I have going is awesome! check it out! ad break over)

`ghlang` needed a local LOC counter. Calling `cloc` from a Python subprocess was fine but slow. I wanted to use `tokei`, with maturin, failed horribly, never used maturin. I wrapped `tokei` in a small Rust tool called `tokount`. It was a shim. It worked. I used it for a while. (funnily enough, I used subprocess for it)

Then one night in March, I messaged my [friend](https://github.com/big-lip-bob): "I'm gonna make my own tokei" "For no apparent reason" "Help me beat tokei in terms of time ☝️😂" "I doubt we can do that" "I mean I'm sure u could" "just no idea how to count lines of code EXTREMELY fast".

Five minutes later he replied: "SIMD" "and optimizing the fuck out of IO especially".

"There's no language agnostic way to count lines of code, so I'd need literally 1 pattern per language". We went back and forth for an hour about what a line even is, whether regex would work, whether a "specialized lexer" built from a language table would be tractable. I said "this project can easily become insanely difficult." He said "the farther you push it the more difficult it gets".

Those two exchanges ended up being the whole `tokount` architecture in seed form. SIMD for the scan. Static pre-processing of the language table. A specialized lexer, baked from data. Not invented that night, but pointed at very clearly.

The wrapper died that week. The real `tokount` took its place.

What came out of that is [`tokount`](https://github.com/velox-sh/tokount). On the Linux kernel corpus (31.3M lines, tmpfs) it finishes in 0.17s on my desktop, 0.78s on my laptop. That's roughly 5-6× ahead of `scc` and `tokei`, and three orders of magnitude ahead of `cloc`. Full numbers live in [BENCHMARKS.md](https://github.com/velox-sh/tokount/blob/master/scripts/benchmarks/BENCHMARKS.md) with per-host metadata so you can see the variance.

But that's now. Let me rewind.

## It wasn't fast at first

Version 1.0.0 shipped on February 17, 2026. It was a shim around `tokei`. Its speed was `tokei`'s speed, which is far faster than `cloc`. Far better UX for `ghlang`. I wasn't trying to beat anything yet (nor did I understand how).

The ground-up rewrite landed as v2.0.0 on March 23, five weeks later. Custom FSM, SIMD byte scanning via `memchr`, `phf`-generated language tables, `ignore`-crate parallel walker, an mmap/buffered hybrid for reads. First version that could beat `tokei` on the corpora I cared about. The Linux kernel came out to __892ms__ on the release build:

![tokount v2.0.0 Linux kernel benchmark, 892ms](/images/posts/tokount-v200-linux-kernel.png)

Fast on paper. But the stddev was awful. Sometimes it was 700, sometimes 1100. I kept running it and watching the number swing, which is not a good way to know whether a change you just made actually helped.

A few days before the release, during that same churn, I had a lucky run that landed at __617ms__:

![tokount work-in-progress Linux kernel benchmark, 617ms](/images/posts/tokount-mar20-linux-kernel.png)

Looks great in isolation. Wasn't reproducible. The 617ms was a good-variance run; the mean was noticeably higher.

April 16 was when I took the perf work seriously and shipped v2.1.8. The headline was __stability, not raw speed__. I dropped `mmap` in favor of a reused 64 KiB buffer and `read_to_end`. The mean shifted a bit but the stddev collapsed from ~49ms to ~14ms. I inlined the delimiter match in the hot FSM loop. Scalar 1/2/3-byte arms instead of `[u8]::starts_with`. That dropped tokount-owned `__memcmp` samples from 582 million to 0. I removed `memmap2`, `rayon`, and `crossbeam-channel` entirely. The Linux kernel run at v2.1.8 was __743ms__:

![tokount v2.1.8 Linux kernel benchmark, 743ms](/images/posts/tokount-v218-linux-kernel.png)

Actually slightly slower in absolute mean than the lucky-run 617ms chart, because the earlier number was cherry-picked by variance. What mattered is that 743ms was __boringly reproducible__. You could run it ten times and see 735, 742, 748, 740, 751. That's when the tool stopped feeling like a prototype.

Today, on v2.1.9, same laptop, tmpfs:

![tokount v2.1.9 Linux kernel benchmark, 779ms](/images/posts/tokount-latest-linux-kernel.png)

Within noise of v2.1.8. On my desktop (i7-10700K, 32GB, tmpfs), v2.1.8 lands at __168ms__. That's 5.3× `tokei` and 5.3× sc`c, with a tight stddev.

## The one loop

Most LOC counters I looked at - `tokei`, `scc`, `cloc`, a handful of smaller ones - do the same high-level thing. Walk the filesystem, classify each file, read it, run a tokenizer or state machine over the bytes, emit code/comment/blank counts per line. The differences are in how each stage is implemented.

`tokount` has one hot loop that does the counting. It reads bytes from a shared 64 KiB buffer and walks a finite state machine whose only states are _Normal_, _InComment_, _InString_, and _InChildBlock_. That's it. It doesn't tokenize. It doesn't parse. It doesn't build a tree. It cares about five transitions: comment starts, comment ends, string starts, string ends, and newlines.

The idea behind this loop is that on real source code, most bytes are _boring_, __very boring__. A typical file is 60-80% letters and whitespace, the FSM doesn't even care about them. The interesting bytes are a small set: the first character of each delimiter, plus `\n`. If you know which bytes are __interesting__, you can skip straight to the next one.

That skip is the thing that earns the speed.

## Skipping to the next interesting byte

This is where SIMD comes in, and it's not as scary as I thought it was.

Given a byte slice and a set of "interesting" bytes, I want the position of the next one. BurntSushi's [`memchr`](https://docs.rs/memchr) crate already does this for 1, 2, or 3 needles using SIMD instructions. `memchr::memchr(b'\n', bytes)` is, on my laptop, about 20 GB/s. Sadly, we do not have `memchr{x}`, so I wrote a 16-byte SSE2 sweep that does the same thing with an arbitrary byte set.

The dispatch picks the cheapest path:

```rust
pub(super) fn find_interesting(bytes: &[u8], needles: &[u8]) -> Option<usize> {
    match needles {
        []          => None,
        [a]         => memchr(*a, bytes),
        [a, b]      => memchr2(*a, *b, bytes),
        [a, b, c]   => memchr3(*a, *b, *c, bytes),
        _           => find_interesting_wide(bytes, needles),
    }
}
```

Each language has a fixed set of "interesting" first bytes baked in at compile time. Rust's interesting set is `{'/', '"', '\'', 'r', '#', '\n'}` - six bytes (Rust was very painful to deal with). C's is `{'/', '"', '\'', '\n'}` - four. Python's is `{'#', '"', '\'', '\n'}` - four. Most languages fit in the 4-or-more bucket; a few land in the 1, 2, or 3 bucket and get the faster dedicated `memchr` paths.

Once the scanner finds an interesting byte, the FSM takes over to decide what that byte means. Is the `/` the start of `//` or `/*`? Is the `"` starting a string or closing one? Is the `\n` inside a string or outside? That logic is straightforward branching, but it only runs on the interesting bytes. The boring bytes between them (sometimes hundreds in a row) are found and skipped in a single SIMD instruction.

On a file where 95% of bytes are uninteresting, tokount _does 95% less_ work than a byte-at-a-time tokenizer. The per-file constant cost only comes from directory walking and I/O now, not parsing.

## Language tables aren't code, they're data

tokount supports 280+ languages. I did not write 280 parsers.

Every language definition lives in [`languages.json`](https://github.com/velox-sh/tokount/blob/master/languages.json). Each entry lists its extensions, filenames, shebangs, comment and string delimiters, and a few flags like "does this language allow nested block comments" and "does this language have embedded children." A build script reads that JSON at compile time and emits a generated `languages.rs` with [`phf`](https://docs.rs/phf) perfect-hash maps: extension → language, filename → language, shebang → language, name → language.

The runtime payoff is that language lookup is a single hash table probe with zero allocation, which is $O(1)$. It's all static data baked into the binary. Adding a new language means editing the JSON and running `cargo build`. The parser doesn't need to change.

## The I/O choice that looked wrong

I initially used `mmap` for file reads. It was an obvious choice: zero-copy, kernel handles everything, should be the fastest thing. I imagined that anything >64KB would benefit from it (due to unnecessary overhead for small files).

__It was slower.__

A buffered `read_to_end` into a reused `Vec<u8>` beat `mmap` consistently. The reason is _page-fault overhead_. `mmap` lets you skip the `read()` syscall, but the first access to each 4KB page still traps into the kernel to map the page. For small-to-medium files, those page faults are more expensive than a single `read()` into a pre-allocated buffer.

The other cost of `mmap` is that run-to-run variance goes up. Page cache behavior dominates wall-clock time. Sometimes a file is already hot, sometimes it isn't, and the stddev of your benchmark balloons.

I kept one `Vec<u8>` per worker thread, `clear()` and `read_to_end()` each file, reuse the allocation. It's the simplest thing that could work and it's also the fastest.

## Accumulating in parallel without a lock

The directory walk is [BurntSushi's `ignore`](https://github.com/BurntSushi/ripgrep/tree/master/crates/ignore) crate, the same thing `ripgrep` uses. It walks in parallel with work-stealing, honors `.gitignore` and `.prettierignore`, skips `.git/` automatically. I wrote approximately zero lines of directory-walking code.

What I did write is the stats aggregation. Each worker thread owns a private `ThreadStats`. A `HashMap<&'static str, LangEntry>` that accumulates per-language counts. No locks during work. When a worker thread exits, its `Drop` impl pushes its stats into a shared `Vec<ThreadStats>` behind a `Mutex`. That mutex is touched exactly once per thread, at teardown.

After the walk returns, the bag is drained on the main thread, stats are merged with and the final totals are computed. The lock exists, but not on the hot path.

This was such a good trick, once I got it working. If you share a single accumulator across threads, you pay synchronization cost on every update. If you use a lock-free concurrent hashmap, you pay atomic contention on the hot path. A private per-thread accumulator with a once-per-thread merge gives you linear scaling until you run out of cores or I/O.

## Accuracy isn't a separate goal

The hardest constraint for `tokount` wasn't speed, it was accuracy. Line counts HAD to match `tokei` and `scc` exactly, across 280 languages, or the speed is worthless. I can make it read the repo at 20GB/s and call it a day.

The test strategy is a per-language fixture. `tests/lang/<name>.<ext>` is a real source file (still working on finding samples every day) and `tests/lang.expected/<name>.<ext>.expected` holds the counts I cross-checked against `tokei` (and `scc` when `tokei` doesn't support the language). A single test function runs every fixture through `tokount`, diffs against the expected counts, and fails with every mismatch listed. CI runs it on every PR. If the parser regresses on one obscure language, I know in under a minute.

When I add a new language, the workflow is: edit `languages.json`, add a fixture, run the test, verify it matches `tokei`. If `tokei` disagrees with itself (it sometimes does on edge cases like raw strings or nested block comments), I dig in until I understand which behavior is "correct" for that language. Usually `scc` is the tiebreaker. When neither supports the language, I read the language spec by hand.

## Closing words

I'm not going to pretend `tokount` beats everything everywhere. On a 25k-line repo, the difference between 5ms and 15ms _doesn't matter to anyone_. The gap only starts mattering on corpora that are genuinely large: Rust's compiler, the Linux kernel, Chromium... and even then, it's mostly a curiosity unless you're running the counter thousands of times a day (pre-commit hooks, CI dashboards, git-blame-style tooling).

What I will say though, is that if you run `tokount` on any of the common workloads, it won't be the bottleneck. That was the goal.

## What's next

v2.1.9 shipped with three new flags: `--files` (per-file breakdown), `--hidden` (count dotfiles), and `--include-ext` / `--exclude-ext` (filter by extension). Nothing architecturally interesting, just ergonomics. The default also flipped to skip hidden files, matching counter standards (I had it flipped around, accidentally).

The bigger ideas sitting in my todo list: YAML and HTML output formats, an MCP server mode so an agent can query `tokount` without shelling out, maybe a Cloudflare Worker that serves `tokount/<owner>/<repo>` shield badges for anyone. Further out: `ULOC` / DRYness maybe (never say never, but no high hopes), Python bindings via PyO3 for scripting use.

I'm not in a hurry. `tokount` is a side project built on evenings. The pace is fine.

Cya. Thanks for reading :)
