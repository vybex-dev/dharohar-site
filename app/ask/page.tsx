"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CitationSource, AskApiResponse } from "@/app/api/ask/route";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationSource[];
  fallback?: boolean;
  error?: boolean;
};

const EXAMPLE_QUESTIONS = [
  {
    topic: "Architecture & Royalty",
    icon: "🏛️",
    text: "Who built Rani ki Vav and what do the Sanskrit epigraphs say about it?",
  },
  {
    topic: "Water Architecture",
    icon: "💧",
    text: "How does Chand Baori's 3,500-step geometric design cool the aquifer?",
  },
  {
    topic: "Textile Traditions",
    icon: "🧵",
    text: "What is double-ikat weaving and how do Patan Salvi weavers create it?",
  },
  {
    topic: "Craft Chemistry",
    icon: "🎨",
    text: "Explain the natural indigo and dabu mud-resist printing technique of Bagru.",
  },
];

export default function AskPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const idCounterRef = useRef(0);

  const getNextId = (prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (questionText?: string) => {
    const text = (questionText ?? input).trim();
    if (!text || loading) return;

    setInput("");
    setErrorMessage(null);

    const userMsgId = getNextId("user");
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);

    // Build history (last 4 turns excluding errors)
    const history = nextMessages
      .slice(-5, -1)
      .filter((m) => !m.error)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history }),
      });

      const data = (await res.json()) as AskApiResponse & { error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to get answer`);
      }

      const assistantMsg: ChatMessage = {
        id: getNextId("assistant"),
        role: "assistant",
        content: data.answer,
        citations: data.citations,
        fallback: data.fallback,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Something went wrong";
      setErrorMessage(errText);
      setMessages((prev) => [
        ...prev,
        {
          id: getNextId("err"),
          role: "assistant",
          content: "Sorry, I could not query the archive at this moment.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setErrorMessage(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9FF] text-[#1E1B4B]">
      {/* Top Header */}
      <header className="border-b border-[#EDE9FE] bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-[#5B21B6] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#8B5CF6]"
            >
              ← Back to Atlas Map
            </Link>
            <span className="text-[#C7B3FF]">|</span>
            <span className="font-serif text-lg font-bold tracking-tight text-[#5B21B6]">
              Dharohar Archive
            </span>
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-[#EDE9FE] hover:text-[#5B21B6] focus-visible:outline-2 focus-visible:outline-[#8B5CF6]"
            >
              Clear conversation
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6">
        {/* Title & Archival Guarantee Disclaimer */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                Ask the Archive
              </h1>
              <p className="mt-1 text-sm text-stone-600">
                Explore architectural surveys, inscriptions, and cultural documentation grounded in primary records.
              </p>
            </div>
            {/* Strictly Grounded Disclaimer */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#C7B3FF] bg-[#EDE9FE] px-3 py-1 text-xs font-semibold text-[#5B21B6] shadow-xs">
              <span className="text-sm">📜</span>
              <span>Answers come only from archived records</span>
            </div>
          </div>
        </div>

        {/* Conversation List / Empty State */}
        <div className="flex-1 space-y-6 pb-24">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center rounded-2xl border border-[#C7B3FF]/80 bg-white p-8 text-center shadow-lg shadow-[#5B21B6]/5 sm:p-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EDE9FE] text-3xl text-[#5B21B6] shadow-sm">
                🏛️
              </div>
              <h2 className="mt-5 font-serif text-2xl font-bold text-[#1E1B4B]">
                Archival Research Assistant
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
                Grounded inquiry across transcribed epigraphs, royal chronicles, and living craft documentation. Answers cite exact source documents and link directly to full records.
              </p>

              <div className="mt-8 w-full max-w-2xl text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-[#5B21B6] mb-3">
                  Explore Curated Archival Themes:
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q.text}
                      onClick={() => handleSend(q.text)}
                      className="group flex flex-col justify-between rounded-xl border border-[#C7B3FF]/60 bg-[#FAF9FF] p-3.5 text-left transition hover:border-[#8B5CF6] hover:bg-[#EDE9FE]/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#8B5CF6]"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base">{q.icon}</span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B21B6]">
                          {q.topic}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-stone-800 leading-snug group-hover:text-[#5B21B6]">
                        {q.text}
                      </p>
                      <div className="mt-2 flex items-center justify-end text-[11px] font-semibold text-[#8B5CF6] group-hover:translate-x-0.5 transition-transform">
                        Ask record →
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl bg-[#5B21B6] px-4 py-3 text-sm text-white shadow-xs sm:max-w-[75%]">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-[95%] rounded-2xl border border-[#EDE9FE] bg-white p-5 shadow-xs sm:max-w-[90%]">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[#5B21B6]">
                      <span>🏛️ Archive Record</span>
                      {m.fallback && (
                        <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] text-stone-500">
                          Unavailable
                        </span>
                      )}
                    </div>

                    <div className="prose prose-stone max-w-none text-sm leading-relaxed text-stone-800">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>

                    {/* Citations / Sources */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-5 border-t border-[#EDE9FE] pt-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                          Referenced Archive Sources ({m.citations.length})
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {m.citations.map((c) => {
                            const targetUrl = `/sites/${c.slug}${
                              c.asset_id ? `#source-${c.asset_id}` : "#sources"
                            }`;
                            return (
                              <div
                                key={`${c.n}-${c.chunk_id}`}
                                className="group relative flex flex-col justify-between rounded-xl border border-[#EDE9FE] bg-[#FAF9FF] p-3 transition hover:border-[#8B5CF6] hover:bg-[#EDE9FE]/40"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#5B21B6] text-[10px] font-bold text-white">
                                      {c.n}
                                    </span>
                                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#5B21B6] uppercase tracking-wider ring-1 ring-[#C7B3FF]">
                                      {c.kind ?? "Record"}
                                    </span>
                                  </div>

                                  <Link
                                    href={targetUrl}
                                    className="mt-2 block font-serif text-sm font-semibold text-stone-900 group-hover:text-[#5B21B6] group-hover:underline"
                                  >
                                    {c.site_name} <span className="text-[#8B5CF6]">↗</span>
                                  </Link>

                                  <p className="mt-1 text-xs italic text-stone-600 line-clamp-3">
                                    &ldquo;{c.snippet}&rdquo;
                                  </p>
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-[#EDE9FE] pt-2 text-[10px] text-stone-400">
                                  <span>{c.licence}</span>
                                  <Link
                                    href={targetUrl}
                                    className="font-medium text-[#5B21B6] hover:underline"
                                  >
                                    Inspect source
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-start">
              <div className="rounded-2xl border border-[#EDE9FE] bg-white p-4 shadow-xs">
                <div className="flex items-center gap-3 text-sm text-stone-600">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6]"></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6] [animation-delay:0.2s]"></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6] [animation-delay:0.4s]"></span>
                  </span>
                  <span>Consulting archival records…</span>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              Error: {errorMessage}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Form Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#EDE9FE] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a site, inscription, or craft tradition… (Enter to send)"
                rows={1}
                disabled={loading}
                className="w-full resize-none rounded-xl border border-[#C7B3FF]/60 bg-white px-4 py-2.5 text-sm leading-relaxed text-stone-900 placeholder-stone-400 focus:border-[#5B21B6] focus:ring-1 focus:ring-[#8B5CF6] focus:outline-none disabled:bg-[#EDE9FE]/50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#5B21B6] px-5 text-sm font-medium text-white shadow-xs transition hover:bg-[#4C1D95] focus-visible:outline-2 focus-visible:outline-[#8B5CF6] disabled:opacity-40 disabled:hover:bg-[#5B21B6]"
            >
              Ask
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-stone-400">
            Archive citations are directly linked to primary sources &bull; Press Shift+Enter for new line
          </p>
        </div>
      </footer>
    </div>
  );
}
