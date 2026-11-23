export default function Scores({ scores }: { scores?: Record<string, number> }) {
  if (!scores) return null;
  return (
    <div className="scores">
      {Object.entries(scores).map(([k, v]) => (
        <div key={k} className="score">
          <b>{typeof v === "number" ? Math.round(v * 10) / 10 : v}</b>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}
