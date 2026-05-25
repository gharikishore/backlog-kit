# Adopting backlog-kit in a fresh project

> **Placeholder — fleshed out in #961 after #956-#960 land.**
>
> Full adoption walkthrough still pending. In the meantime, see:
> - [README quick start](../README.md)
> - `hmbr-starter` (consumer reference — wired end-to-end since 2026-05-24)
> - `specforge` (canonical consumer)

## Naming convention

This kit follows the multi-kit naming convention codified in `~/.claude/CLAUDE.md` → "Naming convention for multi-kit coexistence." Originating intake: `hmbr-starter#86 KIT-NAMING-CONVENTION`.

Four rules in summary:

1. **Fonts**: `font-<slug>-<role>` per kit. (vellum-kit is the platform default and keeps unprefixed `font-display`/`-sans`/`-mono`.)
2. **Colors**: descriptive specific names, never generic.
3. **CSS variables**: every var prefixed with the kit slug.
4. **Animations**: `animate-<slug>-<name>` for kit-specific motion.

### What THIS kit owns

| Layer | Namespace | Examples |
|---|---|---|
| **Font slug** | (none — backlog-kit doesn't ship its own typography; relies on whatever Tailwind preset the consumer applies, typically `vellum-kit`'s defaults) | Components render in `font-sans` / `font-mono` whatever the consumer's defaults resolve to |
| **CSS variables** | `--ft-*` (legacy — originally "Feedback-Triage") | `--ft-ink`, `--ft-card`, `--ft-surface`, `--ft-text-soft`, `--ft-hair-strong`, etc. (~24 vars) |
| **Tailwind utilities** | (none added directly) | The kit's components use *consumer-supplied* Tailwind utilities, not its own |
| **Animations** | (none) | No kit-specific keyframes |

**Why `--ft-*` instead of `--backlog-*`?** Historical — this kit started as feedback-triage and admin-chassis (now folded in). The prefix predates the multi-kit convention. New kits should use their proper slug.

**One free pass**: this kit gets to keep `--ft-*` rather than renaming everything to `--backlog-*` because consumers (specforge + hmbr-starter) already reference those vars in their own CSS. Renaming would be a breaking change for marginal upside.
