import { Instagram, Facebook, Linkedin } from "lucide-react";

export const SOCIAL_LINKS = [
  { name: "Instagram", href: "https://www.instagram.com/botnira/", Icon: Instagram, tid: "social-instagram" },
  { name: "Facebook",  href: "https://www.facebook.com/people/BotNira-All-in-One-AI-Assistant/61588783825013/", Icon: Facebook,  tid: "social-facebook" },
  { name: "LinkedIn",  href: "https://www.linkedin.com/company/115494270/", Icon: Linkedin,  tid: "social-linkedin" },
];

/**
 * Compact 3-icon social strip. `variant="dark"` suits the black footer,
 * `variant="light"` suits the white nav. Keeps icon+aria together for SEO
 * crawlers — `rel="me"` doubles as Google "sameAs" hinting.
 */
export default function SocialIcons({ variant = "light", size = 16, className = "" }) {
  const isDark = variant === "dark";
  const base = isDark
    ? "border border-white/30 hover:border-white hover:bg-white hover:text-black text-white"
    : "border-2 border-black hover:bg-black hover:text-white";
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="social-icons">
      {SOCIAL_LINKS.map(({ name, href, Icon, tid }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="me noopener noreferrer"
          aria-label={`BotNira on ${name}`}
          title={`Follow BotNira on ${name}`}
          data-testid={tid}
          className={`w-9 h-9 grid place-items-center transition-colors ${base}`}
        >
          <Icon size={size} strokeWidth={2} />
        </a>
      ))}
    </div>
  );
}
