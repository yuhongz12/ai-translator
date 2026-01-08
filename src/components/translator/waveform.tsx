import { cn } from "@/lib/utils";

const BARS = [10, 18, 14, 22, 12, 26, 16, 20, 13, 24, 15, 19, 11, 23];

export default function Waveform() {
  return (
    <div className="flex w-full items-center gap-1">
      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        {BARS.map((h, i) => (
          <div
            key={i}
            className={cn(
              "w-1.5 rounded-full bg-primary/70",
              "animate-pulse motion-reduce:animate-none"
            )}
            style={{
              height: `${h}px`,
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>

      <span className="ml-2 text-xs text-muted-foreground">Listening…</span>
    </div>
  );
}
