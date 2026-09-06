-- ═══════════════════════════════════════════════════════════════════════════
-- 27. The switch for looking outside
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Its own flag rather than riding on imprint_analysis, because the two carry
-- different risks and should be switchable apart.
--
-- The analysis reads a business's own answers: it is arithmetic, it costs a
-- few milliseconds, and it cannot say anything the customer did not already
-- tell us. The radar leaves the building. Every run spends money on searches,
-- takes minutes rather than milliseconds, and is the only part of this system
-- that writes a claim about the world.
--
-- So an organisation can have the analysis without the radar, which is the
-- combination to start with. Turning the radar on for one tenant and watching
-- what it admits and rejects is how it earns being turned on for the rest.
--
-- Additive: one row in a catalogue. Nothing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.feature_flags (key, name, description) values
  ('external_radar',
   'External market research',
   'Whether an analysis also searches the web for what is happening around this business. Off means the reading uses the Imprint and internal records only, and records the absence as a gap rather than leaving the radar silently empty. Costs money per run.')
on conflict (key) do nothing;
