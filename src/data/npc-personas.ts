/**
 * NPC challenge personas — client-side registry. Each persona's system prompt
 * runs through the same remote DeepSeek pipeline as the transcript auto-parse /
 * Kitty Help (src/lib/kitty-help.ts kittyChat); the persona JSON is also
 * uploaded to the eco-data D1 `npc_personas` table by the Worker.
 *
 * Personas may name their message field differently in the required JSON
 * ('gb_message' vs 'topus_message') — `messageKey` tells the parser which
 * field holds the NPC's line.
 */

import GB_POOLIUS from './npc/GB_Poolius.json';
import TOPUS_HUNDRIUS from './npc/Topus_Hundrius.json';

export interface NpcPersona {
  system_prompt: string[];
  /** Opening turn — the message lives under the persona's messageKey. */
  initial_output: Record<string, unknown>;
}

export interface NpcPersonaEntry {
  data: NpcPersona;
  name: string;
  messageKey: string;
  /** One-liner shown under the challenge modal's title. */
  blurb: string;
}

export const NPC_PERSONAS: Record<string, NpcPersonaEntry> = {
  gb_poolius: {
    data: GB_POOLIUS as unknown as NpcPersona,
    name: 'GB Poolius',
    messageKey: 'gb_message',
    blurb: 'A furious pool-robot owner on the line. Talk him down — pick one reply per turn.',
  },
  topus_hundrius: {
    data: TOPUS_HUNDRIUS as unknown as NpcPersona,
    name: 'Topus Hundrius',
    messageKey: 'topus_message',
    blurb: 'A needy, loyal regular angling for freebies. Stay polite, hold the line, offer a small concession.',
  },
};
