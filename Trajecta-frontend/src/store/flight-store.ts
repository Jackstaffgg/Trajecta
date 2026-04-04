import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  AnalysisMode,
  AuthState,
  AuthUser,
  FlightLogData,
  ReplayCameraMode,
  TaskInfo,
  TaskStatus
} from "@/types/flight";

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
  currentTask: TaskInfo | null;
  error: string | null;
  replay: ReplayState;
  setAuthenticated: (token: string, user: AuthUser) => void;
  logout: () => void;
  setMode: (mode: AnalysisMode) => void;
  setLoading: (loading: boolean) => void;
  setData: (data: FlightLogData | null) => void;
  setCurrentTask: (task: TaskInfo | null) => void;
  setTaskStatus: (status: TaskStatus, errorMessage?: string | null) => void;
  setError: (error: string | null) => void;
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

const SESSION_STORAGE_KEY = "trajecta.session";

function loadAuthState(): AuthState {
  if (typeof window === "undefined") {
    return { isAuthenticated: false, token: "", user: null };
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return { isAuthenticated: false, token: "", user: null };
    }
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    if (!parsed.token || !parsed.user) {
      return { isAuthenticated: false, token: "", user: null };
    }
    return { isAuthenticated: true, token: parsed.token, user: parsed.user };
  } catch {
    return { isAuthenticated: false, token: "", user: null };
  }
}

function persistAuthState(auth: AuthState) {
  if (typeof window === "undefined") {
    return;
  }

  if (!auth.isAuthenticated || !auth.token || !auth.user) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ token: auth.token, user: auth.user })
  );
}

const authInitial: AuthState = loadAuthState();

export const useFlightStore = create<FlightState>()(
  devtools((set) => ({
    auth: authInitial,
    mode: "tasks",
    loading: false,
    data: null,
    currentTask: null,
    error: null,
    replay: replayInitial,
    setAuthenticated: (token, user) => {
      const auth = { isAuthenticated: true, token, user } as AuthState;
      persistAuthState(auth);
      set({ auth, error: null });
    },
    logout: () => {
      persistAuthState({ isAuthenticated: false, token: "", user: null });
      set({
        auth: { isAuthenticated: false, token: "", user: null },
        mode: "tasks",
        loading: false,
        data: null,
        currentTask: null,
        error: null,
        replay: replayInitial
      });
    },
    setMode: (mode) => set({ mode }),
    setLoading: (loading) => set({ loading }),
    setData: (data) =>
      set({
        data,
        error: null,
        mode: data ? "dashboard" : "tasks",
        replay: { ...replayInitial }
      }),
    setCurrentTask: (currentTask) => set({ currentTask }),
    setTaskStatus: (status, errorMessage) =>
      set((state) => {
        if (!state.currentTask) {
          return {};
        }
        return {
          currentTask: {
            ...state.currentTask,
            status,
            errorMessage: errorMessage ?? null
          }
        };
      }),
    setError: (error) => set({ error }),
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
        auth: loadAuthState(),
        mode: "tasks",
        loading: false,
        data: null,
        currentTask: null,
        error: null,
        replay: replayInitial
      })
  }))
);
