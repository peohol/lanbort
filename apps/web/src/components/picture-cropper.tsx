"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { BusyButton } from "@/components/busy-button";
import { Field } from "@/components/field";
import {
  clampCrop,
  type Crop,
  drawCrop,
  type FrameBox,
  type ImageSize,
  initialCrop,
  maxZoom,
  type PictureShape,
  traceFrame,
} from "@/presentation/picture-crop";

/** The editor's square view, in CSS pixels; the frame fills most of it. */
const stageSize = 288;
const frameShare = 0.8;

/** Where the frame lies in the view, centred and as large as it fits. */
function stageFrame(size: number, shape: PictureShape): FrameBox {
  const width = size * frameShare * Math.min(1, shape.aspectRatio);
  const height = width / shape.aspectRatio;

  return { left: (size - width) / 2, top: (size - height) / 2, width };
}

/** Keyboard steps: a small move, zoom and turn, larger with Shift. */
function keyCrop(
  crop: Crop,
  key: string,
  large: boolean,
  rotatable: boolean,
): Crop | null {
  const move = large ? 0.1 : 0.02;
  const turn = large ? 15 : 1;
  const zoom = large ? 1.25 : 1.05;

  switch (key) {
    case "ArrowLeft":
      return { ...crop, x: crop.x - move };
    case "ArrowRight":
      return { ...crop, x: crop.x + move };
    case "ArrowUp":
      return { ...crop, y: crop.y - move };
    case "ArrowDown":
      return { ...crop, y: crop.y + move };
    case "+":
    case "=":
      return { ...crop, zoom: crop.zoom * zoom };
    case "-":
      return { ...crop, zoom: crop.zoom / zoom };
    case "[":
      return rotatable ? { ...crop, rotation: crop.rotation - turn } : null;
    case "]":
      return rotatable ? { ...crop, rotation: crop.rotation + turn } : null;
    default:
      return null;
  }
}

interface Touch {
  x: number;
  y: number;
}

/**
 * Places a photo in a frame of `shape`: a profile picture (PS-USR-002) or
 * a thing's main picture (PS-OBJ-002). Move it by dragging or with the
 * arrow keys, zoom with two fingers, the wheel or the slider, and, where
 * `rotatable`, turn it with two fingers, the slider or a quarter turn at a
 * time. The view is drawn by the same code as what is kept, in the same
 * shape as the picture is shown in the app.
 */
