'use client';

import { Alliance } from '@/types';
import ZoomableImage from './ZoomableImage';
import styles from './AllianceAvatar.module.css';

interface AllianceAvatarProps {
  alliance: Alliance;
  className?: string;
}

function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export default function AllianceAvatar({ alliance, className }: AllianceAvatarProps) {
  if (alliance.allianceImageUrl) {
    return (
      <ZoomableImage
        src={alliance.allianceImageUrl}
        alt={`[${alliance.nameTag}]${alliance.name}`}
        className={className}
        width={160}
        height={160}
      />
    );
  }

  const hue = hashHue(alliance.nameTag || alliance.name);

  return (
    <div
      className={`${styles.placeholder} ${className || ''}`}
      style={{ backgroundColor: `hsl(${hue}, 55%, 40%)` }}
      title={alliance.name}
    >
      {alliance.nameTag}
    </div>
  );
}
