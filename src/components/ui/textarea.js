import * as React from "react";
import { cn } from "@/lib/utils";
function Textarea({ className, ...props }) {
    return (<textarea data-slot="textarea" className={cn(
        // Recessed liquid-glass text field (see .glass-field in tailwind-theme.css)
        "glass-field placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-lg px-3 py-2 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "aria-invalid:border-destructive", className)} {...props}/>);
}
export { Textarea };
