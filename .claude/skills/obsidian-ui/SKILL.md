---
name: obsidian-ui
description: Use for ANY frontend work in this repo (components, pages, styling, charts). Enforces a flat, dense, Obsidian-style dark UI and bans generic AI-generated design patterns.
---

# Obsidian-style UI for ConnectNow

Goal: it should look like a serious desktop knowledge tool (Obsidian, Linear, Things), not a landing page. Quiet, dense, flat, keyboard-friendly. If a choice is between "impressive" and "calm and legible", pick calm.

## Read before styling
1. Use the tokens below via CSS variables in `frontend/app/globals.css`. Never hardcode colors in components.
2. After any UI change, take a screenshot (Playwright MCP if available) at 1440x900, compare against the checklist at the bottom, and fix before reporting done.

## Tokens
```css
:root {
  --bg:          #161616;  /* app background */
  --bg-panel:    #1e1e1e;  /* sidebars, panes */
  --bg-raised:   #262626;  /* inputs, hovered rows, popovers */
  --bg-active:   #2f2f2f;  /* selected row */
  --border:      #303030;  /* 1px hairlines everywhere */
  --text:        #dadada;
  --text-muted:  #9a9a9a;
  --text-faint:  #6b6b6b;
  --accent:      #8b72f0;  /* the ONLY accent color (Obsidian purple) */
  --accent-soft: rgba(139,114,240,0.14);
  --danger:      #e5534b;
  --radius:      4px;      /* max 6px anywhere */
  --font-ui:     Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono:   "JetBrains Mono", ui-monospace, Menlo, monospace;
}
```
Type: base 13px, line-height 1.5. Only three sizes: 12 (meta), 13 (body), 15 (pane titles). Weights 400 and 500 only. Mono for ids, scores, and numbers.
Spacing: 4px grid (4, 8, 12, 16, 24). Rows are 28px high. Pane padding 12-16px.

## Layout (three-pane workspace, like Obsidian)
- Left sidebar (240px, collapsible): search box, people list as a flat file-tree-style list, filter chips for school/team/cluster, and the weight sliders in a collapsible "Weights" section.
- Center: tab bar (Heat map, Constellation, Find my people, Bridges) with the active tab underlined by 1px accent. Content fills the pane edge to edge, no card wrapper around the visualization.
- Right sidebar (320px, collapsible): details for the selected person or pair (properties as key/value rows, score breakdown, explanation, icebreaker). Empty state is one line of muted text.
- Thin status bar at the bottom (28px): N participants, selected pair, mode, cache status.
- Command palette on Cmd/Ctrl+K to jump to a person or switch tab/mode.

## Components
- Buttons: 28px tall, 1px border, transparent or --bg-raised, radius 4. Primary is --accent text on --accent-soft, not a solid gradient blob. No more than one primary per pane.
- Inputs/sliders: flat, --bg-raised, 1px border, accent only on focus ring (1px) and slider fill. Show the numeric value in mono next to each slider.
- Tabs: text only, muted until active, 1px accent underline.
- Lists: no card per item. Hover = --bg-raised, selected = --bg-active plus 2px accent left bar.
- Chips/tags: 20px tall, 1px border, --text-muted, radius 4. No colored fills except accent-soft for selected.
- Tooltips/popovers: --bg-raised, 1px border, radius 4, no shadow (or 0 4px 12px rgba(0,0,0,.4) at most), 12px text.
- Icons: lucide-react, 16px, stroke 1.5, --text-muted. No emoji anywhere in the UI.
- Motion: 100-150ms opacity/background only. No bounce, no parallax, no scale-on-hover. Exception: the heat map reveal animation on the demo path.

## Data viz
- Heat map: single-hue sequential ramp from --bg-panel to --accent (light end = high similarity), NOT rainbow, NOT jet. Cluster boundaries as 1px --border lines, cluster labels 12px --text-muted along the axes. Canvas fills the pane; no rounded container, no drop shadow.
- Cluster colors in the constellation: a muted categorical set of at most 8 hues at ~60% saturation on dark, with the accent reserved for selection/highlight.
- Axis text and tooltips use the UI font at 12px; numbers in mono.
- Always provide hover + click detail in the right sidebar, never a modal.

## Banned (these are the "AI slop" tells)
- Gradients of any kind (backgrounds, buttons, text), glassmorphism/backdrop-blur, glow/neon box-shadows, animated blobs, grid/noise/particle backgrounds.
- Big hero sections, centered marketing layouts, giant headings, pill badges like "Powered by AI", emoji or sparkle icons, feature-card grids.
- Cards inside cards, rounded-xl/2xl/3xl, thick colored borders, colored shadows.
- Purple-to-blue or any two-color accent scheme. One accent only.
- Lorem-ipsum-style filler copy, exclamation marks, "Unlock / Supercharge / Seamless" language. UI copy is short, literal, sentence case ("Find matches", not "Discover Your Perfect Connections!").
- Default shadcn look left untouched: restyle shadcn components to these tokens (flat, 4px radius, 1px border, 13px text).

## Checklist before saying done
- [ ] Only tokens above used; no stray hex codes in components.
- [ ] No gradients, glows, blur, emoji, or radius above 6px.
- [ ] Three-pane layout with tabs and status bar; content is dense, not padded like a landing page.
- [ ] Every number shown has a way to see why (right sidebar breakdown).
- [ ] Readable on a projector: text contrast at least 4.5:1, minimum 12px, and a "Presentation" toggle that bumps base size to 16px.
- [ ] Keyboard: Cmd/Ctrl+K palette, arrow keys move through the people list, Esc clears selection.
- [ ] Screenshot taken and reviewed at 1440x900.
