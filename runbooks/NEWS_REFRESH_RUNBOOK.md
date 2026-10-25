# News & Updates Refresh Runbook

Repeatable pipeline for updating the Product Lookup → News & Updates knowledge base
from Feishu group chats. Follow top to bottom; each step is idempotent (re-running
never duplicates entries — ids are date-slug based and writes are UPSERTs).

## Source chats

| Group | Content |
|---|---|
| 知识点分享群 | Primary knowledge updates (Hoi / Alexia) |
| General | Announcement-grade updates |
| 流程相关 | Process/knowledge announcements |

## Inclusion gates

A group message becomes a news entry only when ALL of these hold:

1. **Sender gate** — sender is Alexia or Hoi (primary curators). Other senders'
   messages are treated as commentary and skipped.
2. **@所有人 gate** — the message must contain an `@所有人` mention. **Detect it in the message `content`, not the `mentions[]` array** — the all-member mention renders inline as `<at user_id="all">` (post messages) or the literal text `@_all` (text messages), while `mentions[]` is usually empty for it. Messages without it — replies, comments, chatter — are skipped.
   *This gate matters most in General and 流程相关 where regular conversation
   would otherwise flood the knowledge base.*
3. **Date gate** — `create_time` between `2026-08-01` (epoch start of the KB)
   and now. On refresh runs, only pull from the last successful run date
   forward; older content is already baked into `news/*.md` + D1.
4. **Content gate** — the message actually announces a knowledge point / update
   (product info, firmware, process change, launch). "FYI-only" forwards and
   bare stickers/images without explanation are skipped. Threads: check
   `thread_id` replies for follow-up corrections before finalizing an entry.

## Step 0 — Auth

```bash
lark-cli auth status        # verify logged in + scopes
# if needed:
lark-cli auth login
```

Message reads need `im:message:readonly` / `im:chat:read`; resource downloads
need `im:resource`. Use `--as user` identity (bot can only see chats it is in).

## Step 1 — Resolve chat ids

```bash
lark-cli im +chat-search --as user --query "知识点分享群" --format json
lark-cli im +chat-search --as user --query "General" --format json
lark-cli im +chat-search --as user --query "流程相关" --format json
```

## Step 2 — Pull messages (per chat)

```bash
lark-cli im +chat-messages-list --as user --chat-id oc_xxx \
  --start 2026-08-01 --order asc --page-size 50 --page-all --format json \
  --download-resources
```

- `--download-resources` saves images into `./lark-im-resources/` and attaches a
  `resources` block per message — use these for the entry images.
- For thread follow-ups: `lark-cli im +threads-messages-list --thread omt_xxx --order asc`.
- Filter client-side by the inclusion gates above (JSON output has
  `sender.name`, `mentions[]`, `create_time`, `deleted`).

## Step 3 — Distill into markdown

One file per knowledge update in `/Users/susul/Dev/econote/news/`:

- **Filename**: `YYYY-MM-DD-ascii-slug.md` (date = the knowledge point's date,
  ASCII slug ≤ ~60 chars). The date prefix is REQUIRED — app loaders and the
  import script skip files without it.
- **Structure** (keep identical to existing files):

  ```markdown
  # English Title

  > Source: 知识点分享群 · Hoi · 2026-09-30

  中文正文……

  ——

  English body……
  ```

  (Source line format: `> Source: <group> · <author> · <date>` — author is
  parsed by splitting on `·`.)
- **Images**: copy from `lark-im-resources/` into `news/assets/` with
  topic-prefixed names; reference as `![](assets/filename.ext)`. Compress to
  **< 300 KB** per image: `sips -Z 1600 -s format jpeg -s formatOptions 65 in.png --out news/assets/name.jpg`.
- Never overwrite an existing file silently — same date+slug means an edit to
  the same knowledge point; update the body and keep the id stable.

## Step 3.5 — Weekly self-test suite

