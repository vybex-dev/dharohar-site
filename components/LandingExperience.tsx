"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const PROBLEMS = [
  {
    icon: "📜",
    title: "Fragile records",
    text: "Palm-leaf manuscripts, estampages, farmans and colonial surveys are fading in cupboards, unscanned and unindexed.",
  },
  {
    icon: "🔤",
    title: "Locked scripts",
    text: "Inscriptions in Devanagari, Old Gujarati, Sharada, Persian and Modi stay unreadable to most researchers and travellers.",
  },
  {
    icon: "🧭",
    title: "No sense of place",
    text: "Stepwells, rock-cut shrines and forts rarely link to real coordinates, so they stay hidden from discovery.",
  },
  {
    icon: "💸",
    title: "No budget for big tech",
    text: "Trusts and small institutions cannot afford GPU clusters, queue workers or enterprise AI platforms.",
  },
];

const PIPELINE = [
  { n: "01", t: "Upload", d: "Drop in a scan, photo or 360° panorama. Nothing else needed." },
  { n: "02", t: "Read (OCR)", d: "Vision models transcribe the original script, with a local fallback." },
  { n: "03", t: "Understand", d: "Structured extraction pulls out names, eras, categories and summaries." },
  { n: "04", t: "Locate", d: "Photo EXIF and geocoding place every record on the map." },
  { n: "05", t: "Embed", d: "Passages become vectors so meaning, not just keywords, can be searched." },
  { n: "06", t: "Review & publish", d: "A human checks the result before it joins the public atlas." },
];

const FEATURES = [
  {
    icon: "🗺️",
    title: "Interactive Atlas",
    text: "Every site, craft and document pinned on a free vector map. Zoom from Gujarat to a single stepwell.",
    href: "/",
    cta: "Open the atlas",
  },
  {
    icon: "🔎",
    title: "Multilingual Search",
    text: "Ask in English, हिन्दी or ગુજરાતી. Semantic, keyword and location search are blended into one ranked answer.",
    href: "/",
    cta: "Try a search",
  },
  {
    icon: "📜",
    title: "Ask the Archive",
    text: "A conversational assistant that answers only from archived records, with citations to the exact passage.",
    href: "/ask",
    cta: "Ask a question",
  },
  {
    icon: "🧵",
    title: "Plan a Journey",
    text: "Describe the trip you want and get a routed itinerary of heritage stops with their stories.",
    href: "/journeys/new",
    cta: "Plan a route",
  },
  {
    icon: "🌐",
    title: "360° Tours",
    text: "Step inside spherical panoramas with hotspots that link to inscriptions and notes.",
    href: "/",
    cta: "Explore sites",
  },
  {
    icon: "📤",
    title: "Contribute",
    text: "Anyone can add a document or photograph and watch it travel through the pipeline into the atlas.",
    href: "/upload",
    cta: "Upload a record",
  },
];

