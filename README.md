# claude-mods

Claude Code mods (function-hook plugins).

## Install

From a terminal Claude Code session:

```
/plugin install context-check --marketplace ajkatom/claude-mods
```

Answer `y` to add the marketplace, then pick the **user** scope so it loads in every session on that machine (the desktop app's Code tab included).

## Mods

### context-check

On the first prompt you type into a **resumed** session, shows how many context tokens that prompt will send and asks what to do:

- **Continue** — send as is
- **Compact** — compact first, then send
- **Clear** — `/clear`, then resend the same prompt in a fresh session

Recommendation thresholds: under 35% of the window → Continue, 35–70% → Compact, 70%+ → Clear. Fresh sessions are never interrupted; it asks once per resumed session.

## Develop

```
claude plugin validate context-check
claude plugin test context-check
claude --plugin-dir ./context-check
```
