"use client";

import { useState, useRef, useEffect } from "react";
import type { EmojiCategory } from "@/lib/emojis";

type Props = {
  value: string;
  onChange: (emoji: string) => void;
  quickEmojis: string[];
  moreEmojis: EmojiCategory[];
};

export default function EmojiPicker({ value, onChange, quickEmojis, moreEmojis }: Props) {
  const [showMore, setShowMore] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMore]);

  function pick(e: string) {
    onChange(value === e ? "" : e);
    setShowMore(false);
  }

  return (
    <div className="relative" ref={pickerRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {quickEmojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(value === e ? "" : e)}
            className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              value === e
                ? "bg-[#2B4B8C]/10 ring-2 ring-[#2B4B8C]/40"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors ${
            showMore
              ? "bg-[#2B4B8C]/10 text-[#2B4B8C]"
              : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          ···
        </button>
      </div>

      {showMore && (
        <div className="absolute top-11 left-0 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-3 w-72 max-h-72 overflow-y-auto">
          {moreEmojis.map(({ label, emojis }) => (
            <div key={label} className="mb-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1.5 px-1">{label}</p>
              <div className="flex flex-wrap gap-1">
                {emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => pick(e)}
                    className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      value === e
                        ? "bg-[#2B4B8C]/10 ring-2 ring-[#2B4B8C]/40"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
