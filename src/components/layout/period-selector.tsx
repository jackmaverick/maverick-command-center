"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_OPTIONS } from "@/lib/constants";

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-[#161b22] border-[#30363d]">
        {PERIOD_OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
