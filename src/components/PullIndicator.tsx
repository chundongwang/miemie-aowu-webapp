import { forwardRef } from "react";

const PullIndicator = forwardRef<HTMLDivElement, { isRefreshing: boolean }>(
  ({ isRefreshing }, ref) => (
    <div
      ref={ref}
      style={{ height: 0, overflow: "hidden" }}
      data-ready="0"
      className="flex items-center justify-center [&[data-ready='1']_[data-arrow]]:rotate-180"
    >
      {isRefreshing ? (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[#2B4B8C] dark:border-t-blue-400 animate-spin" />
      ) : (
        <span
          data-arrow=""
          className="text-gray-400 dark:text-gray-500 text-lg leading-none transition-transform duration-150"
        >
          ↓
        </span>
      )}
    </div>
  )
);

PullIndicator.displayName = "PullIndicator";
export default PullIndicator;
