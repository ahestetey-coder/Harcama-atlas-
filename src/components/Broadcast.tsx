import { ExternalLink } from "lucide-react";
import type { Broadcast } from "../cloud/coach";
import { Badge } from "./ui/primitives";

const KIND_TONE = {
  haber: "neutral",
  yorum: "accent",
  tahmin: "warning",
} as const;
const KIND_LABEL = {
  haber: "Haber",
  yorum: "Yorum",
  tahmin: "Tahmin",
} as const;

/** Günlük ekonomi özeti: her madde türü, kaynağı ve tarihiyle. */
export function BroadcastBody({ b }: { b: Broadcast }) {
  return (
    <>
      {b.summary && <p className="mt-0.5 text-muted">{b.summary}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {b.items.map((it, i) => (
          <li key={i} className="rounded-xl bg-surface px-3 py-2">
            <div className="flex items-start gap-2">
              <Badge tone={KIND_TONE[it.kind]}>{KIND_LABEL[it.kind]}</Badge>
              <span className="text-[13px] text-ink">{it.text}</span>
            </div>
            <a
              href={/^https?:\/\//i.test(it.url) ? it.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-subtle hover:text-accent"
            >
              {it.source} ·{" "}
              {new Date(it.publishedAt).toLocaleString("tr-TR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
