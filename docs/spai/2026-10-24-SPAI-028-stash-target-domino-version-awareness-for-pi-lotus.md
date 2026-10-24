---
type: Idea
title: "Stash: target-Domino-version awareness for pi-lotusscript-modular — add a `dominoVersion` config key (`/ls config set dominoVersion 9.x|10.x|12.x|14.x`, default 9.x) in the settings catalogue, inject it into model-facing guidelines as 'deployment target: Domino <ver>' so advice can version-gate (e.g. 14.x-only classes like NotesLLMRequest, Java version per release 9.x=Java6 … 14.x=Java17). Constraint to keep visible: the compile oracle stays pinned to 9.0.1 — version awareness affects ADVICE only, never the check verdict; a file compiling clean on 9.0.1 may still use APIs missing on older targets or vice versa. Also enables a future 'compiles in 14.x, fails in 9.0.1' gotcha class (KNOWN_LS_CLASSES from NotesDominoExpert_V0.6.7.jsx is 14.5.1-based). Source: NotesDominoExpert AKTIVER KONTEXT block; split out of SPAI-027."
timestamp: 2026-10-24 16:58:29
status: cancelled
source: pi-spai
tags: [plugin, config, guidelines, versioning]
facets:
  priority: low
  project: pi-lotusscript-modular
  project_path: D:/01_programovani/pi/plugins/pi-lotusscript-modular
spai_symbol: 'z'
---

# SPAI-028: Stash: target-Domino-version awareness for pi-lotusscript-modular — add a `dominoVersion` config key (`/ls config set dominoVersion 9.x|10.x|12.x|14.x`, default 9.x) in the settings catalogue, inject it into model-facing guidelines as 'deployment target: Domino <ver>' so advice can version-gate (e.g. 14.x-only classes like NotesLLMRequest, Java version per release 9.x=Java6 … 14.x=Java17). Constraint to keep visible: the compile oracle stays pinned to 9.0.1 — version awareness affects ADVICE only, never the check verdict; a file compiling clean on 9.0.1 may still use APIs missing on older targets or vice versa. Also enables a future 'compiles in 14.x, fails in 9.0.1' gotcha class (KNOWN_LS_CLASSES from NotesDominoExpert_V0.6.7.jsx is 14.5.1-based). Source: NotesDominoExpert AKTIVER KONTEXT block; split out of SPAI-027.

z Stash: target-Domino-version awareness for pi-lotusscript-modular — add a `dominoVersion` config key (`/ls config set dominoVersion 9.x|10.x|12.x|14.x`, default 9.x) in the settings catalogue, inject it into model-facing guidelines as 'deployment target: Domino <ver>' so advice can version-gate (e.g. 14.x-only classes like NotesLLMRequest, Java version per release 9.x=Java6 … 14.x=Java17). Constraint to keep visible: the compile oracle stays pinned to 9.0.1 — version awareness affects ADVICE only, never the check verdict; a file compiling clean on 9.0.1 may still use APIs missing on older targets or vice versa. Also enables a future 'compiles in 14.x, fails in 9.0.1' gotcha class (KNOWN_LS_CLASSES from NotesDominoExpert_V0.6.7.jsx is 14.5.1-based). Source: NotesDominoExpert AKTIVER KONTEXT block; split out of SPAI-027. @pi-lotusscript-modular !low :plugin: :config: :guidelines: :versioning:
