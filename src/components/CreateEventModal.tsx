"use client";

import { useState } from "react";
import { useToast } from "./Toast";

interface Props {
  onClose: () => void;
  onSubmit: (startsAt: string) => Promise<void>;
}

export default function CreateEventModal({ onClose, onSubmit }: Props) {
  const [startsAt, setStartsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    try {
      setLoading(true);
      await onSubmit(startsAt);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modalOverlay">
      <div className="modal">
        <h2>Create Event</h2>

        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />

        <div>
          <button onClick={onClose}>Cancel</button>

          <button onClick={handleSave} disabled={loading}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
