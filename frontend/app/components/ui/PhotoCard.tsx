"use client";

import Image from "next/image";

interface PhotoCardProps {
  src: string;
  alt: string;
  tag: string;
  title: string;
  tagColorClass?: string;
  /** Whether this is the large featured card */
  featured?: boolean;
  /** Optional description (shown only on featured cards on md+) */
  description?: string;
  className?: string;
}

export function PhotoCard({
  src,
  alt,
  tag,
  title,
  tagColorClass = "text-tertiary",
  featured = false,
  description,
  className = "",
}: PhotoCardProps) {
  return (
    <div
      className={`rounded-${featured ? "[2rem]" : "2xl"} overflow-hidden bg-surface-container-high group relative transition-transform duration-500 hover:-translate-y-1 ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover ${featured ? "group-hover:scale-105" : "group-hover:scale-110"} transition-transform ${featured ? "duration-1000" : "duration-700"}`}
      />
      <div
        className={`absolute inset-0 bg-gradient-to-t ${featured ? "from-black via-black/20" : "from-black/90 via-transparent"} to-transparent flex flex-col justify-end ${featured ? "p-8 md:p-12" : "p-6"}`}
      >
        <p
          className={`${featured ? "text-primary" : tagColorClass} text-[10px] ${featured ? "md:text-sm" : ""} font-black uppercase tracking-${featured ? "[0.2em]" : "widest"} mb-${featured ? "3" : "1"}`}
        >
          {tag}
        </p>
        <h4
          className={`text-white ${featured ? "text-3xl md:text-5xl font-headline font-extrabold leading-tight" : "text-lg font-bold"}`}
        >
          {title}
        </h4>
        {featured && description && (
          <p className="text-white/70 text-lg max-w-md hidden md:block leading-relaxed mt-4">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
