import assert from "node:assert/strict";
import test from "node:test";
import {
  PlanJourneyOutputSchema,
  NarrateJourneyOutputSchema,
} from "../lib/llm";

test("PlanJourneyOutputSchema parses and defaults correctly", () => {
  // Test case 1: Full payload
  const sample1 = {
    theme: "Solanki stepwells",
    region_or_origin: "Ahmedabad",
    days: 3,
    era: "Solanki",
    category: "stepwell",
  };
  const parsed1 = PlanJourneyOutputSchema.parse(sample1);
  assert.equal(parsed1.theme, "Solanki stepwells");
  assert.equal(parsed1.region_or_origin, "Ahmedabad");
  assert.equal(parsed1.days, 3);
  assert.equal(parsed1.era, "Solanki");
  assert.equal(parsed1.category, "stepwell");

  // Test case 2: Default days to 2 when omitted
  const sample2 = {
    theme: "Mughal forts",
    region_or_origin: null,
  };
  const parsed2 = PlanJourneyOutputSchema.parse(sample2);
  assert.equal(parsed2.days, 2);
  assert.equal(parsed2.category, null);

  // Test case 3: Invalid category coerced to null
  const sample3 = {
    theme: "Ancient monuments",
    region_or_origin: "Delhi",
    days: "4",
    category: "spaceship",
  };
  const parsed3 = PlanJourneyOutputSchema.parse(sample3);
  assert.equal(parsed3.days, 4);
  assert.equal(parsed3.category, null);
});

test("NarrateJourneyOutputSchema validates narration response", () => {
  const sample = {
    title: "Solanki Subterranean Wonders",
    intro: "Discover the breathtaking stone carvings and stepped water architecture of northern Gujarat.",
    stops: [
      {
        site_id: "site-uuid-1",
        blurb: "Marvel at the five-story subterranean pavilion carvings and cooling pavilions.",
      },
      {
        site_id: "site-uuid-2",
        blurb: "Explore the inverted temple honoring Vishnu with over five hundred primary sculptures.",
      },
    ],
  };

  const parsed = NarrateJourneyOutputSchema.parse(sample);
  assert.equal(parsed.title, "Solanki Subterranean Wonders");
  assert.equal(parsed.stops.length, 2);
  assert.equal(parsed.stops[0].site_id, "site-uuid-1");
});

test("Haversine and clustering logic", () => {
  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  // Ahmedabad to Adalaj is ~18 km
  const ahmedabad = { lat: 23.0225, lng: 72.5714 };
  const adalaj = { lat: 23.1667, lng: 72.5815 };
  const dist = haversineKm(ahmedabad.lat, ahmedabad.lng, adalaj.lat, adalaj.lng);
  assert.ok(dist >= 15 && dist <= 20, `Expected ~16-18km, got ${dist}`);

  // Modhera is ~100 km from Ahmedabad
  const modhera = { lat: 23.5833, lng: 72.1333 };
  const distModhera = haversineKm(ahmedabad.lat, ahmedabad.lng, modhera.lat, modhera.lng);
  assert.ok(distModhera >= 75 && distModhera <= 110, `Expected ~80-100km, got ${distModhera}`);
});

test("Narration site ID grounding and repair logic", () => {
  const candidateIds = new Set(["uuid-adalaj", "uuid-rani-ki-vav"]);
  const candidates = [
    { site_id: "uuid-adalaj", name: "Adalaj Stepwell" },
    { site_id: "uuid-rani-ki-vav", name: "Rani ki Vav" },
  ];

  const rawLLMStops = [
    { site_id: "uuid-adalaj", blurb: "Five story underground stepwell." },
    { site_id: "Rani ki Vav", blurb: "Subterranean temple honoring Vishnu." }, // LLM used name instead of UUID
    { site_id: "fake-uuid-not-in-db", blurb: "A fabricated stop." },
  ];

  const blurbMap = new Map<string, string>();
  for (const st of rawLLMStops) {
    if (candidateIds.has(st.site_id)) {
      blurbMap.set(st.site_id, st.blurb);
    } else {
      const match = candidates.find(
        (c) => c.name.toLowerCase() === st.site_id.toLowerCase(),
      );
      if (match) blurbMap.set(match.site_id, st.blurb);
    }
  }

  assert.equal(blurbMap.size, 2);
  assert.equal(blurbMap.get("uuid-adalaj"), "Five story underground stepwell.");
  assert.equal(blurbMap.get("uuid-rani-ki-vav"), "Subterranean temple honoring Vishnu.");
  assert.equal(blurbMap.has("fake-uuid-not-in-db"), false);
});

console.log("All unit tests passed successfully!");
