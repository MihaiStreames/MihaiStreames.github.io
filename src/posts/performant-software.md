---
title: What happened to performant software?
date: "2026-04-13"
categories:
  - opinion
tags:
  - software
  - bloat
  - electron
  - windows
  - performance
excerpt: Software is getting worse, and I'm not sure anyone in charge actually cares.
---

## Let's talk about Discord

Discord uses up to 4GB of RAM. On a chat app. For text, voice, and some GIFs.

That's not a typo. [Discord itself admitted it in late 2025](https://www.windowslatest.com/2025/12/06/discord-admits-its-windows-11-app-is-a-resource-hog-tests-auto-restart-when-ram-usage-exceeds-4gb/), and their solution was to add an auto-restart that kicks in when memory usage hits 4GB, as long as you've been idle for 30 minutes. A chat app. Restarting itself. Because it can't manage memory. That's the fix.

The reason is Electron. Discord is essentially a browser running inside a browser. Every server you join is like opening a new tab, and Chromium doesn't let go of that memory easily. Each process - UI, GPU, voice, utility - runs separately and stacks up. Someone at Discord apparently decided to call `Get-WmiObject Win32_logicaldisk` through PowerShell just to check disk info, instead of using the Windows API that exists precisely for that. That's not Electron's fault. That's just bad engineering.

And it's not only Discord. VS Code, Slack, Spotify - all Electron. All doing the same thing. Open Task Manager while any of these are running and watch the numbers. It's honestly impressive in the wrong way.

I get why Electron exists. One codebase, three platforms, ship fast. I understand the business case. But somewhere between "this is a pragmatic tradeoff" and "our chat app needs 4GB of RAM," something went wrong. The art of actually thinking about what your software costs the user - in RAM, in CPU, in battery - feels like it quietly disappeared.

## Then there's Windows

Windows 11 shipped with the Start menu rewritten in React. The Start menu. A list of apps and a search bar, rebuilt with a JavaScript framework, because apparently that made sense to someone.

Then Copilot showed up in Notepad. Not as a plugin you install. Just there. In Notepad. The app whose entire point is that it opens instantly and does nothing but text.

They shoved Copilot into Photos, Snipping Tool, Widgets, the taskbar, notifications - everywhere. Not because users asked for it. Because Microsoft needed to justify the AI investment to shareholders. [The internet started calling it "Microslop"](https://www.windowslatest.com/2026/03/21/microsoft-responds-to-microslop-criticism-by-scaling-back-copilot-in-windows-11-starting-with-notepad-and-other-apps/), and that's fair. After enough backlash, Microsoft announced in March 2026 they'd pull Copilot back from Notepad and a few other places, calling it "integrating AI where it's most meaningful." Cool. Thanks for the correction three years later.

The Copilot integration in Notepad also introduced a security vulnerability that had to be patched separately. Just to round that off nicely.

Meanwhile, moving the taskbar to the side of the screen - something Linux and macOS have let you do for decades - was announced as a feature. Coming soon. Very exciting.

## Nobody is accountable

The pattern here isn't a technical problem, it's an accountability problem.

The engineers working on Discord probably know it's bloated. They're not idiots. But the decision to use Electron, to not prioritize memory, to ship the PowerShell disk check monstrosity - those aren't engineering decisions. They're product and business decisions. Someone decided that shipping cross-platform fast was more important than shipping something that doesn't eat your RAM. That someone isn't writing the code.

Same with Copilot in Windows. The engineers integrating it into Notepad didn't wake up one day and think "this will be great." They were told to do it. The pressure to monetize AI, to show usage metrics, to justify billions in infrastructure spending - that flows down from the top and becomes features nobody asked for.

The outcome is that software is actively getting worse while hardware gets more powerful. We have machines with 32GB of RAM and people are closing Discord to free up memory to play games. That shouldn't be possible. But here we are.

## What I actually do about it

I can't fix Discord. I can't fix Windows. But I can refuse to build things that way.

When I started actually paying attention to what my programs cost - in memory, in binary size, in startup time - it changed how I think about writing software entirely. An Alt+Tab replacement for Windows (made by my friend and I) is 13.5KB. The whole thing. That's not a flex, that's just what happens when you use the platform APIs that exist for exactly that purpose instead of embedding a web browser.

I'm not saying every app needs to be written in C or Rust, or that developer experience doesn't matter. It does. But there's a gap between "I used a framework to ship faster" and "my text editor needs an AI button and 400MB of RAM." That gap is where care used to live.

Software used to be written by people who thought about what it would feel like to use. Who cared whether it was fast, whether it was small, whether it did one thing well. That instinct isn't gone - there are still people building like that. But it's not rewarded at the organizational level anymore, and that's the actual problem.

I don't have a clean answer. The incentives aren't going to change because someone wrote a blog post. Electron isn't going away. Copilot will be back in Notepad in two years under a different name.

But I'll keep building stuff that opens in under a second and doesn't need you to close it when you want to play a game.
