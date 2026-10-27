export async function isChatRoomMember(
  env: Env,
  username: string,
  roomId: string,
): Promise<boolean> {
  if (roomId === 'global') return true;
  const direct = await env.DB.prepare(
    'SELECT 1 AS found FROM chat_conversations WHERE username = ? COLLATE NOCASE AND room_id = ? LIMIT 1',
  ).bind(username, roomId).first<{ found: number }>();
  if (direct) return true;
  const group = await env.DB.prepare(
    'SELECT 1 AS found FROM chat_group_members WHERE username = ? COLLATE NOCASE AND room_id = ? LIMIT 1',
  ).bind(username, roomId).first<{ found: number }>();
  return !!group;
}

export async function getChatRoomMembers(env: Env, roomId: string): Promise<string[]> {
  if (roomId === 'global') return [];
  if (roomId.startsWith('dm-')) {
    const result = await env.DB.prepare(
      'SELECT username FROM chat_conversations WHERE room_id = ? ORDER BY username COLLATE NOCASE',
    ).bind(roomId).all<{ username: string }>();
    return (result.results ?? []).map((row) => row.username);
  }
  const result = await env.DB.prepare(
    'SELECT username FROM chat_group_members WHERE room_id = ? ORDER BY username COLLATE NOCASE',
  ).bind(roomId).all<{ username: string }>();
  return (result.results ?? []).map((row) => row.username);
}
