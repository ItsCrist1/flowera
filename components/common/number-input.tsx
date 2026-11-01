"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
    value: number | null;
    onValueChange: (value: number | null) => void;
    /** Allow clearing the field (value becomes null). */
    nullable?: boolean;
    integer?: boolean;
    min?: number;
    max?: number;
};

/**
 * A number field that keeps the text the user is typing (e.g. "-" or "1.") and only reports
 * valid numbers. Out-of-range values are clamped on blur.
 */
export function NumberInput({ value, onValueChange, nullable, integer, min, max, className, onBlur, ...rest }: Props) {
    const [text, setText] = useState(value === null ? "" : String(value));
    const [seen, setSeen] = useState(value);

    // Sync from outside changes without clobbering what the user is typing.
    if (seen !== value) {
        setSeen(value);
        const typed = text.trim() === "" ? null : Number(text.replace(",", "."));
        if (typed !== value) setText(value === null ? "" : String(value));
    }

    function commit(raw: string) {
        if (raw.trim() === "") {
            if (nullable) onValueChange(null);
            return;
        }
        let n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n)) return;
        if (integer) n = Math.round(n);
        onValueChange(n);
    }

    return (
        <Input
            {...rest}
            inputMode={integer ? "numeric" : "decimal"}
            className={cn("tabular-nums", className)}
            value={text}
            onChange={e => {
                setText(e.target.value);
                commit(e.target.value);
            }}
            onBlur={e => {
                let n = text.trim() === "" ? null : Number(text.replace(",", "."));
                if (n !== null && Number.isFinite(n)) {
                    if (integer) n = Math.round(n);
                    if (min !== undefined) n = Math.max(min, n);
                    if (max !== undefined) n = Math.min(max, n);
                    onValueChange(n);
                    setText(String(n));
                } else if (!nullable) {
                    setText(value === null ? "" : String(value));
                }
                onBlur?.(e);
            }}
        />
    );
}
