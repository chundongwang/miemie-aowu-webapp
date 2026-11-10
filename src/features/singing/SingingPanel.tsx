"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import RecordedLibrary from "./components/RecordedLibrary";
import { releaseAudioSession } from "./audio/native-session";
import "./studio.css";
import "./mobile.css";

export default function SingingPanel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
      void releaseAudioSession();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="singing-panel" aria-labelledby="singing-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="singing-panel-header">
      <div><span>🎤</span><div><h2 id="singing-title">练唱空间</h2><small>唱你的歌，找到自己的节奏</small></div></div>
      <button type="button" onClick={onClose} aria-label="关闭练唱空间并结束本次练习">关闭</button>
    </header>
    <div className="singing-panel-content"><RecordedLibrary /><p className="singing-close-note">暂停保留记录；关闭面板结束本次练习。声音在本机分析。</p></div>
  </dialog>, document.body);
}
