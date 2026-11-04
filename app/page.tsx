import type { Metadata } from "next";
import LandingExperience from "@/components/LandingExperience";

export const metadata: Metadata = {
  title: "Dharohar · धरोहर — Bringing India's forgotten heritage back to life",
  description:
    "Dharohar turns fading manuscripts, inscriptions and field photographs into a living, searchable, multilingual atlas of India's architectural and cultural heritage.",
};

export default function LandingPage() {
  return <LandingExperience />;
}
