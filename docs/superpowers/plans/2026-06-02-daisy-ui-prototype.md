# DaisyUI Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe `/daisy` prototype for the fee book's core workflow while leaving the existing MUI app unchanged.

**Architecture:** Add Tailwind CSS v4 and daisyUI as an isolated styling layer, then build a focused client route with its own Demo localStorage state. The route can inspect the selected live room through the existing localStorage keys, but Real data mode is read-only. Session calculations continue to use domain helpers from `lib/session.ts`.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS v4, daisyUI v5, Vitest, Testing Library

---

## File Structure

- Create `app/daisy/page.tsx`: `/daisy` route shell using the existing theme context.
- Create `app/daisy/daisy-fee-book.tsx`: focused client component for login, source selection, Demo mutations, Real read-only display, summary, and table.
- Create `lib/daisy-session.ts`: localStorage adapters and small state helpers for the prototype.
- Create `tests/daisy-session.test.ts`: unit tests for storage fallback, duplicate handling, and read-only live loading.
- Create `tests/daisy-page.test.tsx`: component tests for login, Demo flow, Real read-only mode, and theme switching.
- Modify `app/globals.css`: import Tailwind and daisyUI, then add a small scoped touch-target rule for the prototype.
- Modify `package.json` and `package-lock.json`: add Tailwind CSS v4, PostCSS integration, and daisyUI.
- Create `postcss.config.mjs`: enable the Tailwind CSS v4 PostCSS plugin.

### Task 1: Add Tailwind CSS v4 and daisyUI Tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `postcss.config.mjs`
- Modify: `app/globals.css`

- [ ] **Step 1: Install the styling dependencies**

Run:

```bash
npm install -D tailwindcss @tailwindcss/postcss daisyui
```

Expected: `package.json` and `package-lock.json` include `tailwindcss`, `@tailwindcss/postcss`, and `daisyui`.

- [ ] **Step 2: Create the PostCSS configuration**

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};
```

- [ ] **Step 3: Import Tailwind and configure daisyUI themes**

Add to the top of `app/globals.css`:

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
}
```

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing routes compile with the new CSS pipeline.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json postcss.config.mjs app/globals.css
git commit -m "Add Tailwind and daisyUI tooling"
```

### Task 2: Add Prototype Session Helpers

**Files:**
- Create: `lib/daisy-session.ts`
- Create: `tests/daisy-session.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/daisy-session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  addDemoPlayer,
  loadDaisyDemoSession,
  loadLiveSession,
  saveDaisyDemoSession
} from "@/lib/daisy-session";
import { createInitialSession } from "@/lib/session";

