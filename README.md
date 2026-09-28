# 藍 — N4 Kanji & Vocabulary Trainer

A local practice app built for JLPT N4/NAT-TEST Q4 level.

**What's actually in here:** 283 kanji · 1,112 unique kanji-words · 1,217 unique vocabulary forms · **2,049 unique study items**.

No accounts, no internet, no build step. Progress saves in your browser.

---

## Running it

**Option 1 — just open it.** Double-click `index.html`. Works in any modern browser.

**Option 2 — VS Code Live Server** (nicer, auto-reloads):
1. Install the **Live Server** extension
2. Open this folder in VS Code
3. Right-click `index.html` → **Open with Live Server**

**Option 3 — any static server:**
```
python3 -m http.server 8000
```
then open `http://localhost:8000`.

Keep the three files together — `index.html` loads `data.js` and `app.js` from the same folder.

---

## What's in it

**Practice**

| Mode | What it drills |
|---|---|
| Smart drill | Everything, scheduled. This is the one to use daily. |
| Reading | Kanji → reading, with phonetic near-miss options |
| Kanji choice | Reading → correct kanji spelling, with lookalike options |
| Meaning | Word → English, and English → word |
| Type reading | You type the hiragana. No options to guess from. |

**Games**

- **Match** — pair 8 words with their readings against the clock
- **Sprint** — 60 seconds, as many as you can; a wrong answer costs 3 seconds

**Exam** — 35 questions in 25 minutes, split across reading / kanji choice / meaning / vocabulary, with a per-section breakdown at the end and a button to drill only what you missed.

**Review** — progress dashboard, a ranked list of your weak items, and a searchable browser of every kanji with its readings and words.

---

## How the scheduling works

Set **Exam in** under Settings. The interval ladder changes to fit the time you have, so nothing is ever scheduled past your exam date.

**With 12 days set:**

| Level | Next review |
|---|---|
| 1 | 25 minutes |
| 2 | 2 hours |
| 3 | 8 hours |
| 4 | 1 day — counts as **mastered** here |
| 5 | 2 days |
| 6 | 3 days |
| 7 | 4 days |

An item starting from zero cycles through **7 exposures inside 12 days**. On the open-ended ladder (no date set) it would have been three, with the last one landing after the exam.

**With no date set**, the long ladder applies: 4 hours → 1 day → 3 days → 1 week → 2 weeks → 5 weeks → 3 months.

Get it wrong and it drops two levels and comes back in about 6 minutes. Items you keep missing surface at the top of every round and get listed under **Weak items**.

Drill rounds also adapt the question type: new or shaky items get multiple choice, and once an item is solid you start being asked to type the reading from memory. Recognition is easier than recall, so recall is where the ladder ends.

---

## Keyboard

| Key | Action |
|---|---|
| `1`–`4` | Pick an answer |
| `Enter` | Next question |
| `Space` | Submit a typed answer |
| `Esc` | Back to Smart drill |

---

## Known limits

**No listening, no kana-only vocabulary.** Adverbs like ゆっくり and はっきり, and katakana words, are in the data as vocabulary items but nothing here drills them by ear.

**Progress is per-browser.** Different browser or a cleared cache means starting over unless you exported.

**The 283-kanji list is a compilation, not an official NAT list.** Expect a few unfamiliar characters on the day.
