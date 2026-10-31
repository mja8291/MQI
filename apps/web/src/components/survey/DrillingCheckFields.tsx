import {
  DRILLING_DONE_QUESTION,
  DRILLING_POINT_OPTIONS,
  DRILLING_POINT_QUESTION,
  DRILLING_REPAIR_QUESTION,
  SCREED_THICKNESS_LABEL,
  SCREED_UNSAFE_MM,
  SCREED_UNSAFE_NOTE,
  SITE_PHOTO_DRILLING_POINT,
  SITE_PHOTO_SLAB_THICKNESS,
  SLAB_ASSESSMENT_OPTIONS,
  SLAB_ASSESSMENT_QUESTION,
  SLAB_THICKNESS_LABEL,
  TOTAL_DEPTH_GUIDANCE,
  TOTAL_DEPTH_LABEL,
} from "@mqi/shared";
import type { DrillHole, DrillingCheck } from "@mqi/shared";
import { Field } from "@/components/ui/Field";
import { ReviewPhotoField } from "./ReviewPhotoField";

const INPUT = "w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink";

/** v2 (W45): each hole's first reading, with the standing guidance under it. */
function TotalDepthField({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <Field label={TOTAL_DEPTH_LABEL}>
      <input type="number" inputMode="decimal" min={0} step="any" placeholder="mm" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">{TOTAL_DEPTH_GUIDANCE}</p>
    </Field>
  );
}

/** Shown under a screed reading of 110 mm or more. */
function ScreedNote({ value }: { value: string }) {
  return Number(value) >= SCREED_UNSAFE_MM ? <p className="-mt-2 mb-3 text-[12px] leading-snug text-band-poor">{SCREED_UNSAFE_NOTE}</p> : null;
}

/**
 * The slab / roof-screeding drilling check ("Drilling & observation"). v2 (W27): asked while
 * scoring a Roof location instead of on the Review page; one answer per survey.
 */
export function DrillingCheckFields({ drilling, onChange }: { drilling: DrillingCheck; onChange: (value: DrillingCheck) => void }) {
  return (
    <>
      <Field label={DRILLING_DONE_QUESTION}>
        <select
          value={drilling.done}
          onChange={(e) => onChange({ ...drilling, done: e.target.value as DrillingCheck["done"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </Field>

      {drilling.done === "YES" ? (
        <div className="rounded-xl border border-border bg-card px-3 pt-3 mb-4">
          <Field label={DRILLING_POINT_QUESTION}>
            <select
              value={drilling.pointMarked}
              onChange={(e) => onChange({ ...drilling, pointMarked: e.target.value as DrillingCheck["pointMarked"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              {DRILLING_POINT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <ReviewPhotoField itemName={SITE_PHOTO_DRILLING_POINT} />

          <TotalDepthField value={drilling.totalDepthMm ?? ""} onChange={(v) => onChange({ ...drilling, totalDepthMm: v })} />

          <Field label={SLAB_THICKNESS_LABEL}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="mm"
              value={drilling.slabThicknessMm}
              onChange={(e) => onChange({ ...drilling, slabThicknessMm: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          </Field>

          <Field label={SLAB_ASSESSMENT_QUESTION}>
            <select
              value={drilling.slabAssessment ?? ""}
              onChange={(e) => onChange({ ...drilling, slabAssessment: e.target.value as DrillingCheck["slabAssessment"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              {SLAB_ASSESSMENT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <ReviewPhotoField itemName={SITE_PHOTO_SLAB_THICKNESS} />

          <Field label={SCREED_THICKNESS_LABEL}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="mm"
              value={drilling.screedThicknessMm}
              onChange={(e) => onChange({ ...drilling, screedThicknessMm: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          </Field>
          <ScreedNote value={drilling.screedThicknessMm} />

          {/* v2 (W36): further drill holes, each with its own readings. */}
          {(drilling.extraHoles ?? []).map((hole, i) => {
            const setHole = (patch: Partial<DrillHole>) =>
              onChange({ ...drilling, extraHoles: (drilling.extraHoles ?? []).map((h, j) => (j === i ? { ...h, ...patch } : h)) });
            return (
              <div key={i} className="rounded-xl border border-border bg-white px-3 pt-3 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-semibold text-ink">Drill hole {i + 2}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...drilling, extraHoles: (drilling.extraHoles ?? []).filter((_, j) => j !== i) })}
                    className="text-[12.5px] font-semibold text-band-poor underline"
                  >
                    Remove
                  </button>
                </div>
                <TotalDepthField
                  value={hole.totalDepthMm ?? ""}
                  onChange={(v) => setHole({ totalDepthMm: v })}
                  ariaLabel={`Drill hole ${i + 2}: total depth (mm)`}
                />
                <Field label={SLAB_THICKNESS_LABEL}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="mm"
                    aria-label={`Drill hole ${i + 2}: slab thickness (mm)`}
                    value={hole.slabThicknessMm}
                    onChange={(e) => setHole({ slabThicknessMm: e.target.value })}
                    className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
                  />
                </Field>
                <Field label={SLAB_ASSESSMENT_QUESTION}>
                  <select
                    aria-label={`Drill hole ${i + 2}: slab thickness assessment`}
                    value={hole.slabAssessment}
                    onChange={(e) => setHole({ slabAssessment: e.target.value as DrillHole["slabAssessment"] })}
                    className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
                  >
                    <option value="">Select an answer</option>
                    {SLAB_ASSESSMENT_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={SCREED_THICKNESS_LABEL}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="mm"
                    aria-label={`Drill hole ${i + 2}: roof screeding thickness (mm)`}
                    value={hole.screedThicknessMm}
                    onChange={(e) => setHole({ screedThicknessMm: e.target.value })}
                    className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
                  />
                </Field>
                <ScreedNote value={hole.screedThicknessMm} />
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onChange({ ...drilling, extraHoles: [...(drilling.extraHoles ?? []), { totalDepthMm: "", slabThicknessMm: "", screedThicknessMm: "", slabAssessment: "" }] })
            }
            className="mb-4 text-[13px] font-semibold text-brand-deep underline"
          >
            + Add another drill hole
          </button>

          <Field label={DRILLING_REPAIR_QUESTION}>
            <select
              value={drilling.holeRepaired}
              onChange={(e) => onChange({ ...drilling, holeRepaired: e.target.value as DrillingCheck["holeRepaired"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </Field>
        </div>
      ) : null}
    </>
  );
}
