"use client";

import { useState } from "react";

import { ActionButton, PanelSection } from "@/components/editor/controls";
import { SchemaForm } from "@/components/generation/schema-form";
import { type FieldValues, type ProviderInfo, defaultValues } from "@/lib/generation/api";
import { useI18n } from "@/lib/i18n";

/** The generation provider that writes notes rather than audio. */
export const ARRANGER_ID = "arranger";

/**
 * "Write an arrangement": drums, bass, chords, a melody, a pad and an arpeggio written as
 * notes on this computer. The form is built from the provider's own description of its
 * controls, and the result lands as one instrument track per part.
 */
export function ArrangeSection({
  providers,
  busy,
  projectTempo,
  projectKey,
  beatsPerBar,
  beatUnit,
  onRun
}: {
  providers: ProviderInfo[];
  busy: boolean;
  projectTempo: number | null;
  projectKey: string | null;
  beatsPerBar: number;
  beatUnit: 4 | 8;
  onRun: (params: Record<string, unknown>, title: string) => void;
}) {
  const { t } = useI18n();
  const provider = providers.find((p) => p.id === ARRANGER_ID && p.enabled) ?? null;
  const [edited, setEdited] = useState<FieldValues>({});
  const [open, setOpen] = useState(false);
  if (!provider) return null;

  const keyOptions = provider.schema.fields.find((field) => field.key === "key")?.options ?? [];
  const knownKey = keyOptions.some((option) => (typeof option === "string" ? option : option.value) === projectKey);
  // A project that already has music in it sets the tempo and key the new parts must fit.
  const values: FieldValues = {
    ...defaultValues(provider.schema),
    beats_per_bar: beatsPerBar,
    beat_unit: String(beatUnit),
    ...(projectTempo ? { bpm: Math.round(projectTempo) } : {}),
    ...(projectKey && knownKey ? { key: projectKey } : {}),
    ...edited
  };

  const run = () => {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== "") fields[key] = value;
    }
    onRun({ provider: provider.id, task: "arrange", title: "Arrangement", fields }, t("editor.arrange.working"));
  };

  return (
    <PanelSection
      title={t("editor.arrange.title")}
      help="write-an-arrangement"
      hint={t("editor.arrange.hint")}
    >
      {open ? (
        <>
          <SchemaForm
            schema={provider.schema}
            values={values}
            disabled={busy}
            onChange={(key, value) => setEdited((current) => ({ ...current, [key]: value }))}
          />
          <ActionButton variant="primary" className="w-full" disabled={busy} onClick={run}>
            {t("editor.arrange.run")}
          </ActionButton>
        </>
      ) : (
        <ActionButton variant="primary" className="w-full" onClick={() => setOpen(true)}>
          {t("editor.arrange.choose")}
        </ActionButton>
      )}
    </PanelSection>
  );
}
