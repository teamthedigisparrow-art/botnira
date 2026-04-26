// BotNira brand mark — replaces the old "B in blue box" everywhere.
// Used wherever the "B" used to appear next to the wordmark.
//
// Usage:
//   <BrandMark size={28} />   // header / nav
//   <BrandMark size={32} />   // legal pages, etc.
//
// The crop already includes the brand's dark navy backdrop, so you don't need
// to wrap it in a colored box — it ships as a self-contained square tile.

export default function BrandMark({ size = 28, className = "", testId = "brand-mark" }) {
  return (
    <img
      src="/brand/botnira-mark.png"
      width={size}
      height={size}
      alt="BotNira"
      data-testid={testId}
      className={`block border-2 border-black object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
