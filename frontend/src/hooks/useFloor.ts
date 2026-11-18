import { useCallback, useEffect, useRef, useState } from "react";
import { floorRequest, type FloorState } from "../api/copilot";

/** Serial polling: a slow response never overwrites a completed intervention. */
export function useFloor() {
  const [state, setState] = useState<FloorState | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const acting = useRef(false);
  const load = useCallback(async () => {
    if (acting.current) return;
    const version = ++generation.current;
    try {
      const value = await floorRequest();
      if (version === generation.current) {
        setState(value);
        setConnected(true);
      }
    } catch {
      if (version === generation.current) setConnected(false);
    }
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await load();
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      generation.current++;
    };
  }, [load]);
  const act = useCallback(async (path: string, body: unknown) => {
    if (acting.current) return false;
    acting.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const value = await floorRequest(path, body);
      setState(value);
      setConnected(true);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be completed.",
      );
      return false;
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }, []);
  return { state, connected, busy, error, setError, act };
}
