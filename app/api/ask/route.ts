import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage } from "@/lib/http";
import {
  callLLM,
  type AnswerPassage,
  type AnswerHistoryMessage,
} from "@/lib/llm";
import { getServerSupabase } from "@/lib/supabase-server";

/* =========================================================================
 * Request / Response schemas & types
 * ========================================================================= */

const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().max(2000),
});

const AskRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(2, "Question must be at least 2 characters")
    .max(500, "Question must be under 500 characters"),
  history: z.array(HistoryMessageSchema).max(4).optional(),
});

export type CitationSource = {
  n: number;
  chunk_id: string;
  site_name: string;
  slug: string;
  asset_id: string | null;
  kind: string | null;
  snippet: string;
  licence: string;
};

export type AskApiResponse = {
  ok: boolean;
  answer: string;
  citations: CitationSource[];
  cached?: boolean;
  fallback?: boolean;
};

/* =========================================================================
 * Rate-limiting & Cache (in-memory per instance)
 * ========================================================================= */

type CacheEntry = {
  data: AskApiResponse;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

const askCache = new Map<string, CacheEntry>();
const rateLimitMap = new Map<string, number[]>();

function normalizeQuestion(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

const STOP_WORDS = new Set([
  "what", "whats", "which", "where", "wheres", "when", "whens", "who", "whos",
  "whom", "whose", "how", "hows", "why", "are", "is", "was", "were", "be",
  "been", "being", "the", "a", "an", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "about", "tell", "show", "give", "please", "can",
  "could", "would", "should", "does", "do", "did", "have", "has", "had",
  "practiced", "practice", "located", "found", "describe", "explain", "some",
  "many", "much", "there", "their", "this", "that", "these", "those", "say",
  "says", "said", "text", "saying",
]);

export function extractSearchTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const terms = new Set<string>();
  for (const w of words) {
    terms.add(w);
    if (w.endsWith("es") && w.length > 4) {
      terms.add(w.slice(0, -2));
    } else if (w.endsWith("s") && w.length > 3) {
      terms.add(w.slice(0, -1));
    }
  }
  return Array.from(terms);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

type RetrievedChunk = {
  chunk_id: string;
  site_id: string;
  site_name: string;
  site_slug: string;
  asset_id: string | null;
  asset_kind: string | null;
  chunk_index: number;
  text_en: string;
  text_original: string | null;
  language: string | null;
  snippet: string;
  licence: string;
};

/* =========================================================================
 * POST /api/ask
 * ========================================================================= */

export async function POST(req: Request) {
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Rate limit exceeded. Please wait a minute before asking again.",
      },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = AskRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 400 },
    );
  }

  const { question, history } = parsed.data;
  const normalizedQ = normalizeQuestion(question);

  // 1. Embed question (purpose="query")
  let queryEmbedding: number[] | null = null;
  try {
    const embedRes = await callLLM("embed", {
      texts: [question],
      purpose: "query",
    });
    queryEmbedding = embedRes.output.vectors[0] ?? null;
  } catch (embedErr) {
    console.warn("Ask route: embedding failed, falling back to text search only:", embedErr);
  }

  // 2. Retrieve top 8 candidate chunks via hybrid RRF
  const supabase = getServerSupabase();
  let retrievedChunks: RetrievedChunk[] = [];

  try {
    const { data, error } = await supabase.rpc("search_chunks", {
      query_embedding: queryEmbedding,
      query_text: question,
      match_count: 8,
    });

    if (error) {
      console.warn("Ask route: search_chunks RPC error, trying fallback query:", error.message);
    } else if (Array.isArray(data) && data.length > 0) {
      retrievedChunks = (data as Array<{
        chunk_id: string;
        site_id: string;
        site_name: string;
        site_slug: string;
        asset_id: string | null;
        asset_kind: string | null;
        chunk_index: number;
        text_en: string;
        text_original: string | null;
        language: string | null;
      }>).map((r) => {
        const text = r.text_en.trim();
        const snippet = text.length > 220 ? `${text.slice(0, 217)}…` : text;
        return {
          chunk_id: r.chunk_id,
          site_id: r.site_id,
          site_name: r.site_name,
          site_slug: r.site_slug,
          asset_id: r.asset_id,
          asset_kind: r.asset_kind ?? (r.asset_id ? "scan" : "record"),
          chunk_index: r.chunk_index,
          text_en: text,
          text_original: r.text_original,
          language: r.language,
          snippet,
          licence: "Open Heritage Archive / CC-BY-SA 4.0",
        };
      });
    }
  } catch (err) {
    console.warn("Ask route: search_chunks threw:", err);
  }

  // Fallback if search_chunks RPC is not present or yielded zero rows:
  if (retrievedChunks.length === 0) {
    try {
      const terms = extractSearchTerms(question);

      type RawChunkRow = {
        id: string;
        site_id: string;
        asset_id: string | null;
        chunk_index: number;
        text_en: string;
        text_original: string | null;
        language: string | null;
        sites:
          | {
              id: string;
              name_en: string;
              slug: string;
              origin: string;
              district?: string;
              category?: string;
            }
          | Array<{
              id: string;
              name_en: string;
              slug: string;
              origin: string;
              district?: string;
              category?: string;
            }>
          | null;
        assets: { id: string; kind: string } | Array<{ id: string; kind: string }> | null;
      };

      // 1. Chunks whose text matches any search term
      let textRows: RawChunkRow[] = [];
      if (terms.length > 0) {
        const { data } = await supabase
          .from("doc_chunks")
          .select(`
            id,
            site_id,
            asset_id,
            chunk_index,
            text_en,
            text_original,
            language,
            sites!inner (
              id,
              name_en,
              slug,
              status,
              origin,
              district,
              category
            ),
            assets (
              id,
              kind
            )
          `)
          .eq("sites.status", "published")
          .or(terms.map((t) => `text_en.ilike.%${t}%`).join(","))
          .limit(16);
        if (data) textRows = data as unknown as RawChunkRow[];
      }

      // 2. Sites matching terms in name_en, district, or category
      let siteRows: RawChunkRow[] = [];
      if (terms.length > 0) {
        const { data: matchedSites } = await supabase
          .from("sites")
          .select("id")
          .eq("status", "published")
          .or(
            terms
              .map((t) => `name_en.ilike.%${t}%,district.ilike.%${t}%,category.ilike.%${t}%`)
              .join(","),
          )
          .limit(10);

        if (matchedSites && matchedSites.length > 0) {
          const siteIds = (matchedSites as Array<{ id: string }>).map((s) => s.id);
          const { data: chunksForSites } = await supabase
            .from("doc_chunks")
            .select(`
              id,
              site_id,
              asset_id,
              chunk_index,
              text_en,
              text_original,
              language,
              sites!inner (
                id,
                name_en,
                slug,
                status,
                origin,
                district,
                category
              ),
              assets (
                id,
                kind
              )
            `)
            .in("site_id", siteIds)
            .eq("sites.status", "published")
            .limit(16);
          if (chunksForSites) siteRows = chunksForSites as unknown as RawChunkRow[];
        }
      }

      let rows = [...textRows, ...siteRows];

      // 3. If still empty, grab published chunks as general archive context
      if (rows.length === 0) {
        const { data: defaultRows } = await supabase
          .from("doc_chunks")
          .select(`
            id,
            site_id,
            asset_id,
            chunk_index,
            text_en,
            text_original,
            language,
            sites!inner (
              id,
              name_en,
              slug,
              status,
              origin,
              district,
              category
            ),
            assets (
              id,
              kind
            )
          `)
          .eq("sites.status", "published")
          .limit(8);
        if (defaultRows) rows = defaultRows as unknown as RawChunkRow[];
      }

      const candidateList: RetrievedChunk[] = [];
      const seenChunkIds = new Set<string>();

      for (const r of rows) {
        if (!r || seenChunkIds.has(r.id)) continue;
        seenChunkIds.add(r.id);

        const siteObj = Array.isArray(r.sites) ? r.sites[0] : r.sites;
        const assetObj = Array.isArray(r.assets) ? r.assets[0] : r.assets;
        if (!siteObj) continue;

        const text = (r.text_en ?? "").trim();
        const snippet = text.length > 220 ? `${text.slice(0, 217)}…` : text;

        candidateList.push({
          chunk_id: r.id,
          site_id: r.site_id,
          site_name: siteObj.name_en,
          site_slug: siteObj.slug,
          asset_id: r.asset_id,
          asset_kind: assetObj?.kind ?? null,
          chunk_index: r.chunk_index,
          text_en: text,
          text_original: r.text_original,
          language: r.language,
          snippet,
          licence:
            siteObj.origin === "seed"
              ? "Curated Heritage Record / Public Domain"
              : "Open Heritage Archive / CC-BY-SA 4.0",
        });
      }

      // Sort candidate chunks: chunks matching more query terms rank first
      if (terms.length > 0) {
        candidateList.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;
          const textA = (a.text_en + " " + a.site_name).toLowerCase();
          const textB = (b.text_en + " " + b.site_name).toLowerCase();
          for (const t of terms) {
            if (textA.includes(t)) scoreA += 1;
            if (textB.includes(t)) scoreB += 1;
          }
          return scoreB - scoreA;
        });
      }

      retrievedChunks = candidateList.slice(0, 8);
    } catch (fbCatch) {
      console.warn("Ask route: fallback chunk search failed:", fbCatch);
    }
  }

  // If still zero chunks found, return grounded message immediately
  if (retrievedChunks.length === 0) {
    return NextResponse.json({
      ok: true,
      answer: "The archive doesn't cover this yet.",
      citations: [],
    } satisfies AskApiResponse);
  }

  // 3. Cache lookup by normalized question + top chunk IDs
  const chunkIdsKey = retrievedChunks
    .map((c) => c.chunk_id)
    .sort()
    .join(",");
  const cacheKey = sha256(`${normalizedQ}::${chunkIdsKey}`);

  const cached = askCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      ...cached.data,
      cached: true,
    } satisfies AskApiResponse);
  }

  // 4. Build passages for the LLM
  const passages: AnswerPassage[] = retrievedChunks.map((c, i) => ({
    n: i + 1,
    chunk_id: c.chunk_id,
    text: c.text_en,
    site_name: c.site_name,
  }));

  const historyMsgs: AnswerHistoryMessage[] | undefined = history?.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  // 5. Ask LLM
  try {
    const llmRes = await callLLM("answer", {
      question,
      passages,
      history: historyMsgs,
    });

    const output = llmRes.output;

    // Validate citations:
    // Only keep citations whose `n` corresponds to an actual passage (1..passages.length)
    const validCitations: CitationSource[] = [];
    const seenPassageNums = new Set<number>();

    for (const cit of output.citations ?? []) {
      const pIndex = cit.n - 1;
      if (pIndex >= 0 && pIndex < retrievedChunks.length && !seenPassageNums.has(cit.n)) {
        seenPassageNums.add(cit.n);
        const chunk = retrievedChunks[pIndex];
        validCitations.push({
          n: cit.n,
          chunk_id: chunk.chunk_id,
          site_name: chunk.site_name,
          slug: chunk.site_slug,
          asset_id: chunk.asset_id,
          kind: chunk.asset_kind,
          snippet: chunk.snippet,
          licence: chunk.licence,
        });
      }
    }

    const responseData: AskApiResponse = {
      ok: true,
      answer: output.answer,
      citations: validCitations,
    };

    // Cache the response
    askCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(responseData);
  } catch (llmErr) {
    console.error("Ask route: LLM call failed:", errorMessage(llmErr));
    // Fallback: return polite archive message
    return NextResponse.json({
      ok: true,
      answer:
        "The archive doesn't cover this yet (archival research service temporarily unavailable).",
      citations: [],
      fallback: true,
    } satisfies AskApiResponse);
  }
}