export function PictureCropper({
  photo,
  shape,
  rotatable = true,
  initial = initialCrop,
  saveLabel,
  saving = false,
  onSave,
  onCancel,
}: {
  photo: ImageBitmap;
  shape: PictureShape;
  rotatable?: boolean;
  /** Where the photo lies when the editor opens. */
  initial?: Crop;
  saveLabel: string;
  saving?: boolean;
  onSave: (crop: Crop) => void;
  onCancel: () => void;
}) {
  const image: ImageSize = photo;
  const frame = useMemo(() => stageFrame(stageSize, shape), [shape]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const touches = useRef(new Map<number, Touch>());
  const [crop, setCrop] = useState(() => clampCrop(image, initial, shape));
  const id = useId();
  const place = (next: Crop) => setCrop(clampCrop(image, next, shape));

  useEffect(() => {
    const view = canvas.current;
    const context = view?.getContext("2d");
    if (!view || !context) return;

    const ratio = window.devicePixelRatio || 1;
    view.width = Math.round(stageSize * ratio);
    view.height = Math.round(stageSize * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, stageSize, stageSize);
    drawCrop(context, photo, image, crop, frame, shape);
    // What falls outside the frame is dimmed, not hidden, so one sees
    // what there is to move into it.
    context.beginPath();
    context.rect(0, 0, stageSize, stageSize);
    traceFrame(context, frame, shape);
    context.fillStyle = "rgb(0 0 0 / 0.6)";
    context.fill("evenodd");
    context.beginPath();
    traceFrame(context, frame, shape);
    context.strokeStyle = "rgb(255 255 255 / 0.9)";
    context.lineWidth = 2;
    context.stroke();
  }, [photo, image, crop, frame, shape]);

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    touches.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = touches.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    const others = [...touches.current.entries()].filter(
      ([id]) => id !== event.pointerId,
    );
    touches.current.set(event.pointerId, current);

    if (others.length === 0) {
      place({
        ...crop,
        x: crop.x + (current.x - previous.x) / frame.width,
        y: crop.y + (current.y - previous.y) / frame.width,
      });
      return;
    }

    // Two fingers: the change in their distance zooms, in their angle turns.
    const anchor = others[0]![1];
    const before = { x: previous.x - anchor.x, y: previous.y - anchor.y };
    const after = { x: current.x - anchor.x, y: current.y - anchor.y };
    const distance = (v: Touch) => Math.hypot(v.x, v.y) || 1;
    const angle = (v: Touch) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
    place({
      ...crop,
      zoom: crop.zoom * (distance(after) / distance(before)),
      rotation: rotatable
        ? crop.rotation + angle(after) - angle(before)
        : crop.rotation,
    });
  }

  function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
    touches.current.delete(event.pointerId);
  }

  function keyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const next = keyCrop(crop, event.key, event.shiftKey, rotatable);
    if (!next) return;
    event.preventDefault();
    place(next);
  }

  useEffect(() => {
    const view = canvas.current;
    if (!view) return;
    // Not passive, so the wheel zooms the picture instead of the page.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setCrop((current) =>
        clampCrop(
          image,
          {
            ...current,
            zoom: current.zoom * Math.exp(-event.deltaY * 0.002),
          },
          shape,
        ),
      );
    };
    view.addEventListener("wheel", wheel, { passive: false });
    return () => view.removeEventListener("wheel", wheel);
  }, [image, shape]);

  return (
    <div className="picture-cropper">
      <canvas
        ref={canvas}
        className="picture-stage"
        style={{ width: stageSize, height: stageSize }}
        tabIndex={0}
        role="img"
        aria-label="Utsnitt av bildet"
        aria-describedby={`${id}-hjelp`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onKeyDown={keyDown}
      />
      <p id={`${id}-hjelp`} className="help">
        {rotatable
          ? "Dra bildet for å flytte det, og bruk to fingre for å zoome og rotere. Med tastaturet flytter piltastene bildet, + og − zoomer, og [ og ] roterer."
          : "Dra bildet for å flytte det, og bruk to fingre for å zoome. Med tastaturet flytter piltastene bildet, og + og − zoomer."}
      </p>
      <Field id={`${id}-zoom`} label="Zoom">
        <input
          id={`${id}-zoom`}
          type="range"
          min={1}
          max={maxZoom}
          step={0.01}
          value={crop.zoom}
          onChange={(event) =>
            place({ ...crop, zoom: Number(event.target.value) })
          }
        />
      </Field>
      {rotatable && (
        <Field
          id={`${id}-rotasjon`}
          label={`Rotasjon: ${Math.round(crop.rotation)}°`}
        >
          <input
            id={`${id}-rotasjon`}
            type="range"
            min={-180}
            max={180}
            step={1}
            value={crop.rotation}
            onChange={(event) =>
              place({ ...crop, rotation: Number(event.target.value) })
            }
          />
        </Field>
      )}
      <div className="actions">
        {rotatable && (
          <button
            type="button"
            onClick={() => place({ ...crop, rotation: crop.rotation + 90 })}
          >
            Roter en kvart omdreining
          </button>
        )}
        <button type="button" onClick={() => setCrop(initialCrop)}>
          Tilbakestill
        </button>
      </div>
      <div className="actions">
        <BusyButton
          type="button"
          className="button-primary"
          busy={saving}
          onClick={() => onSave(crop)}
        >
          {saveLabel}
        </BusyButton>
        <button type="button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  );
}
