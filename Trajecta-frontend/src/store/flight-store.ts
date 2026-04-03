import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AnalysisMode, FlightLogData, ReplayCameraMode } from "@/types/flight";

type AuthState = {
  isAuthenticated: boolean;
  email: string;
};

type ReplayState = {
  timeSec: number;
  isPlaying: boolean;
  speed: number;
  camera: ReplayCameraMode;
};

type FlightState = {
  auth: AuthState;
  mode: AnalysisMode;
  loading: boolean;
  data: FlightLogData | null;
  replay: ReplayState;
  setAuth: (next: AuthState) => void;
  setMode: (mode: AnalysisMode) => void;
  setLoading: (loading: boolean) => void;
  setData: (data: FlightLogData | null) => void;
  setReplayTime: (timeSec: number) => void;
  setReplayPlaying: (isPlaying: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayCamera: (camera: ReplayCameraMode) => void;
  reset: () => void;
};

const replayInitial: ReplayState = {
  timeSec: 0,
  isPlaying: false,
  speed: 1,
  camera: "chase"
};

const authInitial: AuthState = {
  isAuthenticated: false,
  email: ""
};

export const useFlightStore = create<FlightState>()(
  devtools((set) => ({
    auth: authInitial,
    mode: "dashboard",
    loading: false,
    data: null,
    replay: replayInitial,
    setAuth: (auth) => set({ auth }),
    setMode: (mode) => set({ mode }),
    setLoading: (loading) => set({ loading }),
    setData: (data) =>
      set({
        data,
        mode: data ? "dashboard" : "dashboard",
        replay: { ...replayInitial }
      }),
    setReplayTime: (timeSec) =>
      set((state) => ({ replay: { ...state.replay, timeSec } })),
    setReplayPlaying: (isPlaying) =>
      set((state) => ({ replay: { ...state.replay, isPlaying } })),
    setReplaySpeed: (speed) =>
      set((state) => ({ replay: { ...state.replay, speed } })),
    setReplayCamera: (camera) =>
      set((state) => ({ replay: { ...state.replay, camera } })),
    reset: () =>
      set({
        auth: authInitial,
        mode: "dashboard",
        loading: false,
        data: null,
        replay: replayInitial
      })
  }))
);
