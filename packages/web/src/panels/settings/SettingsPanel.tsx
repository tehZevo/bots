import { useEffect, useRef, useState } from "react";
import { SpendCapSection } from "./SpendCapSection.tsx";

const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "Providers" },
  { id: "system", label: "System" },
];

import { anyDirtyLabel, useNavGuard } from "../../components/ui/discard.tsx";
import { TabNav } from "../../components/ui/TabNav.tsx";
import { titleCase } from "../../lib/format.ts";
import { ProvidersSection } from "../../panels/settings/ProvidersSection.tsx";
import type { SettingsTab } from "../../types.ts";
export function settingsHref(tab: SettingsTab): string {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`;
}

export function settingsTabFromLocation(): SettingsTab {
  if (typeof location === "undefined") return "general";
  const value = new URLSearchParams(location.search).get("tab");
  return SETTINGS_TABS.some((x) => x.id === value)
    ? (value as SettingsTab)
    : "general";
}

import { PasswordSettings, SessionSettings } from "../../auth.tsx";
import { PushSection } from "../../push.tsx";

import { ApiKeysSection } from "./ApiKeysSection.tsx";
import { AuditRetentionSection } from "./AuditRetentionSection.tsx";
import { ConfigBackupSection } from "./ConfigBackupSection.tsx";
import { ControlMcpSection } from "./ControlMcpSection.tsx";
import { EventDestinationsSection } from "./EventDestinationsSection.tsx";
import { SandboxCapsSection } from "./SandboxCapsSection.tsx";
import { SandboxIdleSection } from "./SandboxIdleSection.tsx";
import { SoundsSection } from "./SoundsSection.tsx";
import { ThemeSection } from "./ThemeSection.tsx";
export function SettingsPanel() {
  const guard = useNavGuard();
  const [sub, setSub] = useState<SettingsTab>(settingsTabFromLocation);
  const subRef = useRef(sub);

  useEffect(() => {
    subRef.current = sub;
  }, [sub]);

  useEffect(() => {
    if (typeof addEventListener === "undefined") return;
    const onPop = () => {
      if (location.pathname.replace(/\/+$/, "") !== "/settings") return;
      const target = settingsTabFromLocation();
      if (target === subRef.current) return;
      if (anyDirtyLabel())
        history.pushState({}, "", settingsHref(subRef.current));
      guard(() => setSub(target));
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [guard]);

  const switchTab = (next: SettingsTab) => {
    if (next === sub) return;
    guard(() => {
      setSub(next);
      if (typeof history !== "undefined")
        history.pushState({}, "", settingsHref(next));
    });
  };

  return (
    <section>
      <div className="mainhead"></div>
      <TabNav
        tabs={SETTINGS_TABS}
        selected={sub}
        onSelect={(id) => switchTab(id as SettingsTab)}
        ariaLabel="Settings sections"
      />
      <div
        className="tabbody settingstab"
        role="tabpanel"
        aria-label={`${titleCase(sub)} settings`}
      >
        {sub === "general" && <SettingsGeneral key="general" />}
        {sub === "providers" && <ProvidersSection key="providers" />}
        {sub === "system" && <SettingsSystem key="system" />}
      </div>
    </section>
  );
}

export function SettingsGeneral() {
  return (
    <>
      <PasswordSettings />
      <ThemeSection />
      <SandboxIdleSection />
      <SandboxCapsSection />
      <AuditRetentionSection />
      <SpendCapSection />
      <SoundsSection />
      <PushSection />
    </>
  );
}

export function SettingsSystem() {
  return (
    <>
      <SessionSettings />
      <ApiKeysSection />
      <ConfigBackupSection />
      <ControlMcpSection />
      <EventDestinationsSection />
    </>
  );
}
