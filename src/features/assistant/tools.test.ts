import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS, toolNames } from './tool-definitions';

/**
 * These assert the shape of the tool surface rather than what the executors
 * return — the executors read a database, and what matters here is the
 * contract handed to the model.
 *
 * The tenant assertion is the one that would matter most if it ever failed.
 */
describe('the Assistant tool surface', () => {
  it('offers the six things the brief asks it to be able to read', () => {
    expect(toolNames()).toEqual([
      'explain_figure',
      'read_brief',
      'read_imprint',
      'read_latest_analysis',
      'read_open_proposals',
      'read_twin_state',
    ]);
  });

  it('never lets the model name an organisation', () => {
    // The tenant comes from the session. A tool that accepted one would be a
    // tool the model can be talked into pointing elsewhere — by a scraped
    // market signal, a summarised document, or the customer's own message.
    for (const tool of ASSISTANT_TOOLS) {
      const properties = Object.keys(
        (tool.input_schema.properties ?? {}) as Record<string, unknown>,
      );
      for (const property of properties) {
        expect(property).not.toMatch(/organisation|organization|org_?id|tenant|customer_id/i);
      }
    }
  });

  it('has no tool that writes', () => {
    // The Assistant's only route to changing anything is a proposal a person
    // accepts. A write tool here would quietly undo migration 32's decision.
    for (const name of toolNames()) {
      expect(name).not.toMatch(/^(write|set|update|create|delete|apply|accept|save)_/);
    }
  });

  it('constrains every tool strictly, so an executor never meets a malformed argument', () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.strict, `${tool.name} is not strict`).toBe(true);
      expect(tool.input_schema.type).toBe('object');
      expect(
        (tool.input_schema as { additionalProperties?: unknown }).additionalProperties,
        `${tool.name} accepts extra properties`,
      ).toBe(false);
      expect(Array.isArray((tool.input_schema as { required?: unknown }).required)).toBe(true);
    }
  });

  it('requires every declared property that is not explicitly optional to be named', () => {
    // strict:true validates against `required`; a property that is neither
    // required nor documented as optional is a silent maybe.
    for (const tool of ASSISTANT_TOOLS) {
      const properties = (tool.input_schema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      const required = ((tool.input_schema as { required?: string[] }).required ?? []) as string[];
      for (const [name, schema] of Object.entries(properties)) {
        if (required.includes(name)) continue;
        expect(
          schema.description ?? '',
          `${tool.name}.${name} is optional but does not say so`,
        ).toMatch(/omit/i);
      }
    }
  });

  it('describes every tool, because the description is what the model reads', () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect((tool.description ?? '').length, `${tool.name} is undescribed`).toBeGreaterThan(80);
    }
  });

  it('tells the model what not to conclude, not just what the tool returns', () => {
    const byName = new Map(ASSISTANT_TOOLS.map((t) => [t.name, t.description ?? '']));

    // Each of these is a mistake the platform has designed against elsewhere;
    // the description is where the model is told about it.
    expect(byName.get('read_imprint')).toMatch(/not zero|must not be treated as zero/i);
    expect(byName.get('read_latest_analysis')).toMatch(/provisional/i);
    expect(byName.get('read_twin_state')).toMatch(/accura/i);
    expect(byName.get('read_open_proposals')).toMatch(/never tell somebody a change has been made/i);
  });
});
