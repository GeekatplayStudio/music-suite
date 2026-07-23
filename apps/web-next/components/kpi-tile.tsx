import { Card, CardContent } from "@/components/ui/card";

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function KpiTile({ label, value, hint }: KpiTileProps) {
  return (
    <Card className="border-border/80">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 display-font text-2xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
