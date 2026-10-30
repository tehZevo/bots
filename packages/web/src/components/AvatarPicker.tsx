import { AVATAR_COLORS, avatarColor, SHAPE_PRESETS } from "../lib/avatar.ts";
import type { Bot } from "../types.ts";
import { ShapePreview } from "./Avatar.tsx";
import { useEscape } from "./ui/useEscape.ts";

export function AvatarPicker({
  bot,
  onPick,
  onClose,
}: {
  bot: Bot;
  onPick: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  useEscape(onClose);
  const pick = (body: Record<string, unknown>) => {
    void onPick(body).catch((e) => alert((e as Error).message));
  };
  return (
    <>
      <button
        type="button"
        className="pickscrim"
        aria-label="Close avatar picker"
        onClick={onClose}
      />
      <div className="avatarmenu" role="dialog" aria-label="Avatar picker">
        <div className="shapes">
          {SHAPE_PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={`shapeprev${bot.avatar_shape === i ? " sel" : ""}`}
              aria-label={`Shape ${p.name}`}
              style={{
                color:
                  bot.avatar_color == null
                    ? avatarColor(bot.id)
                    : AVATAR_COLORS[bot.avatar_color],
              }}
              onClick={() => pick({ avatar_shape: i })}
            >
              <ShapePreview preset={i} />
            </button>
          ))}
        </div>
        <div className="swatches">
          {AVATAR_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${bot.avatar_color === i ? " sel" : ""}`}
              style={{ background: c, color: c }}
              aria-label={`Color ${i + 1}`}
              onClick={() => pick({ avatar_color: i })}
            />
          ))}
        </div>
        <button
          type="button"
          className="resetauto"
          disabled={bot.avatar_shape === null && bot.avatar_color === null}
          onClick={() => {
            void onPick({ avatar_shape: null, avatar_color: null })
              .then(onClose)
              .catch((e) => alert((e as Error).message));
          }}
        >
          Reset to auto
        </button>
      </div>
    </>
  );
}
