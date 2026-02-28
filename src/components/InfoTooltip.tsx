"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InfoTooltip({
  label,
  explanation,
  children,
}: {
  label: string;
  explanation: string;
  children?: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            {children ?? (
              <span className="text-xs font-medium text-[#8b949e]">
                {label}
              </span>
            )}
            <span className="text-xs text-[#484f58] font-bold">ⓘ</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs bg-[#21262d] border-[#30363d]">
          <p className="text-xs text-[#e6edf3]">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
