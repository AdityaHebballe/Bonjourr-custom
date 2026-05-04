# Games Release Widget

This document tracks the planned implementation of a games release schedule feature for Bonjourr.

## Goal

Add a new movable widget that shows upcoming game releases in the new tab page.

The first version should be small and stable:

- Show upcoming releases only
- Support a limited number of visible items
- Support a small set of filters
- Cache results locally
- Fit Bonjourr's existing feature architecture

## Current Status

Implemented in the repo:

- tracking doc
- `games` widget type and default sync state
- startup registration
- settings section and wiring
- move/layout integration
- interface markup
- dedicated stylesheet
- placeholder feature module with local mock release data
- live range, platform, and item-limit filtering against mock data
- horizontal scrolling card layout
- generated mock cover art for cards
- context-menu shortcut into games settings
- re-render on widget enable instead of showing an empty shell

Not implemented yet:

- real API or proxy integration
- local cache persistence
- loading and retry states for network requests
- links to game detail pages

## Current Decision

The feature should be implemented as a new widget named `games`.

It should follow the same general pattern as existing feature modules such as:

- `weather`
- `quotes`
- `notes`
- `pomodoro`

It should not be merged into `weather`, `quotes`, or `main`.

## Why A Separate Widget

- It matches the existing movable widget architecture
- It keeps settings isolated
- It keeps rendering and storage logic simple
- It makes future expansion easier, especially for watchlists

## Recommended MVP

### User-facing behavior

- Optional widget, disabled by default
- Shows the next upcoming game releases
- Presents releases as horizontally scrollable cards
- Each item should include:
  - cover image or fallback artwork
  - game title
  - release date
  - platform or short platform label
- Basic empty state
- Basic loading state
- Basic error state

### MVP settings

- Enable / disable
- Time window:
  - next 7 days
  - next 14 days
  - next 30 days
- Platform filter:
  - all
  - PC
  - PlayStation
  - Xbox
  - Nintendo
- Item count:
  - 3
  - 5
  - 10

## Data Source Decision

### Preferred direction

Use a backend or proxy endpoint instead of calling a protected games API directly from the extension frontend.

### Reason

The extension is client-side and public. Exposing API credentials in the shipped bundle is not acceptable for a durable implementation.

### Notes

- IGDB is strong on data quality, but its browser usage is a poor fit for a public frontend because it requires confidential app credentials and has browser/CORS constraints.
- RAWG is easier for direct requests, but direct key usage in the extension is still a poor long-term choice.
- A user-provided feed is viable for a niche advanced mode, but not ideal as the main UX.

## Proposed Architecture

### New files

- `src/scripts/features/games/index.ts`
- `src/scripts/features/games/request.ts`
- `src/scripts/features/games/display.ts`
- `src/styles/features/games.css`

### Existing files that will need changes

- `src/index.html`
- `src/settings.html`
- `src/styles/style.css`
- `src/scripts/index.ts`
- `src/scripts/settings.ts`
- `src/scripts/defaults.ts`
- `src/scripts/features/move/helpers.ts`
- `src/types/sync.ts`
- `src/types/local.ts`
- `src/types/shared.ts`
- `_locales/en/translations.json`
- `_locales/en/messages.json`

### Storage shape

Planned sync structure:

```ts
games: {
    on: boolean
    range: '7d' | '14d' | '30d'
    platform: 'all' | 'pc' | 'playstation' | 'xbox' | 'nintendo'
    limit: 3 | 5 | 10
}
```

Planned local structure:

```ts
gamesCache?: {
    fetchedAt: number
    query: {
        range: '7d' | '14d' | '30d'
        platform: 'all' | 'pc' | 'playstation' | 'xbox' | 'nintendo'
        limit: 3 | 5 | 10
    }
    items: {
        id: string
        title: string
        releaseDate: string
        platform: string
        url?: string
    }[]
}
```

The exact type names can change during implementation.

## Planned DOM Structure

Current widget structure:

```html
<div id="games_container" class="hidden">
    <div id="games_header">
        <p>Upcoming releases</p>
    </div>
    <ul id="games_list"></ul>
</div>
```

The card contents are still created with direct DOM writes in `display.ts`.

## Planned Integration Points

### Startup

Add the feature to `src/scripts/index.ts`, similar to how `quotes`, `weather`, and `notes` are initialized.

### Settings

Add a new settings section in `src/settings.html` and wire events in `src/scripts/settings.ts`.

### Layout editor

Register `games` as a movable widget in:

- `src/types/shared.ts`
- `src/scripts/features/move/helpers.ts`

### Styling

Add a dedicated feature stylesheet and import it through `src/styles/style.css`.

## Phases

### Phase 1: Scaffolding

- Add types
- Add defaults
- Add empty widget markup
- Add settings markup
- Add startup hook
- Add move/layout support
- Add CSS import

### Phase 2: Local mock data

- Render mock release items
- Validate layout and settings behavior
- Confirm translation and hidden-state behavior

### Phase 3: Real fetching

- Add request layer
- Add caching
- Add refresh rules
- Add error handling

### Phase 4: Polish

- Improve item formatting
- Improve responsive layout
- Add links if data source supports them
- Decide whether watchlist support is worth adding

## Risks

- Data-source choice may block a full implementation if there is no acceptable backend/proxy
- Release-date data can be incomplete or platform-specific
- A watchlist feature is much larger than the MVP and should not be mixed into the first pass

## Next Concrete Step

Implement the request and cache layer without changing the UI contract:

- replace mock-only request logic with a fetch abstraction
- persist the last successful query in local storage
- add loading and error card states beside the current empty state
- keep the horizontal card layout and settings contract unchanged

That keeps the widget usable now while making room for a real backend later.
