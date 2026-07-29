# TODO

## Now

- [x] Keep real third-party resources out of git with `local-resources/`.
- [x] Track source credits and license notes under `resources/original-video-assets/`.
- [x] Add a config format for local user-supplied MMD-style assets.
- [x] Add an app-side loader that reads the local config and reports found/missing assets.

## Next

- [ ] Add a loader panel for selecting scenes from config.
- [ ] Add PMX/PMD model loading with a permissive test asset first.
- [ ] Normalize model internals into renderer-facing buckets: meshes, skeleton, materials, blend shapes/expressions, physics, animations, and metadata.
- [ ] Map PMX and VRM into that model bucket schema without assuming every format exposes the same fields.
- [ ] Add on-the-fly procedural pose generation for stick/skeleton models: accept pose intents, solve target joint rotations with constraints/IK, and blend them through the scheduler.
- [ ] Add VMD motion probing and compatibility checks before animation playback.
- [ ] Add audio playback and timeline sync for local files.
- [ ] Add stage loading with separate transform controls.
- [ ] Add per-asset license/status display from config and tracked audit notes.

## WebKit Wallpaper Path

- [ ] Keep the core player as framework-light HTML/CSS/Three.js so it embeds cleanly in WebKit.
- [ ] Add a WebKit wrapper once the player can load local config reliably.
- [ ] Use the wrapper to grant read access to user-selected local asset folders.
- [ ] Persist the chosen asset folder outside the repo.
- [ ] Add wallpaper-safe controls: pause on battery, FPS cap, opacity/background mode, monitor selection.

## Distribution Rules

- [ ] Ship the player only, not third-party assets.
- [ ] Include only permissive or original sample assets.
- [ ] Make user-supplied assets local-only by default.
- [ ] Avoid export/repack/share features until asset terms are handled.
