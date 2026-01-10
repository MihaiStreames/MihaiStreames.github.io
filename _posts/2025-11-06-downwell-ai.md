---
layout: post
title: Teaching an AI to Play Downwell (and Failing Spectacularly)
date: 2026-01-10 18:00:00 +0200
categories:
  - ai
  - gaming
  - machine-learning
tags:
  - downwell
  - pytorch
  - reinforcement-learning
  - dqn
  - reverse-engineering
excerpt: A two-year journey of teaching an AI to play Downwell through OCR disasters, memory hacking, abandoned Rust rewrites, and eventually getting something that almost works.
---

## The Idea

It was 3:17 AM on May 5th, 2023. I should have been sleeping, but instead I was staring at [Downwell](https://downwellgame.com/), a brutally difficult roguelike where you fall down a well shooting enemies with your gunboots. The game is pure chaos: dodge enemies, manage ammo, chain combos, collect gems, and try not to die.

## Chapter 1: The OCR Nightmare (May 2023)

My initial approach seemed reasonable at the time:

```python
# Initial commit: 8659f5f - May 5, 2023, 3:17 AM
class CustomDownwellEnvironment:
    def __init__(self):
        self.game_window = None
        self.actions = ['left', 'right', 'space']
```

The plan was simple:

1. Screenshot the game with `pyautogui`
2. Extract HP/gems with OCR (Tesseract)
3. Feed into a basic DQN

Within 10 minutes, I realized OCR was absolute garbage for this:

```python
# Commit: c831e55 - "path at top of processing" - 3:27 AM
def extract_hp(screen):
    vals = {'44': 4, '34': 3, '5': 2, '14': 1}  # WTF Tesseract?
    hp_area = screen[49:67, 30:194]
    hp_area = cv.cvtColor(hp_area, cv.COLOR_BGR2GRAY)
    hp_area = cv.threshold(hp_area, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU)[1]
    
    hp = pytesseract.image_to_string(hp_area, config='--psm 6')
    hp = hp.replace(' ', '').replace('\n', '')
    
    if hp in vals:  # Manual error mapping because OCR sucks
        hp = vals[hp]
    else:
        hp = 0  # Give up
    return hp
```

Tesseract would read '4' as '44', '3' as '34', and sometimes just return complete nonsense. The game's pixel font was not OCR-friendly, and the 60 FPS gameplay meant everything was constantly moving.

By the next day, I gave up on computer vision entirely:

```bash
# Commit: df916a5 - May 6, 1:57 AM
"removed need for finding the player or enemies
using external counters such as hp and gem count, 
we can theoretically tell if we killed an enemy or not, and so on"
```

## Chapter 2: The Memory Hacking Solution (June 2023)

After a month of suffering with image processing, I discovered **pymem** - a Python library for reading process memory. Instead of trying to parse pixels, why not just read the actual values from RAM?

```bash
# Commit: adea1f3 - June 15, 5:57 PM
"switched to memory accessing for game data
since well image processing sucks lol"
```

Best commit message I've ever written.

### Reverse Engineering with Cheat Engine

This required finding the memory addresses for player data. Time to fire up Cheat Engine and do some pointer scanning:

```python
PLAYER_PTR = {
    "hp": {
        "base": 0x004A5E50,
        "offsets": [0x708, 0xC, 0x24, 0x10, 0x9C0, 0x390],
        "type": "double",
    },
    "gems": {
        "base": 0x00757BF0,
        "offsets": [0x24, 0x10, 0x330, 0xE0, 0x50, 0x9A8, 0x350],
        "type": "double",
    },
    "xpos": {
        "bases": [0x00534288, 0x005479FC],  # Multiple pointer chains
        "offsets": [
            [0x100, 0x8C0, 0x10, 0x84, 0x44, 0x8, 0xB0],
            [0x240, 0x4F0, 0x10, 0x84, 0x44, 0x8, 0xB0],
        ],
        "type": "float",
    },
}
```

Finding these pointer chains took consisted of:

1. Searching for value in Cheat Engine
2. Taking damage/collect gem
3. Searching for changed value
4. Repeating until I had the address
5. Finding what accessed this address
6. Generating pointer map

But it worked! The AI could now read game state with zero latency and perfect accuracy.

## Chapter 3: The Rust Tangent (June 16, 2023)

At 1:35 AM on June 16th, I had a brilliant idea:

```bash
# Commit: 55ba9d1 - "rust init"
```

Python felt slow. Rust would be faster, right? I spent the next 10 hours trying to rewrite everything in Rust.

```bash
# Commit: d81e118 - 11:53 AM
"no rust"
```

Turns out, the Python ecosystem (PyTorch, OpenCV, pymem) is really nice to have. Performance wasn't even the bottleneck - my architecture was just bad.

30 minutes later, I had another brilliant idea:

```bash
# Commit: 7f23738 - 12:37 PM
"bye bye dqn, hello reinforcement"
```

Maybe DQN wasn't the right algorithm? Let's try policy gradients.

```bash
# Commit: 32eaaba - June 17, 3:18 PM
"set up customEnv for agent, but still a lot to do"
```

There was indeed a lot to do. So much that I didn't touch the project again for 3 months.

## Chapter 4: The Long Winter (June 2023 - Late 2024)

The project collected dust. A few halfhearted attempts:

```bash
# September 29, 2023: "refactoring"
# December 24, 2023: "minor adjustments mainly some refactoring 
#                     to permit future usage of the AI on Linux"
# February 6, 2024: "ideas flowing"
```

That last one is hilarious in retrospect. The ideas were flowing so well that I didn't commit anything for another 8 months.

## Chapter 5: Actually Making It Work (Late 2024)

In October 2024, I came back with fresh eyes and finally understood what was wrong.

### The Critical Bug: Not Learning Online

My original implementation only trained at the end of episodes:

```python
# OLD WAY - Train only when episode ends
def run_episode():
    while not done:
        action = agent.act(state)
        next_state, reward, done = env.step(action)
        memory.add(state, action, reward, next_state, done)
    
    # Only train AFTER the episode ends
    if episode % 10 == 0:
        agent.replay(batch_size=32)  # Too late!
```

This was catastrophically bad. The agent would play for hundreds of steps, die, then try to learn from ancient history.

The fix was embarrassingly simple:

```python
# Commit: 02db6f0 - November 3, 2024
"how could i miss the part where the DQN learns EVERY STEP smh"

# NEW WAY - Train continuously
def step(self):
    if self.last_state is not None:
        reward = self.reward_calc.calculate_reward(
            self.last_state, current_state
        )
        
        # Store experience
        self.memory.add(
            self.last_state, self.last_action, 
            reward, current_state, done
        )
        
        # Train IMMEDIATELY
        if self.memory.size > self.config.agent.train_start:
            loss = self.agent.replay(batch_size=512)
```

This single change made the agent go from completely random to actually learning patterns.

### Frame Stacking: Teaching the AI to See Motion

The agent couldn't perceive velocity from single frames. Imagine trying to play Downwell by looking at screenshots - you'd have no idea if enemies are moving up or down.

```python
# Commit: f2823e3 - "Frame stacking attempt"
self.frame_stack = deque(maxlen=4)

def get_state(self):
    frame = self.capture_engine.capture()
    processed = self._preprocess_frame(frame)
    self.frame_stack.append(processed)
    
    # Stack 4 frames together: (84, 84, 4)
    state = np.stack(self.frame_stack, axis=2)
    return state
```

Now the AI could "see" motion across 4 frames, understanding trajectories and velocities.

### The Threading Architecture

Running everything in a single thread was killing performance. The solution: decouple perception from decision-making.

```python
# Commit: c5b545d - "need to speedup"
class GameStateReaderThreader(Thread):
    """60 FPS perception thread"""
    def run(self):
        while self.game.is_running():
            state = self.player.get_all_values()
            self.queue.put(state)
            sleep(1/60)  # Smooth 60 FPS reading

class AgentThreader(Thread):
    """15 FPS decision thread"""
    def run(self):
        while self.running:
            state = self.state_queue.get()
            action = self.agent.act(state)
            self.action_queue.put(action)
            
            # Train while we wait
            if self.memory.size > batch_size:
                self.agent.replay()
```

This let the AI read game state at 60 FPS while making decisions at a more reasonable 15 FPS.

### The Reward System

Early reward systems were too simple. The final version rewarded:

```python
def calculate_reward(self, state, next_state):
    reward = 0
    
    # Going deeper is the main goal
    if next_state.depth > state.depth:
        reward += (next_state.depth - state.depth) * 2.0
    
    # But don't hit walls
    if self._near_boundary(next_state.xpos):
        reward -= 5.0
    
    # Combos are good
    if next_state.combo > state.combo:
        reward += min(next_state.combo * 0.5, 10)
    
    # Death is very bad
    if next_state.hp <= 0:
        reward -= 100
    
    # Clip to prevent instability
    return np.clip(reward, -100, 100)
```

### Hyperparameter Madness

After hundreds of failed runs, these hyperparameters finally worked:

```python
@dataclass(frozen=True)
class AgentConfig:
    learning_rate: float = 0.0001
    gamma: float = 0.9997  # VERY high - long-term planning crucial
    epsilon_start: float = 1.0
    epsilon_min: float = 0.1
    epsilon_decay: float = 0.999985  # Slow decay
    batch_size: int = 512  # Big batches = stable learning
```

That gamma of 0.9997 is absurdly high, but Downwell requires planning 100+ steps ahead. Lower values made the agent too myopic.

## Chapter 6: Visualization & Debugging

I built a real-time visualization to see what the AI was "thinking":

```python
# Commit: e4334d4 - "Add training history logging and visualization"
class AIVision:
    def display(self, game_state, q_values, last_reward):
        # Show Q-values as bars
        for i, (action, q_val) in enumerate(zip(ACTIONS, q_values)):
            color = GREEN if i == np.argmax(q_values) else GRAY
            bar_width = int(normalize(q_val) * 140)
            cv2.rectangle(canvas, start, end, color, -1)
            cv2.putText(canvas, f"{action}: {q_val:.2f}", ...)
```

Watching the Q-values change in real-time was mesmerizing. You could literally see the AI learning that jumping over pits had high value, while moving into walls had negative value.

## The Reality Check

After all this work, here's the truth: **the AI still can't beat Downwell**.

It can:

- Navigate basic obstacles
- Collect gems
- Chain small combos
- Avoid walls (mostly)
- Survive for ~30-60 seconds

It cannot:

- Handle complex enemy patterns
- Manage ammo efficiently
- Adapt to new level layouts
- Come close to my personal best (world 3)

## Try It Yourself

The code is all on GitHub: [MihaiStreames/Downwell.AI](https://github.com/MihaiStreames/Downwell.AI)
