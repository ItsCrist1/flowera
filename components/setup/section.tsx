import { cn } from "@/lib/utils";

/** A titled block used across the setup panels. */
export function Section({ title, description, children, className, action }: {
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <section className={cn("flex flex-col gap-4 border bg-card/50 p-5", className)}>
            <header className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
                    {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
                </div>
                {action}
            </header>
            {children}
        </section>
    );
}

/** A label + control row with an optional hint. */
export function Field({ label, hint, children, htmlFor, inline }: {
    label: React.ReactNode;
    hint?: React.ReactNode;
    children: React.ReactNode;
    htmlFor?: string;
    inline?: boolean;
}) {
    return (
        <div className={cn("flex gap-2", inline ? "items-center justify-between" : "flex-col")}>
            <div className="flex flex-col gap-0.5">
                <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}
