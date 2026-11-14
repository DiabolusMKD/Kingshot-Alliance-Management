import { Player } from "@/types";

/** Which power a Swordland event uses to build (and show) its assignments */
export type PowerMode = "swordland" | "power";

export const POWER_MODE_OPTIONS: { value: PowerMode; label: string }[] = [
  { value: "swordland", label: "Swordland power" },
  { value: "power", label: "Total power" },
];

export const getPowerLabel = (mode: PowerMode) =>
  mode === "power" ? "Power" : "Swordland Power";

export const getPlayerPower = (player: Player, mode: PowerMode): number =>
  Number(mode === "power" ? player.power : player.swordlandPower) || 0;
