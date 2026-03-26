"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { PhotoCard } from "../ui/PhotoCard";
import { FullscreenGallery } from "./FullscreenGallery";

const GALLERY_ITEMS = [
  {
    src: "/images/women-entrepreneurs-1.jpg",
    alt: "The Collective Mindset workshop",
    tag: "Workshop Spotlight",
    title: "The Collective Mindset",
    tagColorClass: "text-primary",
    featured: true,
    description:
      "Female leaders gathering to solve community-level economic challenges through digital innovation.",
  },
  {
    src: "/images/women-entrepreneurs-2.jpg",
    alt: "Innovation Hub collaboration",
    tag: "Collaboration",
    title: "Innovation Hub",
  },
  {
    src: "/images/women-entrepreneurs-3.jpg",
    alt: "Digital Literacy learning session",
    tag: "Learning",
    title: "Digital Literacy",
  },
  {
    src: "/images/women-entrepreneurs-4.jpg",
    alt: "Funding Goal impact",
    tag: "Impact",
    title: "Funding Goal",
  },
  {
    src: "/images/women-entrepreneurs-5.jpg",
    alt: "Abeokuta Circle community",
    tag: "Community",
    title: "Abeokuta Circle",
  },
  {
    src: "/images/women-entrepreneurs-6.jpg",
    alt: "Strategy Sessions deep focus",
    tag: "Deep Focus",
    title: "Strategy Sessions",
    tagColorClass: "text-primary",
    wide: true,
  },
  {
    src: "/images/women-entrepreneurs-7.jpg",
    alt: "Future Leaders growth",
    tag: "Growth",
    title: "Future Leaders",
  },
  {
    src: "/images/women-entrepreneurs-8.jpg",
    alt: "The Vault Summit network event",
    tag: "Network",
    title: "The Vault Summit",
  },
] as const;

export function PhotoGallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const featured = GALLERY_ITEMS[0];
  const grid = GALLERY_ITEMS.slice(1);

  useGSAP(
    () => {
      if (!sectionRef.current) return;

      // Header reveal
      gsap.from(sectionRef.current.querySelector(".gallery-header"), {
        y: 20,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      });

      // Gallery items: staggered scale-up + fade
      const items = sectionRef.current.querySelectorAll(".gallery-item");
      gsap.from(items, {
        y: 50,
        opacity: 0,
        scale: 0.95,
        duration: 0.7,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current.querySelector(".gallery-grid"),
          start: "top 85%",
          toggleActions: "play none none none",
        },
      });

      // Gallery text overlays: slide up after each card's entrance
      const gridTrigger = sectionRef.current.querySelector(".gallery-grid");
      items.forEach((item, i) => {
        const texts = item.querySelectorAll("p, h4");
        gsap.from(texts, {
          y: 20,
          opacity: 0,
          duration: 0.4,
          stagger: 0.08,
          ease: "power2.out",
          delay: 0.1 * i + 0.5,
          scrollTrigger: {
            trigger: gridTrigger,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      });
    },
    { dependencies: [] }
  );

  return (
    <>
      <section ref={sectionRef} className="py-32 px-6 lg:px-20 max-w-[1440px] mx-auto">
        <div className="gallery-header flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="max-w-xl">
            <h2 className="text-4xl md:text-5xl font-headline font-extrabold mb-4 tracking-tight">
              Faces of <span className="gradient-text">Change</span>
            </h2>
            <p className="text-on-surface-variant text-lg">
              Impact in action: Real stories from the Abeokuta Entrepreneurship
              Workshop series.
            </p>
          </div>
          <button
            onClick={() => setGalleryOpen(true)}
            className="text-primary font-extrabold hover:underline flex items-center gap-2 group text-lg"
          >
            View Full Gallery{" "}
            <span className="text-xl group-hover:translate-x-1 transition-transform">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>
          </button>
        </div>

        <div className="gallery-grid grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[250px] md:auto-rows-[320px]">
          {/* Featured large card */}
          <PhotoCard
            src={featured.src}
            alt={featured.alt}
            tag={featured.tag}
            title={featured.title}
            tagColorClass={featured.tagColorClass}
            featured
            description={featured.description}
            className="gallery-item col-span-2 row-span-2"
          />

          {/* Grid items */}
          {grid.map((item) => (
            <PhotoCard
              key={item.title}
              src={item.src}
              alt={item.alt}
              tag={item.tag}
              title={item.title}
              tagColorClass={"tagColorClass" in item ? item.tagColorClass : undefined}
              className={`gallery-item ${"wide" in item && item.wide ? "col-span-2" : ""}`}
            />
          ))}
        </div>
      </section>

      <FullscreenGallery
        images={GALLERY_ITEMS.map((item) => ({
          src: item.src,
          alt: item.alt,
          tag: item.tag,
          title: item.title,
          description: "description" in item ? item.description : undefined,
        }))}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}
