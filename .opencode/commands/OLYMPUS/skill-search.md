---
description: Search the skill manifest by query — debug skill matching
agent: callimachus
---

# /skill-search <query>

Search the OLYMPUS skill manifest by natural-language query.

## Args

- query (required): natural-language search query, e.g. "database migration"
- --god <name> (optional): restrict to a specific god's pool
- --k <n> (optional): number of results (default: 10)

## Output format

```
Searching skills for: "database migration"
Pool: all gods (260 skills)
Top 10 results:

  Score   Skill                          God          Description
  0.92    db-migration-reviewer          athena       Reviews database migrations
  0.89    schema-migrator                hephaestus   Generates forward + backward migrations
  ...

Tip: The router injects the top-5 (score >= 0.80) into the dispatched god's context.
```
