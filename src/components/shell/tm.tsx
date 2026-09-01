/**
 * Trademark superscripts.
 *
 * Amryn™, AIGrowthIntelligence®, DigitalTwin® and OpportunityRadar® are marks,
 * and a mark set at the same size as the word beside it stops reading as one.
 * The `.tm` class in globals.css fixes the size and baseline so the superscript
 * never scales with its surrounding text.
 *
 * The marks are written without a space before the symbol, matching the
 * marketing site and the workbooks exactly.
 */

export function TM({ children, mark = '™' }: { children: string; mark?: '™' | '®' }) {
  return (
    <>
      {children}
      <sup className="tm">{mark}</sup>
    </>
  );
}

export function Amryn() {
  return <TM>Amryn</TM>;
}

export function DigitalTwin() {
  return <TM mark="®">DigitalTwin</TM>;
}

export function OpportunityRadar() {
  return <TM mark="®">OpportunityRadar</TM>;
}

export function AIGrowthIntelligence() {
  return <TM mark="®">AIGrowthIntelligence</TM>;
}

/** The full product lockup, as it appears in headers and the PDF. */
export function AmrynLockup() {
  return (
    <>
      <Amryn /> <AIGrowthIntelligence />
    </>
  );
}
