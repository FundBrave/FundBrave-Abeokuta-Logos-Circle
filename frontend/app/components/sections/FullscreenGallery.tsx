"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import Image from "next/image";

interface GalleryImage {
  src: string;
  alt: string;
  tag: string;
  title: string;
  description?: string;
}

interface FullscreenGalleryProps {
  images: GalleryImage[];
  isOpen: boolean;
  onClose: () => void;
}

export function FullscreenGallery({
  images,
  isOpen,
  onClose,
}: FullscreenGalleryProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const isAnimating = useRef(false);
  const touchStartX = useRef(0);

  const numPanels = images.length;

  // Navigate to a specific panel
  const goTo = useCallback(
    (idx: number) => {
      if (isAnimating.current || idx < 0 || idx >= numPanels || idx === current)
        return;
      isAnimating.current = true;

      // Animate caption out for current panel
      const currentCaption = panelsRef.current?.children[current]?.querySelector(".panel-caption");
      if (currentCaption) {
        gsap.to(currentCaption, { y: 20, opacity: 0, duration: 0.2 });
      }

      gsap.to(panelsRef.current, {
        x: `-${idx * 100}vw`,
        duration: 0.6,
        ease: "power2.inOut",
        onComplete: () => {
          isAnimating.current = false;
          setCurrent(idx);

          // Animate caption in for new panel
          const newCaption = panelsRef.current?.children[idx]?.querySelector(".panel-caption");
          if (newCaption) {
            gsap.fromTo(
              newCaption,
              { y: 20, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }
            );
          }
        },
      });
    },
    [current, numPanels]
  );

  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setCurrent(0);
      isAnimating.current = false;
      // Reset panel position
      if (panelsRef.current) {
        gsap.set(panelsRef.current, { x: 0 });
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Entry animation — useGSAP auto-kills the timeline when isOpen changes or component unmounts
  useGSAP(() => {
    if (!isOpen || !overlayRef.current) return;

    const tl = gsap.timeline();
    tl.fromTo(
      overlayRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: "power2.out" }
    );

    // Scale first panel in
    const firstPanel = panelsRef.current?.children[0];
    if (firstPanel) {
      tl.fromTo(
        firstPanel,
        { scale: 1.05 },
        { scale: 1, duration: 0.6, ease: "power2.out" },
        0.1
      );
    }

    // Fade in first caption
    const firstCaption = firstPanel?.querySelector(".panel-caption");
    if (firstCaption) {
      tl.fromTo(
        firstCaption,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
        0.3
      );
    }
  }, { dependencies: [isOpen] });

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, goNext, goPrev]);

  // Wheel navigation
  useEffect(() => {
    if (!isOpen) return;
    let accumulated = 0;
    const threshold = 50;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulated += e.deltaY;
      if (Math.abs(accumulated) > threshold) {
        if (accumulated > 0) goNext();
        else goPrev();
        accumulated = 0;
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [isOpen, goNext, goPrev]);

  // Touch swipe
  useEffect(() => {
    if (!isOpen) return;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const delta = touchStartX.current - e.changedTouches[0].clientX;
      if (Math.abs(delta) > 60) {
        if (delta > 0) goNext();
        else goPrev();
      }
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen, goNext, goPrev]);

  const handleClose = useCallback(() => {
    if (!overlayRef.current) {
      onClose();
      return;
    }
    gsap.to(overlayRef.current, {
      opacity: 0,
      duration: 0.3,
      ease: "power2.in",
      onComplete: onClose,
    });
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[60] bg-black">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-[70] w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <span className="material-symbols-outlined text-white text-2xl">
          close
        </span>
      </button>

      {/* Counter */}
      <div className="fixed top-6 left-6 z-[70] text-white/60 text-sm font-label font-bold">
        <span className="text-white">{current + 1}</span> / {images.length}
      </div>

      {/* Panels container */}
      <div className="h-screen w-screen overflow-hidden">
        <div
          ref={panelsRef}
          className="flex h-full"
          style={{ width: `${images.length * 100}vw` }}
        >
          {images.map((img, i) => (
            <div
              key={i}
              className="relative w-screen h-screen flex-shrink-0"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover"
                priority={i <= 1}
              />
              {/* Gradient overlay + caption */}
              <div className="panel-caption absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-8 md:p-16">
                <p className="text-primary text-xs md:text-sm font-black uppercase tracking-[0.2em] mb-2">
                  {img.tag}
                </p>
                <h3 className="text-white text-3xl md:text-5xl font-headline font-extrabold mb-3">
                  {img.title}
                </h3>
                {img.description && (
                  <p className="text-white/70 text-base md:text-lg max-w-lg leading-relaxed">
                    {img.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      {current > 0 && (
        <button
          onClick={goPrev}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-[70] w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            chevron_left
          </span>
        </button>
      )}
      {current < numPanels - 1 && (
        <button
          onClick={goNext}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-[70] w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            chevron_right
          </span>
        </button>
      )}

      {/* Dot indicators */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all duration-300 ${
              i === current
                ? "w-2.5 h-2.5 bg-white"
                : "w-2 h-2 bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
