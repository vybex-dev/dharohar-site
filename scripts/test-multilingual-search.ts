/**
 * Unit tests for the multilingual search enhancements.
 *
 * Run with:
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-multilingual-search.ts
 */

import { ParseQueryOutputSchema } from "../lib/llm";

// ── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`, detail ?? "");
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ── helpers for fallbackParse (inlined here to avoid importing server modules) ──

function fallbackParse(rawQuery: string) {
  return {
    language: "en" as const,
    place: null,
    radius_km: null,
    era: null,
    type: null,
    topic_en: rawQuery,
    topic_original: rawQuery,
    topic: rawQuery,
  };
}

// ── Test 1: ParseQueryOutputSchema — Hindi input ─────────────────────────────

section("ParseQueryOutputSchema — Hindi input");
{
  const raw = {
    language: "hi",
    topic_en: "mud resist block printing",
    topic_original: "मिट्टी से छपाई",
    topic: "mud resist block printing",
    place: null,
    radius_km: null,
    era: null,
    type: null,
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert("language = 'hi'", result.data.language === "hi", result.data.language);
    assert(
      "topic_en = 'mud resist block printing'",
      result.data.topic_en === "mud resist block printing",
      result.data.topic_en,
    );
    assert(
      "topic_original = 'मिट्टी से छपाई'",
      result.data.topic_original === "मिट्टी से छपाई",
      result.data.topic_original,
    );
    assert(
      "topic = topic_en (backward compat)",
      result.data.topic === result.data.topic_en,
      result.data.topic,
    );
  }
}

// ── Test 2: ParseQueryOutputSchema — Gujarati input ─────────────────────────

section("ParseQueryOutputSchema — Gujarati input");
{
  const raw = {
    language: "gu",
    topic_en: "Rani ki Vav stepwell",
    topic_original: "રાણકી વાવ",
    topic: "Rani ki Vav stepwell",
    place: "Patan",
    radius_km: 50,
    era: null,
    type: null,
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert("language = 'gu'", result.data.language === "gu", result.data.language);
    assert(
      "topic_original = 'રાણકી વાવ'",
      result.data.topic_original === "રાણકી વાવ",
      result.data.topic_original,
    );
    assert(
      "place preserved",
      result.data.place === "Patan",
      result.data.place,
    );
  }
}

// ── Test 3: ParseQueryOutputSchema — backward compat (old format, topic only) ──

section("ParseQueryOutputSchema — backward compat (old LLM format with 'topic' only)");
{
  const raw = {
    topic: "stepwells",
    place: null,
    radius_km: null,
    era: "medieval",
    type: null,
    // no language, no topic_en, no topic_original
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert(
      "topic_en falls back to 'topic' value",
      result.data.topic_en === "stepwells",
      result.data.topic_en,
    );
    assert(
      "topic_original falls back to topic_en",
      result.data.topic_original === "stepwells",
      result.data.topic_original,
    );
    assert(
      "language defaults to 'en'",
      result.data.language === "en",
      result.data.language,
    );
    assert(
      "era = 'medieval'",
      result.data.era === "medieval",
      result.data.era,
    );
  }
}

// ── Test 4: ParseQueryOutputSchema — English input (new format) ──────────────

section("ParseQueryOutputSchema — English input (new format)");
{
  const raw = {
    language: "en",
    topic_en: "Solanki stepwells",
    topic_original: "Solanki stepwells",
    topic: "Solanki stepwells",
    place: "Ahmedabad",
    radius_km: 100,
    era: null,
    type: null,
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert("language = 'en'", result.data.language === "en");
    assert("topic_en = 'Solanki stepwells'", result.data.topic_en === "Solanki stepwells");
    assert("place = 'Ahmedabad'", result.data.place === "Ahmedabad");
  }
}

// ── Test 5: ParseQueryOutputSchema — unknown language → 'other' ──────────────

section("ParseQueryOutputSchema — unknown language normalises to 'other'");
{
  const raw = {
    language: "ta", // Tamil — not in the enum
    topic_en: "Dravidian temples",
    topic_original: "திராவிட கோவில்கள்",
    topic: "Dravidian temples",
    place: null,
    radius_km: null,
    era: null,
    type: null,
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert("language normalised to 'other'", result.data.language === "other", result.data.language);
    assert("topic_original preserved", result.data.topic_original === "திராவிட கோவில்கள்");
  }
}

// ── Test 6: fallbackParse ────────────────────────────────────────────────────

section("fallbackParse — Hindi raw query");
{
  const result = fallbackParse("मिट्टी से छपाई");

  assert("language = 'en' (fallback doesn't detect)", result.language === "en", result.language);
  assert(
    "topic_en = raw query",
    result.topic_en === "मिट्टी से छपाई",
    result.topic_en,
  );
  assert(
    "topic_original = raw query",
    result.topic_original === "मिट्टी से छपाई",
    result.topic_original,
  );
  assert(
    "topic = raw query (backward compat)",
    result.topic === "मिट्टी से छपाई",
    result.topic,
  );
}

// ── Test 7: ParseQueryOutputSchema — empty topic fields ─────────────────────

section("ParseQueryOutputSchema — query is purely a place name (empty topics)");
{
  const raw = {
    language: "en",
    topic_en: "",
    topic_original: "",
    topic: "",
    place: "Modhera",
    radius_km: 30,
    era: null,
    type: null,
  };

  const result = ParseQueryOutputSchema.safeParse(raw);

  assert("parses successfully", result.success, result.error);

  if (result.success) {
    assert("topic_en is empty string", result.data.topic_en === "");
    assert("place = 'Modhera'", result.data.place === "Modhera");
  }
}

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
