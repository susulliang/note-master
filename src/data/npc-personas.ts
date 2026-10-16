/**
 * NPC challenge personas — client-side registry. The system prompt runs
 * through the same remote DeepSeek pipeline as the transcript auto-parse /
 * Kitty Help (src/lib/kitty-help.ts kittyChat); the persona JSON is also
 * uploaded to the eco-data D1 `npc_personas` table by the Worker.
 */

import GB_POOLIUS from './npc/GB_Poolius.json';

export interface NpcPersona {
  system_prompt: string[];
  initial_output: { gb_message: string; agent_choices: string[]; status: string };
}

export const NPC_PERSONAS: Record<string, NpcPersona> = {
  gb_poolius: GB_POOLIUS as unknown as NpcPersona,
};
