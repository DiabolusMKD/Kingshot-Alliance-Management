/**
 * Utility function to format numbers with commas as thousand separators.
 * If the number has a decimal part that is ".00", it will be removed.
 * Example:
 *   formatNumbers(1234567) => "1,234,567"
 *   formatNumbers(1234567.00) => "1,234,567"
 *   formatNumbers(1234567.89) => "1,234,567.89"
 */
export const formatNumbers = (num: number): string => {
    if (isNaN(num)) {
        return "0";
    }
    const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (formatted.includes(".")) {
        const [integer, decimal] = formatted.split(".");
        if (decimal === "00") {
            return integer;
        }
    }
    return formatted;
}

/**
 * Formats a power value with a space between each group of three digits.
 * Uses a non-breaking space so a number never wraps onto two lines.
 * Example: formatPower(152384920) => "152 384 920"
 */
export const formatPower = (num: number): string => formatNumbers(Number(num)).replace(/,/g, " ");

const COMPACT_UNITS: { value: number; suffix: string }[] = [
  { value: 1_000_000_000, suffix: "B" },
  { value: 1_000_000, suffix: "M" },
  { value: 1_000, suffix: "K" },
];

/**
 * Short power for tables: one decimal, cut (not rounded) so it never shows more than the
 * player has, a comma as the decimal mark and no ",0".
 * Examples: 103890000 => "103,8M", 103000000 => "103M", 130890 => "130,8K", 950 => "950"
 */
export const formatCompactPower = (num: number): string => {
  const value = Number(num);
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const unit = COMPACT_UNITS.find((u) => abs >= u.value);
  if (!unit) return `${sign}${Math.floor(abs)}`;

  const tenths = Math.floor(abs / (unit.value / 10));
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${sign}${whole}${decimal ? `,${decimal}` : ""}${unit.suffix}`;
};
