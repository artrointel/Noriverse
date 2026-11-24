import { isRoomRole, roomRoles } from './rooms.ts';
import type { Role } from './rooms.ts';

const teamIds = [1, 2, 3, 4] as const;
export type TeamId = typeof teamIds[number];
export type RoomTeam = { id: TeamId; members: Role[]; manual?: true };
export const teamSize = 2;
export const maxTeams = teamIds.length;
export const readTeamId = (value: unknown) => teamIds.find(id => id === value);
export const teamFor = (teams: readonly RoomTeam[] | undefined, role: Role) => teams?.find(team => team.members.includes(role));
export const activeTeams = (teams: readonly RoomTeam[]) => teams.filter(team => team.members.length > 0);

export function readRoomTeams(value: unknown): RoomTeam[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > maxTeams) return;
  const seats = new Set<Role>();
  const teams: RoomTeam[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return;
    const id = readTeamId(entry.id);
    if (!id || teams.some(team => team.id === id) || !Array.isArray(entry.members) || entry.members.length > teamSize
      || (entry.manual !== undefined && entry.manual !== true)) return;
    const members: Role[] = [];
    for (const role of entry.members) {
      if (!isRoomRole(role) || seats.has(role)) return;
      seats.add(role);
      members.push(role);
    }
    teams.push({ id, members, ...(entry.manual && { manual: true }) });
  }
  return teams.sort((a, b) => a.id - b.id);
}

export function addRoomTeam(teams: RoomTeam[], manual = true): RoomTeam[] {
  const id = teamIds.find(id => !teams.some(team => team.id === id));
  return id ? [...teams, { id, members: [], ...(manual && { manual: true as const }) }].sort((a, b) => a.id - b.id) : teams;
}

export function removeRoomTeam(teams: RoomTeam[], id: TeamId) {
  return teams.length > 2 && teams.some(team => team.id === id && !team.members.length)
    ? teams.filter(team => team.id !== id) : teams;
}

export function fillRoomTeams(teams: RoomTeam[], seats: readonly Role[]): RoomTeam[] {
  const available = roomRoles.filter(role => seats.includes(role));
  const minimum = Math.max(2, Math.ceil(available.length / teamSize));
  let next = teams.map(team => ({ ...team, members: team.members.filter(role => available.includes(role)) }));
  for (let i = next.length - 1; i >= 0 && next.length > minimum; i--) {
    if (!next[i].manual && !next[i].members.length) next.splice(i, 1);
  }
  while (next.length < minimum) next = addRoomTeam(next, false);
  for (const role of available) {
    if (teamFor(next, role)) continue;
    const team = next.reduce((smallest, candidate) => candidate.members.length < smallest.members.length ? candidate : smallest);
    team.members.push(role);
  }
  return next;
}

export function moveRoomTeamMember(teams: RoomTeam[], role: Role, id: TeamId) {
  const target = teams.find(team => team.id === id);
  const source = teamFor(teams, role);
  if (!source || !target || source === target || target.members.length >= teamSize) return teams;
  return teams.map(team => team === source ? { ...team, members: team.members.filter(member => member !== role) }
    : team === target ? { ...team, members: [...team.members, role] } : team);
}

export function validTeamLineup(teams: readonly RoomTeam[], seats: readonly Role[]) {
  return activeTeams(teams).length >= 2 && teams.flatMap(team => team.members).length === seats.length
    && seats.every(role => teamFor(teams, role));
}
