"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";

interface StakeSplitConfiguratorProps {
  currentCauseBps: bigint;
  onSave: (causeBps: number, stakerBps: number) => void;
  isSaving: boolean;
}

const PRESETS = [
  { label: "Default (79/19)", cause: 7900 },
  { label: "Generous (90/8)", cause: 9000 },
  { label: "Max Donate (98/0)", cause: 9800 },
];

export function StakeSplitConfigurator({
  currentCauseBps,
  onSave,
  isSaving,
}: StakeSplitConfiguratorProps) {
  const [open, setOpen] = useState(false);
  const [causeBps, setCauseBps] = useState<number>(Number(currentCauseBps));
  const ref = useScrollReveal<HTMLElement>({ y: 25, duration: 0.5 });

  const stakerBps = 9800 - causeBps;
  const causePct = (causeBps / 100).toFixed(0);
  const stakerPct = (stakerBps / 100).toFixed(0);
  const isDirty = causeBps !== Number(currentCauseBps);

  return (
    <section ref={ref} className="space-y-6">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-surface-container-high/40 rounded-2xl px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-surface-container-high transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl text-on-surface-variant">
            <span className="material-symbols-outlined">
              settings_input_component
            </span>
          </span>
          <span className="text-on-surface font-semibold text-sm">
            Yield Split Configurator
          </span>
          {isDirty && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-on-surface-variant font-medium">
            High Impact ({causePct}/{stakerPct})
          </span>
          <span className="text-on-surface-variant">
            <span className="material-symbols-outlined">
              {open ? "expand_less" : "expand_more"}
            </span>
          </span>
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="glass-card rounded-3xl p-8 space-y-10 shadow-inner">
          <div className="space-y-6">
            <div className="flex justify-between text-sm font-label font-medium px-1">
              <span className="text-tertiary-fixed-dim flex items-center gap-2">
                <span className="text-sm">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    volunteer_activism
                  </span>
                </span>
                Donate to campaign
              </span>
              <span className="text-primary flex items-center gap-2">
                Keep for myself
                <span className="text-sm">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    person
                  </span>
                </span>
              </span>
            </div>

            {/* Visual Split Bar */}
            <div className="h-4 w-full rounded-full flex overflow-hidden ring-4 ring-surface-container-lowest">
              <div
                className="h-full bg-gradient-to-r from-secondary-container to-primary-container transition-all duration-500"
                style={{ width: `${causeBps / 98}%` }}
              />
              <div
                className="h-full bg-surface-container-high transition-all duration-500"
                style={{ width: `${stakerBps / 98}%` }}
              />
              <div className="h-full bg-outline-variant/40 w-[2%]" />
            </div>

            {/* Range Slider */}
            <input
              className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary-container"
              max={9800}
              min={0}
              step={100}
              type="range"
              value={causeBps}
              onChange={(e) => setCauseBps(Number(e.target.value))}
            />
          </div>

          {/* Percentage circles */}
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full border-2 border-primary-container/30 flex flex-col items-center justify-center mx-auto bg-primary-container/5">
                <span className="text-lg font-bold">{causePct}%</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                Campaign
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full border-2 border-on-surface-variant/20 flex flex-col items-center justify-center mx-auto">
                <span className="text-lg font-bold">{stakerPct}%</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                You
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full border-2 border-outline-variant/10 flex flex-col items-center justify-center mx-auto opacity-50">
                <span className="text-lg font-bold">2%</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label opacity-50">
                Platform
              </div>
            </div>
          </div>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            {PRESETS.map(({ label, cause }) => (
              <button
                key={label}
                onClick={() => setCauseBps(cause)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-transform active:scale-95 ${
                  causeBps === cause
                    ? "bg-primary-container text-white border border-primary/20 shadow-lg shadow-primary/10"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Save button */}
          {isDirty && (
            <button
              onClick={() => {
                onSave(causeBps, stakerBps);
                setOpen(false);
              }}
              disabled={isSaving}
              className="w-full bg-gradient-to-r from-primary-container to-secondary-container py-4 rounded-2xl font-headline font-extrabold text-on-primary-container shadow-xl shadow-primary-container/20 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </span>
              ) : (
                "Save Split"
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
