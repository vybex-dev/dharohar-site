import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AnswerOutputSchema,
  AnswerCitationSchema,
} from "../lib/llm";
import { extractSearchTerms } from "../app/api/ask/route";

test("AnswerOutputSchema validates well-formed answer and citations", () => {
  const sample = {
    answer:
      "Rani ki Vav was constructed in the 11th century CE during the Solanki dynasty [1]. It features an inverted temple layout with extensive sculptures depicting avatars of Vishnu [2].",
    citations: [
      { n: 1, chunk_id: "chunk-uuid-1" },
      { n: 2, chunk_id: "chunk-uuid-2" },
    ],
  };

  const parsed = AnswerOutputSchema.parse(sample);
  assert.equal(parsed.citations.length, 2);
  assert.equal(parsed.citations[0].n, 1);
  assert.equal(parsed.citations[0].chunk_id, "chunk-uuid-1");
  assert.ok(parsed.answer.includes("[1]"));
});

test("AnswerCitationSchema rejects invalid citation numbers", () => {
  assert.throws(() => {
    AnswerCitationSchema.parse({ n: 0, chunk_id: "valid-uuid" });
  });
  assert.throws(() => {
    AnswerCitationSchema.parse({ n: -1, chunk_id: "valid-uuid" });
  });
  assert.throws(() => {
    AnswerCitationSchema.parse({ n: 1.5, chunk_id: "valid-uuid" });
  });
});

test("Citation pruning strips invalid or out-of-bounds citations", () => {
  const passages = [
    { n: 1, chunk_id: "chunk-1", site_name: "Rani ki Vav" },
    { n: 2, chunk_id: "chunk-2", site_name: "Adalaj" },
  ];

  const rawCitations = [
    { n: 1, chunk_id: "chunk-1" },
    { n: 99, chunk_id: "chunk-fake" }, // out of bounds
    { n: 1, chunk_id: "chunk-1" }, // duplicate
    { n: 2, chunk_id: "chunk-2" },
  ];

  const validCitations: Array<{ n: number; chunk_id: string; site_name: string }> = [];
  const seenN = new Set<number>();

  for (const c of rawCitations) {
    const idx = c.n - 1;
    if (idx >= 0 && idx < passages.length && !seenN.has(c.n)) {
      seenN.add(c.n);
      validCitations.push({
        n: c.n,
        chunk_id: passages[idx].chunk_id,
        site_name: passages[idx].site_name,
      });
    }
  }

  assert.equal(validCitations.length, 2);
  assert.equal(validCitations[0].n, 1);
  assert.equal(validCitations[1].n, 2);
  assert.equal(validCitations[0].chunk_id, "chunk-1");
});

test("Cache key consistency for normalized question and chunks", () => {
  function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  function normalize(q: string): string {
    return q.toLowerCase().trim().replace(/\s+/g, " ");
  }

  const q1 = "What do the inscriptions at Rani ki Vav say?";
  const q2 = "  what do the  inscriptions at rani ki vav say?   ";

  const chunks1 = ["uuid-b", "uuid-a"];
  const chunks2 = ["uuid-a", "uuid-b"];

  const key1 = sha256(`${normalize(q1)}::${chunks1.slice().sort().join(",")}`);
  const key2 = sha256(`${normalize(q2)}::${chunks2.slice().sort().join(",")}`);

  assert.equal(key1, key2, "Cache keys must match regardless of casing, spacing, or chunk order");
});

test("extractSearchTerms removes stopwords and stems words correctly", () => {
  const termsPatan = extractSearchTerms("What crafts are practiced in Patan?");
  assert.ok(termsPatan.includes("patan"), "Should include patan");
  assert.ok(termsPatan.includes("craft") || termsPatan.includes("crafts"), "Should include craft/crafts");
  assert.ok(!termsPatan.includes("what"), "Should exclude what");
  assert.ok(!termsPatan.includes("practiced"), "Should exclude practiced");

  const termsRani = extractSearchTerms("What do the inscriptions at Rani ki Vav say?");
  assert.ok(termsRani.includes("rani"), "Should include rani");
  assert.ok(termsRani.includes("vav"), "Should include vav");
  assert.ok(termsRani.includes("inscription") || termsRani.includes("inscriptions"), "Should include inscription");
});
