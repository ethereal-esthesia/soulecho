# SoulEcho

> An open-source desktop companion platform for VRM and MMD (PMX) characters.

**SoulEcho** aims to bring interactive 3D characters to the desktop, local applications, and eventually online experiences.

The long-term goal is to support expressive companions that can:

- Load **VRM** and **PMX** characters.
- Animate, emote, and react in real time.
- Interact with desktop applications.
- Connect to local or online AI backends.
- Allow creators to package and share companion characters.

---

## Current Status

⚠️ **Work in Progress**

This repository is an early prototype.

At the moment the application is primarily a local rendering demo used to develop the rendering pipeline and character system.

Current features include:

- VRM model loading
- PMX model loading
- Basic renderer
- Character preview controls
- Lighting presets
- Bloom, saturation and post-processing controls
- Local resource configuration
- Model presets
- Auto-discovered local model folders
- Basic local Ollama dialogue

External networking is intentionally limited in the prototype. Local AI dialogue is available through the dev server bridge when Ollama is running.

---

## Vision

The goal is to evolve this into a complete companion platform capable of running:

- Desktop companions
- Embedded web companions
- Local AI companions
- Server-hosted companions
- Shared virtual assistants

Characters should eventually be able to:

- Speak
- Animate
- React to applications
- Follow the user
- Display emotions
- Support physics and accessories
- Be extended through plugins

---

## Resources

Models, animations, motions and textures are loaded from the local `resources/` directory.

Eventually any compatible assets placed into the resource folders should become available automatically without modifying application code.

The bundled public demo profile uses the Astera VRM sample at:

```text
public/characters/astera/Astera.vrm
```

Astera is a renamed copy of the Vita VRoid Studio sample model from the `madjin/vrm-samples` mirror. The embedded VRM metadata lists the model license as `CC0`; see `public/characters/astera/README.md` for source and license references.

For quick model testing, place one model folder per character under:

```text
local-resources/original-video-assets/model/vrm-samples/
```

`local-resources/` is ignored by git and should hold user-supplied or locally licensed assets only. Copy `resources/original-video-assets/config.example.json` to `local-resources/original-video-assets/config.json` when you need a local asset catalog. On dev server start, each immediate child folder with a `.vrm`, `.pmx`, or `.pmd` file is added to the model dropdown using the folder name as its label.

Planned supported formats include:

- VRM
- PMX
- VMD
- Additional asset formats as support is added

---

## Roadmap

- [x] VRM loading
- [x] PMX loading
- [x] Local resource configuration
- [x] Web rendering pipeline
- [ ] Desktop rendering pipeline
- [ ] VMD animation playback
- [ ] Physics improvements
- [ ] Companion behavior system
- [x] AI integration
- [ ] Voice synthesis
- [ ] Desktop interaction
- [ ] Plugin system
- [ ] Asset manager
- [x] Online companion server
- [ ] Cross-platform releases

---

## Running

```bash
npm install
npm run dev
```

Then open the local development URL shown by Vite.

### Admin and demo modes

Use admin mode to tune and save demo profiles:

```bash
npm run configure
```

```text
http://127.0.0.1:5173/?mode=admin&config=default
```

Click `Save demo profile` after choosing the model preset and preview settings. The save dialog asks for the profile name. You can also pass an optional name after `--` to prefill that dialog:

```bash
npm run configure -- sameko
```

In dev/preview, saving writes deployable profiles to:

```text
public/demo-configs/<name>.json
public/demo-profile.json
```

Run the default Astera compiled demo locally with:

```bash
npm run demo
```

Run a specific saved configuration with:

```bash
npm run run -- sameko
```

`npm run demo -- sameko` is the same command with a less funny name. Both validate the selected profile, build the public bundle, copy that profile into `dist/demo-profile.json`, and serve the separate demo page:

```text
http://127.0.0.1:4173/
```

For deploy packaging or CI, use `npm run demo:build -- astera`. The public demo page loads only the compiled profile instead of the full local model catalog.

For a path-mounted deployment, pass the public base path before the profile name:

```bash
npm run demo:build -- --base /soulecho/demo/ astera
npm run demo:preview -- --host 127.0.0.1 --port 4173 --base /soulecho/demo/ astera
```

### Runtime settings

The app reads `public/app-settings.json` in development. The tracked defaults favor local iteration:

```json
{
  "profileMetadataExtraction": true,
  "maxConsoleMemoryLines": 40
}
```

Linux deploys generate `dist/app-settings.json` during build. Production currently uses `profileMetadataExtraction: false` and `maxConsoleMemoryLines: 2` unless overridden by deploy environment variables.

When installing SoulEcho directly, copy values from `.env.example` into your shell or a local `.env`/`.env.local` file. Those files are ignored; keep machine-specific ports, users, and model choices there.

### Local companion chat

The prototype can talk to a local Ollama server through the dev server bridge. The default lightweight model is:

```bash
ollama pull llama3.2:3b
```

Start Ollama, run the app, and use the dialogue console at the top of the scene.

SoulEcho also asks a local AnimaVisage server to animate and speak each normal
companion reply. The text response appears immediately, while the small face
beside the console plays the same buffered fragmented-MP4 stream used by the
AnimaVisage Studio voice demo. Start AnimaVisage on its default local endpoint:

```bash
cd ../AnimaVisage
python3 scripts/expression_studio.py --folder astera-happy --no-open
```

SoulEcho uses the folder currently selected in AnimaVisage Studio by default.
Pin a folder or use a different endpoint with:

```bash
ANIMAVISAGE_URL=http://127.0.0.1:8766 \
ANIMAVISAGE_FOLDER=astera-happy \
npm run dev
```

The browser talks only to SoulEcho. Its backend bridge requests the voice
playlist, proxies the portrait and growing media streams, and degrades to a
text-only reply when AnimaVisage is unavailable.

On Debian/Ubuntu Linux, the setup script installs Ollama as a localhost-only
systemd service and pulls the default model:

```bash
npm run linux:setup-ollama
```

To install the Astera demo as a systemd service:

```bash
npm run linux:install-demo
```

Useful overrides:

```bash
OLLAMA_MODEL=llama3.2:3b npm run linux:setup-ollama
SOULECHO_BASE_PATH=/soulecho/demo/ SOULECHO_PORT=4173 npm run linux:install-demo
PROFILE_METADATA_EXTRACTION=0 MAX_CONSOLE_MEMORY_LINES=2 npm run linux:install-demo
ANIMAVISAGE_URL=http://127.0.0.1:8766 ANIMAVISAGE_FOLDER=astera-happy npm run linux:install-demo
```

The console supports lightweight local memory:

- Profile and recent chat context are stored in this browser with `localStorage`.
- The context log keeps the newest lines and purges the oldest as it grows.
- `/name Shane` stores the user's name.
- `/interest modular synths, arcade games` stores interests.
- `/vibe creative` stores the current mood or vibe when one is provided.
- `/profile` prints the saved profile.
- `/remember I like concise answers` stores facts about the user.
- `/teach The website has a pricing page` stores project or website facts.
- `/memory` prints saved notes.
- `/appearance` prints the current model, expression, motion, and scene snapshot sent to the AI.
- The console's `View memory` button opens the stored profile, facts, and context log.
- `/forget` or the console's `Clear all memory` button clears all local memory and saved context.

---

## License

SoulEcho is licensed under the GNU General Public License v3.0. See the LICENSE file for the full license text.
