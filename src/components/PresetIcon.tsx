import type { CSSProperties } from "react";
import { getPresetIcon } from "~/lib/client/presetIcon.js";
import type { AgentPreset } from "~/lib/client/types.js";

export default function PresetIcon({
  preset,
  size = 14,
}: {
  preset: Pick<AgentPreset, "kind" | "binary" | "name">;
  size?: number;
}) {
  const icon = getPresetIcon(preset);
  const style: CSSProperties = { width: size, height: size };
  if (icon.type === "letter") {
    const letterStyle: CSSProperties = {
      ...style,
      fontSize: Math.max(8, Math.round(size * 0.7)),
      background: `hsl(${icon.hue} 60% 45%)`,
    };
    return (
      <span className="preset-icon preset-icon-letter" style={letterStyle} aria-hidden>
        {icon.letter}
      </span>
    );
  }
  return (
    <span className="preset-icon" style={style} aria-hidden>
      <img className="preset-icon-light" src={icon.light} alt="" width={size} height={size} />
      <img className="preset-icon-dark" src={icon.dark} alt="" width={size} height={size} />
    </span>
  );
}
