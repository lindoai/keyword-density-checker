import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { parseHTML } from 'linkedom';
import { readTurnstileTokenFromUrl, verifyTurnstileToken } from '../../_shared/turnstile';
import { renderTextToolPage, turnstileSiteKeyFromEnv } from '../../_shared/tool-page';

type Env = { Bindings: { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string } };

const STOP_WORDS = new Set([
  'the', 'and', 'is', 'a', 'to', 'in', 'of', 'for', 'on', 'it',
  'that', 'this', 'with', 'are', 'was', 'be', 'at', 'from', 'or',
  'an', 'by', 'as', 'not', 'but', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
]);

const app = new Hono<Env>();
app.use('/api/*', cors());

app.get('/', (c) =>
  c.html(
    renderTextToolPage({
      title: 'Keyword Density Checker',
      description: 'Analyze top repeated words and phrases from a page\'s visible content.',
      endpoint: '/api/analyze',
      sample: '{ "url": "https://example.com", "wordCount": 500, "topWords": [...], "topPhrases": [...] }',
      siteKey: turnstileSiteKeyFromEnv(c.env),
      buttonLabel: 'Analyze',
      toolSlug: 'keyword-density-checker',
    })
  )
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/api/analyze', async (c) => {
  const captcha = await verifyTurnstileToken(
    c.env,
    readTurnstileTokenFromUrl(c.req.url),
    c.req.header('CF-Connecting-IP')
  );
  if (!captcha.ok) return c.json({ error: captcha.error }, 403);

  const normalized = normalizeUrl(c.req.query('url') ?? '');
  if (!normalized) return c.json({ error: 'A valid http(s) URL is required.' }, 400);

  const html = await fetchHtml(normalized);
  if (!html) return c.json({ error: 'Failed to fetch page.' }, 502);

  const { document } = parseHTML(html);
  const body = document.body ?? document.documentElement;
  body.querySelectorAll('script, style, nav, footer, header, aside, form').forEach((el: any) => el.remove());
  const text = (body.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return c.json({ error: 'No readable text found.' }, 400);

  const words = text
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .filter((w: string) => w.length > 1 && !STOP_WORDS.has(w));

  const wordCount = words.length;

  // Single word counts
  const wordCounts = new Map<string, number>();
  for (const w of words) {
    wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }

  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({
      word,
      count,
      percentage: parseFloat(((count / wordCount) * 100).toFixed(2)),
    }));

  // 2-word and 3-word phrases
  const phraseCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    phraseCounts.set(bigram, (phraseCounts.get(bigram) ?? 0) + 1);
    if (i < words.length - 2) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phraseCounts.set(trigram, (phraseCounts.get(trigram) ?? 0) + 1);
    }
  }

  const topPhrases = [...phraseCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const density: Record<string, number> = {};
  for (const { word, percentage } of topWords) {
    density[word] = percentage;
  }

  return c.json({
    url: normalized,
    wordCount,
    topWords,
    topPhrases,
    density,
  });
});

async function fetchHtml(url: string) {
  const r = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Lindo Free Tools/1.0 (+https://lindo.ai/tools)' },
  }).catch(() => null);
  return r?.ok ? r.text() : null;
}

function normalizeUrl(value: string): string | null {
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).toString();
  } catch {
    return null;
  }
}

export default app;
