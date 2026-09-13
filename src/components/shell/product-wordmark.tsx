import Image from 'next/image';
import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils/cn';

/**
 * A product name, set as the supplied artwork rather than as type.
 *
 * The three product names are drawn files in the brand pack, not strings with
 * styling rules attached — Amryn in the bold weight, the product in the
 * regular, the closing word in brand blue, the ™ and ® at their own size and
 * position. Setting that in CSS means reproducing a drawing from memory, and
 * it drifts: the platform was setting `Amryn™DigitalTwin®` in Outfit at one
 * weight, which is the right words in the wrong voice.
 *
 * ── where this belongs, and where it does not ─────────────────────────────
 * Here: page headers and any other place the name is the *title* of something.
 * Not: running prose. A sentence that mentions the Digital Twin wants a word,
 * not a picture — an image inline cannot wrap, cannot be selected, cannot be
 * translated, and cannot take the surrounding size. Those stay as text with
 * the `.tm` treatment, which is what that class is for.
 *
 * The words go to a screen reader and the picture is hidden from it, so the
 * name is read correctly whichever way it is rendered.
 */
const WORDMARKS = {
  'digital-twin': {
    file: 'amryn-product-digital-twin',
    label: 'Amryn™DigitalTwin®',
    width: 531,
  },
  'opportunity-radar': {
    file: 'amryn-product-opportunity-radar',
    label: 'Amryn™OpportunityRadar®',
    width: 716,
  },
  aigrowthintelligence: {
    file: 'amryn-product-aigrowthintelligence',
    label: 'AIGrowthIntelligence® Software',
    width: 808,
  },
} as const;

export type ProductName = keyof typeof WORDMARKS;

export function ProductWordmark({
  name,
  className,
  priority = false,
}: {
  name: ProductName;
  /** Height is the only dimension worth setting; the width follows the art. */
  className?: string;
  priority?: boolean;
}) {
  const mark = WORDMARKS[name];
  return (
    <>
      {/* Supplied artwork only — never recoloured, stretched or outlined. */}
      <Image
        src={withBasePath(`/brand/${mark.file}.png`)}
        alt=""
        aria-hidden
        width={mark.width}
        height={56}
        priority={priority}
        className={cn('block h-7 w-auto sm:h-8', className)}
      />
      <span className="sr-only">{mark.label}</span>
    </>
  );
}
