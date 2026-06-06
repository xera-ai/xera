# Tutorial — Reuse Web SSO Session for the HTTP Adapter

End-to-end walkthrough cho dự án mới: từ `xera init` đến chạy `/xera-run` đầu tiên trên một API authenticated bằng SSO session (Microsoft Entra ID, Okta, hoặc bất kỳ Identity Provider nào set parent-domain cookies).

**Use case:** Web app `app.mycompany.com` và API `api.mycompany.com` đều ride trên 1 session cookie set tại `.mycompany.com`. QA cần test cả web (Playwright UI) và HTTP API trong cùng một suite, không có static bearer token.

**Trước khi bắt đầu, bạn cần:**
- Node 22+
- Browser (Chromium qua Playwright)
- Tài khoản test với SSO/MFA quyền truy cập app
- 5 phút

---

## Bước 1 — Init project

```bash
mkdir my-qa-project && cd my-qa-project
npx @xera-ai/cli init
```

CLI hỏi loạt câu — interactive UI:

```
◆ Project shape?
  ○ Web only
  ○ API only
  ● Mixed (web + http)
  
◆ Issue tracker?
  ○ Jira  ● GitHub

◆ GitHub repo (owner/name)?
  myorg/myapp

◆ Web base URL?
  https://app.dev.mycompany.com

◆ Auth-enabled web flow? (Y/n)  Y

◆ Web roles (comma-separated)?
  ops-member

◆ API base URL?
  https://api.dev.mycompany.com

◆ OpenAPI spec path (relative or URL — leave empty to skip)?
  ./openapi.yaml

◆ Does the API share an SSO session with the web app? (Y/n)
  Y                                             ← câu hỏi quan trọng

◆ API auth strategy?
  ● Reuse web SSO session (shared cookies)    ← default đã đổi sang đây
  ○ Bearer token (env var)
  ○ API key (header)
  ○ Basic auth (env vars)
  ○ OAuth client_credentials
  ○ None / public API

◆ HTTP roles (comma-separated)?
  ops-member

✔ xera initialized!
```

`xera.config.ts` đã được tạo:

```ts
import { defineConfig } from '@xera-ai/core';

export default defineConfig({
  adapters: ['web', 'http'],
  github: { repo: 'myorg/myapp' },
  web: { ... },
  http: {
    baseUrl: { staging: 'https://api.dev.mycompany.com' },
    defaultEnv: 'staging',
    spec: './openapi.yaml',
    auth: {
      strategy: 'reuse-web-session',
      roles: {
        'ops-member': {
          reuseWebSession: {
            domainContains: 'TODO_replace_with_api_parent_domain.example',
            cookies: { access: { match: { regex: '_at$' } } },
          },
        },
      },
    },
  },
  ...
});
```

`TODO_replace_*` và `regex: '_at$'` là placeholder — bước 3 sẽ thay bằng giá trị thật.

Cài deps + Playwright:

```bash
npm install
npx playwright install chromium
```

Set credentials trong `.env`:

```
OPS_MEMBER_EMAIL=test.qa@mycompany.com
OPS_MEMBER_PASSWORD=...
```

---

## Bước 2 — Đăng nhập web 1 lần

Run với `XERA_HEADED=1` để browser hiện ra cho người làm SSO:

```bash
XERA_HEADED=1 npx xera-internal auth-setup --role ops-member --shape web
```

Browser mở:

1. Nhập email → redirect Microsoft Entra ID / Okta
2. Nhập password + MFA code
3. **Quan trọng**: click qua ít nhất 1 trang gọi API thật (Dashboard, Settings, Reports — bất cứ trang nào fire request tới `api.mycompany.com`). Mục đích: API sẽ set tất cả session cookies, **kể cả CSRF**, sau request đầu tiên — nếu bạn dừng ở SSO landing page, CSRF cookie có thể chưa được set.
4. Đóng browser

```
[xera:auth-setup] ✓ ops-member.json (web)
```

`.xera/.auth/ops-member.json` được encrypt AES-256-GCM bằng `XERA_AUTH_KEY` (auto-generated bởi `xera init`, lưu trong `.env`).

**Inspect storageState** (optional, debug):

```bash
npx xera-internal stage-auth --role ops-member
# Decrypts to .xera/.auth/.cache/ops-member.json
cat .xera/.auth/.cache/ops-member.json | jq '.cookies | map(.name)'
```

Output:
```json
[
  "app_at",      ← short-lived access token (Entra ID issues these for the API)
  "app_rt",      ← long-lived refresh token
  "app_csrf",    ← CSRF token (non-httpOnly, JS-readable)
  "_ga",
  "_gid",
  "consent",
  ...
]
```

---

## Bước 3 — AI discover cookies (one-shot)

Mở Claude Code trong project directory, chạy:

```
/xera-http-auth-discover ops-member
```

