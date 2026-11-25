## Summary

<!-- What does this change do, and why is it needed? -->

## Related issues

<!-- e.g. Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / internal
- [ ] Documentation
- [ ] Build / CI / tooling

## Checklist

- [ ] I have read [`AGENTS.md`](../blob/main/AGENTS.md) and my change respects the architecture rules.
- [ ] `packages/core` remains 100% pure TypeScript (no `react-native` / `expo-*` / `@tauri-apps` / `window` / `document`).
- [ ] No raw SQL was added outside `packages/core/src/repositories/`.
- [ ] I ran the gate locally and it is green: `pnpm turbo lint typecheck test` (12/12).
- [ ] I added or updated tests where it makes sense.
- [ ] I updated documentation if behaviour, contracts, or schemas changed.

## Notes for reviewers

<!-- Screenshots, benchmark numbers, migration notes, or follow-ups. -->
