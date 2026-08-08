# The design bridge

Two directions, one folder.

- `from-claude-design/` — what came **out** of Claude Design. `Daily Words.dc.html`
  is the archived visual source of truth for the whole app (ROADMAP [R18]). It is
  read, never generated. Where it and a feature plan disagree, it wins.
- `previews/` — what goes **back in**. Eleven standalone HTML pages, one per part of
  the kit, pushed to the Design System project so the components are reviewable in a
  browser on a phone.

They are different projects and neither is the other's output:

| | Project id | Type | Contains |
|---|---|---|---|
| Screens (the source of truth) | `cf545c6e-6728-461d-ba29-426e7a4ae0f6` | project | the ten screens + a system sheet |
| Design System (the kit) | `8c1c015d-78c9-4945-8382-23bf124f2333` | design system | the eleven previews below |

The type is fixed at creation and cannot be converted, which is why there are two.

## What a preview is

One file. All CSS inlined, no external requests, no fonts fetched over the network.
Open any of them in Safari at 375px with the Network tab open and it stays empty.
Georgia and the system mono stand in for Source Serif 4 and IBM Plex Mono, because a
preview that fetches a font is no longer self-contained — and a preview is about
layout and colour, which the stand-ins carry fine.

**Previews are generated, never hand-edited.** You may edit:

- the body of a preview, outside the marker block
- `previews/_shared.css`, the plain-CSS restatement of the kit

`scripts/build-previews.mjs` owns everything between
`<!-- @dw:tokens:start -->` and `<!-- @dw:tokens:end -->`, and injects
`src/styles/tokens.css` followed by `_shared.css` into that gap. That is why the
tokens live in their own file rather than inside `globals.css`: the previews inline
the exact bytes the app ships, so they cannot drift. Change a colour once and eleven
previews change with it.

The build **fails** if line 1 of any preview is not a well-formed `@dsCard` comment.
Anything before that comment — a doctype, a blank line, a BOM — and the Design System
pane silently renders no card at all, which is a failure mode worth a hard error.

## The eleven files and their groups

Group labels are the card identity in the pane. They are Title Case and **stable**:
renaming a group orphans its card. The numeric prefixes control ordering — never
renumber an existing file, append a new one.

| File | `@dsCard group=` |
|---|---|
| `00-foundations.html` | Foundations |
| `01-typography.html` | Typography |
| `02-buttons.html` | Buttons |
| `03-inputs.html` | Inputs |
| `04-surfaces.html` | Surfaces |
| `05-daily-card.html` | Daily Card |
| `06-navigation.html` | Navigation |
| `07-calendar.html` | Calendar |
| `08-chat.html` | Chat |
| `09-gamification.html` | Gamification |
| `10-screens.html` | Screens |

## Pushing

**Read before you write. Every time.** The design project is a shared surface with a
human in it, and `write_files` is destructive.

```
npm run design:build            # regenerate, so tokens match the app
npm run design:changed          # prints ONLY files whose sha256 ≠ the manifest
```

If `design:changed` prints nothing, stop — there is nothing to push. Otherwise, for
the files it printed:

```
DesignSync.list_files   { project_id }        confirm the file still exists
DesignSync.get_file     { project_id, path }  READ THE REMOTE VERSION FIRST
DesignSync.finalize_plan                      declare exactly the changed files
DesignSync.write_files                        the changed files only
node scripts/dssync-changed.mjs --write-manifest && git add design/.dssync-manifest.json
```

The `get_file` step is the one that matters. If the remote content differs from what
was last pushed in a way you did not author, someone edited it in the browser: stop,
port their change into `previews/` **and** into the React component, then start over.

Never "sync everything". The manifest exists to make incrementality mechanical rather
than a judgement call. The one legitimate bulk push is a token change, which really
does alter all eleven files — say so in `finalize_plan` when it happens.

## Which side wins

The React components in `src/components/` are what users see, so on anything that
ships, the repo wins. Browser-side design is ported in deliberately: change the
component, run `npm run test:layout`, then push the preview back so the two agree
again. A preview that has drifted from the app is worse than no preview, because it
gets believed.
