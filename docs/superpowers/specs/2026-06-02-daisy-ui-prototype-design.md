# DaisyUI Prototype Design

## Goal

Add a separate `/daisy` prototype route that tests whether a daisyUI-based
interface is suitable for the badminton fee book's core on-court workflow.
The existing MUI routes must keep their current behavior.

## Scope

The prototype includes:

- Login using the existing `badminton-fee-book.auth` localStorage session.
- Light and dark theme switching using the existing theme context.
- A data-source switch with `Demo` and `Real data` modes.
- Adding players in Demo mode.
- Incrementing a player's shuttle count in Demo mode.
- Marking a player as paid in Demo mode.
- Summary values for player count, shuttle count, unpaid total, and paid total.
- A player table that remains usable on desktop, iPad, and iPad mini.

The prototype excludes:

- Supabase reads, writes, and subscriptions.
- Room management.
- Voice input.
- Planned matches.
- Activity history.
- Advanced dialogs and the complete MUI feature set.
- Changes to the existing MUI page behavior.

## Data Sources

### Demo Mode

Demo mode is the default. It reads and writes a separate localStorage key:

`badminton-fee-book.daisy-demo`

The prototype can mutate this state freely without affecting live session
data. It uses the existing session domain helpers where practical.

### Real Data Mode

Real data mode is read-only. It reads the selected room from:

`badminton-fee-book.room`

If no room is selected, it falls back to `main`. It then reads:

`badminton-fee-book.session.<room>`

All controls that would mutate state are disabled in Real data mode. The
interface displays a visible warning badge and explanatory text so that the
read-only state does not rely on color alone.

## Interface

The `/daisy` page uses Tailwind CSS v4 and daisyUI classes. It has:

1. A compact header with the prototype title, data-source status, theme
   toggle, and a link back to the existing app.
2. A login panel when the existing local auth session is missing.
3. A source switch near the top of the authenticated view. Demo mode is the
   initial selection.
4. A warning alert when Real data mode is active.
5. A compact four-item summary row.
6. An add-player form that is enabled only in Demo mode.
7. A responsive player table with name, shuttle count, amount, payment state,
   and a large `+ shuttle` action suitable for touch screens.

The prototype keeps controls familiar and dense enough for court-side use.
Primary actions have a minimum touch height of 44 pixels.

## Theme Handling

The existing app theme context remains the source of truth. It writes
`data-theme="light"` or `data-theme="dark"` to the document element.

daisyUI is configured to expose matching `light` and `dark` themes so that the
prototype follows the same toggle without adding a second theme state.

## Error Handling

- Empty player names are rejected without mutating state.
- Duplicate names are rejected case-insensitively after trimming whitespace.
- Invalid stored Demo or Real data falls back to an empty initial session.
- Real data mode never writes to live localStorage keys.
- The interface explains when no real session data is available.

## Testing

Add focused component tests for `/daisy`:

- It shows the login panel without an auth session.
- Demo mode adds a player, increments shuttles, recalculates the amount, and
  marks the player as paid.
- Duplicate names are rejected.
- Real data mode reads the selected live room and disables all mutating
  controls.
- Theme toggle updates the active theme through the existing context.

Run the full Vitest suite and a production build after implementation. Perform
a browser check of `/daisy` at desktop and iPad-sized widths.

