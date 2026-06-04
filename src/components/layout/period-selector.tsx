"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_OPTIONS } from "@/lib/constants";
import { getSelectableMonths, getSelectableWeeks } from "@/lib/dates";

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  includeWeeks?: boolean;
  includeMonths?: boolean;
}

export function PeriodSelector({
  value,
  onChange,
  includeWeeks = true,
  includeMonths = true,
}: PeriodSelectorProps) {
  const weekOptions = includeWeeks ? getSelectableWeeks(10) : [];
  const monthOptions = includeMonths ? getSelectableMonths(18) : [];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[190px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-[#161b22] border-[#30363d] max-h-[420px]">
        <SelectGroup>
          <SelectLabel className="text-[#8b949e]">Quick ranges</SelectLabel>
          {PERIOD_OPTIONS.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>

        {monthOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[#8b949e]">Actual months</SelectLabel>
            {monthOptions.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {weekOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[#8b949e]">Actual weeks</SelectLabel>
            {weekOptions.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
