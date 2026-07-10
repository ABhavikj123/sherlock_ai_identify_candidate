type ScoreRingProps = {
  score: number;
};

export function ScoreRing({ score }: ScoreRingProps) {
  const percentage = Math.round(score * 100);
  const hue = Math.round(score * 120);
  const color = `hsl(${hue} 74% 42%)`;

  return (
    <div
      className="grid size-20 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${percentage}%, #e4e4e7 0)`,
      }}
      aria-label={`Candidate confidence ${percentage} percent`}
    >
      <div className="grid size-16 place-items-center rounded-full bg-white">
        <span className="text-lg font-semibold text-zinc-950">{percentage}%</span>
      </div>
    </div>
  );
}
