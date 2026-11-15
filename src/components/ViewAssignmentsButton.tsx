"use client";

import { useState } from "react";
import Dialog from "./Dialog";
import { useToast } from "./Toast";
import styles from "./ViewAssignmentsButton.module.css";

// Role lines: Swordland "Leader: / Support:", Tri Alliance "- Offense: / - Support:"
const ROLE_LINE = /^(-\s*)?(Leader|Support|Offense):/;
// Swordland headings whose players are on the next line
const PLAYER_LIST_HEADINGS = new Set(["Undercellars", "Substitutes"]);
// Tri Alliance: "Substitutions: A, B" on one line
const SUBSTITUTIONS_LINE = /^Substitutions:\s*(.*)$/;
interface DisplayLine {
  text: string;
  /** Under a building / team / heading */
  indented: boolean;
}

/**
 * Splits the text into lines, marking roles and player lists that sit under their
 * building / team / heading. Indented with padding (not spaces) so wrapped lines keep it.
 */
const toDisplayLines = (text: string): DisplayLine[] =>
  text.split("\n").flatMap((line, index, lines) => {
    if (ROLE_LINE.test(line)) return [{ text: line, indented: true }];
    if (line.trim() && PLAYER_LIST_HEADINGS.has(lines[index - 1]?.trim() ?? "")) {
      return [{ text: line, indented: true }];
    }
    const substitutions = line.match(SUBSTITUTIONS_LINE);
    if (substitutions) {
      return [
        { text: "Substitutions:", indented: false },
        { text: substitutions[1] || "None", indented: true },
      ];
    }
    return [{ text: line, indented: false }];
  });

/** "View assignments" button + a modal with the generated string (same text as below the legions) */
export default function ViewAssignmentsButton({ text }: { text: string }) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <>
      <div className={styles.bar}>
        <button type="button" className={styles.viewButton} onClick={() => setIsOpen(true)}>
          View assignments
        </button>
      </div>

      <Dialog isOpen={isOpen} title="Assignments" onClose={() => setIsOpen(false)} size="large">
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.copyButton} onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {/* Indented only here; Copy and the Generated String keep the original text */}
          <div className={styles.text}>
            {text
              ? toDisplayLines(text).map((line, index) => (
                  <div key={index} className={line.indented ? styles.indented : styles.line}>
                    {/* Keep empty lines as spacing */}
                    {line.text || "\u00A0"}
                  </div>
                ))
              : "No assignments yet."}
          </div>
        </div>
      </Dialog>
    </>
  );
}
