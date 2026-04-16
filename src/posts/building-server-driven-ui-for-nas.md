---
title: How I Discovered Server-Driven UI (and Why It's Cool)
date: "2026-04-16"
categories:
  - architecture
  - desktop-apps
tags:
  - server-driven-ui
  - svelte
  - tauri
  - python
  - websocket
  - nas
excerpt: I wanted community modules for a NAS app. That led me down a rabbit hole into server-driven UI, where the backend owns the interface and the frontend is just a renderer.
---

## How This Started

Back in December 2024 I started building a Steam library reader. I used Python, because I was still learning it properly at the time.

Over the next year it evolved. I kept having ideas: "what if it could monitor system resources," "what if other people could write plugins for it," "what if it managed storage." Each idea pushed the scope further, and my Python got better along the way. By late 2025 it had turned into a NAS management app called ContaraNAS with a module system, a Tauri desktop client, and way more ambition than the original Steam reader.

I tried [NiceGUI](https://nicegui.io/) early on for the frontend. It worked, but making it look the way I wanted was insanely complex. Every time I tried to customize something I'd fight the framework for hours. Eventually I gave up and switched to Tauri + Svelte, which meant I now had a proper frontend to deal with.

That's when the real problem showed up.

## The Module Problem

I wanted community modules. Someone writes a Python class, it shows up as a dashboard widget. Simple idea, annoying implementation.

With a traditional setup, every module author would need to:

1. Write Python for the backend logic
2. Write Svelte for the frontend display
3. Keep both in sync
4. Learn a frontend framework just to show a progress bar

That last one killed it for me. The whole point was that someone could write a Python class and get a working UI. Not "write a Python class AND learn Svelte AND set up a build pipeline."

## The Airbnb Rabbit Hole

Around December 8th, 2025, I stumbled onto Airbnb's engineering blog posts about server-driven UI. The idea is simple: instead of the backend sending data and the frontend deciding how to display it, the backend sends the actual UI structure. The frontend is just a renderer.

So... if the backend controls what the UI looks like, then module authors only write backend code. The frontend doesn't need to know anything about modules. It just receives a tree of components and renders them.

I spent the next few days reading everything I could find about SDUI. Airbnb's approach, how mobile apps use it, the tradeoffs. Then I started building it.

## What I Built

The backend sends complete UI descriptions over WebSocket. When a module's state changes, it pushes its entire UI tree:

```json
{
  "type": "module_ui",
  "module": "sys_monitor",
  "ui": {
    "tile": {
      "type": "tile",
      "icon": "cpu",
      "title": "System Monitor",
      "stats": [
        { "type": "stat", "label": "CPU", "value": "45%" },
        { "type": "stat", "label": "Memory", "value": "8.2 GB" }
      ],
      "content": [
        {
          "type": "line_chart",
          "data": [10, 25, 45, 30, 55],
          "label": "CPU History"
        }
      ],
      "actions": [
        {
          "type": "button",
          "label": "Refresh",
          "on_click": { "__action__": "refresh" }
        }
      ]
    }
  }
}
```

The frontend doesn't interpret any of this. A `tile` becomes a `<Tile>` component. A `button` becomes a `<Button>`. It's recursive, so components nest naturally.

I defined about 20 component types - layout stuff like `stack` and `grid`, display stuff like `text`, `progress`, `table`, `line_chart`, interactive stuff like `button`, `input`, `select`, `toggle`, and a few extras like `modal` and `alert`. Enough for a NAS dashboard, not enough to build Figma.

## The Payoff

This is why I got excited about it. A complete module looks like this:

```python
class MyModule(Module):
    class State(ModuleState):
        count: int = 0

    def get_tile(self) -> Tile:
        return Tile(
            icon="Counter",
            title="Counter",
            stats=[Stat(label="Count", value=self.state.count)],
            actions=[Button(label="+1", on_click=self.increment)],
        )

    @action
    async def increment(self):
        self.state.count += 1
```

That's it. No JavaScript. No frontend tooling. No build step. Write a Python class, get a dashboard widget. The framework handles serialization, WebSocket pushing, and rendering.

When a user clicks that "+1" button, the frontend doesn't handle it - it just calls back to the server (`POST /api/modules/my_module/action/increment`), the server runs the action, state updates, new UI tree gets pushed. The frontend renders whatever comes back.

The `@action` decorator auto-commits after the function returns, so most actions don't need any boilerplate at all.

## Making It Type-Safe

This was the part where I learned FastAPI way better than I expected to. Python is dynamically typed (sort of). TypeScript is statically typed. They need to agree on what a `Button` looks like.

I ended up with two parallel hierarchies:

```python
# What module authors use (runtime)
class Button(Component):
    _type: ClassVar[str] = "button"
    label: str
    on_click: Callable | None = None

# What the API exposes (schema)
class ButtonSchema(BaseModel):
    type: Literal["button"] = "button"
    label: str
    on_click: ActionRef | None = None
```

Why two? You can't serialize a `Callable` to JSON. The schema version uses `ActionRef` instead, basically a small object with the function name that the frontend can POST back to.

The frontend runs `openapi-typescript` against FastAPI's `/openapi.json` to generate TypeScript types. Discriminated union on the `type` field gives you narrowing:

```typescript
function render(component: ComponentSchema) {
  if (component.type === "button") {
    // TypeScript knows this is ButtonSchema
    console.log(component.label);
  }
}
```

Defining components twice is annoying, but each layer does one thing. The schemas are a clean API contract.

## What Sucks About It

Every interaction round-trips to the server. Click a button, POST, server processes, WebSocket pushes new UI back. On a local network this is sub-millisecond and you don't notice. Over the internet, you would.

You also can't do arbitrary UI. Want a custom D3.js visualization? Too bad. You get the 20 components I defined and nothing else. For a NAS dashboard that's fine. For anything more complex, it's limiting.

And the whole UI tree gets rebuilt on every state change. No diffing, no patches - just "here's the entire new tree." For small module UIs this doesn't matter, but it's not exactly elegant.

## Where It Went

My last real commit on the Python version was December 25th, 2025. After that, exams happened, other projects happened, and I got significantly better at Python in the process. When I looked back at the codebase, a lot of it needed rewriting.

But the bigger realization was that Python was the wrong language for this. Deploying a Python app on someone's NAS means fighting package managers, dependency conflicts, and there's no good way to sandbox community modules. Someone's "system monitor" plugin could `import os; os.system("rm -rf /")` and there's nothing stopping it.

The project is now being redesigned in Rust with WASM-sandboxed modules. The SDUI concept carries forward completely - modules still define component trees, the client still renders them generically. But instead of Pydantic models it's WASM components registering JSON specs through a host ABI, and instead of JSON over WebSocket it's Protocol Buffers over a Noise-encrypted connection with forward secrecy.

The core idea survived the rewrite. "Make a renderer, send it trees" turns out to be architecture-agnostic. That's probably the most satisfying thing about this whole detour - the pattern I discovered reading Airbnb blog posts is still the foundation of the project, even as everything else is changing around it.

The full architecture for the Rust version is documented in the [ContaraNAS repo](https://github.com/MihaiStreames/ContaraNAS/tree/rewrite/rust-core).
