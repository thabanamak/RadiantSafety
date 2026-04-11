import type { SupabaseClient } from "@supabase/supabase-js";

export type FriendMemberRosterEntry = {
  device_id: string;
  name: string;
};

/** Stored in `members` jsonb — host is whoever created the room (first joiner). */
export type FriendMembersPayload = {
  host_device_id: string;
  people: FriendMemberRosterEntry[];
};

type LocationRow = {
  id: string;
  device_id: string;
  host_name: string;
  members: unknown;
};

/**
 * Parse `members` from DB: new shape `{ host_device_id, people }` or legacy array.
 */
export function parseFriendMembersPayload(raw: unknown): {
  host_device_id: string | null;
  people: FriendMemberRosterEntry[];
} {
  if (raw == null) return { host_device_id: null, people: [] };
  if (Array.isArray(raw)) {
    const arr = raw as FriendMemberRosterEntry[];
    return {
      host_device_id: arr[0]?.device_id ?? null,
      people: arr.filter((p) => p?.device_id),
    };
  }
  if (typeof raw === "object" && raw !== null && "host_device_id" in raw) {
    const o = raw as Partial<FriendMembersPayload>;
    const people = Array.isArray(o.people)
      ? (o.people as FriendMemberRosterEntry[]).filter((p) => p?.device_id)
      : [];
    const hid =
      typeof o.host_device_id === "string" && o.host_device_id.length > 0
        ? o.host_device_id
        : people[0]?.device_id ?? null;
    return { host_device_id: hid, people };
  }
  return { host_device_id: null, people: [] };
}

/**
 * Rebuilds `members` jsonb on every row in a room.
 * The host is the room creator (first device in an empty room); preserved in payload afterward.
 */
export async function syncFriendRoomMembers(
  supabase: SupabaseClient,
  roomCode: string,
  options?: { roomCreatorDeviceId?: string }
): Promise<{ error: string | null }> {
  const code = roomCode.toUpperCase();
  const { data: rows, error: selErr } = await supabase
    .from("friend_locations")
    .select("id, device_id, host_name, members")
    .eq("room_code", code);

  if (selErr) return { error: selErr.message };
  if (!rows?.length) return { error: null };

  const list = rows as LocationRow[];

  let hostDeviceId: string | null = null;

  const creator = options?.roomCreatorDeviceId;
  if (creator && list.some((r) => r.device_id === creator)) {
    hostDeviceId = creator;
  }

  if (!hostDeviceId) {
    for (const row of list) {
      const parsed = parseFriendMembersPayload(row.members);
      if (parsed.host_device_id && list.some((r) => r.device_id === parsed.host_device_id)) {
        hostDeviceId = parsed.host_device_id;
        break;
      }
    }
  }

  if (!hostDeviceId) {
    if (list.length === 1) {
      hostDeviceId = list[0]!.device_id;
    } else {
      const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
      hostDeviceId = sorted[0]!.device_id;
    }
  }

  const roster: FriendMemberRosterEntry[] = list.map((r) => ({
    device_id: r.device_id,
    name: r.host_name?.trim() || "Friend",
  }));
  const sortedPeople = [...roster].sort((a, b) => {
    if (a.device_id === hostDeviceId) return -1;
    if (b.device_id === hostDeviceId) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const payload: FriendMembersPayload = {
    host_device_id: hostDeviceId!,
    people: sortedPeople,
  };

  const { error: upErr } = await supabase
    .from("friend_locations")
    .update({ members: payload })
    .eq("room_code", code);

  return { error: upErr?.message ?? null };
}
