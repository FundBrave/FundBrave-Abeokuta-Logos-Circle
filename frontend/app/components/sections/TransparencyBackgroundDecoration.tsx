"use client";

export function TransparencyBackgroundDecoration() {
  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none z-[-1]">
      <div className="absolute top-[10%] right-[10%] w-[40rem] h-[40rem] bg-secondary-container/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[5%] left-[5%] w-[30rem] h-[30rem] bg-tertiary-container/5 blur-[100px] rounded-full" />
    </div>
  );
}