const STEP_LAYERS = 9;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function LandingExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Hero: stepwell follows the pointer, and gently parallaxes on scroll
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tx = 0,
      ty = 0,
      cx = 0,
      cy = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const loop = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      const sy = Math.min(window.scrollY, 800) / 800;
      stage.style.setProperty("--mx", cx.toFixed(3));
      stage.style.setProperty("--my", cy.toFixed(3));
      stage.style.setProperty("--sy", sy.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 3D tilt for cards
  const tiltMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 12).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 14).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(0)}%`);
    el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(0)}%`);
  };
  const tiltLeave = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div ref={rootRef} className="dhl">
      <style>{CSS}</style>

      {/* ---------------- Nav ---------------- */}
      <header className="dhl-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/welcome" className="flex items-center gap-2" aria-label="Dharohar home">
            <span className="dhl-logo">DH</span>
            <span className="font-serif text-lg font-bold tracking-tight text-[#5B21B6]">
              Dharohar
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#1E1B4B]/80 md:flex">
            <a href="#problem" className="hover:text-[#5B21B6]">Why</a>
            <a href="#how" className="hover:text-[#5B21B6]">How it works</a>
            <a href="#features" className="hover:text-[#5B21B6]">Features</a>
          </nav>
          <Link
            href="/"
            className="rounded-full bg-[#5B21B6] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#5B21B6]/25 transition hover:bg-[#4C1D95] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[#8B5CF6]"
          >
            Enter the Atlas →
          </Link>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="dhl-hero">
        <div className="dhl-glow dhl-glow-a" aria-hidden="true" />
        <div className="dhl-glow dhl-glow-b" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <span className="dhl-chip">
              <span aria-hidden="true">✦</span> Digital Revitalisation of Unstructured Cultural &amp; Architectural Heritage Archives
            </span>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-[1.05] tracking-tight text-[#1E1B4B] sm:text-6xl">
              Heritage that
              <span className="dhl-shimmer"> refuses to fade.</span>
            </h1>
            <p className="font-indic mt-3 text-2xl font-semibold text-[#8B5CF6]" lang="hi">
              धरोहर · ધરોહર
            </p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#1E1B4B]/75">
              Centuries of India&apos;s stepwells, forts, inscriptions and crafts survive as scattered,
              unreadable paper. Dharohar reads them, translates them, places them on a map and lets
              anyone ask them questions, in their own language.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/" className="dhl-btn dhl-btn-primary">
                Explore the Atlas
              </Link>
              <Link href="/ask" className="dhl-btn dhl-btn-ghost">
                Ask the Archive
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-center">
              {[
                ["3", "languages searched"],
                ["6", "pipeline stages"],
                ["360°", "virtual tours"],
              ].map(([v, l]) => (
                <div key={l} className="dhl-stat">
                  <dt className="font-serif text-2xl font-bold text-[#5B21B6]">{v}</dt>
                  <dd className="text-xs text-[#1E1B4B]/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 3D stepwell */}
          <div className="dhl-scene" aria-hidden="true">
            <div ref={stageRef} className="dhl-stage">
              <div className="dhl-well">
                {Array.from({ length: STEP_LAYERS }).map((_, i) => (
                  <div
                    key={i}
                    className="dhl-step"
                    style={
                      {
                        "--i": i,
                        "--size": `${100 - i * 10.5}%`,
                      } as React.CSSProperties
                    }
                  />
                ))}
                <div className="dhl-water" />
              </div>

              <span className="dhl-float dhl-float-1 font-indic" lang="hi">धरोहर</span>
              <span className="dhl-float dhl-float-2 font-indic" lang="gu">ધરોહર</span>
              <span className="dhl-float dhl-float-3">📜</span>
              <span className="dhl-float dhl-float-4">🏛️</span>
              <span className="dhl-float dhl-float-5">🧵</span>
            </div>
            <p className="dhl-caption">Chand Baori, Abhaneri · 3,500 steps, 13 storeys</p>
          </div>
        </div>

        <div className="dhl-scroll" aria-hidden="true">
          <span />
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section id="problem" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div data-reveal className="dhl-reveal mx-auto max-w-2xl text-center">
          <p className="dhl-eyebrow">The problem</p>
          <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
            A civilisation&apos;s memory, scattered and locked away
          </h2>
          <p className="mt-4 text-[#1E1B4B]/70">
            The knowledge exists. It is just trapped in forms that modern search, maps and
            travellers cannot reach.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" style={{ perspective: 1200 }}>
          {PROBLEMS.map((p, i) => (
            <article
              key={p.title}
              data-reveal
              className="dhl-reveal dhl-tilt dhl-card"
              style={{ transitionDelay: `${i * 80}ms` }}
              onPointerMove={tiltMove}
              onPointerLeave={tiltLeave}
            >
              <div className="dhl-card-inner">
                <div className="dhl-icon" style={{ transform: "translateZ(40px)" }}>{p.icon}</div>
                <h3 className="mt-4 font-serif text-lg font-bold" style={{ transform: "translateZ(24px)" }}>
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#1E1B4B]/70">{p.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Mission ---------------- */}
      <section className="dhl-mission">
        <div data-reveal className="dhl-reveal mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <p className="dhl-eyebrow dhl-eyebrow-light">Our motive</p>
          <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-white sm:text-5xl">
            Make every record findable, readable and walkable.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/80">
            Dharohar means &ldquo;heritage&rdquo;. The goal is simple: take what is hidden in
            unstructured archives and turn it into something a student, a researcher or a curious
            traveller can search, understand and visit, without needing a research grant or a
            data centre.
          </p>
        </div>
      </section>

      {/* ---------------- Pipeline ---------------- */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div data-reveal className="dhl-reveal mx-auto max-w-2xl text-center">
          <p className="dhl-eyebrow">How it works</p>
          <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
            From a faded scan to a living atlas, in six steps
          </h2>
          <p className="mt-4 text-[#1E1B4B]/70">
            A workerless pipeline that runs on ordinary serverless functions, so small institutions
            can run it for almost nothing.
          </p>
        </div>

        <ol className="dhl-timeline mt-14">
          {PIPELINE.map((s, i) => (
            <li
              key={s.n}
              data-reveal
              className="dhl-reveal dhl-tilt dhl-step-card"
              style={{ transitionDelay: `${i * 70}ms` }}
              onPointerMove={tiltMove}
              onPointerLeave={tiltLeave}
            >
              <span className="dhl-num">{s.n}</span>
              <h3 className="font-serif text-lg font-bold">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[#1E1B4B]/70">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="dhl-features">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div data-reveal className="dhl-reveal mx-auto max-w-2xl text-center">
            <p className="dhl-eyebrow">What you can do</p>
            <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
              Six ways to meet India&apos;s heritage
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: 1400 }}>
            {FEATURES.map((f, i) => (
              <Link
                key={f.title}
                href={f.href}
                data-reveal
                className="dhl-reveal dhl-tilt dhl-card dhl-feature"
                style={{ transitionDelay: `${i * 80}ms` }}
                onPointerMove={tiltMove}
                onPointerLeave={tiltLeave}
              >
                <div className="dhl-card-inner">
                  <div className="dhl-icon" style={{ transform: "translateZ(50px)" }}>{f.icon}</div>
                  <h3 className="mt-4 font-serif text-xl font-bold" style={{ transform: "translateZ(30px)" }}>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#1E1B4B]/70">{f.text}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-[#5B21B6]" style={{ transform: "translateZ(20px)" }}>
                    {f.cta} →
                  </span>
                </div>
                <span className="dhl-sheen" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Trust ---------------- */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div data-reveal className="dhl-reveal dhl-trust">
          <div className="text-4xl" aria-hidden="true">🛡️</div>
          <div>
            <h2 className="font-serif text-2xl font-bold">Grounded, never invented</h2>
            <p className="mt-2 text-[#1E1B4B]/75">
              The archive assistant answers only from indexed historical passages and cites each
              one. Uploads pass through a human review step before they are published, so the
              atlas stays something researchers can trust.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="dhl-cta">
        <div data-reveal className="dhl-reveal mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <h2 className="font-serif text-4xl font-bold text-white sm:text-5xl">
            Step into the atlas.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            Search a stepwell in Gujarati, trace a route across Rajasthan, or read an 8th-century
            inscription in translation.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="dhl-btn dhl-btn-light">Open the Atlas Map</Link>
            <Link href="/upload" className="dhl-btn dhl-btn-outline-light">Contribute a record</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#EDE9FE] bg-white/60 py-6 text-center text-xs text-[#1E1B4B]/60">
        Dharohar · धरोहर — Open-source heritage atlas · MIT License
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (scoped under .dhl)                                          */
/* ------------------------------------------------------------------ */

const CSS = `
.dhl { position: relative; overflow-x: clip; background: #FAF9FF; color: #1E1B4B; }
.dhl a:focus-visible { outline: 2px solid #8B5CF6; outline-offset: 3px; border-radius: 8px; }

.dhl-nav { position: sticky; top: 0; z-index: 40; background: rgba(250,249,255,.78); backdrop-filter: blur(14px); border-bottom: 1px solid #EDE9FE; }
.dhl-logo { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background: linear-gradient(135deg,#5B21B6,#8B5CF6); color:#fff; font-size:12px; font-weight:800; box-shadow: 0 4px 12px rgba(91,33,182,.35); }

/* Hero */
.dhl-hero { position: relative; background:
  radial-gradient(1200px 600px at 85% -10%, #EDE9FE 0%, transparent 60%),
  radial-gradient(800px 500px at -10% 30%, #F3EEFF 0%, transparent 60%); }
.dhl-glow { position:absolute; border-radius:50%; filter: blur(70px); opacity:.55; pointer-events:none; }
.dhl-glow-a { width:380px; height:380px; background:#C7B3FF; top:40px; right:8%; animation: dhl-drift 14s ease-in-out infinite; }
.dhl-glow-b { width:300px; height:300px; background:#8B5CF6; opacity:.25; bottom:-60px; left:6%; animation: dhl-drift 18s ease-in-out infinite reverse; }
@keyframes dhl-drift { 50% { transform: translate(30px,-24px) scale(1.08); } }

.dhl-chip { display:inline-flex; gap:8px; align-items:center; padding:6px 12px; border-radius:999px; background:#EDE9FE; border:1px solid #C7B3FF; color:#5B21B6; font-size:11px; font-weight:600; letter-spacing:.02em; line-height:1.3; }
.dhl-shimmer { background: linear-gradient(100deg,#5B21B6 20%,#A78BFA 45%,#5B21B6 70%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation: dhl-shine 6s linear infinite; }
@keyframes dhl-shine { to { background-position: -220% 0; } }

.dhl-btn { display:inline-flex; align-items:center; justify-content:center; padding:12px 22px; border-radius:999px; font-weight:600; font-size:15px; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.dhl-btn:hover { transform: translateY(-2px); }
.dhl-btn:active { transform: translateY(0) scale(.98); }
.dhl-btn-primary { background:#5B21B6; color:#fff; box-shadow: 0 10px 24px rgba(91,33,182,.3); }
.dhl-btn-primary:hover { background:#4C1D95; box-shadow: 0 14px 30px rgba(91,33,182,.4); }
.dhl-btn-ghost { background:#fff; color:#5B21B6; border:1px solid #C7B3FF; }
.dhl-btn-ghost:hover { background:#EDE9FE; }
.dhl-btn-light { background:#fff; color:#5B21B6; box-shadow: 0 10px 28px rgba(0,0,0,.25); }
.dhl-btn-outline-light { color:#fff; border:1px solid rgba(255,255,255,.55); }
.dhl-btn-outline-light:hover { background: rgba(255,255,255,.12); }

.dhl-stat { padding:10px 6px; border-radius:14px; background:rgba(255,255,255,.7); border:1px solid #EDE9FE; }

/* 3D stepwell */
.dhl-scene { position:relative; display:flex; flex-direction:column; align-items:center; }
.dhl-stage { --mx:0; --my:0; --sy:0; position:relative; width:min(460px,86vw); aspect-ratio:1; perspective:1100px; }
.dhl-well { position:absolute; inset:6%; transform-style:preserve-3d;
  transform: rotateX(calc(58deg + var(--my) * -8deg + var(--sy) * 12deg)) rotateZ(calc(var(--mx) * 14deg)) ;
  animation: dhl-spin 38s linear infinite; }
@keyframes dhl-spin { from { rotate: 0deg; } to { rotate: 360deg; } }
.dhl-step { position:absolute; left:50%; top:50%; width:var(--size); height:var(--size); aspect-ratio:1;
  transform: translate(-50%,-50%) translateZ(calc(var(--i) * -26px));
  border-radius: 6px; border: 2px solid rgba(91,33,182, calc(.95 - var(--i) * .07));
  background: linear-gradient(135deg, rgba(237,233,254, calc(.95 - var(--i) * .06)), rgba(199,179,255, calc(.55 - var(--i) * .04)));
  box-shadow: 0 0 0 3px rgba(139,92,246,.12), inset 0 0 22px rgba(91,33,182,.14), 0 18px 30px rgba(91,33,182,.12); }
.dhl-water { position:absolute; left:50%; top:50%; width:12%; height:12%; transform: translate(-50%,-50%) translateZ(calc(${STEP_LAYERS} * -26px));
  border-radius:50%; background: radial-gradient(circle,#fff 0%,#8B5CF6 45%,#5B21B6 100%); box-shadow: 0 0 40px 12px rgba(139,92,246,.7); animation: dhl-pulse 3s ease-in-out infinite; }
@keyframes dhl-pulse { 50% { box-shadow: 0 0 60px 22px rgba(139,92,246,.9); } }

.dhl-float { position:absolute; display:flex; align-items:center; justify-content:center; padding:10px 14px; border-radius:16px; background:rgba(255,255,255,.92); border:1px solid #C7B3FF; box-shadow: 0 14px 30px rgba(91,33,182,.22); font-size:22px; font-weight:700; color:#5B21B6;
  transform: translate3d(calc(var(--mx) * var(--d,18px)), calc(var(--my) * var(--d,18px)), 0); animation: dhl-bob 6s ease-in-out infinite; }
@keyframes dhl-bob { 50% { translate: 0 -14px; } }
.dhl-float-1 { top:2%; left:4%; --d:34px; }
.dhl-float-2 { bottom:12%; right:0; --d:-30px; animation-delay:-2s; }
.dhl-float-3 { top:14%; right:6%; --d:-22px; animation-delay:-1s; font-size:28px; }
.dhl-float-4 { bottom:6%; left:8%; --d:26px; animation-delay:-3s; font-size:28px; }
.dhl-float-5 { top:46%; left:-2%; --d:40px; animation-delay:-4s; font-size:26px; }
.dhl-caption { margin-top:6px; font-size:12px; color:rgba(30,27,75,.55); text-align:center; }

.dhl-scroll { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); width:22px; height:36px; border:2px solid #8B5CF6; border-radius:14px; opacity:.6; }
.dhl-scroll span { position:absolute; left:50%; top:6px; width:4px; height:7px; margin-left:-2px; border-radius:2px; background:#5B21B6; animation: dhl-wheel 1.8s ease-in-out infinite; }
@keyframes dhl-wheel { 0% { opacity:0; transform: translateY(0);} 30% { opacity:1;} 100% { opacity:0; transform: translateY(12px);} }

/* Sections */
.dhl-eyebrow { font-size:12px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:#8B5CF6; }
.dhl-eyebrow-light { color:#C7B3FF; }

.dhl-reveal { opacity:0; transform: translateY(28px); transition: opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1); }
.dhl-reveal.is-in { opacity:1; transform:none; }

/* 3D tilt cards */
.dhl-tilt { --rx:0deg; --ry:0deg; --gx:50%; --gy:50%; }
.dhl-card { position:relative; display:block; border-radius:20px; background:#fff; border:1px solid #E4DBFF; box-shadow: 0 10px 30px rgba(91,33,182,.08);
  transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)); transform-style:preserve-3d; transition: box-shadow .25s ease, transform .15s ease-out, opacity .7s ease; }
.dhl-card.is-in:hover { box-shadow: 0 24px 48px rgba(91,33,182,.22); }
.dhl-card-inner { padding:24px; transform-style:preserve-3d; }
.dhl-card .dhl-icon { display:inline-flex; width:52px; height:52px; align-items:center; justify-content:center; border-radius:16px; background:linear-gradient(135deg,#EDE9FE,#C7B3FF); font-size:26px; box-shadow: 0 8px 18px rgba(91,33,182,.2); }
.dhl-sheen { position:absolute; inset:0; border-radius:20px; pointer-events:none; opacity:0; transition:opacity .25s; background: radial-gradient(260px circle at var(--gx) var(--gy), rgba(139,92,246,.18), transparent 60%); }
.dhl-feature:hover .dhl-sheen { opacity:1; }

/* Mission & CTA bands */
.dhl-mission, .dhl-cta { position:relative; background: linear-gradient(135deg,#3B0764 0%,#5B21B6 55%,#8B5CF6 100%); overflow:hidden; }
.dhl-mission::before, .dhl-cta::before { content:""; position:absolute; inset:-40%; background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.05) 0 10deg, transparent 10deg 20deg); animation: dhl-spin 120s linear infinite; }
.dhl-mission > *, .dhl-cta > * { position:relative; }

/* Timeline */
.dhl-timeline { list-style:none; padding:0; margin-left:0; display:grid; gap:18px; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); perspective:1200px; counter-reset:none; }
.dhl-step-card { position:relative; padding:22px 22px 22px 22px; border-radius:18px; background:#fff; border:1px solid #E4DBFF; box-shadow: 0 8px 24px rgba(91,33,182,.07);
  transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .15s ease-out, box-shadow .25s, opacity .7s ease; }
.dhl-step-card:hover { box-shadow: 0 20px 40px rgba(91,33,182,.18); }
.dhl-num { display:inline-block; margin-bottom:8px; padding:2px 10px; border-radius:999px; background:#5B21B6; color:#fff; font-size:12px; font-weight:700; letter-spacing:.08em; }

.dhl-features { background: linear-gradient(180deg,#FAF9FF 0%,#EDE9FE 100%); }
.dhl-trust { display:flex; gap:20px; align-items:flex-start; padding:28px; border-radius:22px; background:#fff; border:1px solid #C7B3FF; box-shadow: 0 16px 40px rgba(91,33,182,.1); }

@media (max-width: 640px) { .dhl-float-5 { display:none; } }
@media (prefers-reduced-motion: reduce) {
  .dhl *, .dhl *::before, .dhl *::after { animation: none !important; transition: none !important; }
  .dhl-reveal { opacity:1; transform:none; }
  .dhl-well { transform: rotateX(58deg); }
}
`;
