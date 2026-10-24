# AI, Moves and Transcribe

RigStick lets any AI app that speaks the [Model Context Protocol](https://modelcontextprotocol.io)
(Claude Desktop, Claude Code, Gemini CLI, Cursor, VS Code, LM Studio…) read and change the open
animation. Beginners get one-click **Moves**, and **Transcribe** turns a voiceover into word timings
that both people and AI use to time the animation.

## Connect an AI app (desktop app)

Open the **AI** tab in the inspector. The connection is on by default and listens on
`http://127.0.0.1:47760/mcp` (the next free port for a second window). Pick your app, press **Copy**, and:

| App | Where the setup goes |
| --- | --- |
| Claude Desktop | Settings → Developer → Edit Config; merge into `claude_desktop_config.json`, restart Claude. Uses the stdio bridge (`desktop/mcp-stdio.cjs`, run by the RigStick executable in Node mode). |
| Claude Code | Run the copied `claude mcp add --transport http rigstick …` command once. |
| Gemini CLI | Merge into `~/.gemini/settings.json` (`httpUrl` + `Authorization` header). |
| Other | Any Streamable HTTP client: the URL plus `Authorization: Bearer <token>`. |

Then just ask: “make the stickman run in from the left and wave”, or use the guided prompts the app
shows as slash commands: `animate_scene`, `act_out_voiceover`, `research_and_storyboard`, `polish_animation`.
The AI does its own web research with its app's browsing or search.

Safety: the server binds to 127.0.0.1 only, every request needs the token, and requests with a web
page's `Origin` are refused, so websites cannot reach it. **New token** disconnects every app using the
old one; **Off** stops the server. Settings and the token live in `<user data>/mcp.json`.
Every AI change is one undo step labelled “AI: …”; the panel lists each call and has **Undo last AI change**.

The browser version cannot host an MCP server; its AI tab explains this. Moves and Transcribe work there.

### The preset library

The **Library** tab holds your saved figures and movieclips and, under them, ready-made parts for every layer.
Its **Show** menu picks All, your Figures or Movieclips, or one preset kind; the search filters both. Click a
card (inserts at the canvas centre, or applies to the selected figure at the playhead) or drag it onto the
canvas (inserts at the drop point, or applies to the figure under the drop point). Scene effects and camera
moves apply at the playhead. Every preset writes ordinary keys and effect clips, so you can edit it afterwards.

| Kind | What it holds | Count |
| --- | --- | --- |
| Objects | Vector props in 10 categories: weapons, nature, buildings, vehicles, food, tech, symbols, shapes and more | 113 |
| Characters | Keyed stickman moves in 5 groups (move, fight, act, feel, dance), with Length, Strength and Direction | 58 |
| Motion | Entrances, exits, emphasis, loops and paths for any figure, text or sticker, plus sticker landings | 51 |
| Camera | Keyed camera moves (push in, crash zoom, whip pan, dutch tilt, zoom punch…) and camera effects (shake, handheld, impact, follow…) | 13 + 6 |
| Effects | RigStick's Looks plus a library in 8 groups: Action, Power, Magic, Elements, Weather, Celebrate, Explosions, Screen looks | 13 + 78 |
| Stickers | Slash crescents, streaks, impacts, magic, fire and smoke stills, and animated explosion, flash and puff flipbooks | 51 |
| Text | Text looks (comic, neon, chrome, retro…) and text animations, whole text or letter by letter | 25 + 18 |
| 3D Shot | The 3D Shot studio and its camera sliders (below) | — |
| My presets | Your own: imported .rigset / .rigobject files, .zip packs and images, and presets saved from the canvas | — |

The **Ninja VFX Pack** adds 48 stickers: manga sound effects (ドーン!, ズバッ!…), 13 animated ninja effects
(slash arcs, impacts, smoke, shockwave, speed lines…), a shuriken, Japanese traffic and the nine golden-hour
Tokyo depth plates (they fill the stage height, ready for a parallax camera).

#### Preset files: .rigset and .rigobject

Every preset can live in a file of its own (`src/presets/preset-files.mjs`):

- **.rigset**: an animation or effect preset (a character move, a motion, a camera move, an effect, a text animation).
- **.rigobject**: a thing to add (an object, a sticker or flipbook, a text look, a saved figure).

Both are ZIP archives holding `preset.json` (`{"format": "rigstick-preset", "version": 1, "presets": [{kind, id,
name, group, data, frames?, figure?}]}`) and the images (`frames/000.webp`…) or figure (`figure.stkz`) a preset
needs. A file usually holds one preset; it can hold several (a pack). The whole built-in library ships as these
files in `src/presets/library` (`index.json` lists them; `node scripts/build-preset-library.mjs --ninja <webp
folder>` writes them). Packs (the Ninja VFX Pack) are loaded from their files when the app starts.

In the app: a card's ⋯ (or right-click) saves it as a file; the Library's ⋯ menu imports files and makes new
presets from the canvas: **Save selection as object preset** (.rigobject), **Save its animation as preset**
(the selected figure's keyed movement as a motion, .rigset) and **Save its effects as preset** (.rigset). Your
presets go to **My presets** (kept in the app's profile, there in every project) and are written to disk too.

Letter animations split the text into one figure per letter, each on its own layer in a `Text: …` folder.
Sticker art is CC0 from Kenney (Particle Pack, Smoke Particles); the licences sit in `src/presets/art/`.
The library effects are separate from the Effects panel's filter-only presets, so they are applied as
effect clips (`src/presets/vfx-library.mjs`). Code: `src/presets/` (data, catalog, panel) and the preset
engine in `src/ai/ai-tools.mjs`.

AI apps read one kind at a time with `rigstick_presets {kind}` (objects, moves, motions, camera, effects,
stickers, textLooks, textAnimations; each a few hundred tokens), then call
`rigstick_insert_preset {kind: object|sticker|text, name, x, y, frame}` or
`rigstick_apply_preset {kind: move|motion|camera|effect|text, name, figure, frame, seconds, intensity}`.
`rigstick_figure_at {x, y}` finds the figure under a point. A four-second sword fight with a power-up aura,
a dash, a slash sticker, an impact star, hit sparks, a zoom punch, dropping comic text and embers takes
about 20 calls.

### Presets: the cheap way to animate

AI apps should never draw or code effects themselves. `rigstick_presets` returns the whole menu in a few
hundred tokens: moves (walk, run, jump, raise, hover…), camera moves, VFX (generated explosion, smoke,
aura, beam, particles and looks such as Power up or Impact), props (sword, skyline, rooftop, tree,
house, car, bomb, moon…), text styles and backgrounds. `rigstick_build_scene` then builds a whole shot in
one call from a cast (stickmen, props, text, images) and timed steps (move, pan, vfx, look, camera, text,
pose, remove). Cast order is depth order; images are backdrops. `pan` slides a layer at constant speed, so
three skylines panning at different speeds make a parallax tracking shot. A five-second rooftop shot with
a parallax city, a sword raise, a power-up look and an aura costs about 2,000 tokens end to end.
Generated images (for example from Google Flow) join through `rigstick_add_image` or an `image` cast
member, and `rigstick_export_video` renders an MP4 in the background (poll `rigstick_export_status`).

### 3D Shot

**Moves → Open 3D Shot studio** makes a cinematic shot in a real 3D city (three.js, bundled, works offline):
a 2D hero on a rooftop, motion solved by springs (anticipation, overshoot, follow-through), planted feet
with two-bone IK, a wind-blown verlet scarf, and true motion blur from averaged sub-frames. Pick a camera
move (Hero orbit, Push in, Crane up, Truck), an action, the hero's colour, length, blur, quality and city;
the preview plays live and shows the exact blur when paused. **Render MP4** saves to Videos/RigStick (Open
video, Show in folder). **Empty city** drops the hero so the shot becomes a moving backdrop for your own
figures, and **Put this frame in the project** adds the current frame as the background or as an image
layer fitted to the canvas, behind every figure. AI apps get the same engine through
`rigstick_render_3d_shot` (one call, about 1,700 tokens with progress polls). Code: `src/scene3d/`.

**Build as editable layers** makes the shot out of ordinary RigStick parts in a new project (1280×720):

| Layer | What it is | How to change it |
| --- | --- | --- |
| Scene | The sky of the **3D Set** (dome, stars, moon), one image per frame | **Update 3D set** re-renders the set from the 3D Camera |
| 3D City | The towers and their lights, a flipbook sprite (its keyed **Image** property shows frame n at frame n) | Hide, lock, add effects (blur it for depth of field, grade it) |
| 3D Rooftop | The roof, parapet, water tank, AC units, antenna and the hero's contact shadow, also a flipbook | As above |
| 3D Camera | Keyed every frame along the studio's camera move. An invisible rig figure: its root is where the roof under the hero's feet sits in the frame; four dials are orbit, tilt, lens and zoom | The **3D Camera at the playhead** sliders in Moves (each change is a key), or turn the dials on the canvas; RigStick eases between keys |
| Hero | A figure in the studio hero's proportions, keyed every frame from the physics solver, feet planted | Pose, re-key, apply Moves, recolour, like any figure |
| Scarf | A tapering chain joined at the neck, keyed from the wind simulation | Pose or delete keys |
| Sword | The blade, joined to the hand and keyed along the forearm, with a **Power up** glow clip from the raise | Pose it, Effects panel |
| (scene effects) | **City glow** (bloom) and **Vignette** clips | Effects panel |

The set renders with sub-frame motion blur (the rig is evaluated between its keys) in about 15 s for six
seconds. Zoom scales the city, so scale the hero to match it, or change Lens instead. AI apps use
`rigstick_build_3d_layers`, `rigstick_set_3d_camera`, `rigstick_get_3d_camera` and `rigstick_update_3d_set`.

### Motion blur on export

**Export → Motion blur** (Off, Light 3, Film 6, Heavy 12 samples) averages sub-frames over a 180° shutter
that opens at each frame. Every sub-frame is a full evaluation of the animation between its keys, so a
sword swing streaks along its arc instead of ghosting; held drawings and per-frame backgrounds stay on
their own frame. `rigstick_export_video` takes the same option as `blur`.

### Tools

`rigstick_get_project`, `rigstick_get_figure`, `rigstick_render_frame` (PNG, so the AI can look at
its work), `rigstick_add_figure`, `rigstick_pose`, `rigstick_apply_move`, `rigstick_camera`,
`rigstick_add_text`, `rigstick_scene`, `rigstick_go_to_frame`, `rigstick_delete_figure`,
`rigstick_undo`, `rigstick_redo`, `rigstick_get_transcript`, `rigstick_play`.
The contract (JSON Schema) is `desktop/ai-tool-catalog.cjs`; the editor side is `src/ai/ai-tools.mjs`.
Frames are 1-based; joint angles are absolute screen degrees (0 right, 90 down, −90 up).
Edits use the editor's own commands with Auto key on, so keys land where a user's would, and new
figures and text get their own layer so animating one never re-poses another.

## Moves

Select a figure, open **Library → Presets → Characters**, set Length, Strength and Direction, and press (or drag) a
move: 58 of them, from Walk, Run and Jump to Slash, Uppercut, Block, Cast, Cry, Victory and Dance.
It writes keyed, eased poses from the playhead.
Travelling moves stop short of the canvas edge. Camera buttons add Follow, Shake, Impact punch,
Zoom pulse and Handheld; **Smooth all motion** eases every layer. Moves match joints by name
(torso, head, left/right upper arm, forearm, thigh, lower leg), so the stock figure and most
hand-built rigs work (`src/ai/moves.mjs`).

## Transcribe

Pick an audio track, a model (Tiny → Large v3 turbo) and a language, press **Transcribe**.
The first run downloads the engine and model; later runs start at once. Nothing is uploaded.

- **whisper.cpp** (Windows desktop): the newest prebuilt release from
  [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp), the CUDA build when an NVIDIA GPU is
  present, models from Hugging Face (`desktop/whisper-service.cjs`).
- **Transformers.js** (browser, Linux/macOS desktop): Whisper in the page via
  [transformers.js](https://github.com/huggingface/transformers.js), WebGPU when available, else wasm
  (`src/transcribe/transformers-worker.mjs`). The onnxruntime wasm loads from jsDelivr pinned to the
  bundled version, because it is larger than the web host's per-file limit.

**This device** shows live CPU, memory and GPU use (and the whisper process on desktop), from
[systeminformation](https://github.com/sebhildebrandt/systeminformation) and `pidusage`; GPU busy % is
reported for NVIDIA cards, VRAM for most. Click any word in the transcript to jump to it. Transcripts are
saved in the project (`_rigs.rigstickTranscripts`) and AI apps read them with `rigstick_get_transcript`.
