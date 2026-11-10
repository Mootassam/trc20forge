// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extensionGuardScript, foreignAttributes } from "@/lib/extension-guard";

describe("extension guard", () => {
  it("matches only extension-injected attributes", () => {
    expect(
      foreignAttributes([
        "bis_skin_checked", "bis_register", "__processed_67697f33-06c0-49e4-8e77-55cb9b15991b__",
        "class", "id", "hidden", "aria-label", "data-state", "style", "bis", "processed",
      ]),
    ).toEqual(["bis_skin_checked", "bis_register", "__processed_67697f33-06c0-49e4-8e77-55cb9b15991b__"]);
  });

  it("strips existing and newly injected attributes, leaving app attributes alone", async () => {
    document.body.innerHTML = `<div id="a" class="x" bis_skin_checked="1"><span aria-label="ok" bis_register="W3"></span></div>`;
    new Function(extensionGuardScript)();
    const a = document.getElementById("a")!;
    expect(a.hasAttribute("bis_skin_checked")).toBe(false);
    expect(a.getAttribute("class")).toBe("x");
    expect(a.querySelector("span")!.getAttribute("aria-label")).toBe("ok");
    expect(a.querySelector("span")!.hasAttribute("bis_register")).toBe(false);

    // an extension tagging nodes after the script started
    const late = document.createElement("div");
    late.setAttribute("bis_skin_checked", "1");
    late.setAttribute("data-app", "keep");
    document.body.appendChild(late);
    a.setAttribute("bis_skin_checked", "1");
    await new Promise((r) => setTimeout(r, 0));
    expect(late.hasAttribute("bis_skin_checked")).toBe(false);
    expect(late.getAttribute("data-app")).toBe("keep");
    expect(a.hasAttribute("bis_skin_checked")).toBe(false);
  });
});
