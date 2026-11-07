import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useSectionJump() {
  const { hash, key } = useLocation();

  useEffect(() => {
    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    target.scrollIntoView({ block: "start" });
    (target.querySelector<HTMLElement>("[data-section-focus]") ?? target).focus(
      { preventScroll: true },
    );
  }, [hash, key]);
}
