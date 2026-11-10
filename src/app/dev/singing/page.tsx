import { notFound } from 'next/navigation';
import SingingFAB from '@/components/SingingFAB';

// Local layout/audio verification without creating or modifying user accounts.
export default function SingingPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <main className="min-h-dvh bg-[#f5f5ef] p-8"><h1 className="text-xl">练唱空间 · 本地预览</h1><p className="mt-3 text-gray-500">点击麦克风打开面板</p><div className="fixed bottom-6 right-6"><SingingFAB /></div></main>;
}
