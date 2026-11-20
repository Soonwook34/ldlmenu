export type User = { id: number; name: string };
export type Menu = { id: number; name: string; votes: number; voters: string[] };
export type Category = { id: number; name: string; menus: Menu[] };
export type Ranked = Menu & { rank: number; category: string };
export type Round = { name: string; start: number; next_reset: number | null; next_reset_label: string | null };
export type RoundSetting = { name: string; reset: string };

export type PhaseStatus = "open" | "runoff" | "closed";
export type Phase = {
  status: PhaseStatus;
  stage: number; // 결승 차수 (1 = 첫 결승)
  candidates: number[];
  prelim: { id: number; name: string; category: string; votes: number }[]; // 결승 직전 투표 결과
  winner: { id: number; name: string; category: string } | null;
  decided_by: "vote" | "random" | null;
  can_reopen: boolean;
};

export type AppState = {
  round: Round;
  phase: Phase;
  rounds: RoundSetting[];
  users: User[];
  categories: Category[];
  voters: string[];
  max_votes: number;
  ranking: Ranked[];
  me: User | null;
  my_selection: number[];
  version: string;
};

declare global {
  interface Window {
    __STATE__?: AppState; // Flask가 첫 HTML에 실어 보내는 초기 상태
  }
}
