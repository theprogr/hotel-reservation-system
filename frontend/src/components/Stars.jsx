export default function Stars({ count, size = "normal" }) {
  if (!count) return null;
  return (
    <span className={`stars stars-${size}`} role="img" aria-label={`${count}-star hotel`}>
      {"★".repeat(count)}
    </span>
  );
}
