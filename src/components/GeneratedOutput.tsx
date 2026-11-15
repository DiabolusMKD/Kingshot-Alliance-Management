"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import styles from "./GeneratedOutput.module.css";

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

interface GeneratedOutputProps {
  id: string;
  label: string;
  value: string;
}

/** Collapsible read-only output (collapsed by default); Copy sits inside the text area, top right */
export default function GeneratedOutput({ id, label, value }: GeneratedOutputProps) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className={styles.output}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={id}
      >
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true">
          ▸
        </span>
        {label}
      </button>

      {isOpen && (
        <div className={styles.area}>
          <textarea id={id} className={styles.textarea} value={value} readOnly aria-label={label} />
          <button
            type="button"
            onClick={handleCopy}
            className={styles.copyButton}
            title={`Copy ${label.toLowerCase()}`}
            aria-label={`Copy ${label.toLowerCase()}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
