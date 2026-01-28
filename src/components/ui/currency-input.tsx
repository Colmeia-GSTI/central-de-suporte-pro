import * as React from "react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { formatCurrencyBRL, parseCurrencyBRL, maskCurrencyBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, disabled, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState(formatCurrencyBRL(value || 0));

    useEffect(() => {
      setDisplayValue(formatCurrencyBRL(value || 0));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskCurrencyBRL(e.target.value);
      setDisplayValue(masked);
      onChange(parseCurrencyBRL(masked));
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
          R$
        </span>
        <Input
          ref={ref}
          {...props}
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          className={cn("pl-10 text-right font-mono", className)}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
