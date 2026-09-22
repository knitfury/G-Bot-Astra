"use client";
import { useEffect, useState, type InputHTMLAttributes } from "react";
// Keep local feedback immediate while the service commits, and roll back failures.
export function AsyncCheckbox({
  checked,
  onCheckedChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "checked" | "type"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void | Promise<unknown>;
}) {
  const [value, setValue] = useState(checked),
    [saving, setSaving] = useState(false);
  useEffect(() => setValue(checked), [checked]);
  return (
    <input
      {...props}
      type="checkbox"
      checked={value}
      disabled={props.disabled || saving}
      onChange={(e) => {
        const next = e.currentTarget.checked;
        setValue(next);
        setSaving(true);
        Promise.resolve(onCheckedChange(next))
          .catch(() => setValue(checked))
          .finally(() => setSaving(false));
      }}
    />
  );
}
