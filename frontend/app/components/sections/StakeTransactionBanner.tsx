"use client";

interface StakeTransactionBannerProps {
  step: string;
  errorMsg?: string;
}

export function StakeTransactionBanner({
  step,
  errorMsg,
}: StakeTransactionBannerProps) {
  if (errorMsg) {
    return (
      <div className="p-4 rounded-2xl bg-error-container/10 border border-error/20 flex items-start gap-3">
        <span className="text-xl text-error">
          <span className="material-symbols-outlined">error</span>
        </span>
        <p className="text-error text-sm">{errorMsg}</p>
      </div>
    );
  }

  const stepMessages: Record<string, { title: string; desc: string }> = {
    approving: {
      title: "Approving...",
      desc: "Waiting for wallet confirmation to spend USDC",
    },
    staking: {
      title: "Staking...",
      desc: "Confirm in your wallet",
    },
    unstaking: {
      title: "Unstaking...",
      desc: "Confirm in your wallet",
    },
    claiming: {
      title: "Claiming...",
      desc: "Confirm in your wallet",
    },
    confirming: {
      title: "Confirming on chain...",
      desc: "Waiting for block confirmation",
    },
    settingsplit: {
      title: "Saving split...",
      desc: "Confirm in your wallet",
    },
  };

  const msg = stepMessages[step];
  if (!msg) return null;

  return (
    <div className="p-4 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <span className="absolute text-xs text-primary">
          <span className="material-symbols-outlined text-xs">sync</span>
        </span>
      </div>
      <div>
        <p className="text-on-primary-container font-semibold text-sm">
          {msg.title}
        </p>
        <p className="text-on-surface-variant text-xs">{msg.desc}</p>
      </div>
    </div>
  );
}
