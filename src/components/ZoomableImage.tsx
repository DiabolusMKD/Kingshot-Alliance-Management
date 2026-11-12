'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import styles from './ZoomableImage.module.css';

interface ZoomableImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  title?: string;
}

/**
 * Thumbnail that opens a large preview in a modal when clicked.
 * Safe inside clickable rows/cards (links): its clicks never reach the parent.
 */
export default function ZoomableImage({ src, alt, width, height, className, title }: ZoomableImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Don't trigger the row/card navigation around the thumbnail
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`${styles.thumbnail} ${className ?? ''}`}
        title={title ?? `View ${alt}`}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
      />
      {isOpen && <ImageLightbox src={src} alt={alt} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Portaled to <body>, but React events still bubble to the thumbnail's ancestors,
  // so stop them here to keep a parent row/link from reacting.
  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.lightbox}
      aria-label={alt}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close image">
        ✕
      </button>
      {/* Plain <img>: full-size preview of an arbitrary remote image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.fullImage} />
      <p className={styles.caption}>{alt}</p>
    </dialog>,
    document.body
  );
}
