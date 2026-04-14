"use client";

import { useEffect, useRef } from "react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canAdd = photos.length < max;

  // ── Paste from clipboard ────────────────────────────────────────────────────
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!canAdd) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) addFile(file);
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, canAdd]);

  function addFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (photos.length >= max) return;
    const previewUrl = URL.createObjectURL(file);
    onChange([...photos, { file, previewUrl }]);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].previewUrl);
    onChange(photos.filter((_, i) => i !== index));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (photos.length >= max) break;
      addFile(file);
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
        addFile(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      } catch {
        // permission denied or cancelled — nothing to do
      }
    })();
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Photos <span className="text-gray-400 font-normal">(optional, up to {max})</span>
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
            className="w-20 h-20 shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-500 hover:text-gray-600 transition-colors"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-xs mt-1">photo</span>
          </button>
        )}
      </div>

      {canAdd && (
        <p className="text-xs text-gray-400 mt-1.5">
          Or paste an image with {navigator.platform?.includes("Mac") ? "⌘V" : "Ctrl+V"}
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
