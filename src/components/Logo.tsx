import Image from 'next/image';
import { Cinzel } from 'next/font/google';
import styles from './Logo.module.css';

// Roman-capitals serif to match the crest
const cinzel = Cinzel({ subsets: ['latin'], weight: ['600', '800'] });

export const APP_NAME = 'Alliance Management';
export const APP_KICKER = 'Kingshot';
export const APP_TAGLINE = 'Rosters · Events · Gift Codes';

interface LogoProps {
  /** `header`: emblem + name side by side. `hero`: large, stacked, with tagline. */
  variant?: 'header' | 'hero';
}

/**
 * Brand mark: the transparent shield emblem plus live text (always crisp and
 * fully transparent, unlike text baked into an image).
 */
export default function Logo({ variant = 'header' }: LogoProps) {
  return (
    <span className={`${styles.logo} ${styles[variant]} ${cinzel.className}`}>
      <Image
        src="/logo-emblem.png"
        alt=""
        width={454}
        height={350}
        className={styles.emblem}
        priority
      />
      <span className={styles.wordmark}>
        <span className={styles.kicker}>{APP_KICKER}</span>
        <span className={styles.name}>{APP_NAME}</span>
        {variant === 'hero' && <span className={styles.tagline}>{APP_TAGLINE}</span>}
      </span>
    </span>
  );
}
