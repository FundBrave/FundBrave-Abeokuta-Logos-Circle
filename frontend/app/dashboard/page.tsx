"use client";

import { SubPageNav } from "../components/sections/SubPageNav";
import { TransparencyHeroProgress } from "../components/sections/TransparencyHeroProgress";
import { TransparencyStatsGrid } from "../components/sections/TransparencyStatsGrid";
import { TransparencyMultisig } from "../components/sections/TransparencyMultisig";
import { TransparencyContracts } from "../components/sections/TransparencyContracts";
import { TransparencyActivityFeed } from "../components/sections/TransparencyActivityFeed";
import { TransparencyCTA } from "../components/sections/TransparencyCTA";
import { TransparencyBackgroundDecoration } from "../components/sections/TransparencyBackgroundDecoration";
import { Footer } from "../components/sections/Footer";

const NAV_LINKS = [
  { label: "Transparency", href: "/dashboard", active: true },
  { label: "Governance", href: "#", active: false },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body">
      <SubPageNav title="Transparency Dashboard" navLinks={NAV_LINKS} />

      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto space-y-12">
        <TransparencyHeroProgress />

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <TransparencyStatsGrid className="lg:col-span-2" />
          <TransparencyMultisig />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <TransparencyContracts />
          <TransparencyActivityFeed />
        </section>

        <TransparencyCTA />
      </main>

      <Footer />
      <TransparencyBackgroundDecoration />
    </div>
  );
}
