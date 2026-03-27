"use client";

import { TopNavBar } from "./components/sections/TopNavBar";
import { HeroSection } from "./components/sections/HeroSection";
import { ProgressCard } from "./components/sections/ProgressCard";
import { ImpactModels } from "./components/sections/ImpactModels";
import { StatsBar } from "./components/sections/StatsBar";
import { PhotoGallery } from "./components/sections/PhotoGallery";
import { ActivityFeed } from "./components/sections/ActivityFeed";
import { Footer } from "./components/sections/Footer";

export default function CampaignPage() {
  return (
    <>
      <TopNavBar />
      <main>
        <HeroSection />
        <ProgressCard />
        <ImpactModels />
        <StatsBar />
        <PhotoGallery />
        <ActivityFeed />
      </main>
      <Footer />
    </>
  );
}
