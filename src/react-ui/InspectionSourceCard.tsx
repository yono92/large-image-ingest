import type { ReactElement, ReactNode } from "react";
import { useInspectionUploadUi } from "./context.js";
import type { PreviewDerivativeDescriptor } from "./types.js";

export interface InspectionSourceCardProps {
  readonly preview?: PreviewDerivativeDescriptor | undefined;
  readonly previewSlot?: ReactNode | undefined;
}

export function InspectionSourceCard({ preview, previewSlot }: InspectionSourceCardProps): ReactElement {
  const { actions, labels, state } = useInspectionUploadUi();
  const source = state.source;
  return (
    <section className="lii-source" aria-labelledby="lii-source-heading">
      <h2 id="lii-source-heading" className="lii-section-title">{labels.sourceHeading}</h2>
      {source ? (
        <>
          <dl className="lii-source-details">
            <div><dt>Name</dt><dd title={source.name}>{source.name}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(source.sizeBytes)}</dd></div>
            <div><dt>Type</dt><dd>{source.mediaType}</dd></div>
          </dl>
          {preview ? (
            <figure className="lii-preview" data-lii-kind="derivative">
              <img
                src={preview.src}
                alt={preview.decorative ? "" : preview.alt ?? labels.sourceDerivative}
              />
              <figcaption>{preview.statusLabel ?? labels.sourceDerivative}</figcaption>
            </figure>
          ) : previewSlot ? <div data-lii-kind="derivative">{previewSlot}</div> : null}
          {state.controls.canRemove ? (
            <button className="lii-button" type="button" onClick={() => actions.removeSource()}>
              {labels.remove}
            </button>
          ) : null}
        </>
      ) : <p className="lii-muted">{labels.noSource}</p>}
    </section>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}
