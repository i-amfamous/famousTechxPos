import { useRef, useState } from "react";
import { LuCamera, LuImagePlus, LuTrash2, LuUpload } from "react-icons/lu";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";

/**
 * Reads a file (or a camera capture), resizes it in the browser and returns a compact JPEG data URL.
 * Keeping it as a data URL means product photos survive deploys — no ephemeral upload folder on Render.
 */
export async function prepareImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not decode the image"));
    image.onload = () => resolve(image);
    image.src = source;
  });

  let best = "";
  for (const [max, quality] of [[900, 0.82], [700, 0.72], [520, 0.62], [400, 0.55]] as const) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    best = canvas.toDataURL("image/jpeg", quality);
    if (best.length <= 60_000) break;
  }
  return best;
}

export function ProductImagePicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    if (file.size > 12 * 1024 * 1024) { setError("That image is too large. Choose one under 12 MB."); return; }
    setBusy(true);
    setError(null);
    try {
      onChange(await prepareImage(file));
    } catch {
      setError("Couldn't read that image. Try another one.");
    } finally {
      setBusy(false);
    }
  };

  const reset = (el: HTMLInputElement) => { el.value = ""; };

  return (
    <div>
      <div className={cn("relative flex size-28 items-center justify-center overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-200", disabled && "opacity-60")}>
        {value ? <img src={value} alt="Product preview" className="size-full object-cover" /> : <LuImagePlus className="size-8 text-ink-400" />}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/80 text-xs text-brand-700">
            <Spinner className="size-5" /> Preparing…
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<LuUpload className="size-4" />} disabled={disabled || busy} onClick={() => fileInput.current?.click()}>Choose file</Button>
        <Button size="sm" variant="secondary" icon={<LuCamera className="size-4" />} disabled={disabled || busy} onClick={() => cameraInput.current?.click()}>Take photo</Button>
        {value && <Button size="sm" variant="dangerGhost" icon={<LuTrash2 className="size-4" />} disabled={disabled || busy} onClick={() => onChange("")}>Remove</Button>}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose product photo"
        disabled={disabled}
        onChange={(e) => { void pick(e.target.files?.[0]); reset(e.currentTarget); }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take product photo"
        disabled={disabled}
        onChange={(e) => { void pick(e.target.files?.[0]); reset(e.currentTarget); }}
      />
      {error && <p className="mt-1 text-xs font-medium text-rose-600" role="alert">{error}</p>}
      <p className="mt-1 text-[11px] leading-snug text-ink-400">Photos are resized and saved with the product. Works offline after upload.</p>
    </div>
  );
}
