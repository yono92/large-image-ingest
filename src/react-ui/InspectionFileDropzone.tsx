import { useId, useState, type ChangeEvent, type DragEvent, type ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";

export interface InspectionFileDropzoneProps {
  readonly accept?: string | undefined;
  readonly guidance?: ReactElement | string | undefined;
}

export function InspectionFileDropzone({ accept, guidance }: InspectionFileDropzoneProps): ReactElement {
  const { actions, labels, state } = useInspectionUploadUi();
  const inputId = useId();
  const [selectionError, setSelectionError] = useState<string>();

  const select = (files: FileList | readonly File[]): void => {
    if (files.length !== 1) {
      setSelectionError(labels.multipleFilesRejected);
      return;
    }
    const file = files[0];
    if (!file) return;
    setSelectionError(undefined);
    void actions.selectFile(file).catch(() => undefined);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (event.currentTarget.files) select(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!state.controls.canSelect) return;
    select(event.dataTransfer.files);
  };

  return (
    <section className="lii-dropzone" aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className="lii-section-title">{labels.chooseFile}</h2>
      <div
        className="lii-dropzone-target"
        data-lii-disabled={!state.controls.canSelect || undefined}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <span>{labels.dropFile}</span>
        <label className="lii-button lii-button-primary" htmlFor={inputId}>{labels.chooseFile}</label>
        <input
          id={inputId}
          className="lii-file-input"
          type="file"
          accept={accept}
          disabled={!state.controls.canSelect}
          onChange={onChange}
        />
      </div>
      {guidance ? <div className="lii-guidance">{guidance}</div> : null}
      {selectionError ? <p className="lii-inline-error" role="alert">{selectionError}</p> : null}
    </section>
  );
}
