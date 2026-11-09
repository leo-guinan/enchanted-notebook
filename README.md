# The Enchanted Notebook

A guest book for the internet, and a living way into a creator's published work.

The notebook lies open on a desk. On the right is **your page**: you type a question in terminal lettering, and an enchanted quill writes the answer in script. The answer is drawn from the creator's original essays and links back to them. On the left is the **guest book**: every earlier visitor's page, their questions and the quill's answers. Each visitor adds a page.

The first notebook is an independent tribute to **Packy McCormick's** essays at Not Boring. It is unofficial and not affiliated with or endorsed by Packy McCormick or Not Boring.

> The broadcaster is not the destination. The creator and their work are the destination.

## Run it

```sh
node --version                 # 22.13 or newer (uses the built-in node:sqlite)
cp .env.example .env           # optional: add ANTHROPIC_API_KEY and ADMIN_TOKEN
npm start                      # http://localhost:8787
npm test                       # server tests
npm run e2e                    # real-browser run on desktop, phone and reduced motion (needs Playwright)
```

There are no runtime dependencies. The page engine ([fold](https://github.com/leo-guinan/fold)) is vendored.

**Deploy.** Run the Docker image (or `npm start`) anywhere that runs Node 22, with a persistent volume for `/data`. Point `enchantednotebook.com` at it through a TLS proxy (Caddy, Fly.io, Render, or a VPS with nginx) and set `TRUST_PROXY=1`.

```sh
docker build -t enchanted-notebook .
docker run -p 8787:8787 -v notebook-data:/data -e ANTHROPIC_API_KEY=… -e ADMIN_TOKEN=… -e TRUST_PROXY=1 enchanted-notebook
```

## How it works

```
broadcasters/packy/broadcaster.json   the subject: sources, ideas, notice, theme, limits
shared/page-world.mjs                 a guest-book page as a fold log, with the notebook's rules
server/                               retrieval, grounded answers, guest book, referrals, admin
public/                               the notebook: desk, pages, terminal input, the quill
```

**A page is a fold log.** Each guest-book page is a list of `ASK` and `ANSWER` events. The same world runs on the server, which accepts or refuses each entry before storing it, and in the browser, which replays the page and times the quill. Its rules are the notebook's promises:
- one question at a time
- at most five questions per page
- a question can be 240 characters at most
- an answer may only cite sources the notebook holds
- an answer that claims support must cite at least one

**Answers are grounded, cheapest path first.** Keyword retrieval (BM25) runs over the curated sources: summaries, points, short quotes and concept definitions.
1. **Not enough evidence:** the notebook says so honestly. There is no model call and no source.
2. **No API key, or the daily cap is reached:** an extractive answer is built from the curated summary, with its sources.
3. **Otherwise:** Claude (default `claude-haiku-5-5`) writes two to four sentences from the retrieved passages only, as JSON.
   - Its citations are checked against the passages it was given, and invented ones are dropped. If none remain, the answer becomes unsupported.
   - It never speaks as the creator, and it labels its own interpretation ("One reading:").

Repeated questions are cached. Per-IP rate limits, a daily cap on generated answers, and an output-token cap keep costs bounded. When nobody is asking, the server runs no model at all. The idle page writes one precomputed idea, then stays still. Nothing animates when no one is interacting.

**Referrals are the measure.** Every source link goes through `/r/<source>`, which records the click (source, page, context, destination domain, anonymous session) and redirects to the original essay.
- **Source Referral Rate:** unique visitors who clicked a source, divided by unique notebook visitors.
- **`/admin`** (with `ADMIN_TOKEN`) shows visitors, questions, referrals and the referral rate, the most-explored essays, common question words, and generated answers and tokens by day. It can also hide a guest-book page.
- Visitors get a random anonymous session id. No accounts and no personal data. A click shows someone followed a link, not that they read the essay.

**The quill** is the one from Future Radio: the same Hershey script glyphs, joined cursive and quill drawing. Text is generated first, then handed to the animation, so the quill never decides the words.
- "finish writing" skips to the end.
- Reduced-motion visitors see answers at once.
- Answers are also in the page as text for screen readers.

## Making another notebook

Everything subject-specific lives in `broadcasters/<id>/broadcaster.json`: subject, notice, invitation, theme, sources (title, author, canonical URL, date, original summary, points, short quotes, concepts), ambient ideas, limits and outbound destinations. Start the server with `BROADCASTER=<id>`.

## The Packy collection

Five essays are indexed, all verified at their canonical URLs on notboring.co:

| Essay | Published |
|---|---|
| [The Great Online Game](https://www.notboring.co/p/the-great-online-game) | 2021-05-10 |
| [The Cooperation Economy (or How to Build a Liquid Super Team)](https://www.notboring.co/p/the-cooperation-economy-) | 2021-06-07 |
| [The Not Boring Liquid Super Team](https://www.notboring.co/p/the-not-boring-liquid-super-team) | 2022-04-11 |
| [Power to the Person](https://www.notboring.co/p/power-to-the-person) | 2021-02-22 |
| [Introducing Not Boring Capital](https://www.notboring.co/p/introducing-not-boring-capital) | 2021-07-12 |

The summaries and points are original paraphrases. Quotes are short, at most a sentence. No essay is reproduced.

**Before launch:**
- Spot-check each quote against its essay. They were taken from the pages through an automated reader.
- "Story Time" and the original source of the enchanted-notebook idea were not located, so neither is indexed (see `unverified` in the config).

**Moderation.** Guest-book pages are public as soon as they are written. Hide a page from `/admin`.
