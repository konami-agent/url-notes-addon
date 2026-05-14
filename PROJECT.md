# url-notes-addon

A Firefox and Microsoft Edge WebExtension that stores notes per normalized URL.

## Product decision

- Repo name: `url-notes-addon`
- Local project path: `/home/mm/konami-github-workspace/url-notes-addon`
- Intended GitHub repo: `konami-agent/url-notes-addon`
- Browser support: Firefox and Microsoft Edge through the WebExtension APIs
- UI for v0.1: popup-only
- Storage for v0.1: `browser.storage.local` / `chrome.storage.local` wrapper
- URL note key for v0.1: full URL with hash fragment removed; query string preserved
- Export/import: JSON file, schema versioned
- Tech stack: plain JavaScript ES modules, HTML, CSS, Node.js `node:test`, no framework
- License: MIT

## Operating model

This project is advanced by a Hermes cron project-manager job every 4 hours.
The job must use the file-backed project board in this directory:

- `PROJECT.md`: stable product and operating rules
- `TASKS.json`: authoritative task state
- `PROGRESS.md`: append-only tick log
- `cron_prompt.md`: self-contained scheduled manager prompt
- `scripts/validate_project_state.py`: local board/repo validation

## Safety and boundaries

The cron manager may:

- create and edit files under this project directory
- run local tests and validation scripts
- initialize git and create commits when a coherent milestone is complete
- create/push the GitHub public repo only when task criteria explicitly say to do so

The cron manager must not:

- create additional cron jobs
- store secrets, tokens, SSH keys, browser profiles, or private credentials in this repo
- publish to Firefox Add-ons or Microsoft Edge Add-ons stores
- add remote cloud sync or account login without explicit user approval
- delete files outside this project directory

## Required verification

Each cron tick must:

1. Run `python3 scripts/validate_project_state.py` before doing work.
2. Read `TASKS.json` and choose ready tasks based on dependencies.
3. Work on at most two ready tasks per tick unless a task is tiny and directly required for verification.
4. Run relevant tests/checks after changes.
5. Run `python3 scripts/validate_project_state.py` again before finishing.
6. Append a concise tick log to `PROGRESS.md` with timestamp, tasks touched, verification, blockers, and next recommendation.
7. Update `TASKS.json` evidence for every status transition.

## Definition of done for v0.1

- Extension can be loaded unpacked in Firefox and Edge.
- Popup shows current active tab URL and normalized note key.
- User can write, auto-save, reload, and clear a note for the current URL.
- Different normalized URLs have different notes.
- Export/import JSON works.
- README explains install/load/test usage.
- `npm test` and `npm run lint` pass.
- GitHub repo exists and initial version is pushed.

Created: 2026-05-14T20:49:58+09:00
