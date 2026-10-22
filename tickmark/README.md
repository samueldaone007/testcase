# Tickmark

A manual-testing checklist that feels like a well-used lab notebook. Write test
steps, tick them off as you run them, and pull ideas from a pencil-shaped
assistant that scribbles suggestions in the margin — without ever touching your
checklist until you say so.

## What it does

- **Notebooks & pages** — a project ("notebook") holds one or more checklists
  ("pages"). Switch between them from the left rail.
- **Test steps** — each step has a title, optional details and expected result,
  and a status of **Not run**, **Pass**, **Fail** or **Blocked**. Fails and
  blocks get a notes field for what actually happened.
- **Sections** — group steps under headings, and reorder either kind of row by
  dragging the handle.
- **Progress** — a per-checklist bar plus a plain-English line such as
  *"14 of 20 run, 2 failed"*. Filter the list by status, or hit **Reset run** to
  send everything back to Not run (clearing fail/block notes too).
- **Margin notes (the assistant)** — tell Pencil what you're testing in plain
  words. It asks short follow-ups and offers suggestion cards with
  **Add to checklist** and **Add all**. Accepted steps land with a small
  *from chat* marker.
- **Export** — download a checklist's results as Markdown or CSV, stamped with
  the date, tester name and a pass/fail summary.
- **Persistence** — everything is saved to `localStorage` under `tickmark.v1`,
  so a reload picks up where you left off.
- **Works on a phone** — below 860px the layout collapses into three tabs:
  Notebook, Checklist and Pencil.

## The assistant

Pencil is deterministic by default — there is no model call. `src/lib/assistant.ts`
holds a set of topic packs (auth, password reset, search, payments, checkout,
booking, forms, uploads, email, navigation, profile, admin, data, accessibility,
mobile, performance, security, errors) plus generic fallbacks. It recognises
whether you're describing a product, asking for edge cases, asking what's
missing, or asking for more, and it de-duplicates suggestions against the steps
already on the checklist. Every suggestion carries a section so accepted steps
file themselves neatly.

### Optional AI backend

Tickmark works with no model at all — Pencil's offline engine is always there.
If you want richer, freer ideas, you can point Tickmark at an **OpenAI-compatible**
model. The important part: **the API key lives on the server, never in the
browser.** The client talks only to Tickmark's own `/api/assistant` endpoint;
the server adds the key and forwards the request.

**Setup.** Copy `.env.example` to `.env` and fill it in:

```bash
TICKMARK_LLM_API_KEY=sk-...            # required to switch the model on
TICKMARK_LLM_BASE_URL=https://api.openai.com/v1   # optional (default shown)
TICKMARK_LLM_MODEL=gpt-4o-mini         # optional (default shown)
TICKMARK_LLM_TEMPERATURE=0.4           # optional (default shown)
```

Any provider with a `/chat/completions` route works — OpenAI, OpenRouter, Groq,
or a local Ollama at `http://localhost:11434/v1`. Then run `npm run dev` (the
Vite dev server mounts the same endpoint) or `npm run start` for the built app.

**In the app**, open **Pencil's brain** (the ⚙ in the masthead or margin panel).
It shows whether the server has a model, and a switch to keep everything offline
even when one does. There are no key, URL or model fields in the browser.

- The model is asked for strict JSON (`reply`, `followUp`, `quickReplies`,
  `suggestions[]`) and told never to repeat steps already on the checklist.
- **It never touches the checklist** — the accept-one / accept-all flow is
  unchanged, and accepted steps still get the *from chat* marker.
- If the call fails for any reason (bad key, rate limit, network down, malformed
  output), Pencil **quietly falls back** to the local engine and says so in the
  margin, so the assistant never goes dark.
- The browser's only setting — the on/off switch — is stored in `localStorage`
  under `tickmark.llm.v2`.

On the server side:

- `server/assistant.mjs` holds the proxy: it reads the environment, validates the
  incoming messages, enforces a same-origin guard and a body-size cap, and calls
  the provider. It is dependency-free and shared by both servers below.
- `server/index.mjs` is the production server: it serves `dist/` (with SPA
  fallback) and mounts `/api/assistant`.
- `vite.config.ts` mounts the same handler as dev middleware, so `npm run dev`
  behaves like production without a second process.

`src/lib/llm.ts` holds the client settings model, the request builder, the
tolerant JSON parser, `fetchAssistantStatus` / `askLlm` / `pingLlm` (all against
`/api/assistant`) and `respondSmart`, the entry point that prefers the model and
falls back to `respond()`.

## Design notes

Warm cream paper with a faint graph-paper grid; sage green, butter yellow and
cocoa brown ink. Brick-orange is reserved for failures only. Passing a step
plays a quick rubber-stamp animation — PASS thunking down slightly crooked —
and fails get a red-orange stamp. Headings use Shantell Sans, body text uses
Karla, and Pencil's margin notes use Caveat.

## Scripts

```bash
npm run dev       # dev server (app + /api/assistant middleware)
npm run build     # type-check and produce a production build in dist/
npm run preview   # preview the production build (static only, no API)
npm run serve     # run the Node server: dist/ + /api/assistant
npm run start     # build, then serve
npm run lint      # oxlint
npm test          # logic + render smoke tests
```

`npm run dev` and `npm run serve` both expose `/api/assistant`; `npm run preview`
does not, so the assistant simply stays in offline mode there.

The tests are bundled with Vite (`vite build --ssr`) and then run under Node,
since the source uses Vite-style directory imports.

## Layout

```
src/
  components/   UI: app shell, rail, checklist, step rows, stamps, assistant, export, settings
  lib/          assistant engine, optional model client, Markdown/CSV exporters
  store/        pure store transforms + the useTickmark hook
  styles/       design tokens, paper grid, fonts
  types/        data model, row types, stats helpers, persistence
server/
  assistant.mjs the /api/assistant proxy (shared by dev and production)
  index.mjs     production static server + API
tests/          logic and SSR render smoke tests
```
