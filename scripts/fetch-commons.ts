// scripts/fetch-commons.ts
// Fetch image assets from Wikimedia Commons based on a hand‑editable sources JSON file.
// The script is idempotent, respects a 1 req/sec rate limit, validates licenses,
// downloads with sharp, downscales to a max 2400 px long edge, checks pano aspect,
// and updates seed/metadata.csv.

import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import sharp from "sharp";

type SourceItem = {
  commons_title: string; // e.g. "File:Example.jpg"
  kind: "photo" | "scan" | "pano";
  state?: string;
  district?: string;
  category?: string;
  period?: string;
  notes?: string;
};

const ALLOWED_LICENSES = new Set([
  "CC0",
  "Public domain",
  "CC-BY",
  "CC BY",
  "CC-BY-SA",
  "CC BY-SA",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-._]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchInfo(title: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: title,
    redirects: "1",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Commons API error ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages;
  const page = pages && Object.values(pages)[0];
  if (!page || page.missing) throw new Error(`Page not found: ${title}`);
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`No imageinfo for ${title}`);
  return info;
}

async function processItem(item: SourceItem, existingFilenames: Set<string>) {
  const fileTitle = item.commons_title.replace(/^File:/i, "");
  const safeName = slugify(fileTitle);
  const ext = extname(safeName) || ".jpg"; // fallback
  const filename = `${safeName}${ext}`;

  const samplePath = resolve("seed/samples", filename);
  if (existsSync(samplePath) && existingFilenames.has(filename)) {
    console.log(`[SKIP] ${filename} already present`);
    return;
  }

  // Respect 1 req/sec rate‑limit
  await sleep(1000);
  let info;
  try {
    info = await fetchInfo(`File:${fileTitle}`);
  } catch (e) {
    console.warn(`[FAIL] ${item.commons_title}: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const meta = info.extmetadata ?? {};
  const licenseShort = meta.LicenseShortName?.value ?? "";
  const artist = meta.Artist?.value ?? "";
  const description = meta.ImageDescription?.value ?? "";

  // License validation
  const licenseOk = Array.from(ALLOWED_LICENSES).some((allowed) =>
    licenseShort.toUpperCase().includes(allowed.toUpperCase())
  );
  if (!licenseOk) {
    console.warn(`[REJECT] ${filename}: license "${licenseShort}" not permitted`);
    return;
  }

  // Download the original file URL
  const fileUrl = info.url;
  const resp = await fetch(fileUrl);
  if (!resp.ok) {
    console.warn(`[FAIL] download ${filename} – ${resp.statusText}`);
    return;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());

  // Verify pano aspect ratio if required
  if (item.kind === "pano") {
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) {
      console.warn(`[REJECT] ${filename}: unable to read dimensions`);
      return;
    }
    const ratio = width / height;
    if (ratio < 1.8 || ratio > 2.2) {
      console.warn(`[REJECT] ${filename}: pano aspect ${ratio.toFixed(2)} not ~2:1`);
      return;
    }
  }

  // Downscale – keep max 2400 on the longer edge
  const resized = await sharp(buffer)
    .rotate() // handle EXIF orientation
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();

  // Write file
  writeFileSync(samplePath, resized);
  console.log(`[OK] saved ${filename}`);

  // Append to metadata.csv (create header if missing)
  const csvPath = resolve("seed/metadata.csv");
  const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}`;
  const row = [
    filename,
    `"${description.replace(/"/g, "" )}"`, // title column – using description as title fallback
    `"${item.notes ?? description}"`,
    item.kind,
    item.state ?? "",
    item.district ?? "",
    item.category ?? "",
    item.period ?? "",
    sourceUrl,
    licenseShort,
    artist,
  ].join(",");

  // Ensure we do not duplicate rows (by filename)
  const csvExists = existsSync(csvPath);
  if (csvExists) {
    const csvText = readFileSync(csvPath, "utf-8");
    if (csvText.includes(`\n${filename},`)) {
      console.log(`[SKIP] metadata for ${filename} already exists`);
      return;
    }
  } else {
    // Write header
    const header =
      "filename,title,notes,kind,state,district,category,period,source_url,license,attribution\n";
    writeFileSync(csvPath, header, "utf-8");
  }
  appendFileSync(csvPath, row + "\n", "utf-8");
  console.log(`[META] appended metadata for ${filename}`);
}

async function main() {
  const args = process.argv.slice(2);
  const srcPathArg = args.find((a) => a.startsWith("--src="))?.slice(6) ?? "sources.json";
  const srcPath = resolve(srcPathArg);
  if (!existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    process.exit(1);
  }
  const raw = readFileSync(srcPath, "utf-8");
  const items: SourceItem[] = JSON.parse(raw);

  // Build set of already‑downloaded filenames for idempotency
  const existingFiles = new Set<string>(
    existsSync("seed/samples")
      ? readdirSync("seed/samples").filter((f: string) => f !== ".gitkeep")
      : []
  );

  for (const it of items) {
    try {
      await processItem(it, existingFiles);
    } catch (e) {
      console.error(`[ERROR] processing ${it.commons_title}:`, e);
    }
  }
}

void main();
