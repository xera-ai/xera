# @xera-ai/cli

## 0.9.8

### Patch Changes

- Updated dependencies [[`5d7d137`](https://github.com/xera-ai/xera/commit/5d7d1373c100b65c9ec33777e15558a6a3ba2e65)]:
  - @xera-ai/core@0.9.8
  - @xera-ai/skills@0.9.8

## 0.9.7

### Patch Changes

- [#60](https://github.com/xera-ai/xera/pull/60) [`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - load dotenv at xera-internal entry point so all subcommands have env vars; revert dotenv from playwright.config.ts templates

- [#57](https://github.com/xera-ai/xera/pull/57) [`434622d`](https://github.com/xera-ai/xera/commit/434622d22d66b1079e8c8cd3855cd4faa6d94990) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix mixed config template env var names to match .env.example (TEST\_ prefix, \_PWD suffix)

- [#59](https://github.com/xera-ai/xera/pull/59) [`5c080c0`](https://github.com/xera-ai/xera/commit/5c080c0cf7d6f254835bfe80e0e12f2ec942adb6) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - load .env.local then .env in playwright.config.ts so credentials are available to Playwright

- Updated dependencies [[`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160)]:
  - @xera-ai/core@0.9.7
  - @xera-ai/skills@0.9.7

## 0.9.6

### Patch Changes

- [#55](https://github.com/xera-ai/xera/pull/55) [`097add0`](https://github.com/xera-ai/xera/commit/097add0eefd042d5bef864167a3dec115291ea9b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - remove SAMPLE-HTTP-001 http sample from xera init scaffold

- Updated dependencies []:
  - @xera-ai/core@0.9.6
  - @xera-ai/skills@0.9.6

## 0.9.5

### Patch Changes

- [#53](https://github.com/xera-ai/xera/pull/53) [`1ab6a42`](https://github.com/xera-ai/xera/commit/1ab6a42085528965ccc8c293e78005cdd65deba6) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - remove SAMPLE-001 web sample from xera init scaffold

- Updated dependencies []:
  - @xera-ai/core@0.9.5
  - @xera-ai/skills@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies [[`9c77460`](https://github.com/xera-ai/xera/commit/9c77460e62c6040c4042360463c93adbb62a7dff)]:
  - @xera-ai/core@0.9.4
  - @xera-ai/skills@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [[`f1e9d90`](https://github.com/xera-ai/xera/commit/f1e9d903a923206d3d5603e033ceb968581655c9)]:
  - @xera-ai/core@0.9.3
  - @xera-ai/skills@0.9.3

## 0.9.2

### Patch Changes

- [#47](https://github.com/xera-ai/xera/pull/47) [`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - replace hardcoded version strings with dynamic reads (auto-generated from [#47](https://github.com/xera-ai/xera/issues/47))

- Updated dependencies [[`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71)]:
  - @xera-ai/core@0.9.2
  - @xera-ai/skills@0.9.2

## 0.9.1

### Patch Changes

- [#43](https://github.com/xera-ai/xera/pull/43) [`dd68ca4`](https://github.com/xera-ai/xera/commit/dd68ca4da174dfd8f18f007dd4b56dcb90649ac5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - production-ready UX — help on no args, unknown cmd, non-TTY guard (auto-generated from [#43](https://github.com/xera-ai/xera/issues/43))

- [#43](https://github.com/xera-ai/xera/pull/43) [`dd68ca4`](https://github.com/xera-ai/xera/commit/dd68ca4da174dfd8f18f007dd4b56dcb90649ac5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(cli): production-ready UX — help on no args, unknown cmd with did-you-mean, non-TTY guard

- Updated dependencies []:
  - @xera-ai/core@0.9.1
  - @xera-ai/skills@0.9.1

## 0.9.0

### Minor Changes

- [#38](https://github.com/xera-ai/xera/pull/38) [`b3bb9b4`](https://github.com/xera-ai/xera/commit/b3bb9b46c6b304a49ba4b8e19c6eed1cc9faded5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - add non-interactive flags and shortcuts to xera init (auto-generated from [#38](https://github.com/xera-ai/xera/issues/38))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.0
  - @xera-ai/skills@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`6589625`](https://github.com/xera-ai/xera/commit/658962579399182fcb67e6d0dbe243c46a88c654)]:
  - @xera-ai/core@0.8.1
  - @xera-ai/skills@0.8.1

## 0.3.3

### Patch Changes

- [#30](https://github.com/xera-ai/xera/pull/30) [`1913505`](https://github.com/xera-ai/xera/commit/1913505433379f23a48e94728ccd171b571829c9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - use --packages external in build (unblock release pipeline) (auto-generated from [#30](https://github.com/xera-ai/xera/issues/30))
