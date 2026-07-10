# create-nestweaver

npm package for `npm create nestweaver@latest`.

This is a thin wrapper around the [`nestweaver`](../nestweaver) scaffolder — the same prompts and templates, exposed the way npm/pnpm/yarn expect for `create-*` packages.

## Local dev

```bash
pnpm --filter nestweaver build
pnpm --filter create-nestweaver dev my-app
```

## Publish order

1. `@nestweaver/loom` — admin panel (publish first; creates the `@nestweaver` scope on npm if needed)
2. `nestweaver` — scaffolder CLI and templates
3. `create-nestweaver` — `npm create` entry (depends on `nestweaver`)
