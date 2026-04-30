"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/context/LocaleContext";
import { compressToJpeg, UPLOAD_SIZE_LIMIT } from "@/lib/imageUtils";

export type StagedPhoto = {
  file: File;
  previewUrl: string;
};

type Props = {
  photos: StagedPhoto[];
  onChange: (photos: StagedPhoto[]) => void;
  max?: number;
};

export default function PhotoUploadArea({ photos, onChange, max = 3 }: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canAdd = photos.length < max;
  const [compressing, setCompressing] = useState(false);

  // ── Paste from clipboard ────────────────────────────────────────────────────
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!canAdd) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) void addFile(file);
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, canAdd]);

  async function addFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (photos.length >= max) return;

    let finalFile = file;
    const isHeic = file.type.includes("heic") || file.type.includes("heif");
    if (isHeic || file.size > UPLOAD_SIZE_LIMIT) {
      setCompressing(true);
      try {
        finalFile = await compressToJpeg(file);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not compress image — try a JPEG or PNG");
        setCompressing(false);
        return;
      }
      setCompressing(false);
    }

    const previewUrl = URL.createObjectURL(finalFile);
    onChange([...photos, { file: finalFile, previewUrl }]);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].previewUrl);
    onChange(photos.filter((_, i) => i !== index));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (photos.length >= max) break;
      void addFile(file);
    }
    e.target.value = "";
  }

  function handleCameraButton() {
    // Check synchronously — browsers only allow input.click() within a direct user gesture.
    // Any await before the click loses the gesture context and the dialog is silently blocked.
    const isNative =
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Capacitor?.isNativePlatform?.();

    if (!isNative) {
      // Web: trigger file input immediately (still within the gesture)
      fileInputRef.current?.click();
      return;
    }

    // Native Capacitor: async is fine here since the native sheet isn't a browser dialog
    void (async () => {
      try {
        const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const image = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
        });
        if (!image.dataUrl) return;
        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        void addFile(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      } catch {
        // permission denied or cancelled — nothing to do
      }
    })();
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {t("photosLabel")} <span className="text-gray-400 font-normal">({t("photosHint", { max })})</span>
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {/* thumbnails */}
        {photos.map((p, i) => (
          <div key={p.previewUrl} className="relative w-20 h-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.previewUrl}
              alt=""
              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
            />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none hover:bg-red-500"
            >
              ×
            </button>
          </div>
        ))}

        {/* add button */}
        {canAdd && (
          <button
            type="button"
            onClick={handleCameraButton}
            disabled={compressing}
            className="w-20 h-20 shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-500 hover:text-gray-600 transition-colors disabled:opacity-60"
          >
            {compressing ? (
              <>
                <span className="text-xs text-center leading-tight px-1">Compressing<br/>Live Photo…</span>
              </>
            ) : (
              <>
                <span className="text-2xl leading-none">+</span>
                <span className="text-xs mt-1">{t("photoButton")}</span>
              </>
            )}
          </button>
        )}
      </div>

      {canAdd && (
        <p className="text-xs text-gray-400 mt-1.5">
          {navigator.platform?.includes("Mac") ? t("pasteHintMac") : t("pasteHintOther")}
        </p>
      )}

      {/* hidden file input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