After distilling a week's news, add a quiz suite covering the new articles
(`src/data/self-tests/`). Suites are split across `suites-part1..N.ts` files
(~2 suites per file) and concatenated in `index.ts` via `SELF_TEST_SUITES`.

**Suite conventions**

- File: `suites-part<N>.ts` exporting `suitesPart<N>: TestSuite[]`; register it
  in `src/data/self-tests/index.ts`.
- One suite per week: `id: 'wNN'` (ISO week of the covered range), `label:
  'Week NN'`, `range: 'Mon – Sun'` (e.g. `'Oct 12 – Oct 18'`).
- One `ArticleQuiz` per news entry (skip entries already covered by earlier
  suites), `date` = entry date, `article` = the entry's English H1 title.
- Question ids: `wNNqM`, sequential per suite.

**Question authoring rules (anti-guessability)**

- **Correct-answer placement is randomized at runtime** — `shuffleQuestion`
  (SelfTestWorkspace) Fisher–Yates shuffles options and remaps `answerIndex`
  on every attempt. Author with `answerIndex: 0`; never rely on placement.
- **Balance option lengths.** The correct answer must NOT be systematically
  the longest/most detailed option (a classic tell). Trim the correct answer
  to its core and pad distractors to similar length; keep every distractor
  plausible and specific to the same article.
- Explanations may be long (they only show after answering, and carry the full
  policy detail + links). Prompts stay concrete ("What do you do when…?").
- FYI/link-only entries (wiki uploads, sheet links) use the two-option
  "News flash" pattern: `['Yup, I know 👍', 'Nope — where do I find it?']`
  with the link in the explanation.
- `source` format: `'YYYY-MM-DD · <group>'` (matches the news entry's
  `> Source:` line).

**Verify**: `npx tsc --noEmit && npx eslint src/data/self-tests/` must be
clean. In-app: Self Test tab shows the new suites in the card table.

## Step 4 — Migration & backup (D1 + R2 + baked fallback)

1. **Bake (offline fallback)** — the `news/*.md` files ARE the fallback bundle;
   they ship via `import.meta.glob('/news/*.md')`. Commit them to git.
2. **D1 import**:

   ```bash
   cd /Users/susul/Dev/econote/note-master
   node scripts/import-news-to-d1.mjs
   # → writes news/news-import.sql (CREATE TABLE IF NOT EXISTS + UPSERTs)
   npx wrangler d1 execute eco-data --remote --file news/news-import.sql -y
   ```

   (Wrangler needs the Clash proxy `http://127.0.0.1:7897` on this machine.)
3. **R2 mirror** — in the app, sign in as admin → Knowledge Base tab →
   "Sync News to R2" (calls `exportKbToR2(['news', 'news_assets'])`). This
   copies all articles + images from D1 into the R2 backup.
4. **Deploy** — commit `news/` + any version bump, push (pre-push hook bumps),
   Cloudflare Actions deploy, or manually `npm run build && npx wrangler deploy`.

## Step 5 — Verify

- `curl -s https://note-master.econote.workers.dev/api/news` (with bearer token)
  returns the new entries.
- In-app: Product Lookup → News & Updates tab, search a keyword from a new
  entry; images render.
- `node scripts/import-news-to-d1.mjs` output count == number of
  date-prefixed files in `news/`.

## Reference — how loaders consume this

- `src/utils/newsData.ts` — lazy `import.meta.glob('/news/*.md', {query:'?raw'})`,
  parses date/title/author, bilingual tokenizer search (fallback bundle only).
- `src/lib/news-db.ts` — D1-first fetch (`GET /api/news`), admin write
  (`POST /api/admin/news-entry`, +5 spice, auto R2 mirror per entry).
- `worker/kb.ts` — `mirrorNewsEntryToR2` / `removeNewsEntryFromR2`.
- `scripts/import-news-to-d1.mjs` — md → SQL migration (this runbook's step 4).