describe("daisy prototype session helpers", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to an empty demo session for invalid stored data", () => {
    localStorage.setItem("badminton-fee-book.daisy-demo", "{");
    expect(loadDaisyDemoSession()).toEqual(createInitialSession());
  });

  it("persists an added demo player and rejects duplicate names", () => {
    const initial = createInitialSession();
    const withPlayer = addDemoPlayer(initial, " Alice ");
    saveDaisyDemoSession(withPlayer);

    expect(loadDaisyDemoSession().players[0]?.name).toBe("Alice");
    expect(() => addDemoPlayer(withPlayer, "alice")).toThrow("ชื่อซ้ำ");
  });

  it("loads the selected live room without writing to it", () => {
    const live = addDemoPlayer(createInitialSession(), "Real player");
    localStorage.setItem("badminton-fee-book.room", "court-a");
    localStorage.setItem("badminton-fee-book.session.court-a", JSON.stringify(live));

    expect(loadLiveSession()).toEqual({ roomId: "court-a", session: live, available: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/daisy-session.test.ts
```

Expected: FAIL because `@/lib/daisy-session` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/daisy-session.ts`:

```ts
import {
  SessionState,
  createInitialSession,
  createPlayer,
  normalizeSession
} from "@/lib/session";

export const DAISY_DEMO_STORAGE_KEY = "badminton-fee-book.daisy-demo";
const ROOM_STORAGE_KEY = "badminton-fee-book.room";
const SESSION_PREFIX = "badminton-fee-book.session.";

function parseStoredSession(raw: string | null): SessionState | null {
  if (!raw) return null;
  try {
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadDaisyDemoSession(): SessionState {
  return parseStoredSession(localStorage.getItem(DAISY_DEMO_STORAGE_KEY)) ?? createInitialSession();
}

export function saveDaisyDemoSession(session: SessionState): void {
  localStorage.setItem(DAISY_DEMO_STORAGE_KEY, JSON.stringify(session));
}

export function addDemoPlayer(session: SessionState, rawName: string): SessionState {
  const name = rawName.trim();
  if (!name) throw new Error("กรุณากรอกชื่อผู้เล่น");
  if (session.players.some((player) => player.name.trim().toLocaleLowerCase("th-TH") === name.toLocaleLowerCase("th-TH"))) {
    throw new Error("ชื่อซ้ำ");
  }
  return { ...session, players: [...session.players, createPlayer(name)] };
}

export function loadLiveSession(): { roomId: string; session: SessionState; available: boolean } {
  const roomId = localStorage.getItem(ROOM_STORAGE_KEY) ?? "main";
  const session = parseStoredSession(localStorage.getItem(`${SESSION_PREFIX}${roomId}`));
  return { roomId, session: session ?? createInitialSession(), available: session !== null };
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
npm test -- tests/daisy-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/daisy-session.ts tests/daisy-session.test.ts
git commit -m "Add daisy prototype session helpers"
```

### Task 3: Build the `/daisy` Core Flow

**Files:**
- Create: `app/daisy/page.tsx`
- Create: `app/daisy/daisy-fee-book.tsx`
- Create: `tests/daisy-page.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing component tests**

Create `tests/daisy-page.test.tsx` with tests that:

```ts
it("shows login when the auth session is missing");
it("adds a demo player, increments shuttles, calculates totals, and marks paid");
it("shows live room data read-only and disables mutation controls");
it("toggles the shared theme");
```

Use Testing Library interactions against accessible labels:

```ts
screen.getByLabelText("ชื่อผู้เล่น")
screen.getByRole("button", { name: "เพิ่มผู้เล่น" })
screen.getByRole("button", { name: "เพิ่มลูกให้ Alice" })
screen.getByRole("checkbox", { name: "Alice จ่ายแล้ว" })
screen.getByRole("radio", { name: "ข้อมูลจริง" })
screen.getByRole("button", { name: "เปลี่ยนเป็นโหมดมืด" })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/daisy-page.test.tsx
```

Expected: FAIL because the `/daisy` component does not exist.

- [ ] **Step 3: Add the route shell**

Create `app/daisy/page.tsx`:

```tsx
import DaisyFeeBook from "./daisy-fee-book";

export default function DaisyPage() {
  return <DaisyFeeBook />;
}
```

- [ ] **Step 4: Implement the focused client component**

Create `app/daisy/daisy-fee-book.tsx`. The component must:

- use `useThemeMode()` for the existing theme toggle;
- read `badminton-fee-book.auth` on mount and show a small login form when absent;
- default to Demo mode and persist Demo state through `saveDaisyDemoSession`;
- load live data only when Real data mode is selected;
- pass `disabled={source === "live"}` to add, increment, and paid controls;
- use `calculatePlayerTotal(player, session.pricing)` and `summarizeSession(session)`;
- use daisyUI classes such as `btn`, `input`, `table`, `badge`, `alert`, `stats`, `stat`, `radio`, and `checkbox`;
- render a visible Real data read-only alert;
- render a message when live session storage is unavailable.

Use semantic labels from Step 1 and keep the component limited to prototype behavior.

- [ ] **Step 5: Add the scoped touch-target rule**

Append to `app/globals.css`:

```css
.daisyPrototype .btn,
.daisyPrototype .input {
  min-height: 44px;
}
```

- [ ] **Step 6: Run the component tests**

Run:

```bash
npm test -- tests/daisy-page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run the complete test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/daisy/page.tsx app/daisy/daisy-fee-book.tsx app/globals.css tests/daisy-page.test.tsx
git commit -m "Add daisyUI core-flow prototype"
```

### Task 4: Verify Production and Browser Behavior

**Files:**
- Verify only

- [ ] **Step 1: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS and `/daisy` appears in the route output.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts successfully.

- [ ] **Step 3: Check the route in the browser**

Open:

```text
http://localhost:3000/daisy
```

Verify:

- unauthenticated login appears;
- Demo is the default source;
- add player, increment shuttle, and paid checkbox work;
- Real data mode has a warning message and disabled mutation controls;
- theme toggle changes light and dark presentation;
- layout remains usable around 768px and 1024px widths.

- [ ] **Step 4: Inspect git state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: no unintended files are staged or modified.

