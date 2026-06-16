---
title: "Downwell.AI: Training a DQN to play Downwell"
date: 2026-06-09
categories: [Reinforcement Learning, Reverse Engineering]
tags: [rl, dqn, memory-reading, pointer-chains, python]
excerpt: DQN agent trained to play Downwell (alongside fancy ways to get game state).
---

Most RL game projects treat the game as a black box. Downwell keeps all the state I care about in process memory, so I didn't.

## The game

## Why memory reading instead of pixels

Most game RL setups treat the game as a black box: capture pixels, push them through a CNN, hope the agent figures out what matters. That works, but it comes with overhead: you're asking the network to rediscover structure that the game already tracks explicitly. Downwell maintains player position, HP, ammo, gems, and combo as live values in process memory. Reading them directly means the agent gets clean, exact signals with zero ambiguity, no rendering overhead, and no chance of the CNN confusing a blue gem with a blue enemy.

### Pointer chains and multi-chain resilience

Game values aren't at fixed addresses. They live inside heap-allocated objects, and you reach them by following a chain of pointers: start from a known static base in the module, dereference a pointer, add an offset, dereference again, repeat until you reach the field. Cheat Engine calls these pointer chains:

```python
"xpos": {
    "bases": [0x00534288, 0x005479FC],
    "offsets": [
        [0x100, 0x8C0, 0x10, 0x84, 0x44, 0x8, 0xB0],
        [0x240, 0x4F0, 0x10, 0x84, 0x44, 0x8, 0xB0],
    ],
    "type": "float",
},
"ammo": {
    "bases": [0x00757C80, 0x00757BF8, 0x00757978],
    "offsets": [..., ..., ...],
    "type": "double",
},
```

The reason is object reinitialization. When the player dies and the game reloads the level, some heap objects are freed and reallocated. Without pointer chains, all the values would be read from stale memory and contain garbage.

Dead chains are detected via null pointer checks. The library I used for this, `PyMemoryEditor`, sadly does not raise on bad reads (which might be fixed soon), it returns whatever bytes happen to be at the address, which may be garbage. The only reliable signal is a null dereference mid-chain: if following a pointer produces `0x0`, the object at that level hasn't been allocated yet or was freed. `_read_ptr` treats zero as `None` and `_get_ptr_addr` short-circuits immediately:

```python
def _read_ptr(self, addr: int) -> int | None:
    data: bytes = self._process.read_process_memory(addr, bytes, 4)
    result = struct.unpack_from("<I", data)[0]
    return result if result != 0 else None

def _get_ptr_addr(self, base: int, offsets: list[int]) -> int | None:
    addr = self._read_ptr(base)
    if addr is None:
        return None

    for offset in offsets[:-1]:
        addr = self._read_ptr(addr + offset)
        if addr is None:
            return None

    return addr + offsets[-1]
```

We try each chain in order and return the first that resolves. If all chains return `None`, it raises `FieldResolveError`, meaning memory is unreadable, so the run can't continue any further.

### Module base resolution

Pointer chains are relative to the module base. The module base is the address where `Downwell.exe` was loaded into the process.

On Linux, `/proc/{pid}/maps` lists every memory region with its backing file path; scanning for the executable name gives the load address. `PyMemoryEditor` exposes this through `proc.get_memory_regions()`, so the Linux implementation is a straightforward scan:

```python
for region in proc.get_memory_regions():
    if b"r" not in region["struct"].Privileges:
        continue

    path: bytes = region["struct"].Path or b""
    if proc_name.encode() in path:
        return region["address"]
```

_Non-readable regions won't have a valid path populated, so there's no point inspecting them._

On Windows, `VirtualQueryEx` returns `MEMORY_BASIC_INFORMATION`, which has no module name field. We need `EnumProcessModules` + `GetModuleBaseNameW` to match a loaded module by name. `PyMemoryEditor` doesn't expose its process handle (it's name-mangled), so we open a second handle with the minimum required rights and close it immediately after:

```python
handle = _kernel32.OpenProcess(_PROCESS_QUERY_INFORMATION | _PROCESS_VM_READ, _WIN_FALSE, proc.pid)
```

## Capture pipeline

## Input handling
