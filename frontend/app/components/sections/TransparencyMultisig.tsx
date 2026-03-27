"use client";

import { useState } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import {
  CONTRACT_ADDRESSES,
  MULTISIG_SIGNERS,
  REQUIRED_SIGS,
  TOTAL_SIGS,
  shortenAddress,
  getAddressExplorerUrl,
} from "../../lib/contracts";

export function TransparencyMultisig() {
  const ref = useScrollReveal<HTMLDivElement>({ y: 30, duration: 0.6 });
  const [copied, setCopied] = useState(false);

  const treasuryAddr = CONTRACT_ADDRESSES.treasury;
  const isDeployed =
    treasuryAddr !== "0x0000000000000000000000000000000000000000";

  const handleCopy = async () => {
    if (!isDeployed) return;
    await navigator.clipboard.writeText(treasuryAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={ref} className="glass-card p-8 rounded-2xl border border-outline-variant/10 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center border border-primary/20">
            <span
              className="material-symbols-outlined text-primary text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              shield
            </span>
          </div>
          <h3 className="font-headline text-xl font-bold">
            Multisig Treasury
          </h3>
        </div>

        {/* Safe Address */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/5 mb-8">
          <p className="text-xs text-on-surface-variant uppercase font-bold tracking-widest mb-2">
            Gnosis Safe Address
          </p>
          <div className="flex items-center justify-between">
            <code className="text-primary-fixed-dim font-mono text-sm">
              {isDeployed ? shortenAddress(treasuryAddr) : "Not yet deployed"}
            </code>
            <button
              onClick={handleCopy}
              className="text-on-surface-variant text-sm cursor-pointer hover:text-white transition-colors"
              title="Copy address"
            >
              <span className="material-symbols-outlined text-lg">
                {copied ? "check" : "content_copy"}
              </span>
            </button>
          </div>
        </div>

        {/* Signers */}
        <div className="space-y-4">
          <p className="text-xs text-on-surface-variant uppercase font-bold tracking-widest">
            Required Signers ({REQUIRED_SIGS}/{TOTAL_SIGS})
          </p>
          {MULTISIG_SIGNERS.map((signer, i) => (
            <div key={signer.name} className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  i < REQUIRED_SIGS ? "bg-green-500" : "bg-surface-variant"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  i < REQUIRED_SIGS ? "" : "text-on-surface-variant"
                }`}
              >
                {signer.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* View Safe */}
      <a
        href={
          isDeployed
            ? getAddressExplorerUrl(treasuryAddr)
            : "#"
        }
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 w-full py-3 rounded-xl bg-surface-container-highest font-bold text-sm border border-outline-variant/10 hover:bg-surface-container transition-colors text-center block"
      >
        View Safe Details
      </a>
    </div>
  );
}
