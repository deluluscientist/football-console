export type Mode = "1v1" | "2v2" | "ai";
export type Team = "red" | "blue";
export interface Player {
  id: string; team: Team; number: number; x: number; z: number;
  vx: number; vz: number; controlledBy: string | null; active: boolean;
}
export interface Ball { x: number; z: number; vx: number; vz: number; }
export interface MatchState {
  roomId: string; mode: Mode; status: "lobby" | "playing" | "finished";
  players: Player[]; ball: Ball; score: { red: number; blue: number };
  timeLeft: number; possession: Team | null; controllerCount: number;
}