Skill chạy hoàn toàn tự động — bạn chỉ xem output:

### 3a. Prepare (binary)

```
[xera:http-auth-discover] wrote .xera/.auth/http-auth-discover-input-ops-member.json
  (12 cookies, names + metadata only)
```

File chứa **names + metadata only** (`name`, `domain`, `path`, `expiresInSeconds`, `httpOnly`, `sameSite`). Cookie *values* **không bao giờ** ghi vào file — adversarial test trong CI khoá bất biến này.

### 3b. LLM phân loại

Claude (in-session) đọc input + prompt template `http-auth-discover.md`, wrap trong `<XR_DISCOVERY_<NONCE>>` boundary (v0.3 injection-follow defense), trả về JSON proposal với confidence.

### 3c. Finalize (binary validate)

```
// Paste under http.auth.roles.ops-member in xera.config.ts:
reuseWebSession: {
  domainContains: 'mycompany.com',
  cookies: {
    access: { match: { literal: 'app_at' } },
    refresh: { match: { literal: 'app_rt' } },
    csrf: { match: { literal: 'app_csrf' }, header: 'X-CSRF-Token' },
  },
},

Confidence — access: 0.95, refresh: 0.95, csrf: 0.9
```

Binary đã verify:
- Mọi cookie name nominated phải nằm trong captured set (không hallucinated)
- `domainContains` không rỗng
- Schema match (Zod validation)

Nếu LLM detect injection trong cookie names: refuse với `notes: 'injection-follow refused'` → finalize exit 1, không emit block.

### 3d. Skill print cảnh báo CSRF + drive Edit

> ⚠ CSRF header default is `X-CSRF-Token`. Some apps use `X-XSRF-Token` (Angular/Spring), `X-Csrf`, or a custom name. **Verify in the web app's DevTools → Network tab → a POST/PUT request** before accepting.

**Verify trong browser:**
1. Mở `app.dev.mycompany.com` trong Chrome (đăng nhập)
2. F12 → Network tab
3. Trigger 1 hành động POST trong web (create, update, ...)
4. Click request đó → Headers → tìm `X-CSRF-*` trong Request Headers

Trường hợp thật:
- App Microsoft/.NET: thường `X-CSRF-Token` ✓ (skill đoán đúng)
- App Angular/Spring: thường `X-XSRF-Token` → **sửa trong block trước khi accept Edit**
- App custom: copy chính xác từ DevTools

### 3e. Claude show Edit diff prompt

```diff
   'ops-member': {
     reuseWebSession: {
-      domainContains: 'TODO_replace_with_api_parent_domain.example',
-      cookies: { access: { match: { regex: '_at$' } } },
+      domainContains: 'mycompany.com',
+      cookies: {
+        access: { match: { literal: 'app_at' } },
+        refresh: { match: { literal: 'app_rt' } },
+        csrf: { match: { literal: 'app_csrf' }, header: 'X-CSRF-Token' },
+      },
     },
   },
```

**1 click Accept**.

### 3f. Skill chạy doctor + auth-setup http

```
[skill runs: npx xera doctor]
✓ ...
✓ reuse-web-session: web auth file present for role 'ops-member'
✓ reuse-web-session: web auth file fresh for role 'ops-member'

[skill runs: npx xera-internal auth-setup --role ops-member --shape http]
[xera:auth-setup] ✓ http/ops-member.json (reuse-web-session)

✓ http auth file produced at .xera/.auth/http/ops-member.json
  — role is ready for /xera-run.
```

File discovery (`http-auth-discover-{input,output}-ops-member.json`) **tự động bị xóa** sau finalize success — không để cookie metadata leak ra disk.

---

## Bước 4 — Smoke test (optional, 1 giây)

Trước khi chạy full suite, verify auth file work:

```bash
npx xera-internal verify-http-auth --role ops-member --path /api/v1/me
```

Pass:
```
[xera:verify-http-auth] ✓ GET https://api.dev.mycompany.com/api/v1/me → 200
  — role 'ops-member' auth file works.
```

Fail patterns:
```
✗ GET .../me → 401 (token/cookie likely expired — re-run `auth-setup --shape http`)
✗ GET .../me → 403 (CSRF or scope problem — check `npx xera doctor` for the CSRF check)
```

**Test POST endpoint** để xác nhận CSRF lift hoạt động:
```bash
npx xera-internal verify-http-auth --role ops-member --path /api/v1/dryrun --method POST
```

---

## Bước 5 — Chạy test thật

Tạo ticket trong GitHub Issues (hoặc Jira), lấy số ticket. Trong Claude Code:

```
/xera-run TICKET-001
```

`/xera-run` chạy doctor strict trước:

```
✓ reuse-web-session: web auth file present for role 'ops-member'
✓ reuse-web-session: web auth file fresh for role 'ops-member'  (expires in 7h 12m)
✓ http auth file present: ops-member  (expires in 14m)
✓ http auth file readable: ops-member
✓ reuse-web-session: cookies persisted for role 'ops-member'
✓ reuse-web-session: CSRF cookie 'app_csrf' present for role 'ops-member'
```

Test chạy. Mỗi request tới `api.mycompany.com`:
- Cookies được set qua Playwright `storageState`
- `X-CSRF-Token: <live value>` lifted at context creation từ persisted cookies
- Trace recorder ghi network requests (scrubbed: `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF-Token` all → `[REDACTED]`)

---

## Maintenance

### Sau 15 phút (access cookie hết hạn)

Doctor:
```
✗ http auth file fresh: ops-member
  message: expired; run: npx xera-internal auth-setup --role ops-member --shape http
```

Chạy 1 lệnh:
```bash
npx xera-internal auth-setup --role ops-member --shape http
```

Web file vẫn còn → preset re-derive http file → DONE.

### Sau 30 phút trước khi web hết (cảnh báo sớm)

Doctor:
```
○ reuse-web-session: web auth file fresh for role 'ops-member'
  message: web session expires in 25m — plan to re-login soon (XERA_HEADED=1 ... --shape web)
```

Bạn có thời gian để hoàn thành test đang chạy. Khi cảnh báo, lên kế hoạch re-login sớm.

### Sau 8h (web session hết)

```bash
XERA_HEADED=1 npx xera-internal auth-setup --role ops-member --shape web
# (re-login Entra ID + click qua API page như Bước 2)
npx xera-internal auth-setup --role ops-member --shape http
```

**Không cần** re-run `/xera-http-auth-discover` — `xera.config.ts` đã cố định, chỉ cookie values mới.

---

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| `doctor` báo `CSRF cookie 'X' not present` | Bước 2 chưa đi qua trang gọi API → CSRF chưa set | Re-run `--shape web`, click ≥1 API-driven page trước khi đóng browser |
| POST trả 403 nhưng GET 200 | CSRF header name sai (X-CSRF vs X-XSRF) | DevTools verify header name → sửa `csrf.header` trong config → `auth-setup --shape http` |
| `access.match matched multiple cookies` | Regex quá loose (vd `_at` match cả `_at` và `_atomic`) | Đổi sang `{ literal: 'tên-chính-xác' }` |
| `Strategy 'reuse-web-session' requires a web auth file at ...` | Quên bước 2 | `XERA_HEADED=1 npx xera-internal auth-setup --role X --shape web` |
| `No cookies for domainContains='...'` | Sai domain | Discovery propose lại, hoặc kiểm tra cookies via `stage-auth` |
| Discovery propose `csrf: null` nhưng app có CSRF | Cookie httpOnly (JS không đọc được) → discovery skip | Hand-edit config, dùng tên cookie thật |
| Test pass local nhưng CI fail | `XERA_AUTH_KEY` khác giữa local và CI | `.xera/.auth/` không nên check-in. CI cần stage auth riêng |

---

## So sánh với cách cũ (custom `defineHttpAuthSetup`)

Trước (manual):
```ts
// shared/auth-setup.ts — ~50 LOC mỗi project
export const http = defineHttpAuthSetup(async (_request, role) => {
  const web = readAuthState(join(process.cwd(), '.xera', '.auth'), role);
  if (!web || web.strategy !== 'storageState') throw new Error('...');
  const apiCookies = (web.payload.cookies ?? []).filter(c => 
    c.domain.includes('mycompany.com'));
  if (!apiCookies.length) throw new Error('...');
  const expiresAt = Math.min(...apiCookies.map(c => c.expires * 1000).filter(Boolean));
  return { type: 'cookie', token: '', cookies: apiCookies, expiresAt };
});
```

Vấn đề:
- 3 chỗ dễ silent bug: domain filter quá rộng, `Math.min` của cookie sai (analytics cookie short TTL → expiresAt sai), không có CSRF lift
- Copy-paste mỗi project
- Không có doctor visibility — đến lúc run mới biết

Sau (declarative + discovery):
- 0 LOC trong `shared/auth-setup.ts` cho HTTP (`http` export unused)
- `xera.config.ts` declarative — schema validates, doctor checks
- AI propose cookies — không gõ regex tay
- CSRF lift runtime — POST/PUT/PATCH/DELETE just works

---

## Reference

- Schema fields: [docs/CONFIGURATION.md `HTTP auth strategy 'reuse-web-session'`](../CONFIGURATION.md)
- Architecture: [docs/superpowers/specs/2026-06-06-xera-reuse-web-session-design.md](../superpowers/specs/2026-06-06-xera-reuse-web-session-design.md)
- Refresh feature (in flight): [issue #221](https://github.com/xera-ai/xera/issues/221)
- Original ask: [issue #234](https://github.com/xera-ai/xera/issues/234)
