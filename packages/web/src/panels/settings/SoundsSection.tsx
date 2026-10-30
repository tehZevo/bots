import { useState } from "react";
import { SwitchToggle } from "../../components/ui/SwitchToggle.tsx";
import { playSound } from "../../lib/sound.ts";

export function SoundsSection() {
  const [soundsOn, setSoundsOn] = useState(
    () => localStorage.getItem("bots-sounds") === "on",
  );

  return (
    <>
      <p className="muted">Notification sounds</p>
      <div className="actions">
        <SwitchToggle
          ariaLabel="Play notification sounds"
          checked={soundsOn}
          onChange={() => {
            const next = !soundsOn;
            setSoundsOn(next);
            localStorage.setItem("bots-sounds", next ? "on" : "off");
            if (next) playSound("default");
          }}
          stateLabel={soundsOn ? "On" : "Off"}
        />
        <button type="button" onClick={() => playSound("default")}>
          Preview
        </button>
      </div>
    </>
  );
}
