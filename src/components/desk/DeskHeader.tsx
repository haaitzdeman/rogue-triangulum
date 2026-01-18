"use client";

interface DeskHeaderProps {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    description: string;
    stats: Array<{ label: string; value: string }>;
}

export function DeskHeader({ title, icon: Icon, color, description, stats }: DeskHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-card-border">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg bg-${color}/20`}>
                    <Icon className={`w-8 h-8 text-${color}`} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">{title}</h1>
                    <p className="text-sm text-foreground-muted">{description}</p>
                </div>
            </div>

            <div className="flex gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="text-right">
                        <div className="text-lg font-semibold">{stat.value}</div>
                        <div className="text-xs text-foreground-muted">{stat.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
